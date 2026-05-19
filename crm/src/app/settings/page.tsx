import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';
import StageManager from '@/components/StageManager';

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/login');
  }

  const pool = getPool();
  const { rows: stages } = await pool.query(
    'SELECT * FROM stages ORDER BY position ASC'
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-6">
      <div className="mb-6">
        <Link
          href="/"
          className="text-sm font-medium text-sky-600 transition hover:text-sky-700"
        >
          ← Voltar ao funil
        </Link>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">
          Configurações
        </h1>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          Etapas do funil
        </h2>
        <StageManager initialStages={stages} />
      </section>
    </main>
  );
}
