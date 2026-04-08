import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import type { LeaderboardEntry } from '@/lib/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get('game_id');
  const includeRetired = searchParams.get('include_retired') === 'true';

  if (!gameId) {
    return NextResponse.json({ error: 'game_id is required' }, { status: 400 });
  }

  // Get all match results for this game, calculating wins/losses/draws from scores
  const resultsStmt = db.prepare(`
    SELECT
      mp.player_id,
      mp.match_id,
      mp.team,
      mp.score,
      m.game_id
    FROM match_participants mp
    JOIN matches m ON mp.match_id = m.id
    WHERE m.game_id = ?
  `);

  const participations = resultsStmt.all(parseInt(gameId)) as {
    player_id: number;
    match_id: number;
    team: number;
    score: number;
    game_id: number;
  }[];

  // Group by match and calculate outcomes
  const matchOutcomes: Map<number, { teams: Map<number, number> }> = new Map();

  for (const p of participations) {
    if (!matchOutcomes.has(p.match_id)) {
      matchOutcomes.set(p.match_id, { teams: new Map() });
    }
    matchOutcomes.get(p.match_id)!.teams.set(p.team, p.score);
  }

  // Calculate win/loss/draw for each player
  const playerStats: Map<number, { wins: number; losses: number; draws: number }> = new Map();

  for (const p of participations) {
    if (!playerStats.has(p.player_id)) {
      playerStats.set(p.player_id, { wins: 0, losses: 0, draws: 0 });
    }
    const stats = playerStats.get(p.player_id)!;
    const matchData = matchOutcomes.get(p.match_id)!;

    // Find opponent team's score
    let opponentScore: number | null = null;
    for (const [team, score] of matchData.teams) {
      if (team !== p.team) {
        opponentScore = score;
        break;
      }
    }

    if (opponentScore !== null) {
      if (p.score > opponentScore) {
        stats.wins++;
      } else if (p.score < opponentScore) {
        stats.losses++;
      } else {
        stats.draws++;
      }
    }
  }

  // Get base player data
  const statusFilter = includeRetired
    ? ''
    : " AND (p.status IS NULL OR p.status = 'active')";
  const stmt = db.prepare(`
    SELECT
      pr.player_id,
      p.name as player_name,
      pr.elo,
      p.status
    FROM player_ratings pr
    JOIN players p ON pr.player_id = p.id
    WHERE pr.game_id = ?${statusFilter}
    ORDER BY pr.elo DESC
  `);

  const rows = stmt.all(parseInt(gameId)) as {
    player_id: number;
    player_name: string;
    elo: number;
    status: string | null;
  }[];

  // Combine with stats
  const leaderboard: LeaderboardEntry[] = rows.map(row => {
    const stats = playerStats.get(row.player_id) || { wins: 0, losses: 0, draws: 0 };
    return {
      player_id: row.player_id,
      player_name: row.player_name,
      elo: row.elo,
      wins: stats.wins,
      losses: stats.losses,
      draws: stats.draws,
      status: (row.status === 'retired' ? 'retired' : 'active') as 'active' | 'retired',
    };
  });

  return NextResponse.json(leaderboard);
}