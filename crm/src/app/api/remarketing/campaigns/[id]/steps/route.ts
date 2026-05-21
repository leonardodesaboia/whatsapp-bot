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
    'SELECT * FROM remarketing_steps WHERE campaign_id = $1 ORDER BY position ASC',
    [params.id]
  );
  return NextResponse.json(rows);
}

export async function POST(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { delay_days, message } = await req.json();
  if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400 });

  const pool = getPool();
  const { rows: maxRows } = await pool.query(
    'SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM remarketing_steps WHERE campaign_id = $1',
    [params.id]
  );
  const { rows } = await pool.query(
    'INSERT INTO remarketing_steps (campaign_id, position, delay_days, message) VALUES ($1, $2, $3, $4) RETURNING *',
    [params.id, maxRows[0].pos, delay_days ?? 1, message]
  );
  return NextResponse.json(rows[0], { status: 201 });
}
