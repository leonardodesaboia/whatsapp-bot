import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';
import LeadForm from '@/components/LeadForm';
import InteractionTimeline from '@/components/InteractionTimeline';

interface Props {
  params: { id: string };
}

const INTERACTIONS_PAGE_SIZE = 20;

export default async function LeadDetailPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/login');
  }

  const pool = getPool();
  const [leadResult, interactionsCountResult, interactionsResult, stagesResult] =
    await Promise.all([
    pool.query(
      'SELECT l.*, s.name AS stage_name FROM leads l LEFT JOIN stages s ON l.stage_id = s.id WHERE l.id = $1',
      [params.id]
    ),
    pool.query('SELECT COUNT(*)::int AS count FROM interactions WHERE lead_id = $1', [
      params.id,
    ]),
    pool.query(
      'SELECT * FROM interactions WHERE lead_id = $1 ORDER BY created_at DESC LIMIT $2',
      [params.id, INTERACTIONS_PAGE_SIZE]
    ),
    pool.query('SELECT * FROM stages ORDER BY position ASC'),
  ]);

  if (!leadResult.rows[0]) {
    notFound();
  }

  const lead = leadResult.rows[0];
  const totalInteractions = interactionsCountResult.rows[0]?.count || 0;
  const initialInteractions = [...interactionsResult.rows].reverse();

  return (
    <main className="mx-auto max-w-4xl px-6 py-6">
      <div className="mb-6">
        <Link
          href="/"
          className="text-sm font-medium text-sky-600 transition hover:text-sky-700"
        >
          ← Voltar ao funil
        </Link>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">
          {lead.name || lead.phone}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{lead.phone}</p>
      </div>

      <div className="space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Dados do lead
          </h2>
          <LeadForm lead={lead} stages={stagesResult.rows} />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Histórico de interações
            <span className="ml-2 text-sm font-normal text-slate-400">
              ({totalInteractions})
            </span>
          </h2>
          <InteractionTimeline
            leadId={lead.id}
            initialInteractions={initialInteractions}
            totalCount={totalInteractions}
            pageSize={INTERACTIONS_PAGE_SIZE}
          />
        </section>
      </div>
    </main>
  );
}
