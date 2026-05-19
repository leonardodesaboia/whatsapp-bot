import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';
import KanbanBoard from '@/components/KanbanBoard';

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/login');
  }

  const pool = getPool();
  const [stagesResult, leadsResult] = await Promise.all([
    pool.query('SELECT * FROM stages ORDER BY position ASC'),
    pool.query('SELECT * FROM leads ORDER BY updated_at DESC'),
  ]);

  return (
    <main className="px-6 py-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-600">
            CRM
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">
            Funil de vendas
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-slate-500 sm:inline">
            {session.user?.email}
          </span>
          <Link
            href="/settings"
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Configurações
          </Link>
        </div>
      </div>

      <KanbanBoard stages={stagesResult.rows} leads={leadsResult.rows} />
    </main>
  );
}
