import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get('player_id');
  const gameId = searchParams.get('game_id');

  if (!playerId) {
    return NextResponse.json({ error: 'player_id is required' }, { status: 400 });
  }

  let query = `
    SELECT
      a.id as achievement_id,
      a.name as achievement_name,
      a.description as achievement_description,
      a.category as achievement_category,
      a.icon as achievement_icon,
      pa.game_id,
      COUNT(*) as count,
      MIN(pa.earned_at) as first_earned_at
    FROM player_achievements pa
    JOIN achievements a ON pa.achievement_id = a.id
    WHERE pa.player_id = ?
  `;

  const params: (string | number)[] = [playerId];

  if (gameId) {
    query += ' AND pa.game_id = ?';
    params.push(gameId);
  }

  query += ' GROUP BY a.id, pa.game_id ORDER BY a.category, a.name';

  const stmt = db.prepare(query);
  const achievements = stmt.all(...params);

  return NextResponse.json(achievements);
}