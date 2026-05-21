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
