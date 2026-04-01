import { NextResponse } from 'next/server';
import db from '@/lib/db';
import type { Game } from '@/lib/types';

export async function GET() {
  const stmt = db.prepare('SELECT * FROM games ORDER BY name');
  const games = stmt.all() as Game[];
  return NextResponse.json(games);
}