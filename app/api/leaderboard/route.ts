import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import type { LeaderboardEntry } from '@/lib/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get('game_id');

  if (!gameId) {
    return NextResponse.json({ error: 'game_id is required' }, { status: 400 });
  }

  const stmt = db.prepare(`
    SELECT
      pr.player_id,
      p.name as player_name,
      pr.mu,
      pr.sigma,
      pr.mu - 3 * pr.sigma as rating,
      COALESCE(wins.count, 0) as wins,
      COALESCE(losses.count, 0) as losses
    FROM player_ratings pr
    JOIN players p ON pr.player_id = p.id
    LEFT JOIN (
      SELECT player_id, COUNT(*) as count
      FROM match_participants mp
      JOIN matches m ON mp.match_id = m.id
      WHERE m.game_id = ? AND mp.won = 1
      GROUP BY player_id
    ) wins ON wins.player_id = pr.player_id
    LEFT JOIN (
      SELECT player_id, COUNT(*) as count
      FROM match_participants mp
      JOIN matches m ON mp.match_id = m.id
      WHERE m.game_id = ? AND mp.won = 0
      GROUP BY player_id
    ) losses ON losses.player_id = pr.player_id
    WHERE pr.game_id = ?
    ORDER BY rating DESC
  `);

  const leaderboard = stmt.all(parseInt(gameId), parseInt(gameId), parseInt(gameId)) as LeaderboardEntry[];
  return NextResponse.json(leaderboard);
}