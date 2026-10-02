import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

interface Record {
  player_id: number;
  player_name: string;
  value: number | string;
  date?: string;
  opponent?: string;
}

interface GameRecords {
  highest_skill: Record | null;
  lowest_skill: Record | null;
  peak_skill_ever: Record | null;
  trough_skill_ever: Record | null;
  most_games: Record | null;
  highest_win_rate: Record | null;
  longest_win_streak: Record | null;
  longest_lose_streak: Record | null;
  longest_unbeaten_streak: Record | null;
  biggest_skill_gain: Record | null;
  biggest_skill_loss: Record | null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get('game_id');

  if (!gameId) {
    return NextResponse.json({ error: 'game_id is required' }, { status: 400 });
  }

  const records: GameRecords = {
    highest_skill: null,
    lowest_skill: null,
    peak_skill_ever: null,
    trough_skill_ever: null,
    most_games: null,
    highest_win_rate: null,
    longest_win_streak: null,
    longest_lose_streak: null,
    longest_unbeaten_streak: null,
    biggest_skill_gain: null,
    biggest_skill_loss: null
  };

  // Highest current skill (current-season ledger, active players only)
  const currentSeasonIdSub = "(SELECT id FROM seasons WHERE start_date <= datetime('now') ORDER BY start_date DESC, id DESC LIMIT 1)";
  const highestSkill = db.prepare(`
    SELECT pr.player_id, p.name as player_name, pr.elo as value
    FROM player_ratings pr
    JOIN players p ON pr.player_id = p.id
    WHERE pr.game_id = ? AND pr.season_id = ${currentSeasonIdSub}
      AND (p.status IS NULL OR p.status = 'active')
    ORDER BY pr.elo DESC
    LIMIT 1
  `).get(parseInt(gameId)) as Record | undefined;
  records.highest_skill = highestSkill || null;

  // Lowest current skill (current-season ledger, active players with at least 5 games)
  const lowestSkill = db.prepare(`
    SELECT pr.player_id, p.name as player_name, pr.elo as value
    FROM player_ratings pr
    JOIN players p ON pr.player_id = p.id
    WHERE pr.game_id = ? AND pr.season_id = ${currentSeasonIdSub}
      AND (p.status IS NULL OR p.status = 'active')
    AND (
      SELECT COUNT(*) FROM match_participants mp
      JOIN matches m ON mp.match_id = m.id
      WHERE mp.player_id = pr.player_id AND m.game_id = ?
    ) >= 5
    ORDER BY pr.elo ASC
    LIMIT 1
  `).get(parseInt(gameId), parseInt(gameId)) as Record | undefined;
  records.lowest_skill = lowestSkill || null;

  // Peak skill ever reached (historical - highest alltime elo_after any player achieved)
  const peakSkillEver = db.prepare(`
    SELECT
      mp.player_id,
      p.name as player_name,
      mp.alltime_elo_after as value,
      m.played_at as date
    FROM match_participants mp
    JOIN players p ON mp.player_id = p.id
    JOIN matches m ON mp.match_id = m.id
    WHERE m.game_id = ?
    ORDER BY mp.alltime_elo_after DESC
    LIMIT 1
  `).get(parseInt(gameId)) as Record | undefined;
  records.peak_skill_ever = peakSkillEver || null;

  // Trough skill ever (historical - lowest alltime elo_after any player hit, min 5 games at that point)
  const troughSkillEver = db.prepare(`
    SELECT
      mp.player_id,
      p.name as player_name,
      mp.alltime_elo_after as value,
      m.played_at as date
    FROM match_participants mp
    JOIN players p ON mp.player_id = p.id
    JOIN matches m ON mp.match_id = m.id
    WHERE m.game_id = ? AND (
      SELECT COUNT(*) FROM match_participants mp2
      JOIN matches m2 ON mp2.match_id = m2.id
      WHERE mp2.player_id = mp.player_id AND m2.game_id = ? AND m2.played_at <= m.played_at
    ) >= 5
    ORDER BY mp.alltime_elo_after ASC
    LIMIT 1
  `).get(parseInt(gameId), parseInt(gameId)) as Record | undefined;
  records.trough_skill_ever = troughSkillEver || null;

  // Most games played
  const mostGames = db.prepare(`
    SELECT
      mp.player_id,
      p.name as player_name,
      COUNT(*) as value
    FROM match_participants mp
    JOIN players p ON mp.player_id = p.id
    JOIN matches m ON mp.match_id = m.id
    WHERE m.game_id = ?
    GROUP BY mp.player_id
    ORDER BY value DESC
    LIMIT 1
  `).get(parseInt(gameId)) as Record | undefined;
  records.most_games = mostGames || null;

  // Highest win rate (min 20 games)
  const highestWinRate = db.prepare(`
    SELECT
      mp.player_id,
      p.name as player_name,
      CAST(SUM(CASE
        WHEN mp.score > (SELECT MAX(mp2.score) FROM match_participants mp2 WHERE mp2.match_id = mp.match_id AND mp2.team != mp.team)
        THEN 1 ELSE 0
      END) AS FLOAT) / COUNT(*) * 100 as value
    FROM match_participants mp
    JOIN players p ON mp.player_id = p.id
    JOIN matches m ON mp.match_id = m.id
    WHERE m.game_id = ?
    GROUP BY mp.player_id
    HAVING COUNT(*) >= 20
    ORDER BY value DESC
    LIMIT 1
  `).get(parseInt(gameId)) as Record | undefined;
  records.highest_win_rate = highestWinRate || null;

  // Calculate streaks - fetch all match data in a single query (avoiding N+1)
  const allMatchResults = db.prepare(`
    SELECT
      mp.player_id,
      p.name as player_name,
      m.played_at,
      mp.score,
      mp.team,
      m.id as match_id
    FROM match_participants mp
    JOIN players p ON mp.player_id = p.id
    JOIN matches m ON mp.match_id = m.id
    WHERE m.game_id = ?
    ORDER BY m.played_at ASC
  `).all(parseInt(gameId)) as { player_id: number; player_name: string; played_at: string; score: number; team: number; match_id: number }[];

  // Build a map of match_id -> team scores for quick lookup
  const matchTeamScores: Map<number, Map<number, number>> = new Map();
  for (const row of allMatchResults) {
    if (!matchTeamScores.has(row.match_id)) {
      matchTeamScores.set(row.match_id, new Map());
    }
    matchTeamScores.get(row.match_id)!.set(row.team, row.score);
  }

  // Group results by player
  const playerMatches: Map<number, { player_name: string; matches: { played_at: string; score: number; opponent_score: number }[] }> = new Map();
  for (const row of allMatchResults) {
    if (!playerMatches.has(row.player_id)) {
      playerMatches.set(row.player_id, { player_name: row.player_name, matches: [] });
    }
    // Find opponent team score
    const teamScores = matchTeamScores.get(row.match_id)!;
    let opponentScore = 0;
    for (const [team, score] of teamScores) {
      if (team !== row.team) {
        opponentScore = score;
        break;
      }
    }
    playerMatches.get(row.player_id)!.matches.push({
      played_at: row.played_at,
      score: row.score,
      opponent_score: opponentScore
    });
  }

  let longestWinStreak: { player_id: number; player_name: string; streak: number; start: string; end: string } | null = null;
  let longestLoseStreak: { player_id: number; player_name: string; streak: number; start: string; end: string } | null = null;
  let longestUnbeatenStreak: { player_id: number; player_name: string; streak: number; start: string; end: string } | null = null;

  for (const [player_id, data] of playerMatches) {
    // Matches are already sorted by played_at ASC from the query
    let currentWinStreak = 0;
    let currentLoseStreak = 0;
    let currentUnbeatenStreak = 0;
    let winStreakStart: string | null = null;
    let loseStreakStart: string | null = null;
    let unbeatenStreakStart: string | null = null;

    for (const match of data.matches) {
      const isWin = match.score > match.opponent_score;
      const isLoss = match.score < match.opponent_score;

      if (isWin) {
        if (currentWinStreak === 0) winStreakStart = match.played_at;
        currentWinStreak++;
        currentLoseStreak = 0;
        currentUnbeatenStreak++;
        if (currentWinStreak > (longestWinStreak?.streak || 0)) {
          longestWinStreak = {
            player_id,
            player_name: data.player_name,
            streak: currentWinStreak,
            start: winStreakStart!,
            end: match.played_at
          };
        }
      } else if (isLoss) {
        if (currentLoseStreak === 0) loseStreakStart = match.played_at;
        currentWinStreak = 0;
        currentLoseStreak++;
        currentUnbeatenStreak = 0;
        if (currentLoseStreak > (longestLoseStreak?.streak || 0)) {
          longestLoseStreak = {
            player_id,
            player_name: data.player_name,
            streak: currentLoseStreak,
            start: loseStreakStart!,
            end: match.played_at
          };
        }
      } else {
        // Draw
        if (currentUnbeatenStreak === 0) unbeatenStreakStart = match.played_at;
        currentWinStreak = 0;
        currentLoseStreak = 0;
        currentUnbeatenStreak++;
        if (currentUnbeatenStreak > (longestUnbeatenStreak?.streak || 0)) {
          longestUnbeatenStreak = {
            player_id,
            player_name: data.player_name,
            streak: currentUnbeatenStreak,
            start: unbeatenStreakStart!,
            end: match.played_at
          };
        }
      }
    }
  }

  if (longestWinStreak) {
    records.longest_win_streak = {
      player_id: longestWinStreak.player_id,
      player_name: longestWinStreak.player_name,
      value: longestWinStreak.streak,
      date: longestWinStreak.start !== longestWinStreak.end
        ? `${longestWinStreak.start?.split(' ')[0]} - ${longestWinStreak.end?.split(' ')[0]}`
        : longestWinStreak.start?.split(' ')[0]
    };
  }

  if (longestLoseStreak) {
    records.longest_lose_streak = {
      player_id: longestLoseStreak.player_id,
      player_name: longestLoseStreak.player_name,
      value: longestLoseStreak.streak,
      date: longestLoseStreak.start !== longestLoseStreak.end
        ? `${longestLoseStreak.start?.split(' ')[0]} - ${longestLoseStreak.end?.split(' ')[0]}`
        : longestLoseStreak.start?.split(' ')[0]
    };
  }

  if (longestUnbeatenStreak) {
    records.longest_unbeaten_streak = {
      player_id: longestUnbeatenStreak.player_id,
      player_name: longestUnbeatenStreak.player_name,
      value: longestUnbeatenStreak.streak,
      date: longestUnbeatenStreak.start !== longestUnbeatenStreak.end
        ? `${longestUnbeatenStreak.start?.split(' ')[0]} - ${longestUnbeatenStreak.end?.split(' ')[0]}`
        : longestUnbeatenStreak.start?.split(' ')[0]
    };
  }

  // Biggest single game skill gain
  const biggestGain = db.prepare(`
    SELECT
      mp.player_id,
      p.name as player_name,
      (mp.elo_after - mp.elo_before) as value,
      m.played_at as date
    FROM match_participants mp
    JOIN players p ON mp.player_id = p.id
    JOIN matches m ON mp.match_id = m.id
    WHERE m.game_id = ?
    ORDER BY value DESC
    LIMIT 1
  `).get(parseInt(gameId)) as Record | undefined;
  records.biggest_skill_gain = biggestGain || null;

  // Biggest single game skill loss
  const biggestLoss = db.prepare(`
    SELECT
      mp.player_id,
      p.name as player_name,
      (mp.elo_before - mp.elo_after) as value,
      m.played_at as date
    FROM match_participants mp
    JOIN players p ON mp.player_id = p.id
    JOIN matches m ON mp.match_id = m.id
    WHERE m.game_id = ?
    ORDER BY value DESC
    LIMIT 1
  `).get(parseInt(gameId)) as Record | undefined;
  records.biggest_skill_loss = biggestLoss || null;

  return NextResponse.json(records);
}