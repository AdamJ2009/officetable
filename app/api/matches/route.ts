import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { processMatch } from '@/lib/elo';
import { sendGoogleChatNotification, buildMatchNotification } from '@/lib/notifications';
import { getAchievementsForMatch } from '@/lib/achievements';
import type { MatchWithParticipants, CreateMatchInput } from '@/lib/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get('game_id');

  let matchesQuery = `
    SELECT m.*, g.name as game_name
    FROM matches m
    JOIN games g ON m.game_id = g.id
  `;

  if (gameId) {
    matchesQuery += ' WHERE m.game_id = ?';
  }

  matchesQuery += ' ORDER BY m.played_at DESC LIMIT 50';

  const stmt = db.prepare(matchesQuery);
  const matches = gameId ? stmt.all(parseInt(gameId)) : stmt.all();

  // Get participants for each match
  const participantsStmt = db.prepare(`
    SELECT mp.*, p.name as player_name
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
      }))
    };
  });

  return NextResponse.json(matchesWithParticipants);
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
    const playersStmt = db.prepare(`SELECT id, name FROM players WHERE id IN (${placeholders})`);
    const players = playersStmt.all(...playerIds) as { id: number; name: string }[];
    const playerNameMap = new Map(players.map(p => [p.id, p.name]));

    // Get rankings BEFORE the match to calculate rank changes
    const rankingsBefore = db.prepare(`
      SELECT player_id, elo FROM player_ratings WHERE game_id = ? ORDER BY elo DESC
    `).all(game_id) as { player_id: number; elo: number }[];

    const rankBefore = new Map<number, number>();
    rankingsBefore.forEach((row, index) => {
      rankBefore.set(row.player_id, index + 1);
    });

    // Process match and get skill changes
    const result = processMatch({ game_id, notes, teams });

    // Get rankings AFTER the match
    const rankingsAfter = db.prepare(`
      SELECT player_id, elo FROM player_ratings WHERE game_id = ? ORDER BY elo DESC
    `).all(game_id) as { player_id: number; elo: number }[];

    const rankAfter = new Map<number, number>();
    rankingsAfter.forEach((row, index) => {
      rankAfter.set(row.player_id, index + 1);
    });

    // Calculate rank changes (positive = moved up, negative = moved down)
    const rankChanges = new Map<number, number>();
    for (const playerId of playerIds) {
      const before = rankBefore.get(playerId) ?? rankingsBefore.length + 1;
      const after = rankAfter.get(playerId) ?? rankingsAfter.length + 1;
      // Rank change: positive means moved UP in ranking (lower number is better)
      rankChanges.set(playerId, before - after);
    }

    // Get achievements earned in this match
    const matchAchievements = getAchievementsForMatch(result.matchId);

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
        }))
      );
      sendGoogleChatNotification(notification).catch(err => {
        console.error('Failed to send notification:', err);
      });
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error('Error creating match:', error);
    return NextResponse.json({ error: 'Failed to create match' }, { status: 500 });
  }
}