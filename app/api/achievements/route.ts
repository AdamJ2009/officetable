import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  const achievements = db.prepare(`
    SELECT id, name, description, category, icon FROM achievements ORDER BY category, name
  `).all();

  return NextResponse.json(achievements);
}