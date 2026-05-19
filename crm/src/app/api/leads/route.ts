import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const stageId = searchParams.get('stage_id');
  const assignedTo = searchParams.get('assigned_to');
  const tag = searchParams.get('tag');
  const product = searchParams.get('product');

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (stageId) {
    values.push(stageId);
    conditions.push(`l.stage_id = $${values.length}`);
  }
  if (assignedTo) {
    values.push(assignedTo);
    conditions.push(`l.assigned_to = $${values.length}`);
  }
  if (tag) {
    values.push(tag);
    conditions.push(`$${values.length} = ANY(l.tags)`);
  }
  if (product) {
    values.push(product);
    conditions.push(`$${values.length} = ANY(l.products)`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT l.*, s.name AS stage_name, s.color AS stage_color
     FROM leads l
     LEFT JOIN stages s ON l.stage_id = s.id
     ${where}
     ORDER BY l.updated_at DESC`,
    values
  );

  return NextResponse.json(rows);
}

