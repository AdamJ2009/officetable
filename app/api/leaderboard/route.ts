import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { ALLTIME_SEASON_ID, getCurrentSeason } from '@/lib/seasons';
import type { LeaderboardEntry } from '@/lib/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get('game_id');
  const includeRetired = searchParams.get('include_retired') === 'true';
  const includeInactive = searchParams.get('include_inactive') === 'true';
  const scope = searchParams.get('scope'); // 'season' | 'alltime', default 'season'
  const seasonIdParam = searchParams.get('season_id'); // explicit past season

  if (!gameId) {
    return NextResponse.json({ error: 'game_id is required' }, { status: 400 });
  }
  const gid = parseInt(gameId, 10);

  const currentSeason = getCurrentSeason();
  let targetSeasonId: number;
  if (seasonIdParam !== null) {
    const parsed = parseInt(seasonIdParam, 10);
    if (isNaN(parsed) || (parsed !== ALLTIME_SEASON_ID && !db.prepare('SELECT id FROM seasons WHERE id = ?').get(parsed))) {
      return NextResponse.json({ error: 'Unknown season_id' }, { status: 400 });
    }
    targetSeasonId = parsed;
  } else {
    targetSeasonId = scope === 'alltime' ? ALLTIME_SEASON_ID : (currentSeason?.id ?? ALLTIME_SEASON_ID);
  }

  const isAllTime = targetSeasonId === ALLTIME_SEASON_ID;
  // Inactivity rule (60 days) applies to the current-season leaderboard only;
  // past-season and all-time views show everyone — historical views shouldn't
  // banish people.
  const applyInactivity = !isAllTime && targetSeasonId === currentSeason?.id;
  const seasonFilter = isAllTime ? '' : 'AND m.season_id = ?';
  const baseParams: (string | number)[] = isAllTime ? [gid] : [gid, targetSeasonId];

  // Get all match results for this game in scope
  const resultsStmt = db.prepare(`
    SELECT
      mp.player_id,
      mp.match_id,
      mp.team,
      mp.score,
      m.game_id
    FROM match_participants mp
    JOIN matches m ON mp.match_id = m.id
    WHERE m.game_id = ?${seasonFilter}
  `);

  const participations = resultsStmt.all(...baseParams) as {
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

  // Get trend data (last 10 matches rating changes for each player).
  // elo_before/elo_after = season ledger; alltime_* = the never-resetting one.
  const deltaExpr = isAllTime ? 'mp.alltime_elo_after - mp.alltime_elo_before' : 'mp.elo_after - mp.elo_before';
  const trendStmt = db.prepare(`
    SELECT
      mp.player_id,
      ${deltaExpr} as delta,
      m.played_at
    FROM match_participants mp
    JOIN matches m ON mp.match_id = m.id
    WHERE m.game_id = ?${seasonFilter}
    ORDER BY m.played_at DESC, m.id DESC
  `);

  const trendRows = trendStmt.all(...baseParams) as {
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

  // Get base player data from the target ledger
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
    WHERE pr.game_id = ? AND pr.season_id = ?${statusFilter}
    ORDER BY pr.elo DESC, p.name ASC
  `);

  const rows = stmt.all(gid, targetSeasonId) as {
    player_id: number;
    player_name: string;
    avatar_url: string | null;
    elo: number;
    status: string | null;
  }[];

  // Get last match date per player (global, across all seasons) for the
  // inactivity calculation and display
  const lastMatchRows = db.prepare(`
    SELECT
      mp.player_id,
      MAX(m.played_at) as last_match_at
    FROM match_participants mp
    JOIN matches m ON mp.match_id = m.id
    WHERE m.game_id = ?
    GROUP BY mp.player_id
  `).all(gid) as { player_id: number; last_match_at: string }[];

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
    const isInactive = applyInactivity
      ? (lastMatchAt
        ? (now - new Date(lastMatchAt).getTime()) > inactiveThresholdDays * 24 * 60 * 60 * 1000
        : true) // No matches = inactive
      : false;

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

  if (!includeInactive && applyInactivity) {
    leaderboard = leaderboard.filter(entry => !entry.is_inactive);
  }

  return NextResponse.json(leaderboard);
}