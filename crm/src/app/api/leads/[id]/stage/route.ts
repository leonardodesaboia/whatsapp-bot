import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { stage_id } = await req.json();
  if (stage_id === undefined) {
    return NextResponse.json({ error: 'stage_id is required' }, { status: 400 });
  }

  const pool = getPool();
  const { rows } = await pool.query(
    'UPDATE leads SET stage_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [stage_id, params.id]
  );

  if (!rows[0]) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  return NextResponse.json(rows[0]);
}

