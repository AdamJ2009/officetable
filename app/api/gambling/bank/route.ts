// GET  /api/gambling/bank?player_id=  — balance + ledger for a player (or the
//      house when player_id is omitted/house=1); player_id adds the player's
//      central-bank (Alces Bookie) link status — NEVER their stored password.
//
// POST /api/gambling/bank  { player_id, action: 'donate', amount } — gift
//      moose bucks straight to the casino. Nothing in return, by design.
//
// There is deliberately NO top-up/withdraw endpoint: the site has no mint —
// the central Alces Bookie bank controls real balances, and site movements
// are earned through challenges, bets and settlements.

import { NextRequest, NextResponse } from 'next/server';
import { getBank, bankSyncBacklog, getLinkedAccount, alcesMirrorEnabled, donateToHouse } from '@/lib/bank';
import { GambleError } from '@/lib/gamble';
import { announceDonation } from '@/lib/gambleNotifications';
import { gambleErrorResponse, requirePlayerId, requireSessionPlayer } from '@/lib/gambleApi';

const bank = getBank();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const playerIdRaw = searchParams.get('player_id');

    if (playerIdRaw === null || playerIdRaw === 'house') {
      return NextResponse.json({
        house_balance: bank.getHouseBalance(),
        transactions: bank.listTransactions(null),
      });
    }

    const playerId = requirePlayerId(playerIdRaw);
    const linked = getLinkedAccount(playerId);
    return NextResponse.json({
      player_id: playerId,
      balance: bank.getBalance(playerId),
      transactions: bank.listTransactions(playerId),
      house_balance: bank.getHouseBalance(),
      mirror_enabled: alcesMirrorEnabled(),
      linked_account: linked ? {
        bank_username: linked.bank_username,
        bank_linked_at: linked.bank_linked_at,
      } : null,
      bank_username: linked?.bank_username ?? null,
      sync_backlog: alcesMirrorEnabled() ? bankSyncBacklog() : null,
    });
  } catch (error) {
    return gambleErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { player_id?: unknown; action?: unknown; amount?: unknown };
    const playerId = requirePlayerId(body.player_id);
    await requireSessionPlayer(playerId); // money action: the session player only
    if (body.action !== 'donate') {
      throw new GambleError('Unknown bank action', 'bad_terms');
    }
    const amount = typeof body.amount === 'number' ? body.amount : parseInt(String(body.amount ?? ''), 10);
    donateToHouse(playerId, amount);
    // Chat receipt: one Fry gif per donation. Fire-and-forget — a webhook
    // failure must never undo the settled ledger.
    void announceDonation(playerId, amount).catch(e => console.error('donation chat:', e));
    return NextResponse.json({
      donated: amount,
      balance: bank.getBalance(playerId),
      house_balance: bank.getHouseBalance(),
    });
  } catch (error) {
    return gambleErrorResponse(error);
  }
}