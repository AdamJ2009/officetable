// POST /api/gambling/bank/topup — office-bank admin: give a player moose bucks
// { player_id, amount } (positive integers; also usable to reset by negative? no —
// topups only credit; use amount ≤ 0 to withdraw).

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getBank } from '@/lib/bank';
import { gambleErrorResponse, requirePlayerId } from '@/lib/gambleApi';

const bank = getBank();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const playerId = requirePlayerId(body.player_id);
    const amount = parseInt(String(body.amount), 10);
    if (!Number.isInteger(amount) || amount === 0) {
      return NextResponse.json({ error: 'amount must be a non-zero integer' }, { status: 400 });
    }

    bank.ensureAccount(playerId);
    if (amount > 0) {
      bank.credit(playerId, amount, { type: 'topup', id: playerId, memo: 'bank top-up' });
    } else {
      bank.debit(playerId, -amount, { type: 'topup', id: playerId, memo: 'bank withdrawal' });
    }

    revalidatePath('/', 'layout');
    return NextResponse.json({ balance: bank.getBalance(playerId) }, { status: 201 });
  } catch (error) {
    return gambleErrorResponse(error);
  }
}