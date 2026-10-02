import { NextRequest, NextResponse } from 'next/server';
import { getSeasons, getCurrentSeason, getNextSeason, createSeason, deleteQueuedSeason } from '@/lib/seasons';

export async function GET() {
  const seasons = getSeasons();
  const current = getCurrentSeason();
  const next = getNextSeason();

  return NextResponse.json({
    current_season_id: current?.id ?? 0,
    next_season: next
      ? { id: next.id, name: next.name, start_date: next.start_date }
      : null,
    seasons: seasons.map(s => ({
      id: s.id,
      name: s.name,
      start_date: s.start_date,
      end_date: s.end_date,
      is_current: current !== null && s.id === current.id,
      is_queued: next !== null && s.id === next.id,
    })),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { name, start_date } = body as { name?: string; start_date?: string };

    if (!start_date) {
      return NextResponse.json({ error: 'start_date is required' }, { status: 400 });
    }

    // Seasons never overlap or gap: queuing a new season closes the current
    // one exactly at the new start.
    const season = createSeason(start_date, name);
    return NextResponse.json({ success: true, season }, { status: 201 });
  } catch (error) {
    console.error('Error queuing season:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to queue season' },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { id } = body as { id?: number };

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    deleteQueuedSeason(parseInt(String(id), 10));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing queued season:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to remove queued season' },
      { status: 400 }
    );
  }
}