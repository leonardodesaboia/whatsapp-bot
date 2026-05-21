import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT c.*,
      (SELECT COUNT(*) FROM remarketing_steps s WHERE s.campaign_id = c.id) AS step_count,
      (SELECT COUNT(*) FROM remarketing_enrollments e WHERE e.campaign_id = c.id AND e.completed_at IS NULL AND e.cancelled_at IS NULL) AS active_enrollments,
      (SELECT COUNT(*) FROM remarketing_enrollments e WHERE e.campaign_id = c.id AND e.completed_at IS NOT NULL) AS completed_enrollments
    FROM remarketing_campaigns c
    ORDER BY c.created_at ASC
  `);
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, trigger_days, stage_filter } = await req.json();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const pool = getPool();
  const { rows } = await pool.query(
    'INSERT INTO remarketing_campaigns (name, trigger_days, stage_filter) VALUES ($1, $2, $3) RETURNING *',
    [name, trigger_days ?? 3, stage_filter ?? null]
  );
  return NextResponse.json({ ...rows[0], step_count: 0, active_enrollments: 0, completed_enrollments: 0 }, { status: 201 });
}
