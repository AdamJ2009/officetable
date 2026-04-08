import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get('game_id');

  if (!gameId) {
    return NextResponse.json({ error: 'game_id is required' }, { status: 400 });
  }

  // Get total matches for this game
  const matchesStmt = db.prepare(`
    SELECT COUNT(DISTINCT m.id) as count
    FROM matches m
    WHERE m.game_id = ?
  `);
  const matchesResult = matchesStmt.get(parseInt(gameId)) as { count: number };
  const totalMatches = matchesResult.count;

  // Get total points scored by each team
  const pointsStmt = db.prepare(`
    SELECT mp.team, SUM(mp.score) as total_points
    FROM match_participants mp
    JOIN matches m ON mp.match_id = m.id
    WHERE m.game_id = ?
    GROUP BY mp.team
  `);
  const pointsResult = pointsStmt.all(parseInt(gameId)) as { team: number; total_points: number }[];

  let team0Points = 0;
  let team1Points = 0;
  for (const row of pointsResult) {
    if (row.team === 0) {
      team0Points = row.total_points;
    } else if (row.team === 1) {
      team1Points = row.total_points;
    }
  }

  // Get player counts
  const activePlayersStmt = db.prepare(`
    SELECT COUNT(DISTINCT pr.player_id) as count
    FROM player_ratings pr
    JOIN players p ON pr.player_id = p.id
    WHERE pr.game_id = ? AND (p.status IS NULL OR p.status = 'active')
  `);
  const activePlayersResult = activePlayersStmt.get(parseInt(gameId)) as { count: number };
  const activePlayers = activePlayersResult.count;

  const totalPlayersStmt = db.prepare(`
    SELECT COUNT(DISTINCT pr.player_id) as count
    FROM player_ratings pr
    WHERE pr.game_id = ?
  `);
  const totalPlayersResult = totalPlayersStmt.get(parseInt(gameId)) as { count: number };
  const totalPlayers = totalPlayersResult.count;

  return NextResponse.json({
    game_id: parseInt(gameId),
    total_matches: totalMatches,
    team0_points: team0Points,
    team1_points: team1Points,
    active_players: activePlayers,
    total_players: totalPlayers,
  });
}