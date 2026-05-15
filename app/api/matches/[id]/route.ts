import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { correctMatch, deleteMatchAndReplay, isWithinEditWindow } from '@/lib/elo';
import { getPunditryForMatch } from '@/lib/punditry';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const matchId = parseInt(id, 10);

  if (isNaN(matchId)) {
    return NextResponse.json({ error: 'Invalid match ID' }, { status: 400 });
  }

  const matchStmt = db.prepare(`
    SELECT m.*, g.name as game_name
    FROM matches m
    JOIN games g ON m.game_id = g.id
    WHERE m.id = ?
  `);
  const match = matchStmt.get(matchId);

  if (!match) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 });
  }

  const participantsStmt = db.prepare(`
    SELECT mp.*, p.name as player_name
    FROM match_participants mp
    JOIN players p ON mp.player_id = p.id
    WHERE mp.match_id = ?
  `);
  const participants = participantsStmt.all(matchId);

  const achievementsStmt = db.prepare(`
    SELECT
      a.id as achievement_id,
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
  const achievements = achievementsStmt.all(matchId);

  const punditry = getPunditryForMatch(matchId);

  return NextResponse.json({
    ...match,
    participants,
    achievements,
    punditry,
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const matchId = parseInt(id, 10);

    if (isNaN(matchId)) {
      return NextResponse.json({ error: 'Invalid match ID' }, { status: 400 });
    }

    // Get the match to check edit window
    const matchStmt = db.prepare(`SELECT * FROM matches WHERE id = ?`);
    const match = matchStmt.get(matchId) as { id: number; played_at: string } | undefined;

    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    // Check if within edit window (24 hours)
    if (!isWithinEditWindow(match.played_at)) {
      return NextResponse.json(
        { error: 'Match can only be edited within 24 hours of being recorded' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { teams } = body as {
      teams: { team: number; player_ids: number[]; score: number }[];
    };

    if (!teams || teams.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 teams are required' },
        { status: 400 }
      );
    }

    // Validate scores
    for (const team of teams) {
      if (typeof team.score !== 'number' || team.score < 0) {
        return NextResponse.json(
          { error: 'All teams must have a valid score (non-negative number)' },
          { status: 400 }
        );
      }
    }

    // Perform the correction
    correctMatch(matchId, teams);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating match:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update match' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const matchId = parseInt(id, 10);

    if (isNaN(matchId)) {
      return NextResponse.json({ error: 'Invalid match ID' }, { status: 400 });
    }

    // Get the match to check edit window
    const matchStmt = db.prepare(`SELECT * FROM matches WHERE id = ?`);
    const match = matchStmt.get(matchId) as { id: number; played_at: string } | undefined;

    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    // Check if within edit window (24 hours)
    if (!isWithinEditWindow(match.played_at)) {
      return NextResponse.json(
        { error: 'Match can only be deleted within 24 hours of being recorded' },
        { status: 403 }
      );
    }

    // Delete the match and replay subsequent matches to recalculate ratings
    deleteMatchAndReplay(matchId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting match:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete match' },
      { status: 500 }
    );
  }
}