import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const pool = getPool();
  const { rows } = await pool.query('SELECT * FROM stages ORDER BY position ASC');
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name, color } = await req.json();
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const pool = getPool();
  const { rows: maxRows } = await pool.query(
    'SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM stages'
  );
  const { rows } = await pool.query(
    'INSERT INTO stages (name, color, position) VALUES ($1, $2, $3) RETURNING *',
    [name, color || '#6b7280', maxRows[0].pos]
  );

  return NextResponse.json(rows[0], { status: 201 });
}

