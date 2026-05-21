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
