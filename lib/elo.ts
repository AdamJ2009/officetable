import db from './db';
import type { PlayerRating, LeaderboardEntry, CreateMatchInput } from './types';

// Classic Elo constants
const DEFAULT_ELO = 0;
const K_FACTOR = 32;

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
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Calculate average Elo for a team.
 */
function averageTeamElo(ratings: number[]): number {
  if (ratings.length === 0) return DEFAULT_ELO;
  return ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
}

/**
 * Determine match result from scores.
 * Returns array of results: 1 for win, 0.5 for draw, 0 for loss for each team.
 */
function getResultsFromScores(teams: CreateMatchInput['teams']): number[] {
  const scores = teams.map(t => t.score);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);

  // All scores equal = draw
  if (maxScore === minScore) {
    return teams.map(() => 0.5);
  }

  // Winners get 1, losers get 0
  return teams.map(t => t.score === maxScore ? 1 : 0);
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

  // Get results (1 for win, 0.5 for draw, 0 for loss)
  const results = getResultsFromScores(teams);

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
        const newElo = Math.round(oldElo + change);

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
