import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pool = getPool();
  const { rows: categories } = await pool.query(
    'SELECT * FROM catalog_categories ORDER BY position ASC'
  );
  const { rows: items } = await pool.query(
    'SELECT * FROM catalog_items ORDER BY position ASC'
  );
  const result = categories.map((cat) => ({
    ...cat,
    items: items.filter((i) => i.category_id === cat.id),
  }));
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { title, slug } = await req.json();
  if (!title || !slug) return NextResponse.json({ error: 'title and slug are required' }, { status: 400 });

  const pool = getPool();
  const { rows: maxRows } = await pool.query(
    'SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM catalog_categories'
  );
  const { rows } = await pool.query(
    'INSERT INTO catalog_categories (slug, title, position) VALUES ($1, $2, $3) RETURNING *',
    [slug, title, maxRows[0].pos]
  );
  return NextResponse.json({ ...rows[0], items: [] }, { status: 201 });
}
