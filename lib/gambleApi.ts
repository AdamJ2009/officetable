// Shared helpers for the gambling API routes: error → HTTP status mapping
// and the standard validation of the explicit actor (player_id) body field.

import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { GambleError } from '@/lib/gamble';
import { BankError } from '@/lib/bank';

const STATUS_BY_CODE: Record<string, number> = {
  not_found: 404,
  unknown_game: 400,
  unknown_player: 400,
  same_player: 400,
  bad_terms: 400,
  bad_counter: 400,
  bad_stake: 400,
  bad_score: 400,
  bad_teams: 400,
  unsupported_game: 400,
  teams_mismatch: 400,
  not_negotiable: 409,
  not_your_turn: 409,
  already_settled: 409,
  already_cancelled: 409,
  bets_closed: 409,
  insufficient_funds: 409,
  not_a_participant: 403,
  participants_may_not_bet: 403,
};

/** Map lib errors to HTTP responses; anything else is a 500. */
export function gambleErrorResponse(error: unknown): NextResponse {
  if (error instanceof GambleError || error instanceof BankError) {
    const code = (error as GambleError).code;
    return NextResponse.json({ error: (error as Error).message, code }, { status: STATUS_BY_CODE[code] ?? 400 });
  }
  console.error('gambling route error:', error);
  return NextResponse.json({ error: 'Gambling operation failed' }, { status: 500 });
}

/** Validated actor id from a body field (no auth in this app — explicit identity). */
export function requirePlayerId(value: unknown): number {
  const id = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(id)) {
    throw new GambleError('player_id is required (this app has no login — pick who you are)', 'bad_actor');
  }
  const row = db.prepare(`SELECT id FROM players WHERE id = ?`).get(id) as { id: number } | undefined;
  if (!row) throw new GambleError('Unknown player', 'unknown_player');
  return id;
}

STATUS_BY_CODE['bets_still_open'] = 409;
STATUS_BY_CODE['bad_actor'] = 400;
STATUS_BY_CODE['challenge_expired'] = 409;
STATUS_BY_CODE['counter_not_allowed'] = 409;