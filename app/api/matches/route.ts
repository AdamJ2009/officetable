import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import db from '@/lib/db';
import { processMatch } from '@/lib/elo';
import { sendGoogleChatNotification, buildMatchNotification } from '@/lib/notifications';
import { getAchievementsForMatch } from '@/lib/achievements';
import { getPunditryForMatch } from '@/lib/punditry';
import { resolveScopeSeasonId, getCurrentSeason } from '@/lib/seasons';
import type { MatchWithParticipants, CreateMatchInput, MatchFilters, PaginationMeta } from '@/lib/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Parse pagination params
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
  const offset = (page - 1) * limit;

  // Parse filter params
  const gameId = searchParams.get('game_id');
  const dateFrom = searchParams.get('date_from');
  const dateTo = searchParams.get('date_to');
  const playerIdsStr = searchParams.get('player_ids');
  const playerCount = searchParams.get('player_count');
  const hasAchievements = searchParams.get('has_achievements');
  const minSkillChange = searchParams.get('min_skill_change');
  // Season scoping: scope=season (default, current season) | alltime;
  // optional season_id selects a specific (past) season.
  const targetSeasonId = resolveScopeSeasonId(searchParams.get('scope'), searchParams.get('season_id'));

  // Parse player_ids (comma-separated)
  const playerIds = playerIdsStr
    ? playerIdsStr.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id))
    : [];

  // Build WHERE conditions and params
  const whereConditions: string[] = [];
  const params: (string | number)[] = [];

  if (gameId) {
    whereConditions.push('m.game_id = ?');
    params.push(parseInt(gameId, 10));
  }

  // Season scope: all-time shows everything (each match exists once);
  // season views filter to the target ledger's matches.
  if (targetSeasonId !== 0) {
    whereConditions.push('m.season_id = ?');
    params.push(targetSeasonId);
  }

  if (dateFrom) {
    whereConditions.push('DATE(m.played_at) >= ?');
    params.push(dateFrom);
  }

  if (dateTo) {
    whereConditions.push('DATE(m.played_at) <= ?');
    params.push(dateTo);
  }

  // Player filter: AND logic - match must contain ALL selected players
  if (playerIds.length > 0) {
    for (const playerId of playerIds) {
      whereConditions.push('EXISTS (SELECT 1 FROM match_participants mp WHERE mp.match_id = m.id AND mp.player_id = ?)');
      params.push(playerId);
    }
  }

  // Player count filter
  if (playerCount) {
    const count = parseInt(playerCount, 10);
    whereConditions.push('(SELECT COUNT(DISTINCT player_id) FROM match_participants WHERE match_id = m.id) = ?');
    params.push(count);
  }

  // Achievements filter
  if (hasAchievements === 'true') {
    whereConditions.push('EXISTS (SELECT 1 FROM player_achievements pa WHERE pa.match_id = m.id)');
  }

  // Min skill change filter
  if (minSkillChange) {
    const minChange = parseFloat(minSkillChange);
    whereConditions.push('EXISTS (SELECT 1 FROM match_participants mp WHERE mp.match_id = m.id AND ABS(mp.elo_after - mp.elo_before) >= ?)');
    params.push(minChange);
  }

  const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

  // Count query for pagination
  const countQuery = `
    SELECT COUNT(DISTINCT m.id) as total
    FROM matches m
    JOIN games g ON m.game_id = g.id
    ${whereClause}
  `;
  const countStmt = db.prepare(countQuery);
  const countResult = countStmt.get(...params) as { total: number };
  const total = countResult.total;
  const totalPages = Math.ceil(total / limit);

  // Main query with pagination
  const matchesQuery = `
    SELECT m.*, g.name as game_name
    FROM matches m
    JOIN games g ON m.game_id = g.id
    ${whereClause}
    ORDER BY m.played_at DESC
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  const stmt = db.prepare(matchesQuery);
  const matches = stmt.all(...params);

  // Get participants for each match
  const participantsStmt = db.prepare(`
    SELECT mp.*, p.name as player_name, p.avatar_url
    FROM match_participants mp
    JOIN players p ON mp.player_id = p.id
    WHERE mp.match_id = ?
  `);

  // Get achievements for each match
  const achievementsStmt = db.prepare(`
    SELECT
      pa.achievement_id,
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

  const matchesWithParticipants: MatchWithParticipants[] = matches.map((match: any) => {
    const participants = participantsStmt.all(match.id);
    const achievements = achievementsStmt.all(match.id);
    const punditry = getPunditryForMatch(match.id);
    return {
      ...match,
      participants: participants.map((p: any) => ({
        ...p,
        player_name: p.player_name,
      })),
      game_name: match.game_name,
      achievements: achievements.map((a: any) => ({
        achievement_id: a.achievement_id,
        achievement_name: a.achievement_name,
        achievement_description: a.achievement_description,
        achievement_icon: a.achievement_icon,
        player_id: a.player_id,
        player_name: a.player_name
      })),
      punditry
    };
  });

  const pagination: PaginationMeta = {
    page,
    limit,
    total,
    totalPages,
  };

  return NextResponse.json({ matches: matchesWithParticipants, pagination });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { game_id, notes, teams } = body as CreateMatchInput;

    if (!game_id || !teams || teams.length < 2) {
      return NextResponse.json(
        { error: 'game_id and at least 2 teams are required' },
        { status: 400 }
      );
    }

    // Validate all teams have scores
    for (const team of teams) {
      if (typeof team.score !== 'number' || team.score < 0) {
        return NextResponse.json(
          { error: 'All teams must have a valid score (non-negative number)' },
          { status: 400 }
        );
      }
    }

    // Get game name for notification
    const gameStmt = db.prepare('SELECT name, image_url FROM games WHERE id = ?');
    const game = gameStmt.get(game_id) as { name: string; image_url?: string | null } | undefined;

    // Get player names for notification
    const playerIds = teams.flatMap(t => t.player_ids);
    const placeholders = playerIds.map(() => '?').join(',');
    const playersStmt = db.prepare(`SELECT id, name, avatar_url FROM players WHERE id IN (${placeholders})`);
    const players = playersStmt.all(...playerIds) as { id: number; name: string; avatar_url: string | null }[];
    const playerNameMap = new Map(players.map(p => [p.id, p.name]));

    // Build avatar URLs for players that have one (used in Google Chat notifications).
    // Avatar URLs are external links, so they're embeddable by Chat regardless of
    // where the app itself is hosted.
    const playerAvatarMap = new Map<number, string>();
    for (const p of players) {
      if (p.avatar_url) {
        playerAvatarMap.set(p.id, p.avatar_url);
      }
    }

    // Rank shifts are calculated against the same table shown on the
    // leaderboard: retired players AND inactive players (no match within
    // inactive_threshold_days) are hidden, so they must not affect ranks.
    const thresholdSetting = db.prepare(`SELECT value FROM settings WHERE key = 'inactive_threshold_days'`).get() as { value: string } | undefined;
    const inactiveThresholdDays = thresholdSetting ? parseInt(thresholdSetting.value, 10) : 60;
    const inactiveCutoffMs = Date.now() - inactiveThresholdDays * 24 * 60 * 60 * 1000;

    // Last match date per player in this game (before this match is recorded)
    const lastMatchRows = db.prepare(`
      SELECT mp.player_id, MAX(m.played_at) as last_match_at
      FROM match_participants mp
      JOIN matches m ON mp.match_id = m.id
      WHERE m.game_id = ?
      GROUP BY mp.player_id
    `).all(game_id) as { player_id: number; last_match_at: string }[];
    const playerLastMatch = new Map<number, string>();
    for (const row of lastMatchRows) {
      playerLastMatch.set(row.player_id, row.last_match_at);
    }

    // A player is ranked if they're not retired and have played recently enough
    const isRanked = (playerId: number) => {
      const lastMatchAt = playerLastMatch.get(playerId);
      return lastMatchAt !== undefined && new Date(lastMatchAt.replace(' ', 'T')).getTime() >= inactiveCutoffMs;
    };

    const fetchRankings = () => {
      // Rank-shift calc runs on the SEASON ledger (the live competition).
      const currentSeasonId = getCurrentSeason()?.id ?? 0;
      return (db.prepare(`
        SELECT pr.player_id, pr.elo
        FROM player_ratings pr
        JOIN players p ON pr.player_id = p.id
        WHERE pr.game_id = ? AND pr.season_id = ? AND (p.status IS NULL OR p.status != 'retired')
        ORDER BY pr.elo DESC, p.name ASC
      `).all(game_id, currentSeasonId) as { player_id: number; elo: number }[])
        .filter(row => isRanked(row.player_id));
    };

    const toRankMap = (rankings: { player_id: number }[]) => {
      const map = new Map<number, number>();
      rankings.forEach((row, index) => map.set(row.player_id, index + 1));
      return map;
    };

    const rankBefore = toRankMap(fetchRankings());

    // Process match and get skill changes
    const result = processMatch({ game_id, notes, teams });

    // Get rankings AFTER the match
    const rankAfter = toRankMap(fetchRankings());

    // Calculate rank changes (positive = moved up, negative = moved down).
    // Players who were unranked before the match (e.g. inactive players
    // returning after a long break) aren't shown a rank shift.
    const rankChanges = new Map<number, number>();
    for (const playerId of playerIds) {
      const before = rankBefore.get(playerId);
      const after = rankAfter.get(playerId);
      if (before === undefined || after === undefined) continue;
      // Rank change: positive means moved UP in ranking (lower number is better)
      rankChanges.set(playerId, before - after);
    }

    // Get achievements earned in this match
    const matchAchievements = getAchievementsForMatch(result.matchId);

    // Get punditry facts for this match
    const punditryFacts = getPunditryForMatch(result.matchId);

    // Send notification (async, don't wait for it)
    if (game) {
      const notification = buildMatchNotification(
        game.name,
        result.matchId,
        teams,
        playerNameMap,
        result.skillChanges,
        game.image_url,
        notes,
        rankChanges,
        matchAchievements.map(a => ({
          playerId: a.player_id,
          achievementName: a.achievement_name,
          achievementIcon: a.achievement_icon
        })),
        punditryFacts.map(p => ({ description: p.description })),
        playerAvatarMap
      );
      sendGoogleChatNotification(notification).catch(err => {
        console.error('Failed to send notification:', err);
      });
    }

    // Revalidate the home page to show new data
    revalidatePath('/', 'layout');

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error('Error creating match:', error);
    return NextResponse.json({ error: 'Failed to create match' }, { status: 500 });
  }
}