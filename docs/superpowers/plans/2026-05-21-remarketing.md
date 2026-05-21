# Remarketing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automated drip-campaign remarketing that re-engages WhatsApp leads who stopped responding, with multiple configurable campaigns managed through the CRM.

**Architecture:** A new `bot/src/remarketing.js` module processes enrollments hourly via `setInterval`, reads/writes three new PostgreSQL tables, and integrates with the existing `webhook.js` (cancel on reply) and `index.js` (startup). The CRM gains API routes and a UI page for managing campaigns, steps, and viewing enrollment stats.

**Tech Stack:** Node.js + pg (bot), Next.js 14 + TypeScript + Tailwind + lucide-react + @hello-pangea/dnd (CRM), PostgreSQL

---

## File Map

**Create:**
- `bot/src/remarketing.js` — processRemarketing, cancelEnrollment, rescheduleRemarketing
- `bot/tests/remarketing.test.js` — unit tests for remarketing.js
- `crm/src/app/api/remarketing/campaigns/route.ts` — GET + POST campaigns
- `crm/src/app/api/remarketing/campaigns/[id]/route.ts` — PATCH + DELETE campaign
- `crm/src/app/api/remarketing/campaigns/[id]/steps/route.ts` — GET + POST steps
- `crm/src/app/api/remarketing/steps/[id]/route.ts` — PATCH + DELETE step
- `crm/src/app/api/remarketing/campaigns/[id]/enrollments/route.ts` — GET enrollments
- `crm/src/components/RemarketingSettings.tsx` — campaign + steps UI
- `crm/src/app/(app)/settings/remarketing/page.tsx` — settings sub-page

**Modify:**
- `crm/db/migrate.js` — add 3 new tables
- `bot/src/index.js` — call rescheduleRemarketing on startup; fix stale loadContacts import
- `bot/src/webhook.js` — call cancelEnrollment on incoming message
- `crm/src/components/SettingsSidebar.tsx` — add Remarketing link

---

## Task 1: DB Schema — Add 3 Tables

**Files:**
- Modify: `crm/db/migrate.js`

- [ ] **Step 1: Add 3 tables** inside the existing `pool.query(\`...\`)` block in `crm/db/migrate.js`, after the `contacts` table:

```js
      CREATE TABLE IF NOT EXISTS remarketing_campaigns (
        id           SERIAL PRIMARY KEY,
        name         VARCHAR(255) NOT NULL,
        active       BOOLEAN NOT NULL DEFAULT true,
        trigger_days INTEGER NOT NULL DEFAULT 3,
        stage_filter INTEGER REFERENCES stages(id) ON DELETE SET NULL,
        created_at   TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS remarketing_steps (
        id          SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL REFERENCES remarketing_campaigns(id) ON DELETE CASCADE,
        position    INTEGER NOT NULL DEFAULT 0,
        delay_days  INTEGER NOT NULL DEFAULT 1,
        message     TEXT NOT NULL,
        UNIQUE(campaign_id, position)
      );

      CREATE TABLE IF NOT EXISTS remarketing_enrollments (
        id           SERIAL PRIMARY KEY,
        campaign_id  INTEGER NOT NULL REFERENCES remarketing_campaigns(id) ON DELETE CASCADE,
        lead_id      INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        enrolled_at  TIMESTAMPTZ DEFAULT NOW(),
        last_sent_at TIMESTAMPTZ,
        current_step INTEGER NOT NULL DEFAULT 0,
        completed_at TIMESTAMPTZ,
        cancelled_at TIMESTAMPTZ
      );
```

- [ ] **Step 2: Run migration** against dev database:

```bash
cd crm
DATABASE_URL=postgresql://user:pass@localhost:5432/crm node db/migrate.js
```

Expected output: `Migration complete.`

- [ ] **Step 3: Verify tables exist**

```bash
psql $DATABASE_URL -c "\dt remarketing*"
```

Expected: `remarketing_campaigns`, `remarketing_steps`, `remarketing_enrollments` listed.

- [ ] **Step 4: Commit**

```bash
git add crm/db/migrate.js
git commit -m "feat(db): add remarketing_campaigns, steps, and enrollments tables"
```

---

## Task 2: bot/src/remarketing.js — TDD

**Files:**
- Create: `bot/src/remarketing.js`
- Create: `bot/tests/remarketing.test.js`

- [ ] **Step 1: Write the failing tests** in `bot/tests/remarketing.test.js`:

```js
const mockQuery = jest.fn();
const mockSendText = jest.fn();

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({ query: mockQuery })),
}));

jest.mock('../src/evolutionApi', () => ({
  sendText: mockSendText,
  sendList: jest.fn(),
  sendImageBase64: jest.fn(),
  registerWebhook: jest.fn(),
  getMediaBase64: jest.fn(),
}));

process.env.DATABASE_URL = 'postgresql://test';

const { processRemarketing, cancelEnrollment } = require('../src/remarketing');

beforeEach(() => jest.clearAllMocks());

test('processRemarketing envia mensagem quando step está vencido', async () => {
  const yesterday = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  mockQuery
    .mockResolvedValueOnce({ rows: [{ id: 1, active: true, trigger_days: 3, stage_filter: null }] })
    .mockResolvedValueOnce({ rows: [] }) // eligible leads (none)
    .mockResolvedValueOnce({ rows: [{ id: 10, campaign_id: 1, lead_id: 5, current_step: 0, last_sent_at: null, enrolled_at: yesterday, phone: '5511999999999', name: 'João' }] })
    .mockResolvedValueOnce({ rows: [{ position: 0, delay_days: 1, message: 'Oi {{nome}}, tudo bem?' }] })
    .mockResolvedValueOnce({ rows: [] }); // update enrollment
  await processRemarketing();
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', 'Oi João, tudo bem?');
});

test('processRemarketing não envia quando step ainda não está vencido', async () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  mockQuery
    .mockResolvedValueOnce({ rows: [{ id: 1, active: true, trigger_days: 3, stage_filter: null }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 10, campaign_id: 1, lead_id: 5, current_step: 0, last_sent_at: null, enrolled_at: twoHoursAgo, phone: '5511999', name: 'Ana' }] })
    .mockResolvedValueOnce({ rows: [{ position: 0, delay_days: 1, message: 'Oi {{nome}}' }] });
  await processRemarketing();
  expect(mockSendText).not.toHaveBeenCalled();
});

test('processRemarketing substitui {{nome}} por "cliente" quando nome é null', async () => {
  const yesterday = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  mockQuery
    .mockResolvedValueOnce({ rows: [{ id: 1, active: true, trigger_days: 3, stage_filter: null }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 10, campaign_id: 1, lead_id: 5, current_step: 0, last_sent_at: null, enrolled_at: yesterday, phone: '5511999', name: null }] })
    .mockResolvedValueOnce({ rows: [{ position: 0, delay_days: 1, message: 'Oi {{nome}}!' }] })
    .mockResolvedValueOnce({ rows: [] });
  await processRemarketing();
  expect(mockSendText).toHaveBeenCalledWith('5511999', 'Oi cliente!');
});

test('processRemarketing adiciona tag e completa enrollment no último step', async () => {
  const yesterday = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  mockQuery
    .mockResolvedValueOnce({ rows: [{ id: 1, active: true, trigger_days: 3, stage_filter: null }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 10, campaign_id: 1, lead_id: 5, current_step: 0, last_sent_at: null, enrolled_at: yesterday, phone: '5511999', name: 'Maria' }] })
    .mockResolvedValueOnce({ rows: [{ position: 0, delay_days: 1, message: 'Última mensagem' }] }) // only 1 step
    .mockResolvedValueOnce({ rows: [] }) // UPDATE completed_at
    .mockResolvedValueOnce({ rows: [] }); // UPDATE tags
  await processRemarketing();
  expect(mockSendText).toHaveBeenCalled();
  const completedCall = mockQuery.mock.calls.find(c => typeof c[0] === 'string' && c[0].includes('completed_at'));
  expect(completedCall).toBeDefined();
  const tagCall = mockQuery.mock.calls.find(c => typeof c[0] === 'string' && c[0].includes('sem-resposta'));
  expect(tagCall).toBeDefined();
  expect(tagCall[1]).toContain(5); // lead_id
});

test('processRemarketing enrola lead elegível', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ id: 1, active: true, trigger_days: 3, stage_filter: null }] })
    .mockResolvedValueOnce({ rows: [{ id: 42 }] }) // eligible lead
    .mockResolvedValueOnce({ rows: [] }) // INSERT enrollment
    .mockResolvedValueOnce({ rows: [] }); // no pending enrollments
  await processRemarketing();
  const insertCall = mockQuery.mock.calls.find(c => typeof c[0] === 'string' && c[0].includes('INSERT INTO remarketing_enrollments'));
  expect(insertCall).toBeDefined();
  expect(insertCall[1]).toEqual([1, 42]);
});

test('cancelEnrollment define cancelled_at para o lead', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await cancelEnrollment('5511999999999');
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('cancelled_at = NOW()'),
    ['5511999999999']
  );
});

test('cancelEnrollment não lança exceção quando não há enrollment ativo', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await expect(cancelEnrollment('5511999999999')).resolves.not.toThrow();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd bot
npx jest tests/remarketing.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../src/remarketing'`

- [ ] **Step 3: Create `bot/src/remarketing.js`**

```js
const { Pool } = require('pg');
const { sendText } = require('./evolutionApi');

let _pool;
function getPool() {
  if (!_pool) _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return _pool;
}

let _interval;

async function processRemarketing() {
  const pool = getPool();
  try {
    // Phase 1: Auto-enroll eligible leads
    const { rows: campaigns } = await pool.query(
      'SELECT * FROM remarketing_campaigns WHERE active = true'
    );

    for (const campaign of campaigns) {
      const { rows: eligible } = await pool.query(
        `SELECT l.id FROM leads l
         WHERE ($1::integer IS NULL OR l.stage_id = $1)
         AND NOT EXISTS (
           SELECT 1 FROM remarketing_enrollments e
           WHERE e.campaign_id = $2 AND e.lead_id = l.id
           AND e.completed_at IS NULL AND e.cancelled_at IS NULL
         )
         AND (
           NOT EXISTS (SELECT 1 FROM interactions i WHERE i.lead_id = l.id AND i.direction = 'in')
           OR (SELECT MAX(i.created_at) FROM interactions i WHERE i.lead_id = l.id AND i.direction = 'in')
              <= NOW() - ($3 * INTERVAL '1 day')
         )`,
        [campaign.stage_filter, campaign.id, campaign.trigger_days]
      );
      for (const lead of eligible) {
        await pool.query(
          'INSERT INTO remarketing_enrollments (campaign_id, lead_id) VALUES ($1, $2)',
          [campaign.id, lead.id]
        );
      }
    }

    // Phase 2: Process pending steps
    const { rows: enrollments } = await pool.query(
      `SELECT e.id, e.campaign_id, e.lead_id, e.current_step, e.last_sent_at, e.enrolled_at,
              l.phone, l.name
       FROM remarketing_enrollments e
       JOIN leads l ON l.id = e.lead_id
       JOIN remarketing_campaigns c ON c.id = e.campaign_id
       WHERE e.completed_at IS NULL AND e.cancelled_at IS NULL AND c.active = true`
    );

    for (const enrollment of enrollments) {
      const { rows: steps } = await pool.query(
        'SELECT * FROM remarketing_steps WHERE campaign_id = $1 ORDER BY position ASC',
        [enrollment.campaign_id]
      );
      if (steps.length === 0) continue;
      const step = steps[enrollment.current_step];
      if (!step) continue;

      const ref = enrollment.last_sent_at || enrollment.enrolled_at;
      const sendAt = new Date(ref);
      sendAt.setDate(sendAt.getDate() + step.delay_days);
      if (new Date() < sendAt) continue;

      const name = enrollment.name || 'cliente';
      const message = step.message.replace(/{{nome}}/g, name);

      try {
        await sendText(enrollment.phone, message);
      } catch (err) {
        console.error(`Erro ao enviar remarketing para ${enrollment.phone}:`, err.message);
        continue;
      }

      const nextStep = enrollment.current_step + 1;
      const isLast = nextStep >= steps.length;

      if (isLast) {
        await pool.query(
          'UPDATE remarketing_enrollments SET current_step = $1, last_sent_at = NOW(), completed_at = NOW() WHERE id = $2',
          [nextStep, enrollment.id]
        );
        await pool.query(
          "UPDATE leads SET tags = array_append(tags, 'sem-resposta'), updated_at = NOW() WHERE id = $1 AND NOT ('sem-resposta' = ANY(tags))",
          [enrollment.lead_id]
        );
      } else {
        await pool.query(
          'UPDATE remarketing_enrollments SET current_step = $1, last_sent_at = NOW() WHERE id = $2',
          [nextStep, enrollment.id]
        );
      }
    }
  } catch (err) {
    console.error('Erro ao processar remarketing:', err.message);
  }
}

async function cancelEnrollment(phone) {
  try {
    const pool = getPool();
    await pool.query(
      `UPDATE remarketing_enrollments SET cancelled_at = NOW()
       WHERE lead_id = (SELECT id FROM leads WHERE phone = $1)
       AND completed_at IS NULL AND cancelled_at IS NULL`,
      [phone]
    );
  } catch (err) {
    console.error('Erro ao cancelar enrollment de remarketing:', err.message);
  }
}

async function rescheduleRemarketing() {
  await processRemarketing();
  _interval = setInterval(() => { void processRemarketing(); }, 60 * 60 * 1000);
}

module.exports = { processRemarketing, cancelEnrollment, rescheduleRemarketing };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd bot
npx jest tests/remarketing.test.js --no-coverage
```

Expected: PASS — 7 tests passing

- [ ] **Step 5: Commit**

```bash
git add bot/src/remarketing.js bot/tests/remarketing.test.js
git commit -m "feat(bot): add remarketing module with drip campaign processing"
```

---

## Task 3: Integrate Remarketing into Bot

**Files:**
- Modify: `bot/src/index.js`
- Modify: `bot/src/webhook.js`

- [ ] **Step 1: Update `bot/src/index.js`**

Replace the stale broadcast import at the top:

```js
// Replace:
const { sendBroadcast, loadContacts } = require('./broadcast');

// With:
const { sendBroadcast } = require('./broadcast');
const { rescheduleRemarketing } = require('./remarketing');
```

Replace the `/broadcast` HTTP route body (remove `loadContacts()` call and fix response):

```js
// Find the POST /broadcast route and replace its body:
app.post('/broadcast', async (req, res) => {
  const token = req.headers['x-api-key'];
  if (token !== process.env.WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }
  res.json({ queued: true });
  (async () => {
    try {
      await sendBroadcast(message);
    } catch (err) {
      console.error('Erro no broadcast via HTTP:', err.message);
    }
  })();
});
```

Add `rescheduleRemarketing()` call in the `app.listen` callback, after `rescheduleAllReminders()`:

```js
  try {
    await rescheduleRemarketing();
    console.log('Remarketing inicializado.');
  } catch (err) {
    console.warn('Aviso: não foi possível inicializar remarketing.', err.message);
  }
```

- [ ] **Step 2: Update `bot/src/webhook.js`**

Add import at the top (after existing imports):

```js
const { cancelEnrollment } = require('./remarketing');
```

Add `cancelEnrollment` call after extracting `phone` (line after `const phone = data.key.remoteJid.replace(...)` — before the `isHumanMode` check):

```js
  // After: const pushName = data.pushName || null;
  // Add:
  void cancelEnrollment(phone);
```

- [ ] **Step 3: Run full bot test suite**

```bash
cd bot
npm test -- --no-coverage
```

Expected: all 15 test files pass, 114+ tests passing (no regressions).

- [ ] **Step 4: Commit**

```bash
git add bot/src/index.js bot/src/webhook.js
git commit -m "feat(bot): integrate remarketing startup and webhook cancellation"
```

---

## Task 4: CRM API — Campaigns Routes

**Files:**
- Create: `crm/src/app/api/remarketing/campaigns/route.ts`
- Create: `crm/src/app/api/remarketing/campaigns/[id]/route.ts`

- [ ] **Step 1: Create directories**

```bash
mkdir -p 'crm/src/app/api/remarketing/campaigns/[id]'
```

- [ ] **Step 2: Create `crm/src/app/api/remarketing/campaigns/route.ts`**

```ts
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT c.*,
      (SELECT COUNT(*) FROM remarketing_steps s WHERE s.campaign_id = c.id) AS step_count,
      (SELECT COUNT(*) FROM remarketing_enrollments e WHERE e.campaign_id = c.id AND e.completed_at IS NULL AND e.cancelled_at IS NULL) AS active_enrollments,
      (SELECT COUNT(*) FROM remarketing_enrollments e WHERE e.campaign_id = c.id AND e.completed_at IS NOT NULL) AS completed_enrollments
    FROM remarketing_campaigns c
    ORDER BY c.created_at ASC
  `);
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, trigger_days, stage_filter } = await req.json();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const pool = getPool();
  const { rows } = await pool.query(
    'INSERT INTO remarketing_campaigns (name, trigger_days, stage_filter) VALUES ($1, $2, $3) RETURNING *',
    [name, trigger_days ?? 3, stage_filter ?? null]
  );
  return NextResponse.json({ ...rows[0], step_count: 0, active_enrollments: 0, completed_enrollments: 0 }, { status: 201 });
}
```

- [ ] **Step 3: Create `crm/src/app/api/remarketing/campaigns/[id]/route.ts`**

```ts
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

interface Params { params: { id: string } }

export async function PATCH(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, active, trigger_days, stage_filter } = await req.json();
  const pool = getPool();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (name !== undefined) { values.push(name); sets.push(`name = $${values.length}`); }
  if (active !== undefined) { values.push(active); sets.push(`active = $${values.length}`); }
  if (trigger_days !== undefined) { values.push(trigger_days); sets.push(`trigger_days = $${values.length}`); }
  if (stage_filter !== undefined) { values.push(stage_filter); sets.push(`stage_filter = $${values.length}`); }

  if (sets.length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

  values.push(params.id);
  const { rows } = await pool.query(
    `UPDATE remarketing_campaigns SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  if (!rows[0]) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pool = getPool();
  await pool.query('DELETE FROM remarketing_campaigns WHERE id = $1', [params.id]);
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 4: Commit**

```bash
git add crm/src/app/api/remarketing/
git commit -m "feat(crm): add remarketing campaigns API routes"
```

---

## Task 5: CRM API — Steps + Enrollments Routes

**Files:**
- Create: `crm/src/app/api/remarketing/campaigns/[id]/steps/route.ts`
- Create: `crm/src/app/api/remarketing/steps/[id]/route.ts`
- Create: `crm/src/app/api/remarketing/campaigns/[id]/enrollments/route.ts`

- [ ] **Step 1: Create directories**

```bash
mkdir -p 'crm/src/app/api/remarketing/campaigns/[id]/steps'
mkdir -p 'crm/src/app/api/remarketing/campaigns/[id]/enrollments'
mkdir -p 'crm/src/app/api/remarketing/steps/[id]'
```

- [ ] **Step 2: Create `crm/src/app/api/remarketing/campaigns/[id]/steps/route.ts`**

```ts
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

interface Params { params: { id: string } }

export async function GET(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT * FROM remarketing_steps WHERE campaign_id = $1 ORDER BY position ASC',
    [params.id]
  );
  return NextResponse.json(rows);
}

export async function POST(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { delay_days, message } = await req.json();
  if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400 });

  const pool = getPool();
  const { rows: maxRows } = await pool.query(
    'SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM remarketing_steps WHERE campaign_id = $1',
    [params.id]
  );
  const { rows } = await pool.query(
    'INSERT INTO remarketing_steps (campaign_id, position, delay_days, message) VALUES ($1, $2, $3, $4) RETURNING *',
    [params.id, maxRows[0].pos, delay_days ?? 1, message]
  );
  return NextResponse.json(rows[0], { status: 201 });
}
```

- [ ] **Step 3: Create `crm/src/app/api/remarketing/steps/[id]/route.ts`**

```ts
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

interface Params { params: { id: string } }

export async function PATCH(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { delay_days, message, position } = await req.json();
  const pool = getPool();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (delay_days !== undefined) { values.push(delay_days); sets.push(`delay_days = $${values.length}`); }
  if (message !== undefined) { values.push(message); sets.push(`message = $${values.length}`); }
  if (position !== undefined) { values.push(position); sets.push(`position = $${values.length}`); }

  if (sets.length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

  values.push(params.id);
  const { rows } = await pool.query(
    `UPDATE remarketing_steps SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  if (!rows[0]) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pool = getPool();
  await pool.query('DELETE FROM remarketing_steps WHERE id = $1', [params.id]);
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 4: Create `crm/src/app/api/remarketing/campaigns/[id]/enrollments/route.ts`**

```ts
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

interface Params { params: { id: string } }

export async function GET(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT e.*, l.phone, l.name,
       CASE
         WHEN e.cancelled_at IS NOT NULL THEN 'cancelled'
         WHEN e.completed_at IS NOT NULL THEN 'completed'
         ELSE 'active'
       END AS status
     FROM remarketing_enrollments e
     JOIN leads l ON l.id = e.lead_id
     WHERE e.campaign_id = $1
     ORDER BY e.enrolled_at DESC
     LIMIT 100`,
    [params.id]
  );
  return NextResponse.json(rows);
}
```

- [ ] **Step 5: Commit**

```bash
git add crm/src/app/api/remarketing/
git commit -m "feat(crm): add remarketing steps and enrollments API routes"
```

---

## Task 6: CRM UI — RemarketingSettings Component

**Files:**
- Create: `crm/src/components/RemarketingSettings.tsx`

- [ ] **Step 1: Create `crm/src/components/RemarketingSettings.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Plus, Trash2, ChevronRight, ToggleLeft, ToggleRight } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

interface Step {
  id: number;
  campaign_id: number;
  position: number;
  delay_days: number;
  message: string;
}

interface Campaign {
  id: number;
  name: string;
  active: boolean;
  trigger_days: number;
  stage_filter: number | null;
  step_count: number;
  active_enrollments: number;
  completed_enrollments: number;
}

interface Stage { id: number; name: string; }

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100';

export default function RemarketingSettings({
  initialCampaigns,
  stages,
}: {
  initialCampaigns: Campaign[];
  stages: Stage[];
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
  const [selectedId, setSelectedId] = useState<number | null>(initialCampaigns[0]?.id ?? null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [stepsLoaded, setStepsLoaded] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [newStep, setNewStep] = useState({ delay_days: '1', message: '' });

  const selected = campaigns.find((c) => c.id === selectedId);

  const loadSteps = async (campaignId: number) => {
    if (stepsLoaded === campaignId) return;
    const res = await fetch(`/api/remarketing/campaigns/${campaignId}/steps`);
    const data = await res.json();
    setSteps(data);
    setStepsLoaded(campaignId);
  };

  const selectCampaign = (id: number) => {
    setSelectedId(id);
    void loadSteps(id);
  };

  const addCampaign = async () => {
    if (!newName.trim()) return;
    const res = await fetch('/api/remarketing/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const campaign = await res.json();
    setCampaigns((prev) => [...prev, campaign]);
    setNewName('');
    selectCampaign(campaign.id);
  };

  const toggleActive = async (campaign: Campaign) => {
    await fetch(`/api/remarketing/campaigns/${campaign.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !campaign.active }),
    });
    setCampaigns((prev) => prev.map((c) => c.id === campaign.id ? { ...c, active: !c.active } : c));
  };

  const deleteCampaign = async (id: number) => {
    if (!window.confirm('Excluir campanha e todos os seus passos?')) return;
    await fetch(`/api/remarketing/campaigns/${id}`, { method: 'DELETE' });
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) setSelectedId(campaigns.find((c) => c.id !== id)?.id ?? null);
  };

  const updateCampaignField = async (id: number, field: string, value: unknown) => {
    await fetch(`/api/remarketing/campaigns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    setCampaigns((prev) => prev.map((c) => c.id === id ? { ...c, [field]: value } : c));
  };

  const addStep = async () => {
    if (!selected || !newStep.message.trim()) return;
    const res = await fetch(`/api/remarketing/campaigns/${selected.id}/steps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delay_days: parseInt(newStep.delay_days) || 1, message: newStep.message.trim() }),
    });
    const step = await res.json();
    setSteps((prev) => [...prev, step]);
    setNewStep({ delay_days: '1', message: '' });
  };

  const updateStep = async (stepId: number, field: string, value: unknown) => {
    await fetch(`/api/remarketing/steps/${stepId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    setSteps((prev) => prev.map((s) => s.id === stepId ? { ...s, [field]: value } : s));
  };

  const deleteStep = async (stepId: number) => {
    await fetch(`/api/remarketing/steps/${stepId}`, { method: 'DELETE' });
    setSteps((prev) => prev.filter((s) => s.id !== stepId).map((s, i) => ({ ...s, position: i })));
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const reordered = [...steps];
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    const withPositions = reordered.map((s, i) => ({ ...s, position: i }));
    setSteps(withPositions);
    for (const s of withPositions) {
      await fetch(`/api/remarketing/steps/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: s.position }),
      });
    }
  };

  const campaignSteps = steps.filter((s) => s.campaign_id === selectedId);

  return (
    <div className="flex gap-6" style={{ minHeight: 400 }}>
      {/* Campaign list */}
      <div className="w-64 shrink-0">
        <div className="space-y-1">
          {campaigns.map((c) => (
            <div
              key={c.id}
              onClick={() => selectCampaign(c.id)}
              className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 transition ${selectedId === c.id ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
            >
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${selectedId === c.id ? 'text-slate-900' : 'text-slate-700'}`}>{c.name}</p>
                <p className="text-xs text-slate-400">
                  {c.step_count} passo{c.step_count !== 1 ? 's' : ''} · {c.active_enrollments} ativo{c.active_enrollments !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); void toggleActive(c); }}
                  className={`transition ${c.active ? 'text-sky-500 hover:text-sky-600' : 'text-slate-300 hover:text-slate-400'}`}
                >
                  {c.active ? <ToggleRight size={18} strokeWidth={2} /> : <ToggleLeft size={18} strokeWidth={2} />}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); void deleteCampaign(c.id); }}
                  className="text-slate-300 transition hover:text-rose-500"
                >
                  <Trash2 size={13} strokeWidth={2} />
                </button>
                <ChevronRight size={13} strokeWidth={2} className={selectedId === c.id ? 'text-slate-400' : 'text-slate-200'} />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex gap-1">
          <input
            className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-sky-500"
            placeholder="Nova campanha"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void addCampaign(); }}
          />
          <button onClick={() => void addCampaign()} className="rounded-lg bg-slate-950 px-2.5 text-white">
            <Plus size={14} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Campaign config + steps */}
      {selected ? (
        <div className="flex-1 space-y-4">
          {/* Config */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Nome</label>
                <input
                  className={inputClass}
                  defaultValue={selected.name}
                  onBlur={(e) => { if (e.target.value !== selected.name) void updateCampaignField(selected.id, 'name', e.target.value); }}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Dias sem resposta para enrolar</label>
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  defaultValue={selected.trigger_days}
                  onBlur={(e) => void updateCampaignField(selected.id, 'trigger_days', parseInt(e.target.value) || 3)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Etapa alvo (opcional)</label>
                <select
                  className={inputClass}
                  value={selected.stage_filter ?? ''}
                  onChange={(e) => void updateCampaignField(selected.id, 'stage_filter', e.target.value ? parseInt(e.target.value) : null)}
                >
                  <option value="">Todas as etapas</option>
                  {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <p className="text-xs text-slate-400">
                  {selected.active_enrollments} enrolados · {selected.completed_enrollments} concluídos
                </p>
              </div>
            </div>
          </div>

          {/* Steps */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Sequência de mensagens</p>
            <DragDropContext onDragEnd={(r) => void onDragEnd(r)}>
              <Droppable droppableId="steps">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                    {campaignSteps.map((step, index) => (
                      <Draggable key={step.id} draggableId={String(step.id)} index={index}>
                        {(drag) => (
                          <div ref={drag.innerRef} {...drag.draggableProps} {...drag.dragHandleProps}
                            className="rounded-xl border border-slate-200 bg-white p-3"
                          >
                            <div className="mb-2 flex items-center gap-2">
                              <span className="text-xs font-medium text-slate-400">Passo {index + 1}</span>
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-slate-400">após</span>
                                <input
                                  type="number"
                                  min={1}
                                  defaultValue={step.delay_days}
                                  onBlur={(e) => void updateStep(step.id, 'delay_days', parseInt(e.target.value) || 1)}
                                  className="w-12 rounded border border-slate-200 px-1.5 py-0.5 text-xs text-center"
                                />
                                <span className="text-xs text-slate-400">dia{step.delay_days !== 1 ? 's' : ''}</span>
                              </div>
                              <div className="flex-1" />
                              <button onClick={() => void deleteStep(step.id)} className="text-slate-300 transition hover:text-rose-500">
                                <Trash2 size={13} strokeWidth={2} />
                              </button>
                            </div>
                            <textarea
                              className={inputClass}
                              rows={2}
                              defaultValue={step.message}
                              onBlur={(e) => { if (e.target.value !== step.message) void updateStep(step.id, 'message', e.target.value); }}
                              placeholder="Mensagem... use {{nome}} para o nome do lead"
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>

            <div className="mt-3 rounded-xl border border-dashed border-slate-300 p-3 space-y-2">
              <p className="text-xs font-medium text-slate-400 uppercase">Novo passo</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 whitespace-nowrap">Enviar após</span>
                <input
                  type="number"
                  min={1}
                  value={newStep.delay_days}
                  onChange={(e) => setNewStep((s) => ({ ...s, delay_days: e.target.value }))}
                  className="w-14 rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-center"
                />
                <span className="text-xs text-slate-500">dias</span>
              </div>
              <textarea
                className={inputClass}
                rows={2}
                value={newStep.message}
                onChange={(e) => setNewStep((s) => ({ ...s, message: e.target.value }))}
                placeholder="Mensagem... use {{nome}} para o nome do lead"
              />
              <button
                onClick={() => void addStep()}
                className="flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                <Plus size={13} strokeWidth={2} />
                Adicionar passo
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="flex-1 pt-8 text-center text-sm text-slate-400">Selecione ou crie uma campanha</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add crm/src/components/RemarketingSettings.tsx
git commit -m "feat(crm): add RemarketingSettings UI component"
```

---

## Task 7: CRM UI — Page + SettingsSidebar

**Files:**
- Create: `crm/src/app/(app)/settings/remarketing/page.tsx`
- Modify: `crm/src/components/SettingsSidebar.tsx`

- [ ] **Step 1: Create remarketing page directory**

```bash
mkdir -p 'crm/src/app/(app)/settings/remarketing'
```

- [ ] **Step 2: Create `crm/src/app/(app)/settings/remarketing/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';
import RemarketingSettings from '@/components/RemarketingSettings';

export default async function RemarketingPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const pool = getPool();
  const [{ rows: campaigns }, { rows: stages }] = await Promise.all([
    pool.query(`
      SELECT c.*,
        (SELECT COUNT(*) FROM remarketing_steps s WHERE s.campaign_id = c.id) AS step_count,
        (SELECT COUNT(*) FROM remarketing_enrollments e WHERE e.campaign_id = c.id AND e.completed_at IS NULL AND e.cancelled_at IS NULL) AS active_enrollments,
        (SELECT COUNT(*) FROM remarketing_enrollments e WHERE e.campaign_id = c.id AND e.completed_at IS NOT NULL) AS completed_enrollments
      FROM remarketing_campaigns c ORDER BY c.created_at ASC
    `),
    pool.query('SELECT id, name FROM stages ORDER BY position ASC'),
  ]);

  return (
    <main className="px-6 py-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Configurações</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-950">Remarketing</h1>
        <p className="mt-1 text-sm text-slate-500">Campanhas automáticas para leads sem resposta</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <RemarketingSettings initialCampaigns={campaigns} stages={stages} />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Update `crm/src/components/SettingsSidebar.tsx`** — add `Repeat2` to imports and add Remarketing link in the Marketing group:

```tsx
// Replace the import line:
import { Building2, Clock, HelpCircle, Kanban, Package, Megaphone } from 'lucide-react';
// With:
import { Building2, Clock, HelpCircle, Kanban, Package, Megaphone, Repeat2 } from 'lucide-react';
```

```tsx
// Replace the Marketing group:
{
  label: 'Marketing',
  items: [
    { href: '/settings/contatos', icon: Megaphone, label: 'Broadcast' },
    { href: '/settings/remarketing', icon: Repeat2, label: 'Remarketing' },
  ],
},
```

- [ ] **Step 4: Commit**

```bash
git add crm/src/app/(app)/settings/remarketing/ crm/src/components/SettingsSidebar.tsx
git commit -m "feat(crm): add remarketing settings page and sidebar link"
```

---

## Task 8: Final Build Verification

**Files:** none

- [ ] **Step 1: Run full bot test suite**

```bash
cd bot
npm test -- --no-coverage
```

Expected: all test files pass (15+), 121+ tests total (7 new remarketing tests).

- [ ] **Step 2: Build CRM**

```bash
cd crm
npm run build 2>&1 | tail -20
```

Expected: build passes. New routes should appear in the route table:
- `/settings/remarketing`
- `/api/remarketing/campaigns`
- `/api/remarketing/campaigns/[id]`
- `/api/remarketing/campaigns/[id]/steps`
- `/api/remarketing/campaigns/[id]/enrollments`
- `/api/remarketing/steps/[id]`

- [ ] **Step 3: Commit if any loose files remain**

```bash
git status
# If clean: no commit needed
```
