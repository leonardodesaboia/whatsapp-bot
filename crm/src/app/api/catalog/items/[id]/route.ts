import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

interface Params { params: { id: string } }

export async function PATCH(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { title, slug, description, price, duration, position } = await req.json();
  const pool = getPool();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (title !== undefined) { values.push(title); sets.push(`title = $${values.length}`); }
  if (slug !== undefined) { values.push(slug); sets.push(`slug = $${values.length}`); }
  if (description !== undefined) { values.push(description); sets.push(`description = $${values.length}`); }
  if (price !== undefined) { values.push(price); sets.push(`price = $${values.length}`); }
  if (duration !== undefined) { values.push(duration); sets.push(`duration = $${values.length}`); }
  if (position !== undefined) { values.push(position); sets.push(`position = $${values.length}`); }

  if (sets.length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

  values.push(params.id);
  const { rows } = await pool.query(
    `UPDATE catalog_items SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  if (!rows[0]) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pool = getPool();
  await pool.query('DELETE FROM catalog_items WHERE id = $1', [params.id]);
  return new NextResponse(null, { status: 204 });
}
