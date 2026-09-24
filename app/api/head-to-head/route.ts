import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get('player_id');
  const gameId = searchParams.get('game_id');

  if (!playerId) {
    return NextResponse.json({ error: 'player_id is required' }, { status: 400 });
  }

  const pid = parseInt(playerId);

  // Verify player exists
  const player = db.prepare('SELECT id, name FROM players WHERE id = ?').get(pid) as { id: number; name: string } | undefined;
  if (!player) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }

  // Build game filter
  const gameFilter = gameId ? ' AND m.game_id = ?' : '';
  const gameParams = gameId ? [parseInt(gameId)] : [];

  // Get all matches where this player participated
  const matchData = db.prepare(`
    SELECT
      m.id as match_id,
      m.game_id,
      g.name as game_name,
      m.played_at,
      mp.team,
      mp.score,
      mp.elo_before,
      mp.elo_after
    FROM match_participants mp
    JOIN matches m ON mp.match_id = m.id
    JOIN games g ON m.game_id = g.id
    WHERE mp.player_id = ?${gameFilter}
    ORDER BY m.played_at ASC
  `).all(pid, ...gameParams) as {
    match_id: number;
    game_id: number;
    game_name: string;
    played_at: string;
    team: number;
    score: number;
    elo_before: number;
    elo_after: number;
  }[];

  if (matchData.length === 0) {
    return NextResponse.json({
      player_id: player.id,
      player_name: player.name,
      opponents: []
    });
  }

  // Get match IDs to fetch opponents
  const matchIds = matchData.map(m => m.match_id);
  const placeholders = matchIds.map(() => '?').join(',');

  // Build a map: match_id -> player's team
  const matchTeamMap = new Map<number, number>();
  for (const m of matchData) {
    matchTeamMap.set(m.match_id, m.team);
  }

  // Get all participants for these matches (excluding our player) on opposing teams
  const allOpponents = db.prepare(`
    SELECT
      mp.match_id,
      mp.player_id as opponent_id,
      p.name as opponent_name,
      p.avatar_url as opponent_avatar_url,
      mp.team,
      mp.score as opponent_score
    FROM match_participants mp
    JOIN players p ON mp.player_id = p.id
    WHERE mp.match_id IN (${placeholders})
      AND mp.player_id != ?
  `).all(...matchIds, pid) as {
    match_id: number;
    opponent_id: number;
    opponent_name: string;
    opponent_avatar_url: string | null;
    team: number;
    opponent_score: number;
  }[];

  // Build match_id -> list of opponents on the opposing team
  const opponentByMatch = new Map<number, { opponent_id: number; opponent_name: string; opponent_avatar_url: string | null; opponent_score: number }[]>();
  for (const opp of allOpponents) {
    const playerTeam = matchTeamMap.get(opp.match_id);
    if (playerTeam === undefined || opp.team === playerTeam) continue; // skip teammates
    if (!opponentByMatch.has(opp.match_id)) {
      opponentByMatch.set(opp.match_id, []);
    }
    opponentByMatch.get(opp.match_id)!.push({
      opponent_id: opp.opponent_id,
      opponent_name: opp.opponent_name,
      opponent_avatar_url: opp.opponent_avatar_url,
      opponent_score: opp.opponent_score,
    });
  }

  // Build per-opponent aggregates
  // Key insight: for each match, the player's elo delta (elo_after - elo_before) is
  // the total skill change. In a 1v1, that full delta is attributed to the one opponent.
  // In a 1v2, we distribute it equally among opponents so the sum across all opponents
  // equals the player's total skill change.
  interface OpponentAggregate {
    opponent_id: number;
    opponent_name: string;
    opponent_avatar_url: string | null;
    game_id: number;
    game_name: string;
    wins: number;
    losses: number;
    draws: number;
    total_matches: number;
    net_skill: number;
    streaks: ('W' | 'L' | 'D')[];
    last_played: string;
  }

  const opponentMap = new Map<string, OpponentAggregate>();

  for (const match of matchData) {
    const opponents = opponentByMatch.get(match.match_id);
    if (!opponents || opponents.length === 0) continue;

    const eloDelta = match.elo_after - match.elo_before;
    // Distribute elo delta equally across opponents so sum == total skill change
    const eloPerOpponent = eloDelta / opponents.length;

    // Determine result: compare player's score vs best opponent score
    const bestOpponentScore = Math.max(...opponents.map(o => o.opponent_score));
    let result: 'W' | 'L' | 'D';
    if (match.score > bestOpponentScore) result = 'W';
    else if (match.score < bestOpponentScore) result = 'L';
    else result = 'D';

    for (const opp of opponents) {
      const key = `${opp.opponent_id}-${match.game_id}`;
      if (!opponentMap.has(key)) {
        opponentMap.set(key, {
          opponent_id: opp.opponent_id,
          opponent_name: opp.opponent_name,
          opponent_avatar_url: opp.opponent_avatar_url,
          game_id: match.game_id,
          game_name: match.game_name,
          wins: 0,
          losses: 0,
          draws: 0,
          total_matches: 0,
          net_skill: 0,
          streaks: [],
          last_played: match.played_at,
        });
      }
      const agg = opponentMap.get(key)!;
      agg.total_matches++;

      if (result === 'W') {
        agg.wins++;
      } else if (result === 'L') {
        agg.losses++;
      } else {
        agg.draws++;
      }
      agg.net_skill += eloPerOpponent;
      agg.streaks.push(result);

      if (new Date(match.played_at) > new Date(agg.last_played)) {
        agg.last_played = match.played_at;
      }
    }
  }

  // Compute current streaks and build response
  const opponents = Array.from(opponentMap.values()).map(agg => {
    // Current streak: walk backwards from most recent
    let currentStreak = '';
    let streakCount = 0;
    for (let i = agg.streaks.length - 1; i >= 0; i--) {
      if (i === agg.streaks.length - 1) {
        currentStreak = agg.streaks[i];
        streakCount = 1;
      } else if (agg.streaks[i] === currentStreak) {
        streakCount++;
      } else {
        break;
      }
    }

    return {
      opponent_id: agg.opponent_id,
      opponent_name: agg.opponent_name,
      opponent_avatar_url: agg.opponent_avatar_url,
      game_id: agg.game_id,
      game_name: agg.game_name,
      wins: agg.wins,
      losses: agg.losses,
      draws: agg.draws,
      total_matches: agg.total_matches,
      net_skill: Math.round(agg.net_skill * 1000) / 1000,
      current_streak: `${currentStreak}${streakCount}`,
      last_played: agg.last_played,
    };
  });

  // Sort by total matches descending, then by opponent name
  opponents.sort((a, b) => b.total_matches - a.total_matches || a.opponent_name.localeCompare(b.opponent_name));

  return NextResponse.json({
    player_id: player.id,
    player_name: player.name,
    opponents
  });
}