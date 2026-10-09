// POST /api/gambling/bank/resync — re-arm every failed mirror row and drain.
// Movements parked 'failed' (10 dead attempts) only move again when somebody
// presses this; the drainer itself never hammers the bank's API.

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { kickBankSync, bankSyncBacklog, alcesMirrorEnabled } from '@/lib/bank';
import { gambleErrorResponse, requirePlayerId } from '@/lib/gambleApi';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { player_id?: number | string };
    requirePlayerId(body.player_id);
    if (!alcesMirrorEnabled()) {
      return NextResponse.json({ error: 'Central bank is not configured' }, { status: 400 });
    }
    const result = db.prepare(`
      UPDATE bank_sync SET status = 'pending', attempts = 0, error = NULL WHERE status = 'failed'
    `).run();
    kickBankSync(); // one controlled drain; won't loop if things still fail
    return NextResponse.json({
      requeued: result.changes,
      backlog: bankSyncBacklog(),
    });
  } catch (error) {
    return gambleErrorResponse(error);
  }
}