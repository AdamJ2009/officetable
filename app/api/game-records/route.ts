import { NextRequest, NextResponse } from 'next/server';
import { getGameRecords } from '@/lib/data';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get('game_id');

  if (!gameId) {
    return NextResponse.json({ error: 'game_id is required' }, { status: 400 });
  }

  const gid = parseInt(gameId, 10);
  if (isNaN(gid)) {
    return NextResponse.json({ error: 'Invalid game_id' }, { status: 400 });
  }

  // Records are computed in the scope being viewed: season (default = current
  // season) or alltime; an explicit season_id selects a specific past season.
  return NextResponse.json(getGameRecords(gid, {
    scope: (searchParams.get('scope') as 'season' | 'alltime') || 'season',
    seasonId: searchParams.get('season_id') !== null ? parseInt(searchParams.get('season_id')!, 10) : undefined,
  }));
}