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

  // Rate the match
  const results = rate(teamRatings, { rank: ranks });

  // Update ratings in database
  const updateStmt = db.prepare(`
    UPDATE player_ratings SET mu = ?, sigma = ? WHERE player_id = ? AND game_id = ?
  `);

  const insertMatch = db.prepare(`
    INSERT INTO matches (game_id, notes) VALUES (?, ?)
  `);

  const insertParticipant = db.prepare(`
    INSERT INTO match_participants (match_id, player_id, team, won) VALUES (?, ?, ?, ?)
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
        insertParticipant.run(matchId, playerId, team.team, team.won ? 1 : 0);
      }
    }
  });

  updateRatings();
}