import db from './db';

export interface AchievementContext {
  matchId: number;
  gameId: number;
  playedAt: Date;
  teams: {
    team: number;
    player_ids: number[];
    score: number;
  }[];
  participants: {
    player_id: number;
    team: number;
    score: number;
    elo_before: number;
    elo_after: number;
  }[];
  playerNameMap: Map<number, string>;
}

export interface AchievementResult {
  achievementName: string;
  playerId: number;
  matchId: number;
  metadata?: object;
}

// Get rankings before a match (for boss_fight, the_best, the_worst)
function getRankingsBeforeMatch(gameId: number, matchId: number): Map<number, number> {
  // Get the match timestamp
  const match = db.prepare('SELECT played_at FROM matches WHERE id = ?').get(matchId) as { played_at: string } | undefined;
  if (!match) return new Map();

  // Get all player ratings at the time BEFORE this match
  // We use elo_after from the most recent match before this one for each player
  const rankings = new Map<number, number>();

  const playerRatings = db.prepare(`
    SELECT player_id, elo FROM player_ratings WHERE game_id = ?
  `).all(gameId) as { player_id: number; elo: number }[];

  // For each player, find their elo_before from this match or their current rating
  for (const pr of playerRatings) {
    const participant = db.prepare(`
      SELECT elo_before FROM match_participants
      WHERE player_id = ? AND match_id = ?
    `).get(pr.player_id, matchId) as { elo_before: number } | undefined;

    if (participant) {
      rankings.set(pr.player_id, participant.elo_before);
    }
  }

  return rankings;
}

// Get player's total games in a game type
function getTotalGames(playerId: number, gameId: number): number {
  const result = db.prepare(`
    SELECT COUNT(DISTINCT mp.match_id) as count
    FROM match_participants mp
    JOIN matches m ON mp.match_id = m.id
    WHERE mp.player_id = ? AND m.game_id = ?
  `).get(playerId, gameId) as { count: number };
  return result.count;
}

// Get player's lowest elo ever in a game type
function getLowestElo(playerId: number, gameId: number): number | null {
  const result = db.prepare(`
    SELECT MIN(elo_before) as lowest FROM (
      SELECT elo_before FROM match_participants mp
      JOIN matches m ON mp.match_id = m.id
      WHERE mp.player_id = ? AND m.game_id = ?
      UNION
      SELECT elo as elo_before FROM player_ratings WHERE player_id = ? AND game_id = ?
    )
  `).get(playerId, gameId, playerId, gameId) as { lowest: number | null } | null;
  return result?.lowest ?? null;
}

// Check if this is opponent's first game in this game type
function isFirstGameForOpponent(playerId: number, gameId: number, matchId: number): boolean {
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM match_participants mp
    JOIN matches m ON mp.match_id = m.id
    WHERE mp.player_id = ? AND m.game_id = ? AND m.id != ?
  `).get(playerId, gameId, matchId) as { count: number };
  return result.count === 0;
}

// Get ranking at a point in time
function getRankAtTime(gameId: number, playerIds: number[], eloMap: Map<number, number>, playerNameMap: Map<number, string>): Map<number, number> {
  // Sort players by elo descending, with name as tiebreaker for deterministic ordering
  const sorted = [...playerIds].sort((a, b) => {
    const eloA = eloMap.get(a) ?? 0;
    const eloB = eloMap.get(b) ?? 0;
    if (eloB !== eloA) return eloB - eloA;
    // Tiebreaker: alphabetically by name for deterministic ranking
    const nameA = playerNameMap.get(a) ?? '';
    const nameB = playerNameMap.get(b) ?? '';
    return nameA.localeCompare(nameB);
  });

  const rankings = new Map<number, number>();
  sorted.forEach((id, index) => {
    rankings.set(id, index + 1);
  });

  return rankings;
}

export function checkAchievements(context: AchievementContext): AchievementResult[] {
  const results: AchievementResult[] = [];
  const { matchId, gameId, playedAt, teams, participants, playerNameMap } = context;

  // Determine winners and losers
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

  // Build elo map for rankings
  const eloBeforeMap = new Map<number, number>();
  const eloAfterMap = new Map<number, number>();
  for (const p of participants) {
    eloBeforeMap.set(p.player_id, p.elo_before);
    eloAfterMap.set(p.player_id, p.elo_after);
  }

  // Get all player IDs in this game for ranking calculation
  const allPlayerRatings = db.prepare(`
    SELECT player_id, elo FROM player_ratings WHERE game_id = ?
  `).all(gameId) as { player_id: number; elo: number }[];

  const allPlayerIds = allPlayerRatings.map(r => r.player_id);

  // ===== INSTANT DETECTION =====

  // Fresh Blood: Claim points from a new player on their first game
  if (!isDraw) {
    for (const winnerId of winnerIds) {
      for (const loserId of loserIds) {
        if (isFirstGameForOpponent(loserId, gameId, matchId)) {
          results.push({
            achievementName: 'fresh_blood',
            playerId: winnerId,
            matchId,
            metadata: { new_player: playerNameMap.get(loserId) }
          });
        }
      }
    }
  }

  // Flawless Victory: Beat an opponent without conceding a point
  if (!isDraw && maxScore > 0) {
    const loserScore = teams.find(t => t.score < maxScore)?.score ?? 0;
    if (loserScore === 0) {
      for (const winnerId of winnerIds) {
        results.push({
          achievementName: 'flawless_victory',
          playerId: winnerId,
          matchId
        });
      }
    }
  }

  // Against the Odds / Against All Odds: Beat a player with higher Elo
  if (!isDraw) {
    for (const winnerId of winnerIds) {
      for (const loserId of loserIds) {
        const winnerElo = eloBeforeMap.get(winnerId) ?? 0;
        const loserElo = eloBeforeMap.get(loserId) ?? 0;
        const diff = loserElo - winnerElo;

        if (diff >= 100) {
          results.push({
            achievementName: 'against_all_odds',
            playerId: winnerId,
            matchId,
            metadata: { elo_difference: diff }
          });
        } else if (diff >= 50) {
          results.push({
            achievementName: 'against_the_odds',
            playerId: winnerId,
            matchId,
            metadata: { elo_difference: diff }
          });
        }
      }
    }
  }

  // Festive Cheer: Play on December 25th
  const month = playedAt.getMonth();
  const day = playedAt.getDate();
  if (month === 11 && day === 25) { // December is month 11 (0-indexed)
    for (const p of participants) {
      results.push({
        achievementName: 'festive_cheer',
        playerId: p.player_id,
        matchId
      });
    }
  }

  // Night Owl: Play between 00:00 and 03:00
  const hour = playedAt.getHours();
  if (hour >= 0 && hour < 3) {
    for (const p of participants) {
      results.push({
        achievementName: 'night_owl',
        playerId: p.player_id,
        matchId
      });
    }
  }

  // Boss Fight: Defeat the #1 ranked player
  // Also prepare rankings before match for The Best / The Worst
  const allEloBefore = new Map<number, number>();
  for (const r of allPlayerRatings) {
    allEloBefore.set(r.player_id, r.elo);
  }
  for (const p of participants) {
    allEloBefore.set(p.player_id, p.elo_before);
  }

  // Sort by elo descending (with player name tiebreaker) to get rankings before the match
  const allPlayerNamesBefore = new Map<number, string>();
  const allNamesStmt = db.prepare('SELECT id, name FROM players');
  for (const row of allNamesStmt.all() as { id: number; name: string }[]) {
    allPlayerNamesBefore.set(row.id, row.name);
  }
  const sortedBefore = [...allEloBefore.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    const nameA = allPlayerNamesBefore.get(a[0]) ?? '';
    const nameB = allPlayerNamesBefore.get(b[0]) ?? '';
    return nameA.localeCompare(nameB);
  });
  const numberOneBefore = sortedBefore[0]?.[0];
  const lastBefore = sortedBefore[sortedBefore.length - 1]?.[0];

  // Create rank map for before
  const rankBefore = new Map<number, number>();
  sortedBefore.forEach((entry, index) => {
    rankBefore.set(entry[0], index + 1);
  });

  if (!isDraw) {
    for (const winnerId of winnerIds) {
      for (const loserId of loserIds) {
        if (loserId === numberOneBefore && winnerId !== numberOneBefore) {
          results.push({
            achievementName: 'boss_fight',
            playerId: winnerId,
            matchId,
            metadata: { defeated_ranked: 1 }
          });
        }
      }
    }
  }

  // The Best / The Worst: Only if rank changes into #1 or last position
  if (!isDraw) {
    // Calculate rankings after match
    const allEloAfter = new Map<number, number>();
    for (const r of allPlayerRatings) {
      allEloAfter.set(r.player_id, r.elo);
    }
    // Update with participants' after-elo
    for (const p of participants) {
      allEloAfter.set(p.player_id, p.elo_after);
    }

    const sortedAfter = [...allEloAfter.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      const nameA = allPlayerNamesBefore.get(a[0]) ?? '';
      const nameB = allPlayerNamesBefore.get(b[0]) ?? '';
      return nameA.localeCompare(nameB);
    });
    const numberOneAfter = sortedAfter[0]?.[0];
    const lastAfter = sortedAfter[sortedAfter.length - 1]?.[0];

    // Create rank map for after
    const rankAfter = new Map<number, number>();
    sortedAfter.forEach((entry, index) => {
      rankAfter.set(entry[0], index + 1);
    });

    // The Best: Only if player is now #1 AND wasn't #1 before
    for (const winnerId of winnerIds) {
      if (winnerId === numberOneAfter && winnerId !== numberOneBefore) {
        results.push({
          achievementName: 'the_best',
          playerId: winnerId,
          matchId
        });
      }
    }

    // The Worst: Only if player is now last AND wasn't last before
    for (const loserId of loserIds) {
      if (loserId === lastAfter && loserId !== lastBefore) {
        results.push({
          achievementName: 'the_worst',
          playerId: loserId,
          matchId
        });
      }
    }
  }

  // ===== MILESTONE DETECTION =====

  // Game count milestones
  const milestones: [number, string][] = [
    [100, 'mostly_harmless'],
    [500, 'committed'],
    [1000, 'dangerous'],
    [2000, 'resident'],
    [10000, 'elite']
  ];

  for (const p of participants) {
    const totalGames = getTotalGames(p.player_id, gameId);
    for (const [threshold, name] of milestones) {
      if (totalGames === threshold) {
        results.push({
          achievementName: name,
          playerId: p.player_id,
          matchId,
          metadata: { total_games: threshold }
        });
      }
    }
  }

  // Improver: Gain 100 skill points from lowest point
  for (const p of participants) {
    const lowestElo = getLowestElo(p.player_id, gameId);
    if (lowestElo !== null) {
      const currentElo = p.elo_after;
      const previousBest = currentElo - 100 >= lowestElo;
      const justReached = currentElo >= lowestElo + 100 && p.elo_before < lowestElo + 100;
      if (justReached && !previousBest) {
        results.push({
          achievementName: 'improver',
          playerId: p.player_id,
          matchId,
          metadata: { from_lowest: currentElo - lowestElo }
        });
      }
    }
  }

  // ===== STREAK/HISTORICAL DETECTION =====

  // Unstable: See-saw 5+ skill points in consecutive games
  for (const p of participants) {
    // Must filter to matches up to and including current match for recalculation to work correctly
    const recentMatches = db.prepare(`
      SELECT mp.elo_before, mp.elo_after, m.played_at
      FROM match_participants mp
      JOIN matches m ON mp.match_id = m.id
      WHERE mp.player_id = ? AND m.game_id = ? AND m.played_at <= ?
      ORDER BY m.played_at DESC
      LIMIT 2
    `).all(p.player_id, gameId, playedAt.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')) as { elo_before: number; elo_after: number; played_at: string }[];

    if (recentMatches.length >= 2) {
      const change1 = recentMatches[0].elo_after - recentMatches[0].elo_before;
      const change2 = recentMatches[1].elo_after - recentMatches[1].elo_before;

      const absChange1 = Math.abs(change1);
      const absChange2 = Math.abs(change2);
      const oppositeDirections = (change1 > 0 && change2 < 0) || (change1 < 0 && change2 > 0);

      if (absChange1 >= 5 && absChange2 >= 5 && oppositeDirections) {
        results.push({
          achievementName: 'unstable',
          playerId: p.player_id,
          matchId,
          metadata: { change1, change2 }
        });
      }
    }
  }

  // The Dominator: Defeat a player in 10 consecutive games
  if (!isDraw) {
    for (const winnerId of winnerIds) {
      for (const loserId of loserIds) {
        // Check consecutive wins against this opponent
        const matches = db.prepare(`
          SELECT
            m.id as match_id,
            mp1.player_id as player1_id,
            mp1.score as player1_score,
            mp2.player_id as player2_id,
            mp2.score as player2_score
          FROM matches m
          JOIN match_participants mp1 ON m.id = mp1.match_id
          JOIN match_participants mp2 ON m.id = mp2.match_id
          WHERE m.game_id = ?
            AND mp1.player_id = ? AND mp2.player_id = ?
            AND mp1.team != mp2.team
          ORDER BY m.played_at DESC
          LIMIT 10
        `).all(gameId, winnerId, loserId) as {
          match_id: number;
          player1_id: number;
          player1_score: number;
          player2_id: number;
          player2_score: number;
        }[];

        if (matches.length >= 10) {
          const allWonByWinner = matches.every(m =>
            (m.player1_id === winnerId && m.player1_score > m.player2_score) ||
            (m.player2_id === winnerId && m.player2_score > m.player1_score)
          );

          if (allWonByWinner) {
            // Check if we already awarded this achievement for this streak
            const existingStreak = db.prepare(`
              SELECT COUNT(*) as count FROM player_achievements pa
              JOIN achievements a ON pa.achievement_id = a.id
              WHERE pa.player_id = ? AND pa.game_id = ? AND a.name = 'the_dominator'
                AND JSON_EXTRACT(pa.metadata, '$.victim') = ?
            `).get(winnerId, gameId, playerNameMap.get(loserId) ?? '') as { count: number };

            if (existingStreak.count === 0) {
              results.push({
                achievementName: 'the_dominator',
                playerId: winnerId,
                matchId,
                metadata: { victim: playerNameMap.get(loserId), streak: 10 }
              });
            }
          }
        }
      }
    }
  }

  // Nothing if not Consistent: Finish 5 consecutive games with the same score (full match result)
  for (const p of participants) {
    const recentMatches = db.prepare(`
      SELECT
        mp.score as player_score,
        (SELECT MAX(mp2.score) FROM match_participants mp2 WHERE mp2.match_id = mp.match_id AND mp2.team != mp.team) as opponent_score
      FROM match_participants mp
      JOIN matches m ON mp.match_id = m.id
      WHERE mp.player_id = ? AND m.game_id = ?
      ORDER BY m.played_at DESC
      LIMIT 5
    `).all(p.player_id, gameId) as { player_score: number; opponent_score: number }[];

    if (recentMatches.length === 5) {
      const firstMatch = recentMatches[0];
      const allSameResult = recentMatches.every(m =>
        m.player_score === firstMatch.player_score && m.opponent_score === firstMatch.opponent_score
      );
      if (allSameResult) {
        results.push({
          achievementName: 'nothing_if_not_consistent',
          playerId: p.player_id,
          matchId,
          metadata: { player_score: firstMatch.player_score, opponent_score: firstMatch.opponent_score }
        });
      }
    }
  }

  // Comrades: Play 100 games against the same opponent
  for (const team of teams) {
    for (const otherTeam of teams) {
      if (team.team === otherTeam.team) continue;

      for (const playerId of team.player_ids) {
        for (const opponentId of otherTeam.player_ids) {
          // Check if we already awarded this achievement for this opponent pair
          const existingAchievement = db.prepare(`
            SELECT COUNT(*) as count FROM player_achievements pa
            JOIN achievements a ON pa.achievement_id = a.id
            WHERE pa.player_id = ? AND pa.game_id = ? AND a.name = 'comrades'
              AND JSON_EXTRACT(pa.metadata, '$.opponent') = ?
          `).get(playerId, gameId, playerNameMap.get(opponentId) ?? '') as { count: number };

          if (existingAchievement.count > 0) continue;

          const gamesAgainst = db.prepare(`
            SELECT COUNT(DISTINCT m.id) as count
            FROM matches m
            JOIN match_participants mp1 ON m.id = mp1.match_id
            JOIN match_participants mp2 ON m.id = mp2.match_id
            WHERE m.game_id = ?
              AND mp1.player_id = ? AND mp2.player_id = ?
              AND mp1.team != mp2.team
          `).get(gameId, playerId, opponentId) as { count: number };

          if (gamesAgainst.count >= 100) {
            results.push({
              achievementName: 'comrades',
              playerId: playerId,
              matchId,
              metadata: { opponent: playerNameMap.get(opponentId) }
            });
          }
        }
      }
    }
  }

  // Dedication: Play at least once every 60 days for a year
  for (const p of participants) {
    const matchDates = db.prepare(`
      SELECT DISTINCT DATE(m.played_at) as play_date
      FROM match_participants mp
      JOIN matches m ON mp.match_id = m.id
      WHERE mp.player_id = ? AND m.game_id = ?
      ORDER BY play_date ASC
    `).all(p.player_id, gameId) as { play_date: string }[];

    if (matchDates.length > 0) {
      const dates = matchDates.map(d => new Date(d.play_date));

      // Check if span is at least 365 days
      const firstDate = dates[0];
      const lastDate = dates[dates.length - 1];
      const spanDays = Math.floor((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));

      if (spanDays >= 365) {
        // Check max gap between consecutive play dates
        let maxGap = 0;
        for (let i = 1; i < dates.length; i++) {
          const gap = Math.floor((dates[i].getTime() - dates[i-1].getTime()) / (1000 * 60 * 60 * 24));
          maxGap = Math.max(maxGap, gap);
        }

        if (maxGap <= 60) {
          // Check if we already awarded this
          const existing = db.prepare(`
            SELECT COUNT(*) as count FROM player_achievements pa
            JOIN achievements a ON pa.achievement_id = a.id
            WHERE pa.player_id = ? AND pa.game_id = ? AND a.name = 'dedication'
          `).get(p.player_id, gameId) as { count: number };

          if (existing.count === 0) {
            results.push({
              achievementName: 'dedication',
              playerId: p.player_id,
              matchId,
              metadata: { span_days: spanDays, max_gap: maxGap }
            });
          }
        }
      }
    }
  }

  // Early Bird: Play and win the first game of the day
  const matchDate = playedAt.toISOString().split('T')[0];
  const firstGameOfDay = db.prepare(`
    SELECT m.id FROM matches m
    WHERE m.game_id = ? AND DATE(m.played_at) = ?
    ORDER BY m.played_at ASC
    LIMIT 1
  `).get(gameId, matchDate) as { id: number } | undefined;

  if (firstGameOfDay?.id === matchId && !isDraw) {
    for (const winnerId of winnerIds) {
      results.push({
        achievementName: 'early_bird',
        playerId: winnerId,
        matchId,
        metadata: { date: matchDate }
      });
    }
  }

  return results;
}

export function saveAchievements(results: AchievementResult[], gameId: number): void {
  const insertStmt = db.prepare(`
    INSERT INTO player_achievements (player_id, game_id, achievement_id, match_id, metadata)
    VALUES (?, ?, (SELECT id FROM achievements WHERE name = ?), ?, ?)
  `);

  for (const result of results) {
    insertStmt.run(
      result.playerId,
      gameId,
      result.achievementName,
      result.matchId,
      result.metadata ? JSON.stringify(result.metadata) : null
    );
  }
}

export function deleteAchievementsForMatch(matchId: number): void {
  db.prepare('DELETE FROM player_achievements WHERE match_id = ?').run(matchId);
}

export function deleteAchievementsForMatches(matchIds: number[]): void {
  if (matchIds.length === 0) return;
  const placeholders = matchIds.map(() => '?').join(',');
  db.prepare(`DELETE FROM player_achievements WHERE match_id IN (${placeholders})`).run(...matchIds);
}

export function getAchievementsForPlayer(playerId: number, gameId?: number): { achievement_id: number; achievement_name: string; achievement_description: string; achievement_category: string; count: number; first_earned_at: string }[] {
  let query = `
    SELECT
      a.id as achievement_id,
      a.name as achievement_name,
      a.description as achievement_description,
      a.category as achievement_category,
      COUNT(*) as count,
      MIN(pa.earned_at) as first_earned_at
    FROM player_achievements pa
    JOIN achievements a ON pa.achievement_id = a.id
    WHERE pa.player_id = ?
  `;
  const params: (number | number[])[] = [playerId];

  if (gameId) {
    query += ' AND pa.game_id = ?';
    params.push(gameId);
  }

  query += ' GROUP BY a.id ORDER BY a.category, a.name';

  const stmt = db.prepare(query);
  return stmt.all(...params) as { achievement_id: number; achievement_name: string; achievement_description: string; achievement_category: string; count: number; first_earned_at: string }[];
}

export function getAchievementsForMatch(matchId: number): { achievement_name: string; achievement_description: string; achievement_icon: string | null; player_id: number; player_name: string }[] {
  const stmt = db.prepare(`
    SELECT
      a.name as achievement_name,
      a.description as achievement_description,
      a.icon as achievement_icon,
      pa.player_id,
      p.name as player_name
    FROM player_achievements pa
    JOIN achievements a ON pa.achievement_id = a.id
    JOIN players p ON pa.player_id = p.id
    WHERE pa.match_id = ?
    ORDER BY a.name, p.name
  `);
  return stmt.all(matchId) as { achievement_name: string; achievement_description: string; achievement_icon: string | null; player_id: number; player_name: string }[];
}

/**
 * Recalculate all achievements for a game.
 * This deletes all existing achievements for the game and replays them from match history.
 * Returns the number of achievements awarded.
 */
export function recalculateAchievementsForGame(gameId: number): { matchesProcessed: number; achievementsAwarded: number } {
  // Delete all existing achievements for this game
  db.prepare('DELETE FROM player_achievements WHERE game_id = ?').run(gameId);

  // Get all matches for this game in chronological order
  const matches = db.prepare(`
    SELECT m.id, m.played_at, m.notes
    FROM matches m
    WHERE m.game_id = ?
    ORDER BY m.played_at ASC
  `).all(gameId) as { id: number; played_at: string; notes: string | null }[];

  // Get player name map
  const players = db.prepare('SELECT id, name FROM players').all() as { id: number; name: string }[];
  const playerNameMap = new Map(players.map(p => [p.id, p.name]));

  let achievementsAwarded = 0;

  for (const match of matches) {
    // Get participants for this match
    const participants = db.prepare(`
      SELECT player_id, team, score, elo_before, elo_after
      FROM match_participants
      WHERE match_id = ?
    `).all(match.id) as { player_id: number; team: number; score: number; elo_before: number; elo_after: number }[];

    // Group participants into teams
    const teamMap = new Map<number, { player_ids: number[]; score: number }>();
    for (const p of participants) {
      if (!teamMap.has(p.team)) {
        teamMap.set(p.team, { player_ids: [], score: p.score });
      }
      teamMap.get(p.team)!.player_ids.push(p.player_id);
    }

    const teams = Array.from(teamMap.values()).map((t, idx) => ({
      team: idx,
      player_ids: t.player_ids,
      score: t.score
    }));

    const playedAt = new Date(match.played_at.replace(' ', 'T'));

    // Check achievements
    const achievementResults = checkAchievements({
      matchId: match.id,
      gameId,
      playedAt,
      teams,
      participants,
      playerNameMap
    });

    if (achievementResults.length > 0) {
      saveAchievements(achievementResults, gameId);
      achievementsAwarded += achievementResults.length;
    }
  }

  return { matchesProcessed: matches.length, achievementsAwarded };
}

/**
 * Recalculate achievements for all games.
 * Returns summary of achievements awarded per game.
 */
export function recalculateAllAchievements(): { game_name: string; matches_processed: number; achievements_awarded: number }[] {
  const games = db.prepare('SELECT id, name FROM games').all() as { id: number; name: string }[];

  const results = [];
  for (const game of games) {
    const result = recalculateAchievementsForGame(game.id);
    results.push({
      game_name: game.name,
      matches_processed: result.matchesProcessed,
      achievements_awarded: result.achievementsAwarded
    });
  }

  return results;
}