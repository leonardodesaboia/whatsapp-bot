import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get('category_id');

  const pool = getPool();
  const { rows } = categoryId
    ? await pool.query('SELECT * FROM catalog_items WHERE category_id = $1 ORDER BY position ASC', [categoryId])
    : await pool.query('SELECT * FROM catalog_items ORDER BY position ASC');
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { category_id, slug, title, description, price, duration } = await req.json();
  if (!category_id || !slug || !title || price === undefined) {
    return NextResponse.json({ error: 'category_id, slug, title, and price are required' }, { status: 400 });
  }

  const pool = getPool();
  const { rows: maxRows } = await pool.query(
    'SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM catalog_items WHERE category_id = $1',
    [category_id]
  );
  const { rows } = await pool.query(
    `INSERT INTO catalog_items (category_id, slug, title, description, price, duration, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [category_id, slug, title, description || '', price, duration || null, maxRows[0].pos]
  );
  return NextResponse.json(rows[0], { status: 201 });
}
