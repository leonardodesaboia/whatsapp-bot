import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

interface Params {
  params: { id: string };
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name, color, position } = await req.json();
  const pool = getPool();

  const sets: string[] = [];
  const values: unknown[] = [];

  if (name !== undefined) {
    values.push(name);
    sets.push(`name = $${values.length}`);
  }
  if (color !== undefined) {
    values.push(color);
    sets.push(`color = $${values.length}`);
  }
  if (position !== undefined) {
    values.push(position);
    sets.push(`position = $${values.length}`);
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  values.push(params.id);
  const { rows } = await pool.query(
    `UPDATE stages SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );

  if (!rows[0]) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  return NextResponse.json(rows[0]);
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const pool = getPool();
  const { rows: firstStage } = await pool.query(
    'SELECT id FROM stages WHERE id != $1 ORDER BY position ASC LIMIT 1',
    [params.id]
  );
  const fallbackId = firstStage[0]?.id || null;

  await pool.query('UPDATE leads SET stage_id = $1 WHERE stage_id = $2', [
    fallbackId,
    params.id,
  ]);
  await pool.query('DELETE FROM stages WHERE id = $1', [params.id]);

  return new NextResponse(null, { status: 204 });
}

