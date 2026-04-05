import { rating, rate, ordinal } from 'openskill';
import db from './db';
import type { PlayerRating, LeaderboardEntry, CreateMatchInput } from './types';

// Constants for sigma management
const MIN_SIGMA = 1.0; // Minimum sigma floor - never go below this
const INITIAL_SIGMA = 8.333; // Default starting sigma
const SIGMA_DECAY_PER_DAY = 0.01; // How much sigma increases per day of inactivity
const MAX_SIGMA_INCREASE = 5.0; // Maximum sigma increase from inactivity

export function createPlayerRating(playerId: number, gameId: number): PlayerRating {
  const stmt = db.prepare(`
    INSERT INTO player_ratings (player_id, game_id, mu, sigma)
    VALUES (?, ?, 25, ?)
  `);
  const result = stmt.run(playerId, gameId, INITIAL_SIGMA);
  return {
    id: result.lastInsertRowid as number,
    player_id: playerId,
    game_id: gameId,
    mu: 25,
    sigma: INITIAL_SIGMA,
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

/**
 * Get the date of the last match a player played in a specific game
 */
function getLastMatchDate(playerId: number, gameId: number): Date | null {
  const stmt = db.prepare(`
    SELECT MAX(m.played_at) as last_match
    FROM matches m
    JOIN match_participants mp ON m.id = mp.match_id
    WHERE mp.player_id = ? AND m.game_id = ?
  `);
  const result = stmt.get(playerId, gameId) as { last_match: string | null };
  return result.last_match ? new Date(result.last_match) : null;
}

/**
 * Calculate sigma increase based on days since last match.
 * More days = higher uncertainty.
 */
function calculateSigmaDecay(currentSigma: number, daysSinceLastMatch: number): number {
  if (daysSinceLastMatch <= 0) return currentSigma;

  // Calculate decay increase
  const decayIncrease = Math.min(daysSinceLastMatch * SIGMA_DECAY_PER_DAY, MAX_SIGMA_INCREASE);
  const newSigma = currentSigma + decayIncrease;

  // Cap at initial sigma (don't exceed starting uncertainty from decay alone)
  return Math.min(newSigma, INITIAL_SIGMA);
}

/**
 * Apply sigma floor - sigma should never go below MIN_SIGMA
 */
function applySigmaFloor(sigma: number): number {
  return Math.max(sigma, MIN_SIGMA);
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
 * For foosball (first to 10), goal differential matters significantly.
 * Weight range: 1.5 (close 1-goal game) to 4.0 (blowout)
 */
function calculateWeight(teams: CreateMatchInput['teams']): number {
  const scores = teams.map(t => t.score);

  if (scores.length < 2) return 1.5;

  const score1 = scores[0];
  const score2 = scores[1];
  const diff = Math.abs(score1 - score2);

  // Base weight 1.5 ensures even close games move ratings significantly
  // +0.25 per goal differential rewards decisive wins
  // 1-goal: 1.75 | 3-goal: 2.25 | 5-goal: 2.75 | 10-goal: 4.0
  const weight = 1.5 + (diff * 0.25);

  return Math.min(4.0, Math.max(1.5, weight));
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

export function processMatch(input: CreateMatchInput, matchTimestamp?: Date): void {
  const { game_id, notes, teams } = input;
  const matchDate = matchTimestamp || new Date();

  // Get or create ratings for all players, applying sigma decay for inactive players
  const ratingsByPlayer: Map<number, { mu: number; sigma: number }> = new Map();

  for (const team of teams) {
    for (const playerId of team.player_ids) {
      const rating = getOrCreatePlayerRating(playerId, game_id);

      // Calculate sigma decay based on days since last match
      const lastMatchDate = getLastMatchDate(playerId, game_id);
      let adjustedSigma = rating.sigma;

      if (lastMatchDate) {
        const daysSinceLastMatch = Math.floor((matchDate.getTime() - lastMatchDate.getTime()) / (1000 * 60 * 60 * 24));
        adjustedSigma = calculateSigmaDecay(rating.sigma, daysSinceLastMatch);
      }

      ratingsByPlayer.set(playerId, { mu: rating.mu, sigma: adjustedSigma });
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

  // Rate the match with lower beta for more volatility
  // Default beta is 25/3 ≈ 8.333, we use 3.0 for bigger swings
  const rawResults = rate(teamRatings, { rank: ranks, beta: 3.0 });

  // Apply weight to rating changes and enforce sigma floor
  const results = rawResults.map((team, teamIndex) =>
    team.map((playerResult, playerIndex) => {
      const originalRating = teamRatings[teamIndex][playerIndex];
      const muChange = playerResult.mu - originalRating.mu;
      const sigmaChange = playerResult.sigma - originalRating.sigma;

      // Weight affects mu change linearly
      const weightedMuChange = muChange * weight;
      // Weight affects sigma change by sqrt (since sigma is std dev)
      const weightedSigmaChange = sigmaChange * Math.sqrt(weight);

      // Calculate new sigma and apply floor
      let newSigma = originalRating.sigma + weightedSigmaChange;
      newSigma = applySigmaFloor(newSigma);

      return {
        mu: originalRating.mu + weightedMuChange,
        sigma: newSigma,
      };
    })
  );

  // Update ratings in database
  const updateStmt = db.prepare(`
    UPDATE player_ratings SET mu = ?, sigma = ? WHERE player_id = ? AND game_id = ?
  `);

  const insertMatch = db.prepare(`
    INSERT INTO matches (game_id, notes, played_at) VALUES (?, ?, ?)
  `);

  const insertParticipant = db.prepare(`
    INSERT INTO match_participants (match_id, player_id, team, score, mu_before, mu_after, sigma_before, sigma_after)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
      const teamResult = results[teamIndex];

      for (let playerIndex = 0; playerIndex < team.player_ids.length; playerIndex++) {
        const playerId = team.player_ids[playerIndex];
        const originalRating = teamRatings[teamIndex][playerIndex];
        const playerRating = teamResult[playerIndex];

        updateStmt.run(playerRating.mu, playerRating.sigma, playerId, game_id);
        insertParticipant.run(
          matchId,
          playerId,
          team.team,
          team.score,
          originalRating.mu,
          playerRating.mu,
          originalRating.sigma,
          playerRating.sigma
        );
      }
    }
  });

  updateRatings();
}