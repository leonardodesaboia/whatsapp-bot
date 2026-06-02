import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

interface Params { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const { title, slug, position } = await req.json();
  const pool = getPool();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (title !== undefined) { values.push(title); sets.push(`title = $${values.length}`); }
  if (slug !== undefined) { values.push(slug); sets.push(`slug = $${values.length}`); }
  if (position !== undefined) { values.push(position); sets.push(`position = $${values.length}`); }

  if (sets.length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

  values.push(id);
  const { rows } = await pool.query(
    `UPDATE catalog_categories SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  if (!rows[0]) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const pool = getPool();
  await pool.query('DELETE FROM catalog_categories WHERE id = $1', [id]);
  return new NextResponse(null, { status: 204 });
}
