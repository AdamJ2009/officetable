// GET /api/gambling/matches/[id] — gamble match detail
// Query: ?player_id= to include that viewer's own bets/role flags.

import { NextRequest, NextResponse } from 'next/server';
import {
  getGambleMatch, getBets, getBetPool, deriveStatus, syncStatuses,
} from '@/lib/gamble';
import { gambleErrorResponse } from '@/lib/gambleApi';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    syncStatuses();
    const { id } = await params;
    const matchId = parseInt(id, 10);
    const gm = getGambleMatch(matchId);
    if (!gm) {
      return NextResponse.json({ error: 'Gamble match not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const playerId = parseInt(searchParams.get('player_id') ?? '', 10);

    const derived = deriveStatus(gm);
    const bets = getBets(matchId);
    const pool = getBetPool(matchId);

    const isParticipant = Number.isInteger(playerId)
      && (playerId === gm.red_player_id || playerId === gm.blue_player_id);
    const myBets = Number.isInteger(playerId)
      ? bets.filter(b => b.bettor_id === playerId)
      : [];

    return NextResponse.json({
      match: gm,
      derived_status: derived.status,
      seconds_to_close: derived.secondsToClose,
      bets,
      pool,
      my_bets: myBets,
      my_staked: myBets.reduce((s, b) => s + b.stake, 0),
      is_participant: isParticipant,
      can_bet: derived.status === 'open' && !isParticipant,
      can_score: isParticipant && (derived.status === 'awaiting_score' || derived.status === 'bets_closed'),
      can_cancel: isParticipant && (derived.status === 'open' || derived.status === 'bets_closed' || derived.status === 'awaiting_score'),
    });
  } catch (error) {
    return gambleErrorResponse(error);
  }
}