import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { processMatch } from '@/lib/elo';
import { sendGoogleChatNotification, buildMatchNotification } from '@/lib/notifications';
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

  const matchesWithParticipants: MatchWithParticipants[] = matches.map((match: any) => {
    const participants = participantsStmt.all(match.id);
    return {
      ...match,
      participants: participants.map((p: any) => ({
        ...p,
        player_name: p.player_name,
      })),
      game_name: match.game_name,
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
    const gameStmt = db.prepare('SELECT name FROM games WHERE id = ?');
    const game = gameStmt.get(game_id) as { name: string } | undefined;

    // Get player names for notification
    const playerIds = teams.flatMap(t => t.player_ids);
    const placeholders = playerIds.map(() => '?').join(',');
    const playersStmt = db.prepare(`SELECT id, name FROM players WHERE id IN (${placeholders})`);
    const players = playersStmt.all(...playerIds) as { id: number; name: string }[];
    const playerNameMap = new Map(players.map(p => [p.id, p.name]));

    processMatch({ game_id, notes, teams });

    // Send notification (async, don't wait for it)
    if (game) {
      const notification = buildMatchNotification(game.name, teams, playerNameMap);
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