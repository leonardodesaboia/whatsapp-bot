# CRM Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the CRM with a global dark sidebar, split settings into dedicated sub-pages, and replace all emojis with Lucide React icons.

**Architecture:** A Next.js App Router route group `(app)` wraps all authenticated pages with a persistent sidebar layout. Settings gain a secondary sidebar and are split into 6 focused sub-pages. `CompanySettings.tsx` is split into 3 focused components (`CompanyInfo`, `BusinessHoursSettings`, `FaqSettings`).

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, lucide-react, @hello-pangea/dnd (existing)

---

## File Map

**Create:**
- `crm/src/app/(app)/layout.tsx` — authenticated layout with `<Sidebar>`
- `crm/src/app/(app)/page.tsx` — funil (moved from `app/page.tsx`)
- `crm/src/app/(app)/leads/[id]/page.tsx` — lead detail (moved)
- `crm/src/app/(app)/settings/layout.tsx` — settings layout with `<SettingsSidebar>`
- `crm/src/app/(app)/settings/page.tsx` — redirect to `/settings/empresa`
- `crm/src/app/(app)/settings/empresa/page.tsx`
- `crm/src/app/(app)/settings/horario/page.tsx`
- `crm/src/app/(app)/settings/faq/page.tsx`
- `crm/src/app/(app)/settings/etapas/page.tsx`
- `crm/src/app/(app)/settings/catalogo/page.tsx`
- `crm/src/app/(app)/settings/contatos/page.tsx`
- `crm/src/components/Sidebar.tsx`
- `crm/src/components/SettingsSidebar.tsx`
- `crm/src/components/CompanyInfo.tsx`
- `crm/src/components/BusinessHoursSettings.tsx`
- `crm/src/components/FaqSettings.tsx`

**Modify:**
- `crm/package.json` — add `lucide-react`
- `crm/src/app/layout.tsx` — remove children wrapping (just html/body/Providers)
- `crm/src/components/StageManager.tsx` — replace "Remover" text button with `Trash2` icon
- `crm/src/components/CatalogSettings.tsx` — replace `×` delete buttons with `X` icon
- `crm/src/components/ContactsSettings.tsx` — replace "Remover" text with `Trash2` icon

**Delete:**
- `crm/src/app/page.tsx`
- `crm/src/app/settings/page.tsx`
- `crm/src/app/leads/[id]/page.tsx`
- `crm/src/components/CompanySettings.tsx`

---

## Task 1: Install lucide-react

**Files:**
- Modify: `crm/package.json`

- [ ] **Step 1: Install lucide-react**

```bash
cd /path/to/project/crm
npm install lucide-react
```

Expected: `lucide-react` appears in `crm/package.json` dependencies.

- [ ] **Step 2: Verify build still passes**

```bash
npm run build 2>&1 | tail -5
```

Expected: Build completes without errors.

- [ ] **Step 3: Commit**

```bash
git add crm/package.json crm/package-lock.json
git commit -m "chore(crm): add lucide-react"
```

---

## Task 2: Sidebar Component

**Files:**
- Create: `crm/src/components/Sidebar.tsx`

- [ ] **Step 1: Create `crm/src/components/Sidebar.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { BarChart2, Settings, LogOut } from 'lucide-react';

const NAV = [
  { href: '/', icon: BarChart2, label: 'Funil de vendas' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-[200px] flex-col bg-[#0f172a]">
      {/* Brand */}
      <div className="px-4 py-5">
        <p className="text-[13px] font-bold text-white leading-none">WhatsApp Bot</p>
        <p className="mt-1 text-[10px] text-slate-500">Painel de controle</p>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-2">
        <p className="mb-1 px-2 text-[9px] font-semibold uppercase tracking-widest text-slate-600">
          Principal
        </p>
        {NAV.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[12px] font-medium transition-colors ${
              isActive(href)
                ? 'bg-[#1e3a5f] text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Icon size={14} strokeWidth={2} />
            {label}
          </Link>
        ))}
      </nav>

      {/* Bottom */}
      <div className="border-t border-slate-800 px-2 py-3 space-y-0.5">
        <Link
          href="/settings"
          className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[12px] font-medium transition-colors ${
            pathname.startsWith('/settings')
              ? 'bg-[#1e3a5f] text-white'
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <Settings size={14} strokeWidth={2} />
          Configurações
        </Link>
        <button
          onClick={() => void signOut({ callbackUrl: '/login' })}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[12px] text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
        >
          <LogOut size={14} strokeWidth={2} />
          Sair
        </button>
        {session?.user?.email && (
          <p className="truncate px-2.5 pt-1 text-[10px] text-slate-600">
            {session.user.email}
          </p>
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add crm/src/components/Sidebar.tsx
git commit -m "feat(crm): add Sidebar component with lucide icons"
```

---

## Task 3: SettingsSidebar Component

**Files:**
- Create: `crm/src/components/SettingsSidebar.tsx`

- [ ] **Step 1: Create `crm/src/components/SettingsSidebar.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, Clock, HelpCircle, Kanban, Package, Megaphone } from 'lucide-react';

const GROUPS = [
  {
    label: 'Negócio',
    items: [
      { href: '/settings/empresa', icon: Building2, label: 'Empresa' },
      { href: '/settings/horario', icon: Clock, label: 'Horário' },
    ],
  },
  {
    label: 'Atendimento',
    items: [
      { href: '/settings/faq', icon: HelpCircle, label: 'FAQ' },
      { href: '/settings/etapas', icon: Kanban, label: 'Etapas' },
      { href: '/settings/catalogo', icon: Package, label: 'Catálogo' },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { href: '/settings/contatos', icon: Megaphone, label: 'Broadcast' },
    ],
  },
];

export default function SettingsSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-[200px] z-30 flex w-[180px] flex-col border-r border-slate-200 bg-white pt-4">
      <div className="px-3 pb-3">
        <p className="text-[11px] font-semibold text-slate-400">Configurações</p>
      </div>
      <nav className="flex-1 overflow-y-auto px-2">
        {GROUPS.map(({ label, items }) => (
          <div key={label} className="mb-4">
            <p className="mb-1 px-2 text-[9px] font-semibold uppercase tracking-widest text-slate-400">
              {label}
            </p>
            {items.map(({ href, icon: Icon, label: itemLabel }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[12px] transition-colors ${
                  pathname === href
                    ? 'bg-slate-100 font-medium text-slate-900'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon size={13} strokeWidth={2} />
                {itemLabel}
              </Link>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add crm/src/components/SettingsSidebar.tsx
git commit -m "feat(crm): add SettingsSidebar component"
```

---

## Task 4: Route Group Layout — (app)

**Files:**
- Create: `crm/src/app/(app)/layout.tsx`
- Modify: `crm/src/app/layout.tsx`

- [ ] **Step 1: Create directory and `crm/src/app/(app)/layout.tsx`**

```tsx
import Sidebar from '@/components/Sidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="ml-[200px] flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Simplify `crm/src/app/layout.tsx`** — remove any layout wrappers that are now in the route group:

Current file already minimal (just html/body/Providers). Verify it matches:

```tsx
import type { Metadata } from 'next';
import './globals.css';
import Providers from '@/components/Providers';

export const metadata: Metadata = {
  title: 'CRM',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

No changes needed if it already looks like this.

- [ ] **Step 3: Commit**

```bash
git add crm/src/app/(app)/layout.tsx
git commit -m "feat(crm): add (app) route group layout with sidebar"
```

---

## Task 5: Move Main Pages to Route Group

**Files:**
- Create: `crm/src/app/(app)/page.tsx` (moved from `app/page.tsx`)
- Create: `crm/src/app/(app)/leads/[id]/page.tsx` (moved)
- Delete: `crm/src/app/page.tsx`
- Delete: `crm/src/app/leads/[id]/page.tsx`

- [ ] **Step 1: Create `crm/src/app/(app)/page.tsx`**

Remove the old header (email + settings link — now handled by the sidebar). New content:

```tsx
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';
import KanbanBoard from '@/components/KanbanBoard';

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const pool = getPool();
  const [stagesResult, leadsResult] = await Promise.all([
    pool.query('SELECT * FROM stages ORDER BY position ASC'),
    pool.query('SELECT * FROM leads ORDER BY updated_at DESC'),
  ]);

  return (
    <main className="px-6 py-6">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-600">
          CRM
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">
          Funil de vendas
        </h1>
      </div>
      <KanbanBoard stages={stagesResult.rows} leads={leadsResult.rows} />
    </main>
  );
}
```

- [ ] **Step 2: Copy `crm/src/app/leads/[id]/page.tsx` to `crm/src/app/(app)/leads/[id]/page.tsx`**

Read the existing file and copy it verbatim — no content changes needed. Just the file location changes.

- [ ] **Step 3: Delete old files**

```bash
rm crm/src/app/page.tsx
rm crm/src/app/leads/[id]/page.tsx
# Remove now-empty dir if applicable
rmdir crm/src/app/leads/[id] 2>/dev/null || true
rmdir crm/src/app/leads 2>/dev/null || true
```

- [ ] **Step 4: Verify build**

```bash
cd crm && npm run build 2>&1 | tail -10
```

Expected: Build passes. Route `/` and `/leads/[id]` still appear in the route table.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(crm): move main pages to (app) route group"
```

---

## Task 6: Settings Layout + Redirect Page

**Files:**
- Create: `crm/src/app/(app)/settings/layout.tsx`
- Create: `crm/src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Create `crm/src/app/(app)/settings/layout.tsx`**

```tsx
import SettingsSidebar from '@/components/SettingsSidebar';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <SettingsSidebar />
      <div className="ml-[180px] flex-1 min-w-0 bg-slate-50">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `crm/src/app/(app)/settings/page.tsx`**

```tsx
import { redirect } from 'next/navigation';

export default function SettingsPage() {
  redirect('/settings/empresa');
}
```

- [ ] **Step 3: Delete old settings page**

```bash
rm crm/src/app/settings/page.tsx
rmdir crm/src/app/settings 2>/dev/null || true
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(crm): add settings layout with SettingsSidebar"
```

---

## Task 7: CompanyInfo Component + /settings/empresa

**Files:**
- Create: `crm/src/components/CompanyInfo.tsx`
- Create: `crm/src/app/(app)/settings/empresa/page.tsx`

- [ ] **Step 1: Create `crm/src/components/CompanyInfo.tsx`**

Handles only: nome, descrição, horário (texto), contato.

```tsx
'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';

interface CompanyData {
  id?: number;
  nome: string;
  descricao: string;
  horario: string;
  contato: string;
}

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100';

export default function CompanyInfo({ initial }: { initial: CompanyData | null }) {
  const [data, setData] = useState<CompanyData>(
    initial ?? { nome: '', descricao: '', horario: '', contato: '' }
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const update = (patch: Partial<CompanyData>) => setData((d) => ({ ...d, ...patch }));

  const handleSave = async () => {
    setSaving(true);
    await fetch('/api/settings/company', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Nome da empresa</label>
          <input className={inputClass} value={data.nome} onChange={(e) => update({ nome: e.target.value })} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Descrição</label>
          <textarea className={inputClass} rows={3} value={data.descricao} onChange={(e) => update({ descricao: e.target.value })} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Horário (texto exibido ao cliente)</label>
          <input className={inputClass} placeholder="ex: Seg–Sex 9h às 18h" value={data.horario} onChange={(e) => update({ horario: e.target.value })} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Contato</label>
          <input className={inputClass} placeholder="e-mail ou telefone" value={data.contato} onChange={(e) => update({ contato: e.target.value })} />
        </div>
      </div>
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          <Save size={13} strokeWidth={2} />
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        {saved && <span className="text-xs text-emerald-600">Salvo!</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `crm/src/app/(app)/settings/empresa/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';
import CompanyInfo from '@/components/CompanyInfo';

export default async function EmpresaPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const pool = getPool();
  const { rows } = await pool.query('SELECT * FROM company_settings LIMIT 1');

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Configurações</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-950">Empresa</h1>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <CompanyInfo initial={rows[0] ?? null} />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add crm/src/components/CompanyInfo.tsx crm/src/app/(app)/settings/empresa/
git commit -m "feat(crm): add CompanyInfo component and /settings/empresa page"
```

---

## Task 8: BusinessHoursSettings Component + /settings/horario

**Files:**
- Create: `crm/src/components/BusinessHoursSettings.tsx`
- Create: `crm/src/app/(app)/settings/horario/page.tsx`

- [ ] **Step 1: Create `crm/src/components/BusinessHoursSettings.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';

interface DaySchedule { open: string; close: string; }
interface BusinessHours { [key: string]: DaySchedule | null; }

interface HoursData {
  timezone: string;
  business_hours: BusinessHours | null;
  closed_message: string;
}

const DAYS = [
  { key: 'mon', label: 'Segunda' },
  { key: 'tue', label: 'Terça' },
  { key: 'wed', label: 'Quarta' },
  { key: 'thu', label: 'Quinta' },
  { key: 'fri', label: 'Sexta' },
  { key: 'sat', label: 'Sábado' },
  { key: 'sun', label: 'Domingo' },
];

const DEFAULT_HOURS: BusinessHours = {
  mon: { open: '09:00', close: '18:00' },
  tue: { open: '09:00', close: '18:00' },
  wed: { open: '09:00', close: '18:00' },
  thu: { open: '09:00', close: '18:00' },
  fri: { open: '09:00', close: '18:00' },
  sat: null,
  sun: null,
};

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100';

export default function BusinessHoursSettings({ initial }: { initial: HoursData | null }) {
  const [data, setData] = useState<HoursData>(
    initial ?? { timezone: 'America/Sao_Paulo', business_hours: DEFAULT_HOURS, closed_message: '' }
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const is24h = data.business_hours === null;
  const update = (patch: Partial<HoursData>) => setData((d) => ({ ...d, ...patch }));

  const toggleDay = (key: string) => {
    const bh = { ...(data.business_hours || DEFAULT_HOURS) };
    bh[key] = bh[key] ? null : { open: '09:00', close: '18:00' };
    update({ business_hours: bh });
  };

  const updateDayHour = (key: string, field: 'open' | 'close', value: string) => {
    const bh = { ...(data.business_hours || DEFAULT_HOURS) };
    bh[key] = { ...(bh[key] as DaySchedule), [field]: value };
    update({ business_hours: bh });
  };

  const handleSave = async () => {
    setSaving(true);
    await fetch('/api/settings/company', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* 24h toggle */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <p className="text-sm font-medium text-slate-800">Atendimento 24 horas</p>
          <p className="text-xs text-slate-400">Desabilita verificação de horário</p>
        </div>
        <button
          onClick={() => update({ business_hours: is24h ? DEFAULT_HOURS : null })}
          className={`relative h-6 w-11 rounded-full transition ${is24h ? 'bg-sky-500' : 'bg-slate-200'}`}
        >
          <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${is24h ? 'left-5' : 'left-0.5'}`} />
        </button>
      </div>

      {!is24h && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Fuso horário</label>
            <input className={inputClass} value={data.timezone} onChange={(e) => update({ timezone: e.target.value })} placeholder="America/Sao_Paulo" />
          </div>
          <div className="space-y-2">
            {DAYS.map(({ key, label }) => {
              const day = data.business_hours?.[key] as DaySchedule | null;
              return (
                <div key={key} className="flex items-center gap-3">
                  <label className="flex w-28 items-center gap-2">
                    <input type="checkbox" checked={!!day} onChange={() => toggleDay(key)} className="accent-sky-500" />
                    <span className="text-sm text-slate-700">{label}</span>
                  </label>
                  {day && (
                    <>
                      <input type="time" value={day.open} onChange={(e) => updateDayHour(key, 'open', e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                      <span className="text-xs text-slate-400">às</span>
                      <input type="time" value={day.close} onChange={(e) => updateDayHour(key, 'close', e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Mensagem quando fechado</label>
            <textarea className={inputClass} rows={2} value={data.closed_message} onChange={(e) => update({ closed_message: e.target.value })} />
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          <Save size={13} strokeWidth={2} />
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        {saved && <span className="text-xs text-emerald-600">Salvo!</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `crm/src/app/(app)/settings/horario/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';
import BusinessHoursSettings from '@/components/BusinessHoursSettings';

export default async function HorarioPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const pool = getPool();
  const { rows } = await pool.query('SELECT timezone, business_hours, closed_message FROM company_settings LIMIT 1');

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Configurações</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-950">Horário de Funcionamento</h1>
      </div>
      <BusinessHoursSettings initial={rows[0] ?? null} />
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add crm/src/components/BusinessHoursSettings.tsx crm/src/app/(app)/settings/horario/
git commit -m "feat(crm): add BusinessHoursSettings component and /settings/horario page"
```

---

## Task 9: FaqSettings Component + /settings/faq

**Files:**
- Create: `crm/src/components/FaqSettings.tsx`
- Create: `crm/src/app/(app)/settings/faq/page.tsx`

- [ ] **Step 1: Create `crm/src/components/FaqSettings.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';

interface FaqItem { pergunta: string; resposta: string; }

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100';

export default function FaqSettings({ initial }: { initial: FaqItem[] }) {
  const [faq, setFaq] = useState<FaqItem[]>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const addItem = () => setFaq((f) => [...f, { pergunta: '', resposta: '' }]);

  const updateItem = (i: number, field: 'pergunta' | 'resposta', value: string) =>
    setFaq((f) => f.map((item, idx) => idx === i ? { ...item, [field]: value } : item));

  const removeItem = (i: number) => setFaq((f) => f.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    setSaving(true);
    await fetch('/api/settings/company', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ faq }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-3">
      {faq.map((item, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Pergunta {i + 1}</span>
            <button onClick={() => removeItem(i)} className="text-slate-300 transition hover:text-rose-500">
              <Trash2 size={13} strokeWidth={2} />
            </button>
          </div>
          <div className="space-y-2">
            <input className={inputClass} placeholder="Pergunta" value={item.pergunta} onChange={(e) => updateItem(i, 'pergunta', e.target.value)} />
            <textarea className={inputClass} rows={2} placeholder="Resposta" value={item.resposta} onChange={(e) => updateItem(i, 'resposta', e.target.value)} />
          </div>
        </div>
      ))}

      <button
        onClick={addItem}
        className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-2.5 text-sm text-slate-500 transition hover:border-slate-400 hover:text-slate-700"
      >
        <Plus size={13} strokeWidth={2} />
        Adicionar pergunta
      </button>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          <Save size={13} strokeWidth={2} />
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        {saved && <span className="text-xs text-emerald-600">Salvo!</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `crm/src/app/(app)/settings/faq/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';
import FaqSettings from '@/components/FaqSettings';

export default async function FaqPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const pool = getPool();
  const { rows } = await pool.query('SELECT faq FROM company_settings LIMIT 1');
  const faq = rows[0]?.faq ?? [];

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Configurações</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-950">FAQ</h1>
      </div>
      <FaqSettings initial={faq} />
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add crm/src/components/FaqSettings.tsx crm/src/app/(app)/settings/faq/
git commit -m "feat(crm): add FaqSettings component and /settings/faq page"
```

---

## Task 10: Remaining Settings Sub-Pages (etapas, catalogo, contatos)

**Files:**
- Create: `crm/src/app/(app)/settings/etapas/page.tsx`
- Create: `crm/src/app/(app)/settings/catalogo/page.tsx`
- Create: `crm/src/app/(app)/settings/contatos/page.tsx`

- [ ] **Step 1: Create `crm/src/app/(app)/settings/etapas/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';
import StageManager from '@/components/StageManager';

export default async function EtapasPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const pool = getPool();
  const { rows: stages } = await pool.query('SELECT * FROM stages ORDER BY position ASC');

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Configurações</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-950">Etapas do Funil</h1>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <StageManager initialStages={stages} />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Create `crm/src/app/(app)/settings/catalogo/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';
import CatalogSettings from '@/components/CatalogSettings';

export default async function CatalogoPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const pool = getPool();
  const [{ rows: categories }, { rows: items }] = await Promise.all([
    pool.query('SELECT * FROM catalog_categories ORDER BY position ASC'),
    pool.query('SELECT * FROM catalog_items ORDER BY position ASC'),
  ]);

  const catalogWithItems = categories.map((cat) => ({
    ...cat,
    items: items.filter((i) => i.category_id === cat.id),
  }));

  return (
    <main className="px-6 py-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Configurações</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-950">Catálogo</h1>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <CatalogSettings initialCategories={catalogWithItems} />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Create `crm/src/app/(app)/settings/contatos/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';
import ContactsSettings from '@/components/ContactsSettings';

export default async function ContatosPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const pool = getPool();
  const [{ rows: contacts }, { rows: leads }, { rows: stages }] = await Promise.all([
    pool.query('SELECT * FROM contacts ORDER BY name ASC'),
    pool.query('SELECT id, phone, name, stage_id FROM leads ORDER BY name ASC'),
    pool.query('SELECT * FROM stages ORDER BY position ASC'),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Configurações</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-950">Contatos (Broadcast)</h1>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <ContactsSettings initialContacts={contacts} leads={leads} stages={stages} />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add crm/src/app/(app)/settings/etapas/ crm/src/app/(app)/settings/catalogo/ crm/src/app/(app)/settings/contatos/
git commit -m "feat(crm): add etapas, catalogo, and contatos settings sub-pages"
```

---

## Task 11: Delete Old Files + Delete CompanySettings

**Files:**
- Delete: `crm/src/components/CompanySettings.tsx`

- [ ] **Step 1: Delete CompanySettings.tsx**

```bash
rm crm/src/components/CompanySettings.tsx
```

- [ ] **Step 2: Verify build — catch any remaining imports**

```bash
cd crm && npm run build 2>&1 | grep -i error | head -20
```

If any file still imports `CompanySettings`, fix the import (should be none — old `settings/page.tsx` was deleted in Task 6).

- [ ] **Step 3: Full build verification**

```bash
cd crm && npm run build 2>&1 | tail -30
```

Expected: Build passes. Route table should show all new routes:
- `/` — funil
- `/leads/[id]`
- `/settings` → redirect
- `/settings/empresa`
- `/settings/horario`
- `/settings/faq`
- `/settings/etapas`
- `/settings/catalogo`
- `/settings/contatos`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(crm): remove CompanySettings (replaced by CompanyInfo, BusinessHoursSettings, FaqSettings)"
```

---

## Task 12: Replace Emojis/Text Buttons with Lucide Icons

**Files:**
- Modify: `crm/src/components/StageManager.tsx`
- Modify: `crm/src/components/CatalogSettings.tsx`
- Modify: `crm/src/components/ContactsSettings.tsx`

- [ ] **Step 1: Update `crm/src/components/StageManager.tsx`**

Add import at top:
```tsx
import { Trash2 } from 'lucide-react';
```

Replace the delete button (currently text "Remover"):
```tsx
// Replace:
<button onClick={() => handleDelete(stage.id)} className="text-sm text-rose-500 transition hover:text-rose-600">
  Remover
</button>

// With:
<button onClick={() => handleDelete(stage.id)} className="text-slate-300 transition hover:text-rose-500">
  <Trash2 size={14} strokeWidth={2} />
</button>
```

- [ ] **Step 2: Update `crm/src/components/CatalogSettings.tsx`**

Add import at top:
```tsx
import { X, Trash2, Pencil } from 'lucide-react';
```

Replace category delete button (currently `×`):
```tsx
// Replace:
<button onClick={(e) => { e.stopPropagation(); void deleteCategory(cat.id); }} className={`ml-1 text-xs ${selectedId === cat.id ? 'text-slate-300 hover:text-white' : 'text-slate-400 hover:text-rose-500'}`}>×</button>

// With:
<button onClick={(e) => { e.stopPropagation(); void deleteCategory(cat.id); }} className={`ml-1 transition ${selectedId === cat.id ? 'text-slate-300 hover:text-white' : 'text-slate-400 hover:text-rose-500'}`}>
  <X size={12} strokeWidth={2.5} />
</button>
```

Replace item "Editar" / "Remover" text buttons:
```tsx
// Replace:
<button onClick={() => setEditingItem(item)} className="text-xs text-sky-600 hover:text-sky-700">Editar</button>
<button onClick={() => void deleteItem(item.id)} className="text-xs text-rose-500 hover:text-rose-600">Remover</button>

// With:
<button onClick={() => setEditingItem(item)} className="text-slate-400 transition hover:text-sky-600">
  <Pencil size={13} strokeWidth={2} />
</button>
<button onClick={() => void deleteItem(item.id)} className="text-slate-400 transition hover:text-rose-500">
  <Trash2 size={13} strokeWidth={2} />
</button>
```

- [ ] **Step 3: Update `crm/src/components/ContactsSettings.tsx`**

Add import at top:
```tsx
import { Trash2 } from 'lucide-react';
```

Replace "Remover" text button in contact list:
```tsx
// Replace:
<button onClick={() => void removeContact(c.id)} className="text-rose-500 hover:text-rose-600 text-xs">Remover</button>

// With:
<button onClick={() => void removeContact(c.id)} className="text-slate-300 transition hover:text-rose-500">
  <Trash2 size={13} strokeWidth={2} />
</button>
```

- [ ] **Step 4: Build verification**

```bash
cd crm && npm run build 2>&1 | tail -5
```

Expected: Build passes, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add crm/src/components/StageManager.tsx crm/src/components/CatalogSettings.tsx crm/src/components/ContactsSettings.tsx
git commit -m "feat(crm): replace text buttons with Lucide icons across settings components"
```

---

## Task 13: Final Build + Add .superpowers to .gitignore

- [ ] **Step 1: Add .superpowers to .gitignore**

```bash
grep -q ".superpowers" .gitignore || echo ".superpowers/" >> .gitignore
```

- [ ] **Step 2: Final full build**

```bash
cd crm && npm run build 2>&1 | tail -20
```

Expected: All routes present, no errors.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: add .superpowers to .gitignore"
```
