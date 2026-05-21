# Remarketing — Design Spec

**Date:** 2026-05-21
**Goal:** Automated drip-campaign remarketing that re-engages WhatsApp leads who stopped responding, with multiple configurable campaigns managed through the CRM.

---

## Overview

When a lead goes silent on WhatsApp for a configurable number of days, they are automatically enrolled in a remarketing campaign. The campaign sends a sequence of messages at defined intervals. If the lead responds at any point, the campaign is cancelled. If the full sequence completes without a response, the lead receives the tag `sem-resposta`.

---

## Data Model

### `remarketing_campaigns`

```sql
CREATE TABLE IF NOT EXISTS remarketing_campaigns (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT true,
  trigger_days INTEGER NOT NULL DEFAULT 3,
  stage_filter INTEGER REFERENCES stages(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

- `trigger_days`: days of WhatsApp inactivity before auto-enrollment
- `stage_filter`: if set, only leads in this funnel stage are enrolled; null = all leads

### `remarketing_steps`

```sql
CREATE TABLE IF NOT EXISTS remarketing_steps (
  id          SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES remarketing_campaigns(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL DEFAULT 0,
  delay_days  INTEGER NOT NULL DEFAULT 1,
  message     TEXT NOT NULL,
  UNIQUE(campaign_id, position)
);
```

- `delay_days` for step 1: days after enrollment. For subsequent steps: days after previous step was sent.
- `message`: plain text, supports `{{nome}}` placeholder (replaced with lead name or "cliente")

### `remarketing_enrollments`

```sql
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

- `current_step`: 0-based index of the next step to send
- `completed_at`: set when all steps have been sent without response
- `cancelled_at`: set when lead responds (any incoming message cancels the enrollment)
- A lead cannot be enrolled in the same campaign twice simultaneously (UNIQUE constraint)

---

## Bot Module — `bot/src/remarketing.js`

### `processRemarketing()`

Called on startup and every hour via `setInterval`. Two phases per run:

**Phase 1 — Auto-enroll:**
```
For each active campaign:
  SELECT leads l WHERE:
    - l.stage_id = campaign.stage_filter (or stage_filter IS NULL)
    - last incoming interaction: MAX(i.created_at) WHERE i.lead_id = l.id AND i.direction = 'in'
      is older than NOW() - trigger_days (or no incoming interaction exists)
    - no active enrollment for this campaign:
      NOT EXISTS (SELECT 1 FROM remarketing_enrollments
                  WHERE campaign_id = campaign.id AND lead_id = l.id
                  AND completed_at IS NULL AND cancelled_at IS NULL)
For each match: INSERT INTO remarketing_enrollments (campaign_id, lead_id)
```

**Phase 2 — Process pending steps:**
```
SELECT enrollments where:
  - completed_at IS NULL AND cancelled_at IS NULL
  - campaign is active
  - current_step < total steps for campaign
  - (last_sent_at IS NULL AND enrolled_at + step[0].delay_days <= NOW())
    OR (last_sent_at + step[current_step].delay_days <= NOW())
For each:
  - Replace {{nome}} in message with lead.name or "cliente"
  - sendText(lead.phone, message)
  - UPDATE last_sent_at = NOW(), current_step += 1
  - If current_step == total steps:
    - Add tag "sem-resposta" to lead
    - UPDATE completed_at = NOW()
```

Tag insertion reuses the existing `leads.tags` JSONB array pattern from `crm.js`.

### `cancelEnrollment(phone)`

Called by `webhook.js` when any message arrives from a lead:
```
UPDATE remarketing_enrollments SET cancelled_at = NOW()
WHERE lead_id = (SELECT id FROM leads WHERE phone = $1)
  AND completed_at IS NULL AND cancelled_at IS NULL
```

### `rescheduleRemarketing()`

Called at bot startup (after `rescheduleAllReminders()`). Calls `processRemarketing()` once to catch up on any steps that should have fired while the bot was offline, then sets the hourly interval.

### Integration with `bot/src/index.js`

```js
const { rescheduleRemarketing } = require('./remarketing');
// In app.listen callback, after rescheduleAllReminders():
await rescheduleRemarketing();
```

### Integration with `bot/src/webhook.js`

```js
const { cancelEnrollment } = require('./remarketing');
// After extracting phone from incoming message (before isHumanMode check):
await cancelEnrollment(phone);
```

---

## CRM API Routes

All routes follow the existing pattern: `getServerSession` auth check + `getPool()` for DB.

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/remarketing/campaigns` | List all campaigns with step count and enrollment stats |
| POST | `/api/remarketing/campaigns` | Create campaign |
| PATCH | `/api/remarketing/campaigns/[id]` | Update name/active/trigger_days/stage_filter |
| DELETE | `/api/remarketing/campaigns/[id]` | Delete campaign (cascades to steps and enrollments) |
| GET | `/api/remarketing/campaigns/[id]/steps` | List steps ordered by position |
| POST | `/api/remarketing/campaigns/[id]/steps` | Create step |
| PATCH | `/api/remarketing/steps/[id]` | Update delay_days or message |
| DELETE | `/api/remarketing/steps/[id]` | Delete step |
| GET | `/api/remarketing/campaigns/[id]/enrollments` | List enrollments with lead name, status, current_step |

---

## CRM UI

### New page: `/settings/remarketing`

Component: `crm/src/components/RemarketingSettings.tsx` (client component)

**Layout:**
- Left panel: list of campaigns (name, active toggle, trigger info, enrollment count)
- Right panel: steps editor for selected campaign (appears when a campaign is selected)
- "Nova campanha" button at bottom of left panel

**Campaign card** shows:
- Name (editable inline)
- Active toggle
- `Trigger: após X dias sem resposta` (editable inline)
- Stage filter dropdown (all stages + option per stage)
- Enrollment stats: `N ativos · M concluídos`
- Delete button (Trash2 icon)

**Steps editor** (right panel):
- Ordered list of steps
- Each step: `Dia X` label (cumulative), delay_days input, message textarea with `{{nome}}` hint
- Drag to reorder (using `@hello-pangea/dnd`)
- Add step button at bottom
- Save button per step (auto-saves on blur is also acceptable)

### `SettingsSidebar.tsx` update

In the Marketing group, add:
```
{ href: '/settings/remarketing', icon: Repeat2, label: 'Remarketing' }
```

Keep Broadcast (`Megaphone`) as is.

---

## File Map

**DB:**
- Modify: `crm/db/migrate.js` — add 3 new tables

**Bot:**
- Create: `bot/src/remarketing.js`
- Create: `bot/tests/remarketing.test.js`
- Modify: `bot/src/index.js` — call `rescheduleRemarketing()` on startup
- Modify: `bot/src/webhook.js` — call `cancelEnrollment(phone)` on incoming message

**CRM API:**
- Create: `crm/src/app/api/remarketing/campaigns/route.ts`
- Create: `crm/src/app/api/remarketing/campaigns/[id]/route.ts`
- Create: `crm/src/app/api/remarketing/campaigns/[id]/steps/route.ts`
- Create: `crm/src/app/api/remarketing/steps/[id]/route.ts`
- Create: `crm/src/app/api/remarketing/campaigns/[id]/enrollments/route.ts`

**CRM UI:**
- Create: `crm/src/components/RemarketingSettings.tsx`
- Create: `crm/src/app/(app)/settings/remarketing/page.tsx`
- Modify: `crm/src/components/SettingsSidebar.tsx` — add Remarketing link

---

## Error Handling

- `processRemarketing()` wraps each lead in try/catch — one failed send does not stop the batch
- `cancelEnrollment()` is fire-and-forget (called in webhook but does not block message processing)
- DB connection errors in `processRemarketing()` are logged and the interval continues

---

## Testing

`bot/tests/remarketing.test.js` mocks `pg` (Pool), `evolutionApi.sendText`, and the leads/enrollments DB queries. Tests cover:

- `processRemarketing()` enrolls leads matching trigger criteria
- `processRemarketing()` skips leads already enrolled
- `processRemarketing()` sends step 1 message after delay_days
- `processRemarketing()` advances current_step after send
- `processRemarketing()` adds tag and sets completed_at when last step sent
- `cancelEnrollment()` sets cancelled_at for active enrollment
- `cancelEnrollment()` is a no-op when no active enrollment exists
- `{{nome}}` is replaced correctly; falls back to "cliente" when name is null
