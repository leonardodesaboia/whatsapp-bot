import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

interface Params { params: Promise<{ id: string }> }

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const pool = getPool();
  await pool.query('DELETE FROM contacts WHERE id = $1', [id]);
  return new NextResponse(null, { status: 204 });
}
