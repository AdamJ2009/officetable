import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import type { Player } from '@/lib/types';

export async function GET() {
  const stmt = db.prepare('SELECT * FROM players ORDER BY name');
  const players = stmt.all() as Player[];
  return NextResponse.json(players);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const stmt = db.prepare('INSERT INTO players (name) VALUES (?)');
    const result = stmt.run(name.trim());
    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(result.lastInsertRowid) as Player;

    return NextResponse.json(player, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
      return NextResponse.json({ error: 'Player name already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create player' }, { status: 500 });
  }
}