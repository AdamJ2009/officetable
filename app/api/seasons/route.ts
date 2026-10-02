import { NextResponse } from 'next/server';
import { getSeasons, getCurrentSeason } from '@/lib/seasons';

export async function GET() {
  const seasons = getSeasons();
  const current = getCurrentSeason();

  return NextResponse.json({
    current_season_id: current?.id ?? 0,
    seasons: seasons.map(s => ({
      id: s.id,
      name: s.name,
      start_date: s.start_date,
      end_date: s.end_date,
      is_current: current !== null && s.id === current.id,
    })),
  });
}