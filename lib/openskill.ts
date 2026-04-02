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
      COALESCE(losses.count, 0) as losses
    FROM player_ratings pr
    JOIN players p ON pr.player_id = p.id
    LEFT JOIN (
      SELECT player_id, COUNT(*) as count
      FROM match_participants
      WHERE won = 1
      GROUP BY player_id
    ) wins ON wins.player_id = pr.player_id
    LEFT JOIN (
      SELECT player_id, COUNT(*) as count
      FROM match_participants
      WHERE won = 0
      GROUP BY player_id
    ) losses ON losses.player_id = pr.player_id
    WHERE pr.game_id = ?
    ORDER BY rating DESC
  `);
  return stmt.all(gameId) as LeaderboardEntry[];
}

/**
 * Calculate weight based on score difference.
 * Close games (small diff) get lower weight, blowouts get higher weight.
 * Weight range: 0.5 (close game) to 2.0 (blowout)
 * If no scores provided, weight defaults to 1.0
 */
function calculateWeight(teams: CreateMatchInput['teams']): number {
  const scores = teams.map(t => t.score);

  // If any team lacks a score, use default weight
  if (scores.some(s => s === undefined || s === null)) {
    return 1.0;
  }

  const validScores = scores as number[];
  if (validScores.length < 2) return 1.0;

  const score1 = validScores[0];
  const score2 = validScores[1];
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
  // Teams are ordered by their team number, and we pass ranks (lower = better)
  const teamRatings = teams.map((team) =>
    team.player_ids.map((playerId) => {
      const r = ratingsByPlayer.get(playerId)!;
      return rating({ mu: r.mu, sigma: r.sigma });
    })
  );

  // Determine ranks: winning team gets rank 1, losing team gets rank 2
  const ranks = teams.map((team) => (team.won ? 1 : 2));

  // Calculate weight based on score difference
  const weightValue = calculateWeight(teams);
  // Weight must be a 2D array: one array per team, with one weight per player
  const weight = teamRatings.map((team) => team.map(() => weightValue));

  // Rate the match with weight
  const results = rate(teamRatings, { rank: ranks, weight });

  // Update ratings in database
  const updateStmt = db.prepare(`
    UPDATE player_ratings SET mu = ?, sigma = ? WHERE player_id = ? AND game_id = ?
  `);

  const insertMatch = db.prepare(`
    INSERT INTO matches (game_id, notes) VALUES (?, ?)
  `);

  const insertParticipant = db.prepare(`
    INSERT INTO match_participants (match_id, player_id, team, won, score) VALUES (?, ?, ?, ?, ?)
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
        insertParticipant.run(matchId, playerId, team.team, team.won ? 1 : 0, team.score ?? null);
      }
    }
  });

  updateRatings();
}