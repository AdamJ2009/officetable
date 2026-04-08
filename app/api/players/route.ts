import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import type { Player } from '@/lib/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');

  let stmt;
  if (status === 'all') {
    stmt = db.prepare('SELECT * FROM players ORDER BY name');
  } else {
    // Default: only active players
    stmt = db.prepare("SELECT * FROM players WHERE status IS NULL OR status = 'active' ORDER BY name");
  }
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

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status } = body;

    if (!id || typeof id !== 'number') {
      return NextResponse.json({ error: 'Player id is required' }, { status: 400 });
    }

    if (status !== 'active' && status !== 'retired') {
      return NextResponse.json({ error: 'Status must be "active" or "retired"' }, { status: 400 });
    }

    const stmt = db.prepare('UPDATE players SET status = ? WHERE id = ?');
    const result = stmt.run(status, id);

    if (result.changes === 0) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(id) as Player;
    return NextResponse.json(player);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update player' }, { status: 500 });
  }
}