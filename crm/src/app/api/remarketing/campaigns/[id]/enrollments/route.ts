import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

interface Params { params: { id: string } }

export async function GET(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT e.*, l.phone, l.name,
       CASE
         WHEN e.cancelled_at IS NOT NULL THEN 'cancelled'
         WHEN e.completed_at IS NOT NULL THEN 'completed'
         ELSE 'active'
       END AS status
     FROM remarketing_enrollments e
     JOIN leads l ON l.id = e.lead_id
     WHERE e.campaign_id = $1
     ORDER BY e.enrolled_at DESC
     LIMIT 100`,
    [params.id]
  );
  return NextResponse.json(rows);
}
