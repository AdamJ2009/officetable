import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { processMatch } from '@/lib/openskill';
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

    processMatch({ game_id, notes, teams });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error('Error creating match:', error);
    return NextResponse.json({ error: 'Failed to create match' }, { status: 500 });
  }
}