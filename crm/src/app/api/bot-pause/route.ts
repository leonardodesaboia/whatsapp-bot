import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { phone } = await req.json();
  if (!phone) return NextResponse.json({ error: 'phone is required' }, { status: 400 });

  const botUrl = process.env.BOT_INTERNAL_URL || 'http://bot:3000';
  const token = process.env.WEBHOOK_TOKEN;
  if (!token) return NextResponse.json({ error: 'WEBHOOK_TOKEN not configured' }, { status: 500 });

  const res = await fetch(`${botUrl}/bot-pause`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': token },
    body: JSON.stringify({ phone }),
  });

  if (!res.ok) return NextResponse.json({ error: 'bot-pause failed' }, { status: 502 });
  return NextResponse.json({ ok: true });
}
