'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, Clock, HelpCircle, Kanban, Package, Megaphone, Repeat2 } from 'lucide-react';

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
      { href: '/settings/remarketing', icon: Repeat2, label: 'Remarketing' },
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
