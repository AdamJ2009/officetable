import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  const achievements = db.prepare(`
    SELECT id, name, description, category, icon FROM achievements ORDER BY
      CASE category
        WHEN 'milestone' THEN 1
        WHEN 'ranking' THEN 2
        WHEN 'streak' THEN 3
        WHEN 'special' THEN 4
        WHEN 'time_based' THEN 5
        ELSE 6
      END,
      name
  `).all();

  return NextResponse.json(achievements);
}