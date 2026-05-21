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
