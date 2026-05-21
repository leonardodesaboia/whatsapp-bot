import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pool = getPool();
  const { rows } = await pool.query('SELECT * FROM contacts ORDER BY name ASC');
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { phone, name } = await req.json();
  if (!phone) return NextResponse.json({ error: 'phone is required' }, { status: 400 });

  const pool = getPool();
  const { rows } = await pool.query(
    'INSERT INTO contacts (phone, name) VALUES ($1, $2) ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name RETURNING *',
    [phone, name || null]
  );
  return NextResponse.json(rows[0], { status: 201 });
}
