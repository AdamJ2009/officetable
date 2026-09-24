import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import type { LeaderboardEntry } from '@/lib/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get('game_id');
  const includeRetired = searchParams.get('include_retired') === 'true';
  const includeInactive = searchParams.get('include_inactive') === 'true';

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

  // Get trend data (last 10 matches rating changes for each player)
  const trendStmt = db.prepare(`
    SELECT
      mp.player_id,
      mp.elo_after - mp.elo_before as delta,
      m.played_at
    FROM match_participants mp
    JOIN matches m ON mp.match_id = m.id
    WHERE m.game_id = ?
    ORDER BY m.played_at DESC
  `);

  const trendRows = trendStmt.all(parseInt(gameId)) as {
    player_id: number;
    delta: number;
    played_at: string;
  }[];

  // Group trend data by player, taking last 10 matches
  const playerTrends: Map<number, number[]> = new Map();
  const playerMatchCounts: Map<number, number> = new Map();

  for (const row of trendRows) {
    if (!playerTrends.has(row.player_id)) {
      playerTrends.set(row.player_id, []);
      playerMatchCounts.set(row.player_id, 0);
    }
    const trends = playerTrends.get(row.player_id)!;
    const count = playerMatchCounts.get(row.player_id)!;
    if (count < 10) {
      trends.unshift(row.delta); // unshift to get chronological order
      playerMatchCounts.set(row.player_id, count + 1);
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
      p.avatar_url,
      pr.elo,
      p.status
    FROM player_ratings pr
    JOIN players p ON pr.player_id = p.id
    WHERE pr.game_id = ?${statusFilter}
    ORDER BY pr.elo DESC, p.name ASC
  `);

  const rows = stmt.all(parseInt(gameId)) as {
    player_id: number;
    player_name: string;
    avatar_url: string | null;
    elo: number;
    status: string | null;
  }[];

  // Get last match date per player for inactivity calculation
  const lastMatchRows = db.prepare(`
    SELECT
      mp.player_id,
      MAX(m.played_at) as last_match_at
    FROM match_participants mp
    JOIN matches m ON mp.match_id = m.id
    WHERE m.game_id = ?
    GROUP BY mp.player_id
  `).all(parseInt(gameId)) as { player_id: number; last_match_at: string }[];

  const playerLastMatch: Map<number, string> = new Map();
  for (const row of lastMatchRows) {
    playerLastMatch.set(row.player_id, row.last_match_at);
  }

  // Read inactive threshold from settings
  const thresholdSetting = db.prepare(`SELECT value FROM settings WHERE key = 'inactive_threshold_days'`).get() as { value: string } | undefined;
  const inactiveThresholdDays = thresholdSetting ? parseInt(thresholdSetting.value, 10) : 60;
  const now = Date.now();

  // Combine with stats and trend
  let leaderboard: LeaderboardEntry[] = rows.map(row => {
    const stats = playerStats.get(row.player_id) || { wins: 0, losses: 0, draws: 0 };
    const trend = playerTrends.get(row.player_id) || [];
    const lastMatchAt = playerLastMatch.get(row.player_id);
    const isInactive = lastMatchAt
      ? (now - new Date(lastMatchAt).getTime()) > inactiveThresholdDays * 24 * 60 * 60 * 1000
      : true; // No matches = inactive

    return {
      player_id: row.player_id,
      player_name: row.player_name,
      avatar_url: row.avatar_url,
      elo: row.elo,
      wins: stats.wins,
      losses: stats.losses,
      draws: stats.draws,
      status: (row.status === 'retired' ? 'retired' : 'active') as 'active' | 'retired',
      is_inactive: isInactive,
      last_match_at: lastMatchAt || undefined,
      trend,
    };
  });

  if (!includeInactive) {
    leaderboard = leaderboard.filter(entry => !entry.is_inactive);
  }

  return NextResponse.json(leaderboard);
}