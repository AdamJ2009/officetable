import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import db from '@/lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const playerId = parseInt(id);
  if (isNaN(playerId)) {
    return NextResponse.json({ error: 'Invalid player id' }, { status: 400 });
  }

  const player = db.prepare('SELECT id FROM players WHERE id = ?').get(playerId);
  if (!player) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }

  const body = await request.json().catch(() => null) as { url?: string } | null;
  const url = body?.url?.trim() || null;

  if (url) {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('bad protocol');
      }
    } catch {
      return NextResponse.json(
        { error: 'Avatar URL must be a valid http(s) image link' },
        { status: 400 }
      );
    }
  }

  db.prepare(`UPDATE players SET avatar_url = ? WHERE id = ?`).run(url, playerId);

  revalidatePath('/', 'layout');
  return NextResponse.json({ success: true, avatar_url: url });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const playerId = parseInt(id);
  if (isNaN(playerId)) {
    return NextResponse.json({ error: 'Invalid player id' }, { status: 400 });
  }

  const result = db
    .prepare(`UPDATE players SET avatar_url = NULL WHERE id = ?`)
    .run(playerId);

  if (result.changes === 0) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }

  revalidatePath('/', 'layout');
  return NextResponse.json({ success: true });
}