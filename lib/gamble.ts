// Gambling state machine: challenge negotiation, gamble-match lifecycle,
// and settlement math. All money is virtual moose bucks routed through
// lib/bank.ts inside the transactions this module owns.
//
// Invariant: money only ever moves at accept (entry fees), bet placement
// (stakes), settle (payouts/shares) and cancel (refunds) — so a decline or
// counter can never strand a fee.

import db from './db';
import { processMatch } from './elo';
import { getBank } from './bank';
import { computeOddsLadder } from './gambleOdds';
import { normaliseStartDate, toDbDate } from './seasons';
import type {
  Bet,
  Challenge,
  ChallengeTerm,
  GambleMatch,
  GambleMatchStatus,
  OddsLadder,
  ScoreOutcome,
  SettleSummary,
} from './types';

// Every tunable rule in one place — change here, never schema surgery.
export const GAMBLE_RULES = {
  /** Starting balance for a first-seen account. */
  seedBalance: 1000,
  /** Default + bounds for the (negotiable) per-player entry fee. */
  defaultEntryFee: 50,
  minEntryFee: 10,
  maxEntryFee: 500,
  minStake: 1,
  /** Bets close this many minutes before the scheduled start. */
  betCloseLeadMinutes: 2,
  /** Leftover pot split (spec text: 50/25/25; draw → winner share to house). */
  potSplit: { house: 0.5, winner: 0.25, scoreShare: 0.25 },
  /**
   * House fee on entries: the combined entry loses 10% to the bank before
   * the rest is split between the players by score share (100 → 90).
   */
  houseFeeRate: 0.10,
} as const;

const bank = getBank();
const nowDbDate = (): string => toDbDate(new Date());

export class GambleError extends Error {
  constructor(message: string, public code: string) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Status sync (lazy — no cron; read/write paths call this first)
// ---------------------------------------------------------------------------

/** Flip open → awaiting_score once the bet window has passed. */
export function syncStatuses(): void {
  db.prepare(`
    UPDATE gamble_matches SET status = 'awaiting_score'
    WHERE status = 'open' AND bet_close_at <= ?
  `).run(nowDbDate());
}

/** Derived status + seconds-to-close for the UI (bets closing is clock-derived). */
export function deriveStatus(
  gm: Pick<GambleMatch, 'status' | 'bet_close_at'>
): { status: GambleMatchStatus | 'bets_closed'; secondsToClose: number } {
  if (gm.status !== 'open') return { status: gm.status, secondsToClose: 0 };
  const closeMs = new Date(gm.bet_close_at.replace(' ', 'T') + 'Z').getTime();
  const nowMs = Date.now();
  if (nowMs >= closeMs) return { status: 'bets_closed', secondsToClose: 0 };
  return { status: 'open', secondsToClose: Math.floor((closeMs - nowMs) / 1000) };
}

// ---------------------------------------------------------------------------
// Challenges
// ---------------------------------------------------------------------------

export interface ChallengeTermsInput {
  entryFee: number;
  scheduledAt: string;
  side: 'red' | 'blue';
}

function validateTerms(terms: ChallengeTermsInput): string | null {
  if (!Number.isInteger(terms.entryFee) || terms.entryFee < GAMBLE_RULES.minEntryFee || terms.entryFee > GAMBLE_RULES.maxEntryFee) {
    return `Entry fee must be a whole number of moose bucks between ${GAMBLE_RULES.minEntryFee} and ${GAMBLE_RULES.maxEntryFee}`;
  }
  let scheduled: string;
  try {
    scheduled = normaliseStartDate(terms.scheduledAt);
  } catch {
    return 'Scheduled time could not be parsed';
  }
  if (new Date(scheduled.replace(' ', 'T') + 'Z').getTime() <= Date.now()) {
    return 'Scheduled time must be in the future';
  }
  return null;
}

/**
 * Create a challenge. No money moves yet — fees are debited on accept.
 * Betting is restricted to fixed-total games (the market is the exact score).
 */
export function createChallenge(
  gameId: number,
  challengerId: number,
  opponentId: number,
  terms: ChallengeTermsInput
): number {
  const game = db.prepare(`SELECT id, name, score_type FROM games WHERE id = ?`)
    .get(gameId) as { id: number; name: string; score_type: string } | undefined;
  if (!game) throw new GambleError('Unknown game', 'unknown_game');
  if (game.score_type !== 'best_of') {
    throw new GambleError(`Betting is only set up for fixed-total games (${game.name} is "${game.score_type}")`, 'unsupported_game');
  }
  if (challengerId === opponentId) throw new GambleError('You cannot challenge yourself', 'same_player');

  const known = db.prepare(`SELECT COUNT(*) as n FROM players WHERE id IN (?, ?)`)
    .get(challengerId, opponentId) as { n: number };
  if (known.n !== 2) throw new GambleError('Unknown player', 'unknown_player');

  const error = validateTerms(terms);
  if (error) throw new GambleError(error, 'bad_terms');

  const scheduled = normaliseStartDate(terms.scheduledAt);
  const redPlayerId = terms.side === 'red' ? challengerId : opponentId;

  return db.transaction((): number => {
    const result = db.prepare(`
      INSERT INTO challenges (game_id, challenger_id, opponent_id, entry_fee, scheduled_at, red_player_id, status, terms_by)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(gameId, challengerId, opponentId, terms.entryFee, scheduled, redPlayerId, challengerId);
    const challengeId = result.lastInsertRowid as number;

    db.prepare(`
      INSERT INTO challenge_terms (challenge_id, entry_fee, scheduled_at, red_player_id, proposed_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(challengeId, terms.entryFee, scheduled, redPlayerId, challengerId);

    return challengeId;
  })();
}

function futureScheduledAt(input: string): string {
  const scheduled = normaliseStartDate(input);
  if (new Date(scheduled.replace(' ', 'T') + 'Z').getTime() <= Date.now()) {
    throw new GambleError('Scheduled time must be in the future', 'bad_terms');
  }
  return scheduled;
}

/**
 * Respond to a challenge:
 *  - accept: debits both entry fees, freezes an odds ladder, opens the gamble match
 *  - counter: replaces terms, hands the pen back to the other player
 *  - decline / cancel: terminal; no fees were paid, nothing to refund
 * Only the player who did NOT author the current terms (terms_by) may
 * accept/decline/counter; either participant may cancel.
 */
export function respondToChallenge(
  challengeId: number,
  playerId: number,
  action: 'accept' | 'decline' | 'cancel' | 'counter',
  counter?: ChallengeTermsInput
): { challenge: Challenge; gambleMatch?: GambleMatch; ladder?: OddsLadder; balances?: { challenger: number; opponent: number } } {
  const challenge = getChallenge(challengeId);
  if (!challenge) throw new GambleError('Challenge not found', 'not_found');
  if (challenge.status !== 'pending' && challenge.status !== 'countered') {
    throw new GambleError(`Challenge is already ${challenge.status}`, 'not_negotiable');
  }
  if (playerId !== challenge.challenger_id && playerId !== challenge.opponent_id) {
    throw new GambleError('Only the two players can respond to this challenge', 'not_a_participant');
  }

  if (action === 'cancel') {
    db.prepare(`UPDATE challenges SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(challengeId);
    return { challenge: getChallenge(challengeId)! };
  }

  if (playerId === challenge.terms_by) {
    throw new GambleError('You proposed the current terms — it is the other player’s turn', 'not_your_turn');
  }

  if (action === 'decline') {
    db.prepare(`UPDATE challenges SET status = 'declined', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(challengeId);
    return { challenge: getChallenge(challengeId)! };
  }

  if (action === 'counter') {
    if (!counter) throw new GambleError('Counter requires new terms', 'bad_counter');
    validateTerms(counter); // throws GambleError('bad_terms') — no future-time check here, only shape
    const scheduled = futureScheduledAt(counter.scheduledAt);
    const redPlayerId = counter.side === 'red' ? challenge.challenger_id : challenge.opponent_id;

    db.transaction(() => {
      db.prepare(`
        UPDATE challenges
        SET entry_fee = ?, scheduled_at = ?, red_player_id = ?, status = 'countered', terms_by = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(counter.entryFee, scheduled, redPlayerId, playerId, challengeId);

      db.prepare(`
        INSERT INTO challenge_terms (challenge_id, entry_fee, scheduled_at, red_player_id, proposed_by)
        VALUES (?, ?, ?, ?, ?)
      `).run(challengeId, counter.entryFee, scheduled, redPlayerId, playerId);
    })();

    return { challenge: getChallenge(challengeId)! };
  }

  // ---- accept: fees + frozen odds + gamble match in one transaction ----
  const game = db.prepare(`SELECT score_value FROM games WHERE id = ?`)
    .get(challenge.game_id) as { score_value: number };
  const fee = challenge.entry_fee;
  const bluePlayerId = challenge.red_player_id === challenge.challenger_id ? challenge.opponent_id : challenge.challenger_id;

  const ladder = computeOddsLadder({
    gameId: challenge.game_id,
    redPlayerIds: [challenge.red_player_id],
    bluePlayerIds: [bluePlayerId],
    total: game.score_value,
  });
  const betCloseMs = new Date(challenge.scheduled_at.replace(' ', 'T') + 'Z').getTime()
    - GAMBLE_RULES.betCloseLeadMinutes * 60_000;
  const betCloseAt = toDbDate(new Date(betCloseMs));

  // Funds checked before the transaction so the error never half-moves money
  // (the debitChecked guard inside is belt and braces, not the real check).
  for (const pid of [challenge.challenger_id, challenge.opponent_id]) {
    bank.ensureAccount(pid);
    if (bank.getBalance(pid) < fee) {
      throw new GambleError(`Player ${pid} does not have ${fee} moose bucks to enter`, 'insufficient_funds');
    }
  }

  const gambleMatchId = db.transaction((): number => {
    bank.debitChecked(challenge.challenger_id, fee, { type: 'challenge_fee', id: challengeId, memo: 'entry fee' });
    bank.debitChecked(challenge.opponent_id, fee, { type: 'challenge_fee', id: challengeId, memo: 'entry fee' });

    const result = db.prepare(`
      INSERT INTO gamble_matches
        (challenge_id, game_id, red_player_id, blue_player_id, scheduled_at, bet_close_at, entry_fee, outcome_total, odds_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
    `).run(
      challengeId, challenge.game_id, challenge.red_player_id, bluePlayerId,
      challenge.scheduled_at, betCloseAt, fee, game.score_value, JSON.stringify(ladder)
    );
    const gmId = result.lastInsertRowid as number;

    db.prepare(`UPDATE challenges SET status = 'accepted', gamble_match_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(gmId, challengeId);
    return gmId;
  })();

  return {
    challenge: getChallenge(challengeId)!,
    gambleMatch: getGambleMatch(gambleMatchId),
    ladder,
    balances: {
      challenger: bank.getBalance(challenge.challenger_id),
      opponent: bank.getBalance(challenge.opponent_id),
    },
  };
}

export function getChallenge(id: number): Challenge | undefined {
  const row = db.prepare(`
    SELECT c.id, c.game_id, c.challenger_id, c.opponent_id, c.entry_fee, c.scheduled_at,
           c.red_player_id, c.status, c.terms_by, c.gamble_match_id, c.created_at, c.updated_at,
           g.name as game_name,
           cha.name as challenger_name, opp.name as opponent_name, tu.name as terms_by_name
    FROM challenges c
    JOIN players cha ON cha.id = c.challenger_id
    JOIN players opp ON opp.id = c.opponent_id
    JOIN players tu ON tu.id = c.terms_by
    LEFT JOIN games g ON g.id = c.game_id
    WHERE c.id = ?
  `).get(id);
  return row as Challenge | undefined;
}

export function getChallengeTerms(challengeId: number): ChallengeTerm[] {
  return db.prepare(`
    SELECT t.*, p.name as proposed_by_name
    FROM challenge_terms t
    JOIN players p ON p.id = t.proposed_by
    WHERE t.challenge_id = ?
    ORDER BY t.id ASC
  `).all(challengeId) as ChallengeTerm[];
}

export function getGambleMatch(id: number): GambleMatch | undefined {
  const row = db.prepare(`
    SELECT gm.*, g.name as game_name,
           red.name as red_player_name, blue.name as blue_player_name
    FROM gamble_matches gm
    JOIN games g ON g.id = gm.game_id
    JOIN players red ON red.id = gm.red_player_id
    JOIN players blue ON blue.id = gm.blue_player_id
    WHERE gm.id = ?
  `).get(id) as GambleMatch | undefined;
  if (!row) return undefined;
  return { ...row, odds: JSON.parse(row.odds_json) as OddsLadder };
}

// ---------------------------------------------------------------------------
// Bets
// ---------------------------------------------------------------------------

/**
 * Place a bet on an exact scoreline. Participants are blocked (match-fixing
 * guard, server-side). Odds are frozen at placement from the accept-time ladder.
 */
export function placeBet(gambleMatchId: number, bettorId: number, redScore: number, blueScore: number, stake: number): number {
  syncStatuses();

  const gm = getGambleMatch(gambleMatchId);
  if (!gm || !gm.odds) throw new GambleError('Gamble match not found', 'not_found');
  if (gm.status !== 'open') {
    throw new GambleError(`Bets are closed (match is ${gm.status})`, 'bets_closed');
  }
  // Clock re-check at write time — never trust the stored status alone.
  if (Date.now() >= new Date(gm.bet_close_at.replace(' ', 'T') + 'Z').getTime()) {
    throw new GambleError(`Bets are closed — the window shut at ${gm.bet_close_at} UTC`, 'bets_closed');
  }
  if (bettorId === gm.red_player_id || bettorId === gm.blue_player_id) {
    throw new GambleError('Players may not bet on their own match (match-fixing guard)', 'participants_may_not_bet');
  }
  if (!Number.isInteger(stake) || stake < GAMBLE_RULES.minStake) {
    throw new GambleError(`Stake must be a whole number of at least ${GAMBLE_RULES.minStake} moose bucks`, 'bad_stake');
  }
  if (!Number.isInteger(redScore) || !Number.isInteger(blueScore)
      || redScore < 0 || blueScore < 0 || redScore + blueScore !== gm.outcome_total) {
    throw new GambleError(`Pick a valid scoreline — the scores must sum to ${gm.outcome_total}`, 'bad_score');
  }

  const outcome: ScoreOutcome | undefined = gm.odds.outcomes
    .find(o => o.redScore === redScore && o.blueScore === blueScore);
  if (!outcome) throw new GambleError('Scoreline not on the odds board', 'bad_score');

  bank.ensureAccount(bettorId);
  if (bank.getBalance(bettorId) < stake) {
    throw new GambleError(`Not enough moose bucks: balance ${bank.getBalance(bettorId)} < stake ${stake}`, 'insufficient_funds');
  }

  return db.transaction((): number => {
    bank.debitChecked(bettorId, stake, {
      type: 'bet_stake',
      id: gambleMatchId,
      memo: `picked ${redScore}-${blueScore} at ${outcome.fractional}`,
    });
    const result = db.prepare(`
      INSERT INTO bets (gamble_match_id, bettor_id, red_score, blue_score, stake, decimal_odds)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(gambleMatchId, bettorId, redScore, blueScore, stake, outcome.decimalOdds);
    return result.lastInsertRowid as number;
  })();
}

export function getBets(gambleMatchId: number): Bet[] {
  return db.prepare(`
    SELECT b.*, p.name as bettor_name
    FROM bets b JOIN players p ON p.id = b.bettor_id
    WHERE b.gamble_match_id = ?
    ORDER BY b.id DESC
  `).all(gambleMatchId) as Bet[];
}

export function getBetPool(gambleMatchId: number): number {
  return (db.prepare(`
    SELECT COALESCE(SUM(stake), 0) as pool
    FROM bets WHERE gamble_match_id = ? AND status = 'open'
  `).get(gambleMatchId) as { pool: number }).pool;
}

// ---------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------

/**
 * Record the real match (existing Elo flow) and settle every bet plus the
 * players' entry shares and the pot — all in one transaction. Idempotent via
 * a check-and-set status claim. Teams: team 0 = red, team 1 = blue.
 */
export function settleGambleMatch(
  gambleMatchId: number,
  teams: { team: number; player_ids: number[]; score: number }[],
  notes?: string
): SettleSummary {
  const gm = getGambleMatch(gambleMatchId);
  if (!gm) throw new GambleError('Gamble match not found', 'not_found');

  const redTeam = teams.find(t => t.team === 0);
  const blueTeam = teams.find(t => t.team === 1);
  if (!redTeam || !blueTeam || redTeam.player_ids.length !== 1 || blueTeam.player_ids.length !== 1) {
    throw new GambleError('Provide both teams (team 0 = red, team 1 = blue) with one player each', 'bad_teams');
  }
  const [redPlayerId, bluePlayerId] = [redTeam.player_ids[0], blueTeam.player_ids[0]];
  if (redPlayerId !== gm.red_player_id || bluePlayerId !== gm.blue_player_id) {
    throw new GambleError('Teams do not match the gamble match participants', 'teams_mismatch');
  }

  const redScore = redTeam.score;
  const blueScore = blueTeam.score;
  if (!Number.isInteger(redScore) || !Number.isInteger(blueScore)
      || redScore < 0 || blueScore < 0 || redScore + blueScore !== gm.outcome_total) {
    throw new GambleError(`Scores must be whole numbers summing to ${gm.outcome_total}`, 'bad_score');
  }

  // Score entry is only valid after the betting window shut (clock check,
  // not just status check).
  if (Date.now() < new Date(gm.bet_close_at.replace(' ', 'T') + 'Z').getTime()) {
    throw new GambleError(
      `Too early — betting stays open until ${gm.bet_close_at} UTC; the score can be recorded after the match.`,
      'bets_still_open'
    );
  }

  const settle = db.transaction((): SettleSummary => {
    // Check-and-set claim: only the first settle wins, repeats error out.
    const claim = db.prepare(`
      UPDATE gamble_matches SET status = 'settled', settled_at = ?
      WHERE id = ? AND status IN ('open', 'awaiting_score')
    `).run(nowDbDate(), gambleMatchId);
    if (claim.changes === 0) {
      throw new GambleError('Match already settled', 'already_settled');
    }

    // 1. Record the real match via the existing Elo flow
    const processed = processMatch({
      game_id: gm.game_id,
      notes: notes ?? undefined,
      teams: [
        { team: 0, player_ids: [redPlayerId], score: redScore },
        { team: 1, player_ids: [bluePlayerId], score: blueScore },
      ],
    }, new Date());

    // 2. Gamblers: correct-score picks are paid stake × frozen odds — but
    //    the casino holds two pots and the payout cap spans exactly them:
    //    the BET POT (staked money this match took in) and the HOUSE POT
    //    (bank reserves). Total payouts may consume both pots but must
    //    leave the casino holding at least 1 moose buck — winners scale
    //    down proportionally when the full book busts that cap.
    const pool = getBetPool(gambleMatchId);
    const payoutCap = Math.max(0, pool + bank.getHouseBalance() - 1);
    const openBets: Bet[] = db.prepare(`
      SELECT b.*, p.name as bettor_name
      FROM bets b JOIN players p ON p.id = b.bettor_id
      WHERE b.gamble_match_id = ? AND b.status = 'open'
      ORDER BY b.id ASC
    `).all(gambleMatchId) as Bet[];

    let fullReturns = 0;
    const fullPayout = new Map<number, number>();
    for (const bet of openBets) {
      if (bet.red_score === redScore && bet.blue_score === blueScore) {
        const full = Math.floor(bet.stake * bet.decimal_odds);
        fullPayout.set(bet.id, full);
        fullReturns += full;
      }
    }
    const capped = fullReturns > payoutCap;

    let returns = 0;
    const betPayments: SettleSummary['betPayments'] = [];
    for (const bet of openBets) {
      const won = fullPayout.has(bet.id);
      let payout = 0;
      if (won) {
        const full = fullPayout.get(bet.id)!;
        payout = capped ? Math.floor((full * payoutCap) / fullReturns) : full;
        bank.credit(bet.bettor_id, payout, { type: 'gambler_payout', id: gambleMatchId, memo: capped ? `won gamble bet #${bet.id} (capped)` : `won gamble bet #${bet.id}` });
        returns += payout;
      }
      db.prepare(`UPDATE bets SET status = ?, payout = ? WHERE id = ?`).run(won ? 'won' : 'lost', payout, bet.id);
      betPayments.push({
        bettor_id: bet.bettor_id,
        bettor_name: bet.bettor_name ?? `player ${bet.bettor_id}`,
        pick: `${bet.red_score}-${bet.blue_score}`,
        stake: bet.stake,
        status: won ? 'won' : 'lost',
        payout,
      });
    }

    // 3. The house pays itself next: 10% of the combined entry is bank
    //    revenue off the top ("100 becomes 90"), then the players split the
    //    remaining 90% of their entries by their score share.
    const entriesPool = 2 * gm.entry_fee;
    const houseFee = Math.floor(entriesPool * GAMBLE_RULES.houseFeeRate);
    if (houseFee > 0) {
      bank.credit(null, houseFee, { type: 'house_fee', id: gambleMatchId, memo: '10% house fee on entries' });
    }
    const playersPool = entriesPool - houseFee;
    const participants: { playerId: number; score: number }[] = [
      { playerId: redPlayerId, score: redScore },
      { playerId: bluePlayerId, score: blueScore },
    ];
    const playerEntry: SettleSummary['playerEntry'] = [];
    let sharesTotal = 0;
    for (const { playerId, score } of participants) {
      const returned = Math.floor((playersPool * score) / gm.outcome_total);
      sharesTotal += returned;
      if (returned > 0) {
        bank.credit(playerId, returned, {
          type: 'player_share',
          id: gambleMatchId,
          memo: `entry share ${score}/${gm.outcome_total} of ${playersPool} (${100 - 10}% of ${gm.entry_fee} entry)`,
        });
      }
      playerEntry.push({ playerId, fee: gm.entry_fee, returned });
    }

    // 4. The pot = everything banked (stakes + both entry fees) minus what
    //    has been paid out (gambler payouts, the house fee, entry shares).
    //    Positive pot → 50% house / 25% winner / 25% by score share
    //    (draw → winner quarter to house). The casino-wide payout cap
    //    bounds the downside; a book that beats the pool but not the
    //    casino still lands the shortfall on the house below.
    const hold = pool + entriesPool;
    const leftover = hold - returns - houseFee - sharesTotal;

    // Split only what's left; every player/winner share is floored so the
    // rounding dust lands on the house and the ledger balances exactly.
    let houseCut = leftover > 0 ? Math.floor(leftover * GAMBLE_RULES.potSplit.house) : 0;
    let winnerShare = 0;
    let winnerPlayerId: number | null = null;
    let houseLoss = 0;
    const scoreShares: { playerId: number; amount: number }[] = [];
    const winnerQuarter = Math.floor(leftover * GAMBLE_RULES.potSplit.winner);
    const scoreQuarter = Math.floor(leftover * GAMBLE_RULES.potSplit.scoreShare);
    const isDraw = redScore === blueScore;

    if (leftover > 0) {
      winnerPlayerId = isDraw ? null : (redScore > blueScore ? redPlayerId : bluePlayerId);
      if (winnerPlayerId !== null && winnerQuarter > 0) {
        bank.credit(winnerPlayerId, winnerQuarter, { type: 'pot_winner_share', id: gambleMatchId, memo: 'match winner pot share' });
        winnerShare = winnerQuarter;
      }
      // On a draw the winner quarter keeps the houseCut value above.

      let scoreShareTotal = 0;
      for (let i = 0; i < participants.length; i++) {
        const amount = Math.floor((scoreQuarter * participants[i].score) / gm.outcome_total);
        if (amount > 0) {
          bank.credit(participants[i].playerId, amount, { type: 'pot_score_share', id: gambleMatchId, memo: 'pot score share' });
        }
        scoreShares.push({ playerId: participants[i].playerId, amount });
        scoreShareTotal += amount;
      }

      // House takes whatever the floored shares didn't eat — the base 50%
      // cut plus all rounding dust (and the whole quarter on a draw,
      // where winnerShare stays 0). Sum of shares == leftover exactly.
      houseCut = leftover - (winnerShare + scoreShareTotal);
      if (houseCut > 0) {
        bank.credit(null, houseCut, { type: 'pot_house_cut', id: gambleMatchId, memo: isDraw ? 'house cut (draw)' : 'house cut' });
      } else {
        houseCut = 0;
      }
    } else if (leftover < 0) {
      houseLoss = -leftover;
      bank.debit(null, houseLoss, { type: 'house_loss', id: gambleMatchId, memo: 'pot negative — house covered the shortfall' });
    }

    db.prepare(`UPDATE gamble_matches SET status = 'settled', match_id = ?, settled_at = ? WHERE id = ?`)
      .run(processed.matchId, nowDbDate(), gambleMatchId);

    return {
      gambleMatchId,
      matchId: processed.matchId,
      finalScore: { red: redScore, blue: blueScore },
      pool,
      returns,
      payoutCap,
      returnsCapped: capped,
      leftover,
      betPayments,
      pot: {
        positive: leftover > 0,
        house: houseCut,
        houseFee,
        winnerPlayerId,
        winnerShare,
        scoreShares,
        houseLoss,
      },
      playerEntry,
    };
  });

  return settle();
}

/** Refund everything on a cancel: open bet stakes + both entry fees. */
export function cancelGambleMatch(gambleMatchId: number): void {
  const gm = getGambleMatch(gambleMatchId);
  if (!gm) throw new GambleError('Gamble match not found', 'not_found');
  if (gm.status === 'settled') throw new GambleError('Match already settled', 'already_settled');
  if (gm.status === 'cancelled') throw new GambleError('Match already cancelled', 'already_cancelled');

  db.transaction(() => {
    bank.credit(gm.red_player_id, gm.entry_fee, { type: 'refund', id: gambleMatchId, memo: 'entry fee refund' });
    bank.credit(gm.blue_player_id, gm.entry_fee, { type: 'refund', id: gambleMatchId, memo: 'entry fee refund' });

    const openBets = db.prepare(`SELECT * FROM bets WHERE gamble_match_id = ? AND status = 'open'`)
      .all(gambleMatchId) as Bet[];
    for (const bet of openBets) {
      bank.credit(bet.bettor_id, bet.stake, { type: 'refund', id: gambleMatchId, memo: 'stake refund' });
      db.prepare(`UPDATE bets SET status = 'refunded' WHERE id = ?`).run(bet.id);
    }

    db.prepare(`UPDATE gamble_matches SET status = 'cancelled' WHERE id = ?`).run(gambleMatchId);
    db.prepare(`UPDATE challenges SET status = 'cancelled', gamble_match_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(gm.challenge_id);
  })();
}