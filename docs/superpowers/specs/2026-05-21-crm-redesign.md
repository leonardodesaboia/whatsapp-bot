# CRM Redesign — Design Spec

**Date:** 2026-05-21
**Goal:** Give the CRM a professional system-like look with a global sidebar, split settings into dedicated sub-pages, and replace all emojis with Lucide React icons.

---

## Summary of Changes

1. **Global sidebar** on all authenticated pages (hidden on `/login`)
2. **Settings split** into 7 dedicated sub-pages with their own secondary nav
3. **Business hours** extracted from CompanySettings into its own page
4. **lucide-react** installed and used throughout — no emojis

---

## Layout Architecture

### Route Structure (App Router)

```
crm/src/app/
  layout.tsx              ← root layout (no sidebar, just Providers)
  login/page.tsx          ← unchanged
  (app)/                  ← route group — all authenticated pages
    layout.tsx            ← injects <Sidebar> + main content wrapper
    page.tsx              ← funil de vendas (moved from app/page.tsx)
    leads/[id]/page.tsx   ← unchanged content, inherits sidebar
    settings/
      layout.tsx          ← settings sub-nav (secondary sidebar)
      page.tsx            ← redirect → /settings/empresa
      empresa/page.tsx    ← nome, descrição, horário (texto), contato
      horario/page.tsx    ← business hours toggle, per-day schedule, timezone, closed message
      faq/page.tsx        ← FAQ items
      etapas/page.tsx     ← funnel stages
      catalogo/page.tsx   ← catalog categories + items
      contatos/page.tsx   ← broadcast contacts
```

Using a route group `(app)` means `login` stays outside the sidebar layout without any conditional logic.

---

## Sidebar Component (`crm/src/components/Sidebar.tsx`)

Client component. Fixed left, `w-[200px]`, background `#0f172a`.

**Structure:**
- Top: logo/brand ("WhatsApp Bot" + subtitle "Painel de controle")
- Nav section "PRINCIPAL":
  - `BarChart2` → Funil de vendas (`/`)
- Spacer (`flex-1`)
- Bottom (separated by top border):
  - `Settings` → Configurações (`/settings`)
  - `LogOut` → logout (calls `signOut()` from next-auth)
  - User email (small, muted)

Active state: item matching current pathname gets `bg-[#1e3a5f]` + white text. Others: muted slate.

---

## Settings Secondary Nav (`crm/src/components/SettingsSidebar.tsx`)

Server or client component. White background, `w-[180px]`, right border.

**Groups:**

**NEGÓCIO**
- `Building2` → Empresa (`/settings/empresa`)
- `Clock` → Horário (`/settings/horario`)

**ATENDIMENTO**
- `HelpCircle` → FAQ (`/settings/faq`)
- `Kanban` → Etapas (`/settings/etapas`)
- `Package` → Catálogo (`/settings/catalogo`)

**MARKETING**
- `Megaphone` → Broadcast (`/settings/contatos`)

Active item: `bg-slate-100` + `text-slate-900` font-medium. Inactive: `text-slate-500`.

---

## Settings Sub-Pages

Each page is a Server Component that:
1. Checks session (redirect if unauthenticated)
2. Fetches only the data it needs
3. Renders the corresponding client component

| Route | Component | Data fetched |
|-------|-----------|-------------|
| `/settings/empresa` | `CompanyInfo` (renamed/split from CompanySettings) | `company_settings` |
| `/settings/horario` | `BusinessHoursSettings` (extracted) | `company_settings` |
| `/settings/faq` | `FaqSettings` (extracted) | `company_settings` |
| `/settings/etapas` | `StageManager` (unchanged) | `stages` |
| `/settings/catalogo` | `CatalogSettings` (unchanged) | `catalog_categories`, `catalog_items` |
| `/settings/contatos` | `ContactsSettings` (unchanged) | `contacts`, `leads`, `stages` |

### CompanySettings.tsx split

Current `CompanySettings.tsx` handles 3 concerns. Split into focused components:

- **`CompanyInfo.tsx`** — nome, descrição, horário (texto), contato. PATCH to `/api/settings/company`.
- **`BusinessHoursSettings.tsx`** — 24h toggle, per-day schedule (mon–sun), timezone, closed message. PATCH to `/api/settings/company`.
- **`FaqSettings.tsx`** — FAQ list (add/remove/edit items). PATCH to `/api/settings/company`.

All three PATCH to the same API endpoint — they just send different fields.

---

## Icon Library

Install: `lucide-react`

Icons used:
- Sidebar: `BarChart2`, `Settings`, `LogOut`
- Settings nav: `Building2`, `Clock`, `HelpCircle`, `Kanban`, `Package`, `Megaphone`
- Actions: `Plus`, `Trash2`, `Pencil`, `X`, `Check`, `GripVertical` (DnD handle)
- Status/misc: `ChevronRight`, `ChevronLeft`

Replace all emoji usage in existing components with Lucide icons.

---

## Existing Pages — Changes

**`app/page.tsx` → `app/(app)/page.tsx`**
- Move file to route group
- Remove header with email + settings button (sidebar handles both)
- Keep `<KanbanBoard>` as-is

**`app/leads/[id]/page.tsx` → `app/(app)/leads/[id]/page.tsx`**
- Move file to route group
- Remove manual "← back" link if sidebar provides navigation context
- Content unchanged

**`app/login/page.tsx`**
- Stays at root, no sidebar — no changes needed

---

## Styling Notes

- No design system changes — Tailwind stays as-is
- Sidebar width: `w-[200px]`, fixed, `min-h-screen`
- Settings secondary nav: `w-[180px]`, fixed height fills viewport
- Main content: `ml-[200px]` (or flex layout), `bg-slate-50`
- Settings content: occupies remaining width after both sidebars
- All existing component styles preserved — only structural layout changes

---

## Files Created

- `crm/src/app/(app)/layout.tsx`
- `crm/src/app/(app)/page.tsx` (moved)
- `crm/src/app/(app)/leads/[id]/page.tsx` (moved)
- `crm/src/app/(app)/settings/layout.tsx`
- `crm/src/app/(app)/settings/page.tsx` (redirect)
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

## Files Modified

- `crm/src/app/layout.tsx` — remove sidebar (now in route group layout)
- `crm/src/components/CompanySettings.tsx` — delete (replaced by 3 focused components)
- `crm/src/components/CatalogSettings.tsx` — replace emoji/text DnD handle with `GripVertical` icon
- `crm/src/components/StageManager.tsx` — replace any emoji with Lucide icons
- `crm/src/components/LeadCard.tsx` — replace emoji with Lucide icons
- `crm/src/components/LeadForm.tsx` — replace emoji with Lucide icons
- `crm/package.json` — add `lucide-react`

## Files Deleted

- `crm/src/app/page.tsx` (moved to route group)
- `crm/src/app/settings/page.tsx` (moved to route group)
- `crm/src/app/leads/[id]/page.tsx` (moved to route group)
- `crm/src/components/CompanySettings.tsx` (split into 3)
