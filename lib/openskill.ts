import { rating, rate, ordinal } from 'openskill';
import db from './db';
import type { PlayerRating, LeaderboardEntry, CreateMatchInput } from './types';

export function createPlayerRating(playerId: number, gameId: number): PlayerRating {
  const stmt = db.prepare(`
    INSERT INTO player_ratings (player_id, game_id, mu, sigma)
    VALUES (?, ?, 25, 8.333)
  `);
  const result = stmt.run(playerId, gameId);
  return {
    id: result.lastInsertRowid as number,
    player_id: playerId,
    game_id: gameId,
    mu: 25,
    sigma: 8.333,
  };
}

export function getPlayerRatings(gameId: number): PlayerRating[] {
  const stmt = db.prepare(`
    SELECT pr.*, p.name as player_name
    FROM player_ratings pr
    JOIN players p ON pr.player_id = p.id
    WHERE pr.game_id = ?
    ORDER BY pr.mu - 3 * pr.sigma DESC
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
      pr.mu,
      pr.sigma,
      pr.mu - 3 * pr.sigma as rating,
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
    ORDER BY rating DESC
  `);
  return stmt.all(gameId) as LeaderboardEntry[];
}

/**
 * Calculate weight based on score difference.
 * Close games (small diff) get lower weight, blowouts get higher weight.
 * Weight range: 0.5 (close game) to 2.0 (blowout)
 */
function calculateWeight(teams: CreateMatchInput['teams']): number {
  const scores = teams.map(t => t.score);

  if (scores.length < 2) return 1.0;

  const score1 = scores[0];
  const score2 = scores[1];
  const diff = Math.abs(score1 - score2);
  const total = score1 + score2;

  if (total === 0) return 1.0;

  // Normalized difference (0 to ~1 for decisive wins)
  const normalizedDiff = diff / total;

  // Map to weight range [0.5, 2.0]
  // A close game (normalizedDiff near 0) → weight 0.5
  // A blowout (normalizedDiff near 1) → weight 2.0
  // Weight formula: 0.5 + 1.5 * normalizedDiff
  const weight = 0.5 + 1.5 * normalizedDiff;

  return Math.min(2.0, Math.max(0.5, weight));
}

/**
 * Determine ranks from scores.
 * Lower rank = better performance.
 * Returns array of ranks for each team.
 */
function getRanksFromScores(teams: CreateMatchInput['teams']): number[] {
  const scores = teams.map(t => t.score);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);

  // If all scores are equal, it's a tie (all rank 1)
  if (maxScore === minScore) {
    return teams.map(() => 1);
  }

  // Winners get rank 1, losers get rank 2
  return teams.map(t => t.score === maxScore ? 1 : 2);
}

export function processMatch(input: CreateMatchInput): void {
  const { game_id, notes, teams } = input;

  // Get or create ratings for all players
  const ratingsByPlayer: Map<number, { mu: number; sigma: number }> = new Map();
  for (const team of teams) {
    for (const playerId of team.player_ids) {
      const rating = getOrCreatePlayerRating(playerId, game_id);
      ratingsByPlayer.set(playerId, { mu: rating.mu, sigma: rating.sigma });
    }
  }

  // Build teams for OpenSkill rate function
  const teamRatings = teams.map((team) =>
    team.player_ids.map((playerId) => {
      const r = ratingsByPlayer.get(playerId)!;
      return rating({ mu: r.mu, sigma: r.sigma });
    })
  );

  // Determine ranks from scores
  const ranks = getRanksFromScores(teams);

  // Calculate weight based on score difference
  const weight = calculateWeight(teams);

  // Rate the match
  const rawResults = rate(teamRatings, { rank: ranks });

  // Apply weight to rating changes
  const results = rawResults.map((team, teamIndex) =>
    team.map((playerResult, playerIndex) => {
      const originalRating = teamRatings[teamIndex][playerIndex];
      const muChange = playerResult.mu - originalRating.mu;
      const sigmaChange = playerResult.sigma - originalRating.sigma;

      // Weight affects mu change linearly
      const weightedMuChange = muChange * weight;
      // Weight affects sigma change by sqrt (since sigma is std dev)
      const weightedSigmaChange = sigmaChange * Math.sqrt(weight);

      return {
        mu: originalRating.mu + weightedMuChange,
        sigma: originalRating.sigma + weightedSigmaChange,
      };
    })
  );

  // Update ratings in database
  const updateStmt = db.prepare(`
    UPDATE player_ratings SET mu = ?, sigma = ? WHERE player_id = ? AND game_id = ?
  `);

  const insertMatch = db.prepare(`
    INSERT INTO matches (game_id, notes) VALUES (?, ?)
  `);

  const insertParticipant = db.prepare(`
    INSERT INTO match_participants (match_id, player_id, team, score) VALUES (?, ?, ?, ?)
  `);

  // Use transaction for atomicity
  const updateRatings = db.transaction(() => {
    // Create match record
    const matchResult = insertMatch.run(game_id, notes || null);
    const matchId = matchResult.lastInsertRowid as number;

    // Update each team's players
    for (let teamIndex = 0; teamIndex < teams.length; teamIndex++) {
      const team = teams[teamIndex];
      const teamResult = results[teamIndex];

      for (let playerIndex = 0; playerIndex < team.player_ids.length; playerIndex++) {
        const playerId = team.player_ids[playerIndex];
        const playerRating = teamResult[playerIndex];

        updateStmt.run(playerRating.mu, playerRating.sigma, playerId, game_id);
        insertParticipant.run(matchId, playerId, team.team, team.score);
      }
    }
  });

  updateRatings();
}