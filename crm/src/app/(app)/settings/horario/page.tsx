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
