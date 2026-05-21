import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

interface Params { params: { id: string } }

export async function PATCH(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, active, trigger_days, stage_filter } = await req.json();
  const pool = getPool();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (name !== undefined) { values.push(name); sets.push(`name = $${values.length}`); }
  if (active !== undefined) { values.push(active); sets.push(`active = $${values.length}`); }
  if (trigger_days !== undefined) { values.push(trigger_days); sets.push(`trigger_days = $${values.length}`); }
  if (stage_filter !== undefined) { values.push(stage_filter); sets.push(`stage_filter = $${values.length}`); }

  if (sets.length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

  values.push(params.id);
  const { rows } = await pool.query(
    `UPDATE remarketing_campaigns SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  if (!rows[0]) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pool = getPool();
  await pool.query('DELETE FROM remarketing_campaigns WHERE id = $1', [params.id]);
  return new NextResponse(null, { status: 204 });
}
