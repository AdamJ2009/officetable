import db from './db';
import type { PlayerRating, LeaderboardEntry, CreateMatchInput } from './types';

// Elo constants
const DEFAULT_ELO = 0;
const K_FACTOR = 25;

// For team games, we use average team Elo
// This ensures all players on a team move in the same direction

export function createPlayerRating(playerId: number, gameId: number): PlayerRating {
  const stmt = db.prepare(`
    INSERT INTO player_ratings (player_id, game_id, elo)
    VALUES (?, ?, ?)
  `);
  const result = stmt.run(playerId, gameId, DEFAULT_ELO);
  return {
    id: result.lastInsertRowid as number,
    player_id: playerId,
    game_id: gameId,
    elo: DEFAULT_ELO,
  };
}

export function getPlayerRatings(gameId: number): PlayerRating[] {
  const stmt = db.prepare(`
    SELECT pr.*, p.name as player_name
    FROM player_ratings pr
    JOIN players p ON pr.player_id = p.id
    WHERE pr.game_id = ?
    ORDER BY pr.elo DESC
  `);
  return stmt.all(gameId) as PlayerRating[];
}

export function getOrCreatePlayerRating(playerId: number, gameId: number): PlayerRating {
  const stmt = db.prepare(`
    SELECT * FROM player_ratings WHERE player_id = ? AND game_id = ?
  `);
  const existing = stmt.get(playerId, gameId) as PlayerRating | undefined;
  if (existing) return existing;
  return createPlayerRating(playerId, gameId);
}

export function getLeaderboard(gameId: number): LeaderboardEntry[] {
  const stmt = db.prepare(`
    SELECT
      pr.player_id,
      p.name as player_name,
      pr.elo,
      COALESCE(wins.count, 0) as wins,
      COALESCE(losses.count, 0) as losses,
      COALESCE(draws.count, 0) as draws
    FROM player_ratings pr
    JOIN players p ON pr.player_id = p.id
    LEFT JOIN (
      SELECT player_id, COUNT(*) as count
      FROM match_participants
      WHERE score > 0 AND score > (
        SELECT MAX(score) FROM match_participants mp2 WHERE mp2.match_id = match_participants.match_id AND mp2.team != match_participants.team
      )
      GROUP BY player_id
    ) wins ON wins.player_id = pr.player_id
    LEFT JOIN (
      SELECT player_id, COUNT(*) as count
      FROM match_participants
      WHERE score >= 0 AND score < (
        SELECT MAX(score) FROM match_participants mp2 WHERE mp2.match_id = match_participants.match_id AND mp2.team != match_participants.team
      )
      GROUP BY player_id
    ) losses ON losses.player_id = pr.player_id
    LEFT JOIN (
      SELECT player_id, COUNT(*) as count
      FROM match_participants mp1
      WHERE EXISTS (
        SELECT 1 FROM match_participants mp2
        WHERE mp2.match_id = mp1.match_id
        AND mp2.team != mp1.team
        AND mp2.score = mp1.score
      )
      GROUP BY player_id
    ) draws ON draws.player_id = pr.player_id
    WHERE pr.game_id = ?
    ORDER BY pr.elo DESC
  `);
  return stmt.all(gameId) as LeaderboardEntry[];
}

/**
 * Calculate expected score for player A against player B.
 * Returns a value between 0 and 1 representing the probability of A winning.
 */
function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 180));
}

/**
 * Calculate average Elo for a team.
 */
function averageTeamElo(ratings: number[]): number {
  if (ratings.length === 0) return DEFAULT_ELO;
  return ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
}

/**
 * Calculate point ratio for each team.
 * Returns array of actual results: team_score / total_score for each team.
 */
function getPointRatios(teams: CreateMatchInput['teams']): number[] {
  const totalScore = teams.reduce((sum, t) => sum + t.score, 0);
  if (totalScore === 0) {
    // If no points scored, distribute equally
    return teams.map(() => 1 / teams.length);
  }
  return teams.map(t => t.score / totalScore);
}

export function processMatch(input: CreateMatchInput, matchTimestamp?: Date): void {
  const { game_id, notes, teams } = input;
  const matchDate = matchTimestamp || new Date();

  // Get or create ratings for all players
  const ratingsByPlayer: Map<number, number> = new Map();

  for (const team of teams) {
    for (const playerId of team.player_ids) {
      const rating = getOrCreatePlayerRating(playerId, game_id);
      ratingsByPlayer.set(playerId, rating.elo);
    }
  }

  // Calculate average Elo for each team
  const teamAverageElos = teams.map(team =>
    averageTeamElo(team.player_ids.map(id => ratingsByPlayer.get(id)!))
  );

  // Get point ratios (team_score / total_score)
  const results = getPointRatios(teams);

  // Calculate rating changes for each team
  const ratingChanges: number[] = [];

  for (let i = 0; i < teams.length; i++) {
    // Find opponent team(s) - for 2-team games, just use the other team
    // For multi-team games, use average of all other teams
    let opponentElo: number;

    if (teams.length === 2) {
      opponentElo = teamAverageElos[1 - i];
    } else {
      // Multi-team: use average of all other teams
      const otherElos = teamAverageElos.filter((_, j) => j !== i);
      opponentElo = averageTeamElo(otherElos);
    }

    const expected = expectedScore(teamAverageElos[i], opponentElo);
    const actual = results[i];

    // Each player's rating change is based on team performance
    // This ensures all team members move together
    ratingChanges.push(K_FACTOR * (actual - expected));
  }

  // Update ratings in database
  const updateStmt = db.prepare(`
    UPDATE player_ratings SET elo = ? WHERE player_id = ? AND game_id = ?
  `);

  const insertMatch = db.prepare(`
    INSERT INTO matches (game_id, notes, played_at) VALUES (?, ?, ?)
  `);

  const insertParticipant = db.prepare(`
    INSERT INTO match_participants (match_id, player_id, team, score, elo_before, elo_after)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // Use transaction for atomicity
  const updateRatings = db.transaction(() => {
    // Create match record with timestamp
    const playedAt = matchDate.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
    const matchResult = insertMatch.run(game_id, notes || null, playedAt);
    const matchId = matchResult.lastInsertRowid as number;

    // Update each team's players
    for (let teamIndex = 0; teamIndex < teams.length; teamIndex++) {
      const team = teams[teamIndex];
      const change = ratingChanges[teamIndex];

      for (const playerId of team.player_ids) {
        const oldElo = ratingsByPlayer.get(playerId)!;
        const newElo = oldElo + change;

        updateStmt.run(newElo, playerId, game_id);
        insertParticipant.run(
          matchId,
          playerId,
          team.team,
          team.score,
          oldElo,
          newElo
        );
      }
    }
  });

  updateRatings();
}

/**
 * Correct a match result and replay all subsequent matches.
 * This recalculates all Elo ratings from the corrected match forward.
 */
export function correctMatch(
  matchId: number,
  newTeams: { team: number; player_ids: number[]; score: number }[]
): void {
  // Get the original match
  const matchStmt = db.prepare(`
    SELECT * FROM matches WHERE id = ?
  `);
  const originalMatch = matchStmt.get(matchId) as { id: number; game_id: number; played_at: string; notes: string | null } | undefined;

  if (!originalMatch) {
    throw new Error('Match not found');
  }

  const gameId = originalMatch.game_id;
  const originalTimestamp = originalMatch.played_at;

  // Get all matches for this game from the correction point forward (in chronological order)
  const matchesToReplayStmt = db.prepare(`
    SELECT id, played_at, notes FROM matches
    WHERE game_id = ? AND played_at >= ?
    ORDER BY played_at ASC
  `);
  const allMatchesFromPoint = matchesToReplayStmt.all(gameId, originalTimestamp) as { id: number; played_at: string; notes: string | null }[];

  // Get all player_ids involved in all matches from this point forward
  const playerIds = new Set<number>();
  const getMatchPlayersStmt = db.prepare(`SELECT DISTINCT player_id FROM match_participants WHERE match_id = ?`);
  for (const m of allMatchesFromPoint) {
    const players = getMatchPlayersStmt.all(m.id) as { player_id: number }[];
    for (const p of players) {
      playerIds.add(p.player_id);
    }
  }
  // Also include players from the new teams
  for (const team of newTeams) {
    for (const pid of team.player_ids) {
      playerIds.add(pid);
    }
  }

  // Get ratings before the correction point for each player
  // Find the most recent match before this one
  const prevMatchStmt = db.prepare(`
    SELECT id FROM matches
    WHERE game_id = ? AND played_at < ?
    ORDER BY played_at DESC LIMIT 1
  `);
  const prevMatch = prevMatchStmt.get(gameId, originalTimestamp) as { id: number } | undefined;

  // Get elo_before from the match being corrected, or from player_ratings
  const ratingsBefore: Map<number, number> = new Map();

  for (const playerId of playerIds) {
    // Try to get elo_after from the previous match for this player
    if (prevMatch) {
      const prevEloStmt = db.prepare(`
        SELECT elo_after FROM match_participants
        WHERE match_id = ? AND player_id = ?
      `);
      const prevElo = prevEloStmt.get(prevMatch.id, playerId) as { elo_after: number } | undefined;
      if (prevElo) {
        ratingsBefore.set(playerId, prevElo.elo_after);
        continue;
      }
    }

    // Fall back to current rating from player_ratings
    // For players who haven't played yet, use DEFAULT_ELO
    const currentRatingStmt = db.prepare(`
      SELECT elo FROM player_ratings WHERE player_id = ? AND game_id = ?
    `);
    const currentRating = currentRatingStmt.get(playerId, gameId) as { elo: number } | undefined;
    ratingsBefore.set(playerId, currentRating?.elo ?? DEFAULT_ELO);
  }

  // Collect all matches to replay with their participant info
  interface MatchToReplay {
    matchId: number;
    teams: { team: number; player_ids: number[]; score: number }[];
    timestamp: string;
    notes: string | null;
  }

  const matchesToReplay: MatchToReplay[] = [];

  // First match is the corrected one
  matchesToReplay.push({
    matchId: matchId,
    teams: newTeams,
    timestamp: originalTimestamp,
    notes: originalMatch.notes
  });

  // Subsequent matches
  const getParticipantsStmt = db.prepare(`
    SELECT player_id, team, score FROM match_participants WHERE match_id = ?
  `);

  for (const m of allMatchesFromPoint) {
    if (m.id === matchId) continue; // Skip the match we're correcting (already added)

    const participants = getParticipantsStmt.all(m.id) as { player_id: number; team: number; score: number }[];

    // Group by team
    const teams: { team: number; player_ids: number[]; score: number }[] = [];
    for (const p of participants) {
      let team = teams.find(t => t.team === p.team);
      if (!team) {
        team = { team: p.team, player_ids: [], score: p.score };
        teams.push(team);
      }
      team.player_ids.push(p.player_id);
    }

    matchesToReplay.push({
      matchId: m.id,
      teams,
      timestamp: m.played_at,
      notes: m.notes
    });
  }

  // Use transaction for atomic correction
  // Track the new match ID for the corrected match
  let correctedMatchNewId: number | null = null;

  const doCorrection = db.transaction(() => {
    // Delete match_participants for all matches being replayed
    const deleteParticipantsStmt = db.prepare(`DELETE FROM match_participants WHERE match_id = ?`);
    for (const m of matchesToReplay) {
      deleteParticipantsStmt.run(m.matchId);
    }

    // Reset player ratings to their values before the correction point
    const resetRatingStmt = db.prepare(`
      UPDATE player_ratings SET elo = ? WHERE player_id = ? AND game_id = ?
    `);
    for (const [playerId, elo] of ratingsBefore) {
      resetRatingStmt.run(elo, playerId, gameId);
    }

    // Ensure all players have ratings
    for (const playerId of playerIds) {
      if (!ratingsBefore.has(playerId)) {
        // Create rating if doesn't exist
        createPlayerRating(playerId, gameId);
      }
    }

    // Replay all matches in order
    for (const matchData of matchesToReplay) {
      const matchDate = new Date(matchData.timestamp.replace(' ', 'T'));

      // Delete existing match record (we'll recreate)
      if (matchData.matchId !== matchId) {
        db.prepare(`DELETE FROM matches WHERE id = ?`).run(matchData.matchId);
      } else {
        // For the original match, update scores in the match record
        db.prepare(`DELETE FROM matches WHERE id = ?`).run(matchData.matchId);
      }

      // Create new match with the same timestamp
      const insertMatch = db.prepare(`
        INSERT INTO matches (game_id, notes, played_at) VALUES (?, ?, ?)
      `);
      const playedAt = matchDate.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
      const result = insertMatch.run(gameId, matchData.notes ?? null, playedAt);
      const newMatchId = result.lastInsertRowid as number;

      // Track the new ID for the corrected match (first one)
      if (matchData.matchId === matchId && correctedMatchNewId === null) {
        correctedMatchNewId = newMatchId;
      }

      // Calculate and apply rating changes
      const ratingsByPlayer: Map<number, number> = new Map();
      for (const team of matchData.teams) {
        for (const playerId of team.player_ids) {
          const rating = getOrCreatePlayerRating(playerId, gameId);
          ratingsByPlayer.set(playerId, rating.elo);
        }
      }

      // Calculate average Elo for each team
      const teamAverageElos = matchData.teams.map(team =>
        averageTeamElo(team.player_ids.map(id => ratingsByPlayer.get(id)!))
      );

      // Get point ratios
      const totalScore = matchData.teams.reduce((sum, t) => sum + t.score, 0);
      const results = totalScore === 0
        ? matchData.teams.map(() => 1 / matchData.teams.length)
        : matchData.teams.map(t => t.score / totalScore);

      // Calculate rating changes
      const ratingChanges: number[] = [];
      for (let i = 0; i < matchData.teams.length; i++) {
        let opponentElo: number;
        if (matchData.teams.length === 2) {
          opponentElo = teamAverageElos[1 - i];
        } else {
          const otherElos = teamAverageElos.filter((_, j) => j !== i);
          opponentElo = averageTeamElo(otherElos);
        }
        const expected = expectedScore(teamAverageElos[i], opponentElo);
        ratingChanges.push(K_FACTOR * (results[i] - expected));
      }

      // Update ratings and insert participants
      const updateRatingStmt = db.prepare(`
        UPDATE player_ratings SET elo = ? WHERE player_id = ? AND game_id = ?
      `);
      const insertParticipantStmt = db.prepare(`
        INSERT INTO match_participants (match_id, player_id, team, score, elo_before, elo_after)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (let teamIndex = 0; teamIndex < matchData.teams.length; teamIndex++) {
        const team = matchData.teams[teamIndex];
        const change = ratingChanges[teamIndex];

        for (const playerId of team.player_ids) {
          const oldElo = ratingsByPlayer.get(playerId)!;
          const newElo = oldElo + change;

          updateRatingStmt.run(newElo, playerId, gameId);
          insertParticipantStmt.run(newMatchId, playerId, team.team, team.score, oldElo, newElo);

          // Update the map for subsequent matches
          ratingsByPlayer.set(playerId, newElo);
        }
      }
    }
  });

  doCorrection();

  // Mark the corrected match as edited (after transaction commits)
  if (correctedMatchNewId) {
    const now = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
    db.prepare(`UPDATE matches SET is_edited = 1, edited_at = ? WHERE id = ?`).run(now, correctedMatchNewId);
  }
}

/**
 * Check if a match is within the edit window (24 hours).
 */
export function isWithinEditWindow(playedAt: string): boolean {
  const matchTime = new Date(playedAt.replace(' ', 'T'));
  const now = new Date();
  const hoursSince = (now.getTime() - matchTime.getTime()) / (1000 * 60 * 60);
  return hoursSince <= 24;
}

/**
 * Delete a match and replay all subsequent matches to recalculate ratings.
 */
export function deleteMatchAndReplay(matchId: number): void {
  // Get the match to delete
  const matchStmt = db.prepare(`SELECT * FROM matches WHERE id = ?`);
  const matchToDelete = matchStmt.get(matchId) as { id: number; game_id: number; played_at: string } | undefined;

  if (!matchToDelete) {
    throw new Error('Match not found');
  }

  const gameId = matchToDelete.game_id;
  const deleteTimestamp = matchToDelete.played_at;

  // Get all subsequent matches for this game (in chronological order)
  const subsequentStmt = db.prepare(`
    SELECT id, played_at, notes FROM matches
    WHERE game_id = ? AND played_at > ?
    ORDER BY played_at ASC
  `);
  const subsequentMatches = subsequentStmt.all(gameId, deleteTimestamp) as { id: number; played_at: string; notes: string | null }[];

  // If no subsequent matches, just delete and adjust ratings based on the deleted match's effect
  if (subsequentMatches.length === 0) {
    // Get the ratings change from this match and reverse it
    const participantsStmt = db.prepare(`
      SELECT player_id, elo_before, elo_after FROM match_participants WHERE match_id = ?
    `);
    const participants = participantsStmt.all(matchId) as { player_id: number; elo_before: number; elo_after: number }[];

    const deleteTransaction = db.transaction(() => {
      // Reverse the rating changes
      for (const p of participants) {
        db.prepare(`UPDATE player_ratings SET elo = ? WHERE player_id = ? AND game_id = ?`).run(p.elo_before, p.player_id, gameId);
      }

      // Delete match participants and match
      db.prepare(`DELETE FROM match_participants WHERE match_id = ?`).run(matchId);
      db.prepare(`DELETE FROM matches WHERE id = ?`).run(matchId);
    });

    deleteTransaction();
    return;
  }

  // Get all player_ids involved in subsequent matches
  const playerIds = new Set<number>();
  for (const m of subsequentMatches) {
    const participants = db.prepare(`SELECT DISTINCT player_id FROM match_participants WHERE match_id = ?`).all(m.id) as { player_id: number }[];
    for (const p of participants) {
      playerIds.add(p.player_id);
    }
  }

  // Get ratings before the deleted match for each player
  const prevMatchStmt = db.prepare(`
    SELECT id FROM matches
    WHERE game_id = ? AND played_at < ?
    ORDER BY played_at DESC LIMIT 1
  `);
  const prevMatch = prevMatchStmt.get(gameId, deleteTimestamp) as { id: number } | undefined;

  const ratingsBefore: Map<number, number> = new Map();

  for (const playerId of playerIds) {
    if (prevMatch) {
      const prevEloStmt = db.prepare(`
        SELECT elo_after FROM match_participants
        WHERE match_id = ? AND player_id = ?
      `);
      const prevElo = prevEloStmt.get(prevMatch.id, playerId) as { elo_after: number } | undefined;
      if (prevElo) {
        ratingsBefore.set(playerId, prevElo.elo_after);
        continue;
      }
    }

    // Fall back to current rating
    const currentRating = db.prepare(`SELECT elo FROM player_ratings WHERE player_id = ? AND game_id = ?`).get(playerId, gameId) as { elo: number } | undefined;
    ratingsBefore.set(playerId, currentRating?.elo ?? DEFAULT_ELO);
  }

  // Collect subsequent matches to replay
  interface MatchToReplay {
    matchId: number;
    teams: { team: number; player_ids: number[]; score: number }[];
    timestamp: string;
    notes: string | null;
  }

  const matchesToReplay: MatchToReplay[] = [];

  const getParticipantsStmt = db.prepare(`SELECT player_id, team, score FROM match_participants WHERE match_id = ?`);

  for (const m of subsequentMatches) {
    const participants = getParticipantsStmt.all(m.id) as { player_id: number; team: number; score: number }[];

    const teams: { team: number; player_ids: number[]; score: number }[] = [];
    for (const p of participants) {
      let team = teams.find(t => t.team === p.team);
      if (!team) {
        team = { team: p.team, player_ids: [], score: p.score };
        teams.push(team);
      }
      team.player_ids.push(p.player_id);
    }

    matchesToReplay.push({
      matchId: m.id,
      teams,
      timestamp: m.played_at,
      notes: m.notes
    });
  }

  // Use transaction for atomic deletion
  const doDelete = db.transaction(() => {
    // Delete the match to be removed
    db.prepare(`DELETE FROM match_participants WHERE match_id = ?`).run(matchId);
    db.prepare(`DELETE FROM matches WHERE id = ?`).run(matchId);

    // Delete match_participants for subsequent matches
    for (const m of matchesToReplay) {
      db.prepare(`DELETE FROM match_participants WHERE match_id = ?`).run(m.matchId);
      db.prepare(`DELETE FROM matches WHERE id = ?`).run(m.matchId);
    }

    // Reset player ratings to their values before the deleted match
    const resetRatingStmt = db.prepare(`UPDATE player_ratings SET elo = ? WHERE player_id = ? AND game_id = ?`);
    for (const [playerId, elo] of ratingsBefore) {
      resetRatingStmt.run(elo, playerId, gameId);
    }

    // Ensure all players have ratings
    for (const playerId of playerIds) {
      if (!ratingsBefore.has(playerId)) {
        createPlayerRating(playerId, gameId);
      }
    }

    // Replay all subsequent matches in order
    for (const matchData of matchesToReplay) {
      const matchDate = new Date(matchData.timestamp.replace(' ', 'T'));

      // Create new match
      const insertMatch = db.prepare(`INSERT INTO matches (game_id, notes, played_at) VALUES (?, ?, ?)`);
      const playedAt = matchDate.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
      const result = insertMatch.run(gameId, matchData.notes ?? null, playedAt);
      const newMatchId = result.lastInsertRowid as number;

      // Calculate and apply rating changes
      const ratingsByPlayer: Map<number, number> = new Map();
      for (const team of matchData.teams) {
        for (const playerId of team.player_ids) {
          const rating = getOrCreatePlayerRating(playerId, gameId);
          ratingsByPlayer.set(playerId, rating.elo);
        }
      }

      const teamAverageElos = matchData.teams.map(team =>
        averageTeamElo(team.player_ids.map(id => ratingsByPlayer.get(id)!))
      );

      const totalScore = matchData.teams.reduce((sum, t) => sum + t.score, 0);
      const results = totalScore === 0
        ? matchData.teams.map(() => 1 / matchData.teams.length)
        : matchData.teams.map(t => t.score / totalScore);

      const ratingChanges: number[] = [];
      for (let i = 0; i < matchData.teams.length; i++) {
        let opponentElo: number;
        if (matchData.teams.length === 2) {
          opponentElo = teamAverageElos[1 - i];
        } else {
          const otherElos = teamAverageElos.filter((_, j) => j !== i);
          opponentElo = averageTeamElo(otherElos);
        }
        const expected = expectedScore(teamAverageElos[i], opponentElo);
        ratingChanges.push(K_FACTOR * (results[i] - expected));
      }

      const updateRatingStmt = db.prepare(`UPDATE player_ratings SET elo = ? WHERE player_id = ? AND game_id = ?`);
      const insertParticipantStmt = db.prepare(`INSERT INTO match_participants (match_id, player_id, team, score, elo_before, elo_after) VALUES (?, ?, ?, ?, ?, ?)`);

      for (let teamIndex = 0; teamIndex < matchData.teams.length; teamIndex++) {
        const team = matchData.teams[teamIndex];
        const change = ratingChanges[teamIndex];

        for (const playerId of team.player_ids) {
          const oldElo = ratingsByPlayer.get(playerId)!;
          const newElo = oldElo + change;

          updateRatingStmt.run(newElo, playerId, gameId);
          insertParticipantStmt.run(newMatchId, playerId, team.team, team.score, oldElo, newElo);

          ratingsByPlayer.set(playerId, newElo);
        }
      }
    }
  });

  doDelete();
}
