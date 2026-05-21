import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pool = getPool();
  const { rows } = await pool.query('SELECT * FROM company_settings LIMIT 1');
  return NextResponse.json(rows[0] || null);
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const allowed = ['nome', 'descricao', 'horario', 'contato', 'faq', 'timezone', 'business_hours', 'closed_message'];
  const sets: string[] = [];
  const values: unknown[] = [];

  for (const key of allowed) {
    if (key in body) {
      values.push(key === 'faq' || key === 'business_hours' ? JSON.stringify(body[key]) : body[key]);
      sets.push(`${key} = $${values.length}`);
    }
  }

  if (sets.length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

  const pool = getPool();
  const { rows: existing } = await pool.query('SELECT id FROM company_settings LIMIT 1');

  if (existing.length === 0) {
    const cols = sets.map((s) => s.split(' = ')[0]).join(', ');
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await pool.query(
      `INSERT INTO company_settings (${cols}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    return NextResponse.json(rows[0]);
  }

  values.push(existing[0].id);
  const { rows } = await pool.query(
    `UPDATE company_settings SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  return NextResponse.json(rows[0]);
}
