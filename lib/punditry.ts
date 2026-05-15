import db from './db';

export interface PunditryFact {
  type: string;
  player_id: number;
  player_name: string;
  description: string;
  metadata?: Record<string, unknown>;
}

interface MatchParticipant {
  player_id: number;
  team: number;
  score: number;
  elo_before: number;
  elo_after: number;
}

interface MatchInfo {
  id: number;
  game_id: number;
  played_at: string;
  participants: MatchParticipant[];
}

/**
 * Get player's highest Elo ever achieved in a game (before this match)
 */
function getHighestEloBefore(playerId: number, gameId: number, beforeMatchId: number): number | null {
  const result = db.prepare(`
    SELECT MAX(elo_after) as highest
    FROM match_participants mp
    JOIN matches m ON mp.match_id = m.id
    WHERE mp.player_id = ? AND m.game_id = ? AND m.id < ?
  `).get(playerId, gameId, beforeMatchId) as { highest: number | null } | null;
  return result?.highest ?? null;
}

/**
 * Get player's lowest Elo ever in a game (before this match)
 */
function getLowestEloBefore(playerId: number, gameId: number, beforeMatchId: number): number | null {
  const result = db.prepare(`
    SELECT MIN(elo_after) as lowest
    FROM match_participants mp
    JOIN matches m ON mp.match_id = m.id
    WHERE mp.player_id = ? AND m.game_id = ? AND m.id < ?
  `).get(playerId, gameId, beforeMatchId) as { lowest: number | null } | null;
  return result?.lowest ?? null;
}

/**
 * Get player's biggest absolute Elo change before this match
 */
function getBiggestEloChangeBefore(playerId: number, gameId: number, beforeMatchId: number): number {
  const result = db.prepare(`
    SELECT MAX(ABS(elo_after - elo_before)) as biggest
    FROM match_participants mp
    JOIN matches m ON mp.match_id = m.id
    WHERE mp.player_id = ? AND m.game_id = ? AND m.id < ?
  `).get(playerId, gameId, beforeMatchId) as { biggest: number } | null;
  return result?.biggest ?? 0;
}

/**
 * Get total points scored by player before this match
 */
function getTotalPointsScoredBefore(playerId: number, gameId: number, beforeMatchId: number): number {
  const result = db.prepare(`
    SELECT SUM(mp.score) as total
    FROM match_participants mp
    JOIN matches m ON mp.match_id = m.id
    WHERE mp.player_id = ? AND m.game_id = ? AND m.id < ?
  `).get(playerId, gameId, beforeMatchId) as { total: number | null } | null;
  return result?.total ?? 0;
}

/**
 * Get total points conceded by player before this match
 */
function getTotalPointsConcededBefore(playerId: number, gameId: number, beforeMatchId: number): number {
  // Sum of opponent scores across all matches
  const result = db.prepare(`
    SELECT SUM(opponent_score) as total
    FROM (
      SELECT mp.match_id, mp.score,
        (SELECT MAX(mp2.score) FROM match_participants mp2 WHERE mp2.match_id = mp.match_id AND mp2.team != mp.team) as opponent_score
      FROM match_participants mp
      JOIN matches m ON mp.match_id = m.id
      WHERE mp.player_id = ? AND m.game_id = ? AND m.id < ?
    )
  `).get(playerId, gameId, beforeMatchId) as { total: number | null } | null;
  return result?.total ?? 0;
}

/**
 * Get total wins by player before this match
 */
function getTotalWinsBefore(playerId: number, gameId: number, beforeMatchId: number): number {
  const result = db.prepare(`
    SELECT COUNT(*) as wins
    FROM match_participants mp
    JOIN matches m ON mp.match_id = m.id
    WHERE mp.player_id = ? AND m.game_id = ? AND m.id < ?
      AND mp.score > (
        SELECT MAX(mp2.score) FROM match_participants mp2
        WHERE mp2.match_id = mp.match_id AND mp2.team != mp.team
      )
  `).get(playerId, gameId, beforeMatchId) as { wins: number } | null;
  return result?.wins ?? 0;
}

/**
 * Get match results for a player in chronological order (before this match)
 */
function getMatchResultsBefore(playerId: number, gameId: number, beforeMatchId: number): { match_id: number; result: 'win' | 'loss' | 'draw' }[] {
  const results = db.prepare(`
    SELECT
      mp.match_id,
      mp.score,
      (SELECT MAX(mp2.score) FROM match_participants mp2 WHERE mp2.match_id = mp.match_id AND mp2.team != mp.team) as opponent_score
    FROM match_participants mp
    JOIN matches m ON mp.match_id = m.id
    WHERE mp.player_id = ? AND m.game_id = ? AND m.id < ?
    ORDER BY m.played_at ASC
  `).all(playerId, gameId, beforeMatchId) as { match_id: number; score: number; opponent_score: number }[];

  return results.map(r => ({
    match_id: r.match_id,
    result: r.score > r.opponent_score ? 'win' as const : r.score < r.opponent_score ? 'loss' as const : 'draw' as const
  }));
}

/**
 * Count matches between two players on opposing teams before this match
 */
function getMatchesBetweenPlayersBefore(playerId1: number, playerId2: number, gameId: number, beforeMatchId: number): number {
  const result = db.prepare(`
    SELECT COUNT(DISTINCT m.id) as count
    FROM matches m
    JOIN match_participants mp1 ON m.id = mp1.match_id
    JOIN match_participants mp2 ON m.id = mp2.match_id
    WHERE m.game_id = ? AND m.id < ?
      AND mp1.player_id = ? AND mp2.player_id = ?
      AND mp1.team != mp2.team
  `).get(gameId, beforeMatchId, playerId1, playerId2) as { count: number };
  return result.count;
}

/**
 * Calculate punditry facts for a match
 */
export function getPunditryForMatch(matchId: number): PunditryFact[] {
  const facts: PunditryFact[] = [];

  // Get match info
  const match = db.prepare(`
    SELECT m.id, m.game_id, m.played_at
    FROM matches m
    WHERE m.id = ?
  `).get(matchId) as { id: number; game_id: number; played_at: string } | null;

  if (!match) return facts;

  // Get participants
  const participants = db.prepare(`
    SELECT mp.player_id, mp.team, mp.score, mp.elo_before, mp.elo_after, p.name as player_name
    FROM match_participants mp
    JOIN players p ON mp.player_id = p.id
    WHERE mp.match_id = ?
  `).all(matchId) as { player_id: number; team: number; score: number; elo_before: number; elo_after: number; player_name: string }[];

  // Get teams info
  const teamMap = new Map<number, { score: number; player_ids: number[] }>();
  for (const p of participants) {
    if (!teamMap.has(p.team)) {
      teamMap.set(p.team, { score: p.score, player_ids: [] });
    }
    teamMap.get(p.team)!.player_ids.push(p.player_id);
  }
  const teams = Array.from(teamMap.values());

  // Determine winners/losers
  const maxScore = Math.max(...teams.map(t => t.score));
  const winningTeams = teams.filter(t => t.score === maxScore);
  const isDraw = winningTeams.length > 1;
  const winnerIds = new Set<number>();
  const loserIds = new Set<number>();

  for (const team of teams) {
    if (team.score === maxScore && !isDraw) {
      team.player_ids.forEach(id => winnerIds.add(id));
    } else if (team.score < maxScore) {
      team.player_ids.forEach(id => loserIds.add(id));
    }
  }

  // Get player name map
  const playerNameMap = new Map(participants.map(p => [p.player_id, p.player_name]));

  for (const p of participants) {
    // 1. Highest ever skill
    const highestBefore = getHighestEloBefore(p.player_id, match.game_id, matchId);
    if (highestBefore === null || p.elo_after > highestBefore) {
      facts.push({
        type: 'highest_skill',
        player_id: p.player_id,
        player_name: playerNameMap.get(p.player_id) ?? '',
        description: `That match puts ${playerNameMap.get(p.player_id)} on their highest ever skill (${p.elo_after.toFixed(1)})`,
        metadata: { elo: p.elo_after }
      });
    }

    // 2. Lowest ever skill
    const lowestBefore = getLowestEloBefore(p.player_id, match.game_id, matchId);
    if (lowestBefore === null || p.elo_after < lowestBefore) {
      facts.push({
        type: 'lowest_skill',
        player_id: p.player_id,
        player_name: playerNameMap.get(p.player_id) ?? '',
        description: `That match puts ${playerNameMap.get(p.player_id)} on their lowest ever skill (${p.elo_after.toFixed(1)})`,
        metadata: { elo: p.elo_after }
      });
    }

    // 3. Most significant match (biggest skill gain/loss)
    const eloChange = Math.abs(p.elo_after - p.elo_before);
    const biggestBefore = getBiggestEloChangeBefore(p.player_id, match.game_id, matchId);
    if (eloChange > biggestBefore && biggestBefore > 0) {
      const change = p.elo_after - p.elo_before;
      const direction = change > 0 ? 'gain' : 'loss';
      facts.push({
        type: 'biggest_match',
        player_id: p.player_id,
        player_name: playerNameMap.get(p.player_id) ?? '',
        description: `That was ${playerNameMap.get(p.player_id)}'s most significant match (${Math.abs(change).toFixed(1)} skill ${direction})`,
        metadata: { change: eloChange }
      });
    }

    // 4. Points scored milestone (multiple of 100)
    const pointsBefore = getTotalPointsScoredBefore(p.player_id, match.game_id, matchId);
    const totalPoints = pointsBefore + p.score;
    if (totalPoints > 0 && totalPoints % 100 === 0) {
      facts.push({
        type: 'points_milestone',
        player_id: p.player_id,
        player_name: playerNameMap.get(p.player_id) ?? '',
        description: `That match hit a points scored milestone for ${playerNameMap.get(p.player_id)} (${totalPoints} total points)`,
        metadata: { total_points: totalPoints }
      });
    }

    // 6. Points conceded milestone (multiple of 100)
    const opponentScore = Math.max(...participants.filter(op => op.team !== p.team).map(op => op.score));
    const pointsConcededBefore = getTotalPointsConcededBefore(p.player_id, match.game_id, matchId);
    const totalConceded = pointsConcededBefore + opponentScore;
    if (totalConceded > 0 && totalConceded % 100 === 0) {
      facts.push({
        type: 'points_conceded_milestone',
        player_id: p.player_id,
        player_name: playerNameMap.get(p.player_id) ?? '',
        description: `That match hit a points conceded milestone for ${playerNameMap.get(p.player_id)} (${totalConceded} total points conceded)`,
        metadata: { total_conceded: totalConceded }
      });
    }

    // 7. Win milestone (multiple of 100)
    if (!isDraw && winnerIds.has(p.player_id)) {
      const winsBefore = getTotalWinsBefore(p.player_id, match.game_id, matchId);
      const totalWins = winsBefore + 1;
      if (totalWins > 0 && totalWins % 100 === 0) {
        facts.push({
          type: 'win_milestone',
          player_id: p.player_id,
          player_name: playerNameMap.get(p.player_id) ?? '',
          description: `That match hit a win milestone for ${playerNameMap.get(p.player_id)} (${totalWins} total wins)`,
          metadata: { total_wins: totalWins }
        });
      }
    }

    // 8 & 9. Streak calculations
    const matchResults = getMatchResultsBefore(p.player_id, match.game_id, matchId);

    // Calculate longest streaks before this match
    let longestWinStreak = 0;
    let longestLoseStreak = 0;
    let longestUnbeatenStreak = 0;
    let currentWinStreak = 0;
    let currentLoseStreak = 0;
    let currentUnbeatenStreak = 0;

    for (const r of matchResults) {
      if (r.result === 'win') {
        currentWinStreak++;
        currentLoseStreak = 0;
        currentUnbeatenStreak++;
        if (currentWinStreak > longestWinStreak) longestWinStreak = currentWinStreak;
      } else if (r.result === 'loss') {
        currentWinStreak = 0;
        currentLoseStreak++;
        currentUnbeatenStreak = 0;
        if (currentLoseStreak > longestLoseStreak) longestLoseStreak = currentLoseStreak;
      } else { // draw
        currentWinStreak = 0;
        currentLoseStreak = 0;
        currentUnbeatenStreak++;
      }
      if (currentUnbeatenStreak > longestUnbeatenStreak) longestUnbeatenStreak = currentUnbeatenStreak;
    }

    // Current streak before this match
    const streakBefore = {
      win: currentWinStreak,
      lose: currentLoseStreak,
      unbeaten: currentUnbeatenStreak
    };

    // Current result
    const currentResult = p.score > opponentScore ? 'win' as const : p.score < opponentScore ? 'loss' as const : 'draw' as const;

    // New streak lengths after this match
    const newStreak = {
      win: currentResult === 'win' ? streakBefore.win + 1 : 0,
      lose: currentResult === 'loss' ? streakBefore.lose + 1 : 0,
      unbeaten: currentResult !== 'loss' ? streakBefore.unbeaten + 1 : 0
    };

    // 8. Longest streak milestone
    if (newStreak.win > longestWinStreak && newStreak.win >= 3) {
      facts.push({
        type: 'longest_win_streak',
        player_id: p.player_id,
        player_name: playerNameMap.get(p.player_id) ?? '',
        description: `That match hit a longest win streak milestone for ${playerNameMap.get(p.player_id)} (${newStreak.win} wins)`,
        metadata: { streak_length: newStreak.win }
      });
    }
    if (newStreak.lose > longestLoseStreak && newStreak.lose >= 3) {
      facts.push({
        type: 'longest_lose_streak',
        player_id: p.player_id,
        player_name: playerNameMap.get(p.player_id) ?? '',
        description: `That match hit a longest losing streak milestone for ${playerNameMap.get(p.player_id)} (${newStreak.lose} losses)`,
        metadata: { streak_length: newStreak.lose }
      });
    }
    if (newStreak.unbeaten > longestUnbeatenStreak && newStreak.unbeaten >= 5) {
      facts.push({
        type: 'longest_unbeaten_streak',
        player_id: p.player_id,
        player_name: playerNameMap.get(p.player_id) ?? '',
        description: `That match hit a longest unbeaten streak milestone for ${playerNameMap.get(p.player_id)} (${newStreak.unbeaten} unbeaten)`,
        metadata: { streak_length: newStreak.unbeaten }
      });
    }

    // 9. Streak broken
    if (streakBefore.win >= 3 && currentResult !== 'win') {
      facts.push({
        type: 'win_streak_broken',
        player_id: p.player_id,
        player_name: playerNameMap.get(p.player_id) ?? '',
        description: `That match broke ${playerNameMap.get(p.player_id)}'s ${streakBefore.win}-game winning streak`,
        metadata: { streak_length: streakBefore.win }
      });
    }
    if (streakBefore.lose >= 3 && currentResult !== 'loss') {
      facts.push({
        type: 'lose_streak_broken',
        player_id: p.player_id,
        player_name: playerNameMap.get(p.player_id) ?? '',
        description: `That match ended ${playerNameMap.get(p.player_id)}'s ${streakBefore.lose}-game losing streak`,
        metadata: { streak_length: streakBefore.lose }
      });
    }
    if (streakBefore.unbeaten >= 5 && currentResult === 'loss') {
      facts.push({
        type: 'unbeaten_streak_broken',
        player_id: p.player_id,
        player_name: playerNameMap.get(p.player_id) ?? '',
        description: `That match ended ${playerNameMap.get(p.player_id)}'s ${streakBefore.unbeaten}-game unbeaten run`,
        metadata: { streak_length: streakBefore.unbeaten }
      });
    }
  }

  // 5. Matches against milestone (between opponents on different teams)
  for (const [teamNum, teamData] of teamMap.entries()) {
    for (const [otherTeamNum, otherTeamData] of teamMap.entries()) {
      if (teamNum === otherTeamNum) continue;

      for (const playerId of teamData.player_ids) {
        for (const opponentId of otherTeamData.player_ids) {
          const matchesBefore = getMatchesBetweenPlayersBefore(playerId, opponentId, match.game_id, matchId);
          const totalMatches = matchesBefore + 1; // +1 for current match
          if (totalMatches > 0 && totalMatches % 100 === 0) {
            // Avoid duplicate facts for same pair
            if (playerId < opponentId) {
              facts.push({
                type: 'matches_against_milestone',
                player_id: playerId,
                player_name: playerNameMap.get(playerId) ?? '',
                description: `That match hit a matches played milestone between ${playerNameMap.get(playerId)} and ${playerNameMap.get(opponentId)} (${totalMatches} games)`,
                metadata: { opponent_id: opponentId, opponent_name: playerNameMap.get(opponentId), total_matches: totalMatches }
              });
            }
          }
        }
      }
    }
  }

  return facts;
}