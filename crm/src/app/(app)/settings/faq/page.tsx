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
