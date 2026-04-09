import { NextResponse, NextRequest } from 'next/server';
import db from '@/lib/db';
import type { Game } from '@/lib/types';

export async function GET() {
  const stmt = db.prepare('SELECT * FROM games ORDER BY name');
  const games = stmt.all() as Game[];
  return NextResponse.json(games);
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, image_url } = body;

    if (!id) {
      return NextResponse.json({ error: 'Game ID is required' }, { status: 400 });
    }

    const stmt = db.prepare('UPDATE games SET image_url = ? WHERE id = ?');
    stmt.run(image_url || null, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating game:', error);
    return NextResponse.json({ error: 'Failed to update game' }, { status: 500 });
  }
}