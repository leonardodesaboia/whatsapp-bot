import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { lead_ids } = await req.json();
  if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
    return NextResponse.json({ error: 'lead_ids array is required' }, { status: 400 });
  }

  const pool = getPool();
  const placeholders = lead_ids.map((_, i) => `$${i + 1}`).join(', ');
  const { rows: leads } = await pool.query(
    `SELECT phone, name FROM leads WHERE id IN (${placeholders})`,
    lead_ids
  );

  let imported = 0;
  for (const lead of leads) {
    await pool.query(
      'INSERT INTO contacts (phone, name) VALUES ($1, $2) ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name',
      [lead.phone, lead.name]
    );
    imported++;
  }

  return NextResponse.json({ imported });
}
