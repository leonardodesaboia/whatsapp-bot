import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { normalizeTags } from '@/lib/leadUtils';

interface Params {
  params: { id: string };
}

export async function GET(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(_req.url);
  const rawPage = parseInt(searchParams.get('page') || '1', 10);
  const rawLimit = parseInt(searchParams.get('limit') || '20', 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, 100)
      : 20;
  const offset = (page - 1) * limit;

  const pool = getPool();
  const [leadResult, interactionsCountResult, interactionsResult] = await Promise.all([
    pool.query(
      'SELECT l.*, s.name AS stage_name FROM leads l LEFT JOIN stages s ON l.stage_id = s.id WHERE l.id = $1',
      [params.id]
    ),
    pool.query(
      'SELECT COUNT(*)::int AS count FROM interactions WHERE lead_id = $1',
      [params.id]
    ),
    pool.query(
      'SELECT * FROM interactions WHERE lead_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [params.id, limit, offset]
    ),
  ]);

  if (!leadResult.rows[0]) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const total = interactionsCountResult.rows[0]?.count || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return NextResponse.json({
    lead: leadResult.rows[0],
    interactions: [...interactionsResult.rows].reverse(),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  });
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  if ('tags' in body) {
    if (typeof body.tags === 'string') {
      body.tags = normalizeTags(body.tags);
    } else if (Array.isArray(body.tags)) {
      body.tags = normalizeTags(body.tags.join(','));
    }
  }

  const allowed = [
    'name',
    'stage_id',
    'assigned_to',
    'products',
    'estimated_value',
    'tags',
    'follow_up_at',
    'notes',
  ];

  const sets: string[] = [];
  const values: unknown[] = [];

  for (const key of allowed) {
    if (key in body) {
      values.push(body[key]);
      sets.push(`${key} = $${values.length}`);
    }
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  sets.push('updated_at = NOW()');
  values.push(params.id);

  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE leads SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );

  if (!rows[0]) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  return NextResponse.json(rows[0]);
}
