// GET  /api/gambling/bank?player_id=  — balance + ledger for a player (or the
//      house when player_id is omitted/house=1)
// POST /api/gambling/bank/topup      — office-bank admin: credit moose bucks

import { NextRequest, NextResponse } from 'next/server';
import { getBank, BankRef } from '@/lib/bank';
import { gambleErrorResponse, requirePlayerId } from '@/lib/gambleApi';

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
    return NextResponse.json({
      player_id: playerId,
      balance: bank.getBalance(playerId),
      transactions: bank.listTransactions(playerId),
      house_balance: bank.getHouseBalance(),
    });
  } catch (error) {
    return gambleErrorResponse(error);
  }
}