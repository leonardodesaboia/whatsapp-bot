import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';
import RemarketingSettings from '@/components/RemarketingSettings';

export default async function RemarketingPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const pool = getPool();
  const [{ rows: campaigns }, { rows: stages }] = await Promise.all([
    pool.query(`
      SELECT c.*,
        (SELECT COUNT(*) FROM remarketing_steps s WHERE s.campaign_id = c.id) AS step_count,
        (SELECT COUNT(*) FROM remarketing_enrollments e WHERE e.campaign_id = c.id AND e.completed_at IS NULL AND e.cancelled_at IS NULL) AS active_enrollments,
        (SELECT COUNT(*) FROM remarketing_enrollments e WHERE e.campaign_id = c.id AND e.completed_at IS NOT NULL) AS completed_enrollments
      FROM remarketing_campaigns c ORDER BY c.created_at ASC
    `),
    pool.query('SELECT id, name FROM stages ORDER BY position ASC'),
  ]);

  return (
    <main className="px-6 py-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Configurações</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-950">Remarketing</h1>
        <p className="mt-1 text-sm text-slate-500">Campanhas automáticas para leads sem resposta</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <RemarketingSettings initialCampaigns={campaigns} stages={stages} />
      </div>
    </main>
  );
}
