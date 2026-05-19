# CRM / Funil de Vendas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um CRM com funil de vendas ao bot de WhatsApp, com leads criados automaticamente pelo bot e dashboard Next.js para visualização e gestão.

**Architecture:** Bot ganha `bot/src/crm.js` (write-only ao PostgreSQL) integrado em `webhook.js`. CRM é um serviço Next.js separado (`crm/`) que lê e escreve no mesmo PostgreSQL via API Routes. Autenticação com NextAuth.js Credentials. O PostgreSQL já existente no docker-compose é reutilizado com um banco de dados `crm` separado.

**Tech Stack:** Node.js 20, PostgreSQL 15, Next.js 14 (App Router), TypeScript, Tailwind CSS, NextAuth.js v4, `pg`, `bcryptjs`, `@hello-pangea/dnd`, Jest.

---

## Mapa de arquivos

**Criar:**
- `crm/package.json`
- `crm/tsconfig.json`
- `crm/next.config.js`
- `crm/tailwind.config.js`
- `crm/postcss.config.js`
- `crm/Dockerfile`
- `crm/db/migrate.js`
- `crm/db/seed.js`
- `crm/src/lib/db.ts`
- `crm/src/lib/auth.ts`
- `crm/src/middleware.ts`
- `crm/src/app/layout.tsx`
- `crm/src/app/globals.css`
- `crm/src/app/login/page.tsx`
- `crm/src/app/page.tsx`
- `crm/src/app/leads/[id]/page.tsx`
- `crm/src/app/settings/page.tsx`
- `crm/src/app/api/auth/[...nextauth]/route.ts`
- `crm/src/app/api/stages/route.ts`
- `crm/src/app/api/stages/[id]/route.ts`
- `crm/src/app/api/leads/route.ts`
- `crm/src/app/api/leads/[id]/route.ts`
- `crm/src/app/api/leads/[id]/stage/route.ts`
- `crm/src/components/Providers.tsx`
- `crm/src/components/KanbanBoard.tsx`
- `crm/src/components/LeadCard.tsx`
- `crm/src/components/LeadForm.tsx`
- `crm/src/components/InteractionTimeline.tsx`
- `crm/src/components/StageManager.tsx`
- `bot/src/crm.js`
- `bot/tests/crm.test.js`

**Modificar:**
- `bot/package.json` — adicionar `pg`
- `bot/src/webhook.js` — integrar `upsertLead` e `addInteraction`
- `bot/tests/webhook.test.js` — adicionar mock de `crm` e novos testes
- `docker-compose.yml` — adicionar serviço `crm`, atualizar `bot`
- `.env.example` — adicionar `DATABASE_URL`, `NEXTAUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`

---

## Task 1: Scaffold — infra e diretórios

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env.example`
- Modify: `bot/package.json`
- Create: `crm/package.json`, `crm/tsconfig.json`, `crm/next.config.js`, `crm/tailwind.config.js`, `crm/postcss.config.js`, `crm/Dockerfile`

- [ ] **Step 1: Adicionar `pg` ao `bot/package.json`**

Em `bot/`, executar:

```bash
cd bot && npm install pg && cd ..
```

Verificar que `"pg": "^8.12.0"` (ou mais recente) apareceu em `dependencies`.

- [ ] **Step 2: Adicionar variáveis ao `.env.example`**

Adicionar ao final de `.env.example`:

```bash
# CRM / Funil de Vendas
DATABASE_URL=postgresql://evolution:change-me-strong-random-password@postgres:5432/crm
NEXTAUTH_SECRET=change-me-generate-with-openssl-rand-hex-32
ADMIN_EMAIL=admin@empresa.com
ADMIN_PASSWORD=senha-admin-aqui
```

- [ ] **Step 3: Atualizar `docker-compose.yml`**

Adicionar serviço `crm` após o serviço `bot`:

```yaml
  crm:
    build: ./crm
    restart: always
    ports:
      - "3001:3001"
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/crm
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
      NEXTAUTH_URL: http://localhost:3001
      ADMIN_EMAIL: ${ADMIN_EMAIL}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD}
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - bot-net
```

Adicionar `DATABASE_URL` ao serviço `bot` (no bloco `environment:` existente):

```yaml
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/crm
```

- [ ] **Step 4: Criar `crm/package.json`**

```json
{
  "name": "crm",
  "version": "1.0.0",
  "scripts": {
    "dev": "next dev -p 3001",
    "build": "next build",
    "start": "next start -p 3001",
    "test": "jest"
  },
  "dependencies": {
    "next": "14.2.3",
    "react": "^18",
    "react-dom": "^18",
    "next-auth": "^4.24.7",
    "pg": "^8.12.0",
    "bcryptjs": "^2.4.3",
    "@hello-pangea/dnd": "^16.6.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "@types/pg": "^8.11.6",
    "@types/bcryptjs": "^2.4.6",
    "typescript": "^5",
    "tailwindcss": "^3.4.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8",
    "jest": "^29.7.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.4.6"
  }
}
```

- [ ] **Step 5: Criar `crm/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "es2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 6: Criar `crm/next.config.js`**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {};
module.exports = nextConfig;
```

- [ ] **Step 7: Criar `crm/tailwind.config.js`**

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: { extend: {} },
  plugins: [],
};
```

- [ ] **Step 8: Criar `crm/postcss.config.js`**

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 9: Criar `crm/Dockerfile`**

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/db ./db
COPY --from=builder /app/package.json ./
EXPOSE 3001
CMD ["sh", "-c", "node db/migrate.js && node db/seed.js && npm start"]
```

- [ ] **Step 10: Instalar dependências do CRM**

```bash
cd crm && npm install && cd ..
```

- [ ] **Step 11: Commit**

```bash
git add bot/package.json bot/package-lock.json crm/ docker-compose.yml .env.example
git commit -m "chore: scaffold CRM service with Next.js and pg dependency"
```

---

## Task 2: CRM database — migrate, seed e pool

**Files:**
- Create: `crm/db/migrate.js`
- Create: `crm/db/seed.js`
- Create: `crm/src/lib/db.ts`

- [ ] **Step 1: Criar `crm/db/migrate.js`**

```javascript
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

async function migrate() {
  const adminUrl = new URL(DATABASE_URL);
  const dbName = adminUrl.pathname.slice(1);
  adminUrl.pathname = '/postgres';

  const adminPool = new Pool({ connectionString: adminUrl.toString() });
  const { rows } = await adminPool.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [dbName]
  );
  if (rows.length === 0) {
    await adminPool.query(`CREATE DATABASE "${dbName}"`);
    console.log(`Database "${dbName}" created.`);
  }
  await adminPool.end();

  const pool = new Pool({ connectionString: DATABASE_URL });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stages (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      color VARCHAR(7) NOT NULL DEFAULT '#6b7280',
      position INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      phone VARCHAR(20) UNIQUE NOT NULL,
      name VARCHAR(255),
      stage_id INTEGER REFERENCES stages(id),
      assigned_to VARCHAR(255),
      products TEXT[] DEFAULT '{}',
      estimated_value DECIMAL(10,2),
      tags TEXT[] DEFAULT '{}',
      follow_up_at TIMESTAMPTZ,
      notes TEXT,
      last_message TEXT,
      last_seen_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS interactions (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
      direction VARCHAR(3) NOT NULL,
      content TEXT NOT NULL,
      type VARCHAR(10) NOT NULL DEFAULT 'text',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.end();
  console.log('Migration complete.');
}

migrate().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Criar `crm/db/seed.js`**

```javascript
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

async function seed() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const { rows: stageCount } = await pool.query('SELECT COUNT(*) FROM stages');
  if (parseInt(stageCount[0].count) === 0) {
    const stages = [
      { name: 'Lead', color: '#6b7280', position: 0 },
      { name: 'Qualificado', color: '#3b82f6', position: 1 },
      { name: 'Proposta', color: '#f59e0b', position: 2 },
      { name: 'Fechado', color: '#22c55e', position: 3 },
      { name: 'Perdido', color: '#ef4444', position: 4 },
    ];
    for (const s of stages) {
      await pool.query(
        'INSERT INTO stages (name, color, position) VALUES ($1, $2, $3)',
        [s.name, s.color, s.position]
      );
    }
    console.log('Default stages created.');
  }

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    const { rows } = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (rows.length === 0) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)',
        [email, hash, 'Admin']
      );
      console.log(`Admin user "${email}" created.`);
    }
  }

  await pool.end();
  console.log('Seed complete.');
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
```

- [ ] **Step 3: Criar `crm/src/lib/db.ts`**

```typescript
import { Pool } from 'pg';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}
```

- [ ] **Step 4: Commit**

```bash
git add crm/db/ crm/src/lib/db.ts
git commit -m "feat: add CRM database migration, seed and pool"
```

---

## Task 3: `bot/src/crm.js` — módulo write-only (TDD)

**Files:**
- Create: `bot/tests/crm.test.js`
- Create: `bot/src/crm.js`

- [ ] **Step 1: Criar `bot/tests/crm.test.js`**

```javascript
const mockQuery = jest.fn();
const mockPool = { query: mockQuery };

jest.mock('pg', () => ({
  Pool: jest.fn(() => mockPool),
}));

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/crm';

const { upsertLead, addInteraction } = require('../src/crm');

beforeEach(() => jest.clearAllMocks());

test('upsertLead consulta primeira etapa e faz upsert do lead', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ id: 1 }] })
    .mockResolvedValueOnce({ rows: [] });

  await upsertLead('5511999999999', 'João', 'Olá', 'text');

  expect(mockQuery).toHaveBeenCalledTimes(2);
  expect(mockQuery).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining('SELECT id FROM stages'),
    []
  );
  expect(mockQuery).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining('INSERT INTO leads'),
    expect.arrayContaining(['5511999999999', 'João', 'Olá', 1])
  );
});

test('upsertLead usa stage_id null quando não há etapas', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] });

  await upsertLead('5511999999999', null, 'Olá', 'text');

  expect(mockQuery).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining('INSERT INTO leads'),
    expect.arrayContaining(['5511999999999', null, 'Olá', null])
  );
});

test('upsertLead não lança erro quando PostgreSQL falha', async () => {
  mockQuery.mockRejectedValue(new Error('connection refused'));
  await expect(upsertLead('5511999999999', 'João', 'Olá', 'text')).resolves.not.toThrow();
});

test('addInteraction insere interação pelo phone do lead', async () => {
  mockQuery.mockResolvedValue({ rows: [] });

  await addInteraction('5511999999999', 'Olá', 'in', 'text');

  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO interactions'),
    ['5511999999999', 'Olá', 'in', 'text']
  );
});

test('addInteraction não lança erro quando PostgreSQL falha', async () => {
  mockQuery.mockRejectedValue(new Error('connection refused'));
  await expect(addInteraction('5511999999999', 'Olá', 'in', 'text')).resolves.not.toThrow();
});
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
cd bot && npx jest tests/crm.test.js --no-coverage
```

Saída esperada: `Cannot find module '../src/crm'`

- [ ] **Step 3: Criar `bot/src/crm.js`**

```javascript
const { Pool } = require('pg');

let _pool;

function getPool() {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return _pool;
}

async function upsertLead(phone, name, lastMessage, type) {
  try {
    const pool = getPool();
    const stageRes = await pool.query('SELECT id FROM stages ORDER BY position ASC LIMIT 1', []);
    const stageId = stageRes.rows[0]?.id || null;
    await pool.query(
      `INSERT INTO leads (phone, name, last_message, last_seen_at, stage_id)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (phone) DO UPDATE SET
         name = COALESCE(leads.name, EXCLUDED.name),
         last_message = EXCLUDED.last_message,
         last_seen_at = NOW(),
         updated_at = NOW()`,
      [phone, name || null, lastMessage, stageId]
    );
  } catch (err) {
    console.error('CRM upsertLead error:', err.message);
  }
}

async function addInteraction(phone, content, direction, type) {
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO interactions (lead_id, content, direction, type)
       SELECT id, $2, $3, $4 FROM leads WHERE phone = $1`,
      [phone, content, direction, type]
    );
  } catch (err) {
    console.error('CRM addInteraction error:', err.message);
  }
}

module.exports = { upsertLead, addInteraction };
```

- [ ] **Step 4: Rodar para confirmar que passa**

```bash
npx jest tests/crm.test.js --no-coverage
```

Saída esperada: `PASS tests/crm.test.js` — 5 testes passando.

- [ ] **Step 5: Commit**

```bash
cd ..
git add bot/src/crm.js bot/tests/crm.test.js
git commit -m "feat: add CRM write-only module for bot integration"
```

---

## Task 4: Integrar CRM em `webhook.js` (TDD)

**Files:**
- Modify: `bot/src/webhook.js`
- Modify: `bot/tests/webhook.test.js`

- [ ] **Step 1: Adicionar mock de `crm` ao topo de `bot/tests/webhook.test.js`**

Adicionar junto ao bloco de mocks existentes:

```javascript
jest.mock('../src/crm', () => ({
  upsertLead: jest.fn(),
  addInteraction: jest.fn(),
}));
```

Adicionar ao bloco de requires:

```javascript
const { upsertLead, addInteraction } = require('../src/crm');
```

Adicionar no `beforeEach`:

```javascript
  upsertLead.mockResolvedValue(undefined);
  addInteraction.mockResolvedValue(undefined);
```

- [ ] **Step 2: Adicionar novos testes ao final de `bot/tests/webhook.test.js`**

```javascript
test('chama upsertLead e addInteraction (in) quando mensagem de texto chega', async () => {
  isHumanMode.mockResolvedValue(false);
  isOpen.mockReturnValue(true);
  getHistory.mockResolvedValue([]);
  chat.mockResolvedValue('Olá!');
  appendHistory.mockResolvedValue(undefined);
  sendText.mockResolvedValue(undefined);

  await request(app).post('/webhook').set('x-api-key', 'test-token').send(validPayload).expect(200);
  await new Promise((r) => setTimeout(r, 100));

  expect(upsertLead).toHaveBeenCalledWith(
    '5511999999999',
    null,
    'Qual o horário de atendimento?',
    'text'
  );
  expect(addInteraction).toHaveBeenCalledWith(
    '5511999999999',
    'Qual o horário de atendimento?',
    'in',
    'text'
  );
  expect(addInteraction).toHaveBeenCalledWith('5511999999999', 'Olá!', 'out', 'text');
});

test('chama upsertLead com pushName quando disponível', async () => {
  const payloadWithName = {
    ...validPayload,
    data: { ...validPayload.data, pushName: 'João Silva' },
  };
  isHumanMode.mockResolvedValue(false);
  isOpen.mockReturnValue(true);
  getHistory.mockResolvedValue([]);
  chat.mockResolvedValue('Olá!');
  appendHistory.mockResolvedValue(undefined);
  sendText.mockResolvedValue(undefined);

  await request(app).post('/webhook').set('x-api-key', 'test-token').send(payloadWithName).expect(200);
  await new Promise((r) => setTimeout(r, 100));

  expect(upsertLead).toHaveBeenCalledWith(
    '5511999999999',
    'João Silva',
    'Qual o horário de atendimento?',
    'text'
  );
});

test('chama upsertLead com type audio quando mensagem de áudio chega', async () => {
  const audioPayload = {
    event: 'messages.upsert',
    data: {
      key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id: 'msg-audio' },
      message: { audioMessage: {} },
    },
  };
  transcribeAudio.mockResolvedValue('texto transcrito');
  isHumanMode.mockResolvedValue(false);
  isOpen.mockReturnValue(true);
  getHistory.mockResolvedValue([]);
  chat.mockResolvedValue('Resposta');
  appendHistory.mockResolvedValue(undefined);
  sendText.mockResolvedValue(undefined);

  await request(app).post('/webhook').set('x-api-key', 'test-token').send(audioPayload).expect(200);
  await new Promise((r) => setTimeout(r, 100));

  expect(upsertLead).toHaveBeenCalledWith('5511999999999', null, '[áudio]', 'audio');
  expect(addInteraction).toHaveBeenCalledWith('5511999999999', '[áudio]', 'in', 'audio');
});
```

- [ ] **Step 3: Rodar para confirmar que os novos testes falham**

```bash
cd bot && npx jest tests/webhook.test.js --no-coverage 2>&1 | tail -15
```

Saída esperada: falhas nos 3 novos testes — `upsertLead` não foi chamado.

- [ ] **Step 4: Atualizar `bot/src/webhook.js`**

Adicionar ao bloco de requires no topo:

```javascript
const { upsertLead, addInteraction } = require('./crm');
```

No bloco do IIFE em `handleWebhook`, substituir o trecho atual:

```javascript
  (async () => {
    try {
      if (hasImage) {
        await handleImageMessage(phone, data);
        return;
      }

      let messageText = text;
      if (hasAudio) {
        messageText = await transcribeAudio(data);
        if (!messageText) return;
      }

      const reply = await processMessage(phone, messageText);
      if (reply) await sendText(phone, reply);
    } catch (err) {
      console.error('Erro ao processar mensagem:', err.message);
    }
  })();
```

pelo seguinte:

```javascript
  (async () => {
    try {
      const messageType = hasImage ? 'image' : hasAudio ? 'audio' : 'text';
      const incomingContent = text || (hasAudio ? '[áudio]' : '[imagem]');
      const pushName = data.pushName || null;

      await upsertLead(phone, pushName, incomingContent, messageType);
      await addInteraction(phone, incomingContent, 'in', messageType);

      if (hasImage) {
        await handleImageMessage(phone, data);
        return;
      }

      let messageText = text;
      if (hasAudio) {
        messageText = await transcribeAudio(data);
        if (!messageText) return;
      }

      const reply = await processMessage(phone, messageText);
      if (reply) {
        await sendText(phone, reply);
        await addInteraction(phone, reply, 'out', 'text');
      }
    } catch (err) {
      console.error('Erro ao processar mensagem:', err.message);
    }
  })();
```

- [ ] **Step 5: Rodar todos os testes do bot**

```bash
npx jest --no-coverage
```

Saída esperada: 14 test suites (os 13 anteriores + `crm.test.js`), todos passando (exceto `payment` e `scheduling` que falham por dependências externas ausentes — pré-existente).

- [ ] **Step 6: Commit**

```bash
cd ..
git add bot/src/webhook.js bot/tests/webhook.test.js
git commit -m "feat: integrate CRM lead tracking into webhook pipeline"
```

---

## Task 5: Next.js — autenticação (NextAuth + login + middleware)

**Files:**
- Create: `crm/src/lib/auth.ts`
- Create: `crm/src/app/api/auth/[...nextauth]/route.ts`
- Create: `crm/src/middleware.ts`
- Create: `crm/src/app/layout.tsx`
- Create: `crm/src/app/globals.css`
- Create: `crm/src/components/Providers.tsx`
- Create: `crm/src/app/login/page.tsx`

- [ ] **Step 1: Criar `crm/src/lib/auth.ts`**

```typescript
import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { getPool } from './db';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const pool = getPool();
        const { rows } = await pool.query(
          'SELECT * FROM users WHERE email = $1',
          [credentials.email]
        );
        const user = rows[0];
        if (!user) return null;
        const valid = await bcrypt.compare(credentials.password, user.password_hash);
        if (!valid) return null;
        return { id: user.id.toString(), email: user.email, name: user.name };
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
};
```

- [ ] **Step 2: Criar `crm/src/app/api/auth/[...nextauth]/route.ts`**

Criar os diretórios necessários e o arquivo:

```typescript
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

- [ ] **Step 3: Criar `crm/src/middleware.ts`**

```typescript
import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: { signIn: '/login' },
});

export const config = {
  matcher: ['/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 4: Criar `crm/src/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 5: Criar `crm/src/components/Providers.tsx`**

```typescript
'use client';

import { SessionProvider } from 'next-auth/react';

export default function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

- [ ] **Step 6: Criar `crm/src/app/layout.tsx`**

```typescript
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Providers from '@/components/Providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'CRM',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 7: Criar `crm/src/app/login/page.tsx`**

```typescript
'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await signIn('credentials', { email, password, redirect: false });
    if (res?.error) {
      setError('Email ou senha incorretos.');
    } else {
      router.push('/');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-xl shadow-sm w-full max-w-sm border border-gray-100">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">CRM</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            className="w-full bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Commit**

```bash
git add crm/src/
git commit -m "feat: add NextAuth authentication with Credentials provider"
```

---

## Task 6: API Routes — etapas (stages CRUD)

**Files:**
- Create: `crm/src/app/api/stages/route.ts`
- Create: `crm/src/app/api/stages/[id]/route.ts`

- [ ] **Step 1: Criar `crm/src/app/api/stages/route.ts`**

```typescript
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pool = getPool();
  const { rows } = await pool.query('SELECT * FROM stages ORDER BY position ASC');
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, color } = await req.json();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const pool = getPool();
  const { rows: maxRows } = await pool.query(
    'SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM stages'
  );
  const { rows } = await pool.query(
    'INSERT INTO stages (name, color, position) VALUES ($1, $2, $3) RETURNING *',
    [name, color || '#6b7280', maxRows[0].pos]
  );
  return NextResponse.json(rows[0], { status: 201 });
}
```

- [ ] **Step 2: Criar `crm/src/app/api/stages/[id]/route.ts`**

```typescript
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { NextResponse } from 'next/server';

interface Params { params: { id: string } }

export async function PATCH(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, color, position } = await req.json();
  const pool = getPool();

  const sets: string[] = [];
  const values: unknown[] = [];
  if (name !== undefined) { values.push(name); sets.push(`name = $${values.length}`); }
  if (color !== undefined) { values.push(color); sets.push(`color = $${values.length}`); }
  if (position !== undefined) { values.push(position); sets.push(`position = $${values.length}`); }

  if (sets.length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

  values.push(params.id);
  const { rows } = await pool.query(
    `UPDATE stages SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  if (!rows[0]) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pool = getPool();
  const { rows: firstStage } = await pool.query(
    'SELECT id FROM stages WHERE id != $1 ORDER BY position ASC LIMIT 1',
    [params.id]
  );
  const fallbackId = firstStage[0]?.id || null;

  await pool.query('UPDATE leads SET stage_id = $1 WHERE stage_id = $2', [fallbackId, params.id]);
  await pool.query('DELETE FROM stages WHERE id = $1', [params.id]);

  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 3: Commit**

```bash
git add crm/src/app/api/stages/
git commit -m "feat: add stages CRUD API routes"
```

---

## Task 7: API Routes — leads CRUD

**Files:**
- Create: `crm/src/app/api/leads/route.ts`
- Create: `crm/src/app/api/leads/[id]/route.ts`
- Create: `crm/src/app/api/leads/[id]/stage/route.ts`

- [ ] **Step 1: Criar `crm/src/app/api/leads/route.ts`**

```typescript
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const stageId = searchParams.get('stage_id');
  const assignedTo = searchParams.get('assigned_to');
  const tag = searchParams.get('tag');
  const product = searchParams.get('product');

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (stageId) { values.push(stageId); conditions.push(`l.stage_id = $${values.length}`); }
  if (assignedTo) { values.push(assignedTo); conditions.push(`l.assigned_to = $${values.length}`); }
  if (tag) { values.push(tag); conditions.push(`$${values.length} = ANY(l.tags)`); }
  if (product) { values.push(product); conditions.push(`$${values.length} = ANY(l.products)`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT l.*, s.name AS stage_name, s.color AS stage_color
     FROM leads l LEFT JOIN stages s ON l.stage_id = s.id
     ${where} ORDER BY l.updated_at DESC`,
    values
  );
  return NextResponse.json(rows);
}
```

- [ ] **Step 2: Criar `crm/src/app/api/leads/[id]/route.ts`**

```typescript
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { NextResponse } from 'next/server';

interface Params { params: { id: string } }

export async function GET(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pool = getPool();
  const [leadResult, interactionsResult] = await Promise.all([
    pool.query(
      'SELECT l.*, s.name AS stage_name FROM leads l LEFT JOIN stages s ON l.stage_id = s.id WHERE l.id = $1',
      [params.id]
    ),
    pool.query(
      'SELECT * FROM interactions WHERE lead_id = $1 ORDER BY created_at ASC',
      [params.id]
    ),
  ]);

  if (!leadResult.rows[0]) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ lead: leadResult.rows[0], interactions: interactionsResult.rows });
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const allowed = ['name', 'stage_id', 'assigned_to', 'products', 'estimated_value', 'tags', 'follow_up_at', 'notes'];

  const sets: string[] = [];
  const values: unknown[] = [];

  for (const key of allowed) {
    if (key in body) {
      values.push(body[key]);
      sets.push(`${key} = $${values.length}`);
    }
  }

  if (sets.length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

  sets.push('updated_at = NOW()');
  values.push(params.id);

  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE leads SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  if (!rows[0]) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(rows[0]);
}
```

- [ ] **Step 3: Criar `crm/src/app/api/leads/[id]/stage/route.ts`**

```typescript
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { stage_id } = await req.json();
  if (stage_id === undefined) return NextResponse.json({ error: 'stage_id is required' }, { status: 400 });

  const pool = getPool();
  const { rows } = await pool.query(
    'UPDATE leads SET stage_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [stage_id, params.id]
  );
  if (!rows[0]) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(rows[0]);
}
```

- [ ] **Step 4: Commit**

```bash
git add crm/src/app/api/leads/
git commit -m "feat: add leads CRUD API routes"
```

---

## Task 8: Kanban board — página principal

**Files:**
- Create: `crm/src/components/KanbanBoard.tsx`
- Create: `crm/src/components/LeadCard.tsx`
- Create: `crm/src/app/page.tsx`

- [ ] **Step 1: Criar `crm/src/components/LeadCard.tsx`**

```typescript
'use client';

import Link from 'next/link';

interface Lead {
  id: number;
  phone: string;
  name: string | null;
  last_message: string | null;
  tags: string[];
  estimated_value: string | null;
  follow_up_at: string | null;
}

export default function LeadCard({ lead }: { lead: Lead }) {
  const isOverdue = lead.follow_up_at && new Date(lead.follow_up_at) < new Date();

  return (
    <Link href={`/leads/${lead.id}`}>
      <div className="bg-white rounded-lg p-3 mb-2 shadow-sm hover:shadow-md transition-shadow cursor-pointer border border-gray-100">
        <p className="font-medium text-sm text-gray-900 truncate">{lead.name || lead.phone}</p>
        {lead.name && <p className="text-xs text-gray-400">{lead.phone}</p>}
        {lead.last_message && (
          <p className="text-xs text-gray-400 mt-1 truncate">{lead.last_message}</p>
        )}
        {lead.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {lead.tags.slice(0, 3).map(tag => (
              <span key={tag} className="text-xs bg-blue-50 text-blue-600 rounded px-1.5 py-0.5">
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between mt-2">
          {lead.estimated_value && (
            <p className="text-xs font-medium text-green-600">
              R$ {parseFloat(lead.estimated_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          )}
          {lead.follow_up_at && (
            <p className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
              {new Date(lead.follow_up_at).toLocaleDateString('pt-BR')}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Criar `crm/src/components/KanbanBoard.tsx`**

```typescript
'use client';

import { useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import LeadCard from './LeadCard';

interface Stage {
  id: number;
  name: string;
  color: string;
  position: number;
}

interface Lead {
  id: number;
  phone: string;
  name: string | null;
  stage_id: number;
  last_message: string | null;
  tags: string[];
  estimated_value: string | null;
  follow_up_at: string | null;
}

interface Props {
  stages: Stage[];
  leads: Lead[];
}

export default function KanbanBoard({ stages, leads: initialLeads }: Props) {
  const [leads, setLeads] = useState(initialLeads);

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const leadId = parseInt(result.draggableId);
    const newStageId = parseInt(result.destination.droppableId);

    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage_id: newStageId } : l));

    await fetch(`/api/leads/${leadId}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage_id: newStageId }),
    });
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[calc(100vh-140px)]">
        {stages.map(stage => {
          const stageLeads = leads.filter(l => l.stage_id === stage.id);
          return (
            <Droppable key={stage.id} droppableId={stage.id.toString()}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`flex-shrink-0 w-72 rounded-lg p-3 transition-colors ${
                    snapshot.isDraggingOver ? 'bg-blue-50' : 'bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                    <h3 className="font-semibold text-sm text-gray-700">{stage.name}</h3>
                    <span className="ml-auto text-xs text-gray-400 bg-gray-200 rounded-full px-2 py-0.5">
                      {stageLeads.length}
                    </span>
                  </div>
                  {stageLeads.map((lead, index) => (
                    <Draggable key={lead.id} draggableId={lead.id.toString()} index={index}>
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                        >
                          <LeadCard lead={lead} />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          );
        })}
      </div>
    </DragDropContext>
  );
}
```

- [ ] **Step 3: Criar `crm/src/app/page.tsx`**

```typescript
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getPool } from '@/lib/db';
import KanbanBoard from '@/components/KanbanBoard';
import Link from 'next/link';

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const pool = getPool();
  const [stagesResult, leadsResult] = await Promise.all([
    pool.query('SELECT * FROM stages ORDER BY position ASC'),
    pool.query('SELECT * FROM leads ORDER BY updated_at DESC'),
  ]);

  return (
    <main className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Funil de Vendas</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{session.user?.email}</span>
          <Link href="/settings" className="text-sm text-blue-600 hover:underline">
            Configurações
          </Link>
        </div>
      </div>
      <KanbanBoard stages={stagesResult.rows} leads={leadsResult.rows} />
    </main>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add crm/src/components/KanbanBoard.tsx crm/src/components/LeadCard.tsx crm/src/app/page.tsx
git commit -m "feat: add kanban board with drag-and-drop"
```

---

## Task 9: Lead detail page

**Files:**
- Create: `crm/src/components/LeadForm.tsx`
- Create: `crm/src/components/InteractionTimeline.tsx`
- Create: `crm/src/app/leads/[id]/page.tsx`

- [ ] **Step 1: Criar `crm/src/components/InteractionTimeline.tsx`**

```typescript
interface Interaction {
  id: number;
  direction: string;
  content: string;
  type: string;
  created_at: string;
}

export default function InteractionTimeline({ interactions }: { interactions: Interaction[] }) {
  if (interactions.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-6">Nenhuma interação registrada.</p>;
  }

  return (
    <div className="space-y-3">
      {interactions.map(i => (
        <div key={i.id} className={`flex ${i.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
          <div
            className={`max-w-sm rounded-lg px-3 py-2 text-sm ${
              i.direction === 'out' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'
            }`}
          >
            <p className="whitespace-pre-wrap">{i.content}</p>
            <p className={`text-xs mt-1 ${i.direction === 'out' ? 'text-blue-100' : 'text-gray-400'}`}>
              {new Date(i.created_at).toLocaleString('pt-BR')}
              {i.type !== 'text' && ` · ${i.type}`}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Criar `crm/src/components/LeadForm.tsx`**

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Stage { id: number; name: string; color: string }

interface Lead {
  id: number;
  phone: string;
  name: string | null;
  stage_id: number | null;
  assigned_to: string | null;
  products: string[];
  estimated_value: string | null;
  tags: string[];
  follow_up_at: string | null;
  notes: string | null;
}

export default function LeadForm({ lead, stages }: { lead: Lead; stages: Stage[] }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: lead.name || '',
    assigned_to: lead.assigned_to || '',
    products: (lead.products || []).join(', '),
    estimated_value: lead.estimated_value || '',
    tags: (lead.tags || []).join(', '),
    follow_up_at: lead.follow_up_at ? lead.follow_up_at.slice(0, 16) : '',
    notes: lead.notes || '',
    stage_id: lead.stage_id?.toString() || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await fetch(`/api/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name || null,
        assigned_to: form.assigned_to || null,
        products: form.products ? form.products.split(',').map(s => s.trim()).filter(Boolean) : [],
        estimated_value: form.estimated_value ? parseFloat(form.estimated_value) : null,
        tags: form.tags ? form.tags.split(',').map(s => s.trim()).filter(Boolean) : [],
        follow_up_at: form.follow_up_at || null,
        notes: form.notes || null,
        stage_id: form.stage_id ? parseInt(form.stage_id) : null,
      }),
    });
    setSaving(false);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
          <input type="text" value={form.name} onChange={set('name')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Etapa</label>
          <select value={form.stage_id} onChange={set('stage_id')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Sem etapa</option>
            {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Responsável</label>
          <input type="text" value={form.assigned_to} onChange={set('assigned_to')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Valor estimado (R$)</label>
          <input type="number" step="0.01" value={form.estimated_value} onChange={set('estimated_value')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Produtos (separados por vírgula)</label>
          <input type="text" value={form.products} onChange={set('products')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tags (separadas por vírgula)</label>
          <input type="text" value={form.tags} onChange={set('tags')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Próximo contato</label>
          <input type="datetime-local" value={form.follow_up_at} onChange={set('follow_up_at')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
        <textarea value={form.notes} onChange={set('notes')} rows={4}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <button type="submit" disabled={saving}
        className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
        {saving ? 'Salvando...' : 'Salvar'}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Criar `crm/src/app/leads/[id]/page.tsx`**

```typescript
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { getPool } from '@/lib/db';
import LeadForm from '@/components/LeadForm';
import InteractionTimeline from '@/components/InteractionTimeline';
import Link from 'next/link';

interface Props { params: { id: string } }

export default async function LeadDetailPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const pool = getPool();
  const [leadResult, interactionsResult, stagesResult] = await Promise.all([
    pool.query(
      'SELECT l.*, s.name AS stage_name FROM leads l LEFT JOIN stages s ON l.stage_id = s.id WHERE l.id = $1',
      [params.id]
    ),
    pool.query(
      'SELECT * FROM interactions WHERE lead_id = $1 ORDER BY created_at ASC',
      [params.id]
    ),
    pool.query('SELECT * FROM stages ORDER BY position ASC'),
  ]);

  if (!leadResult.rows[0]) notFound();
  const lead = leadResult.rows[0];

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href="/" className="text-sm text-blue-600 hover:underline">← Voltar ao funil</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">{lead.name || lead.phone}</h1>
        <p className="text-gray-500 text-sm">{lead.phone}</p>
      </div>
      <div className="space-y-6">
        <section className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Dados do Lead</h2>
          <LeadForm lead={lead} stages={stagesResult.rows} />
        </section>
        <section className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Histórico de Interações
            <span className="ml-2 text-sm font-normal text-gray-400">
              ({interactionsResult.rows.length})
            </span>
          </h2>
          <InteractionTimeline interactions={interactionsResult.rows} />
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add crm/src/components/LeadForm.tsx crm/src/components/InteractionTimeline.tsx crm/src/app/leads/
git commit -m "feat: add lead detail page with edit form and interaction timeline"
```

---

## Task 10: Settings page — gerenciar etapas

**Files:**
- Create: `crm/src/components/StageManager.tsx`
- Create: `crm/src/app/settings/page.tsx`

- [ ] **Step 1: Criar `crm/src/components/StageManager.tsx`**

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Stage { id: number; name: string; color: string; position: number }

export default function StageManager({ initialStages }: { initialStages: Stage[] }) {
  const router = useRouter();
  const [stages, setStages] = useState(initialStages);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6b7280');

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const res = await fetch('/api/stages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), color: newColor }),
    });
    const stage = await res.json();
    setStages(prev => [...prev, stage]);
    setNewName('');
    setNewColor('#6b7280');
  };

  const handleUpdate = async (id: number, updates: Partial<Stage>) => {
    await fetch(`/api/stages/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    setStages(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Leads nesta etapa serão movidos para a primeira etapa. Confirmar?')) return;
    await fetch(`/api/stages/${id}`, { method: 'DELETE' });
    setStages(prev => prev.filter(s => s.id !== id));
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {stages.map(stage => (
          <div key={stage.id} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3 border border-gray-100">
            <input
              type="color"
              defaultValue={stage.color}
              onBlur={e => handleUpdate(stage.id, { color: e.target.value })}
              className="w-8 h-8 rounded cursor-pointer border border-gray-200 p-0.5"
            />
            <input
              type="text"
              defaultValue={stage.name}
              onBlur={e => {
                if (e.target.value && e.target.value !== stage.name) {
                  handleUpdate(stage.id, { name: e.target.value });
                }
              }}
              className="flex-1 text-sm bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-2 py-1"
            />
            <button
              onClick={() => handleDelete(stage.id)}
              className="text-red-400 hover:text-red-600 text-sm px-2 transition-colors"
            >
              Remover
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
        <input
          type="color"
          value={newColor}
          onChange={e => setNewColor(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border border-gray-200 p-0.5"
        />
        <input
          type="text"
          placeholder="Nome da nova etapa"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleAdd}
          className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
        >
          Adicionar
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Criar `crm/src/app/settings/page.tsx`**

```typescript
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getPool } from '@/lib/db';
import StageManager from '@/components/StageManager';
import Link from 'next/link';

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const pool = getPool();
  const { rows: stages } = await pool.query('SELECT * FROM stages ORDER BY position ASC');

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/" className="text-sm text-blue-600 hover:underline">← Voltar ao funil</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Configurações</h1>
      </div>
      <section className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Etapas do Funil</h2>
        <StageManager initialStages={stages} />
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Rodar o build do CRM para verificar erros de TypeScript**

```bash
cd crm && npm run build 2>&1 | tail -20
```

Saída esperada: `Route (app) ... ✓ Compiled successfully` — sem erros de TypeScript.

- [ ] **Step 4: Commit final**

```bash
cd ..
git add crm/src/components/StageManager.tsx crm/src/app/settings/
git commit -m "feat: add settings page for funnel stage management"
```

---

## Verificação final

Após implementar todas as tasks, subir com Docker:

```bash
docker compose up -d crm
docker compose logs -f crm
```

Saída esperada nos logs:
```
Database "crm" created.   (ou já existe)
Migration complete.
Default stages created.
Admin user "admin@empresa.com" created.
  ▲ Next.js 14.x.x
  - Local: http://localhost:3001
```

Acessar `http://localhost:3001` — deve redirecionar para `/login`. Fazer login com `ADMIN_EMAIL` e `ADMIN_PASSWORD`. Verificar kanban com as 5 etapas padrão.
