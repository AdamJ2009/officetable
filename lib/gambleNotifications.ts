// Chat-card announcements for the gambling flow (challenge issued /
// bets open / settled), sent via the existing announcement path.
// Route handlers call these with .catch(console.error) — a webhook
// failure must never fail a settled transaction.

import { sendAnnouncementNotification, type AnnouncementMessage } from './notifications';
import type { Challenge, GambleMatch, OddsLadder, SettleSummary } from './types';

const baseUrl = () => process.env.NEXT_PUBLIC_BASE_URL;

const moose = (n: number) => `${n} moose bucks`;

const EVENS: Record<string, string> = {
  true_even: 'evens on a draw (5-5)',
  elo_even: "evens on the bookie's line",
};

const evensLabel = (line: string) => EVENS[line] ?? `evens on ${line}`;

/** Challenge issued — the opponent (or the whole office, if broadcast) gets a respond prompt. */
export async function announceChallengeIssued(challenge: Challenge, ladder?: OddsLadder): Promise<void> {
  const broadcast = !!challenge.broadcast;
  const redSide = challenge.red_player_id == null
    ? 'first to accept'
    : challenge.red_player_id === challenge.challenger_id
      ? challenge.challenger_name
      : (challenge.opponent_name ?? 'first to accept');
  const line = ladder?.predictedLine;
  const message: AnnouncementMessage = {
    title: '⚔️ Challenge issued',
    subtitle: challenge.game_name,
    paragraphs: [
      broadcast
        ? `<b>${challenge.challenger_name}</b> broadcasts a challenge at ${challenge.game_name ?? 'the table'} — playing <b>${challenge.challenger_side === 'red' ? 'red' : 'blue'}</b>. First player to accept takes the ${challenge.challenger_side === 'red' ? 'blue' : 'red'} side.`
        : `<b>${challenge.challenger_name}</b> challenges <b>${challenge.opponent_name}</b> at ${challenge.game_name ?? 'the table'}.`,
      `Entry ${moose(challenge.entry_fee)} each · Red: <b>${redSide}</b> · ${evensLabel(challenge.payout_line ?? 'true_even')} · Scheduled ${challenge.scheduled_at} UTC`,
      ...(broadcast
        ? ['Any player may accept — no countering on broadcasts. It expires if nobody accepts by 5 minutes before the start.']
        : ['Expires if not accepted by 5 minutes before the start. Countering may change the terms, including the payout line.']),
      ...(challenge.special_rules ? [`📜 Special rules: <i>${challenge.special_rules}</i>`] : []),
      ...(line ? [`Bookie's early line: <b>${line}</b> — odds freeze when the challenge is accepted.`] : []),
    ],
    linkUrl: baseUrl() ? `${baseUrl()}/gambling/challenges/${challenge.id}` : undefined,
    linkText: 'View the challenge',
  };
  await sendAnnouncementNotification(message);
}

/** Bets open on an accepted challenge. */
export async function announceBetsOpen(gambleMatch: GambleMatch, ladder: OddsLadder): Promise<void> {
  const top = ladder.outcomes.slice().sort((a, b) => b.prob - a.prob).slice(0, 3);
  const topText = top
    .map(o => `<b>${o.redScore}-${o.blueScore}</b> at ${o.fractional}`)
    .join(' · ');
  const message: AnnouncementMessage = {
    title: '🎲 Bets are open',
    subtitle: `${gambleMatch.red_player_name} (red) vs ${gambleMatch.blue_player_name} (blue)`,
    paragraphs: [
      `${gambleMatch.red_player_name} vs ${gambleMatch.blue_player_name} — ${gambleMatch.game_name ?? 'match'} at ${gambleMatch.scheduled_at} UTC.`,
      `Entry ${moose(gambleMatch.entry_fee)} each. Odds to pick the exact score: ${topText}.`,
      `<i>Everyone may bet except the two players. Bets close 2 minutes before the start.</i>`,
    ],
    linkUrl: baseUrl() ? `${baseUrl()}/gambling/matches/${gambleMatch.id}` : undefined,
    linkText: 'Place a bet',
  };
  await sendAnnouncementNotification(message);
}

/** Settled — result, payouts and the pot split. */
export async function announceSettled(gambleMatch: GambleMatch, summary: SettleSummary): Promise<void> {
  const { pot } = summary;
  const winners = summary.betPayments.filter(b => b.status === 'won');
  const potLines: string[] = [];
  if (summary.leftover > 0) {
    potLines.push(
      `Bank pot → house ${pot.house}` +
      (pot.winnerShare > 0 ? ` · winner ${moose(pot.winnerShare)}` : ' · draw: winner share to house') +
      ` · score split ${pot.scoreShares.map(s => moose(s.amount)).join(' / ')}`
    );
  } else if (summary.leftover < 0) {
    potLines.push(`Bank covered a −${moose(pot.houseLoss)} pot shortfall`);
  } else {
    potLines.push('Bank pot settled at exactly zero');
  }

  const message: AnnouncementMessage = {
    title: `🎲 Result: ${gambleMatch.red_player_name} ${summary.finalScore.red}–${summary.finalScore.blue} ${gambleMatch.blue_player_name}`,
    subtitle: gambleMatch.game_name,
    paragraphs: [
      `🏆 Correct-score bets: ${winners.length} won, ${summary.betPayments.length - winners.length} lost — ${moose(summary.returns)} paid out from a ${moose(summary.pool)} pool` +
      (summary.returnsCapped ? ` (capped at bet pool + house bank − 1: ${moose(summary.payoutCap)})` : '') + '.',
      `${gambleMatch.red_player_name} left with ${moose(summary.playerEntry[0]?.returned ?? 0)} · ${gambleMatch.blue_player_name} left with ${moose(summary.playerEntry[1]?.returned ?? 0)} of their entries` +
      (summary.entryEvenHit ? ` (evens line ${summary.payoutLine === 'true_even' ? '5-5' : summary.payoutLine === 'elo_even' ? "on the bookie's line" : summary.payoutLine} hit — 50/50)` : '') + '.',
      ...potLines,
    ],
    linkUrl: baseUrl() ? `${baseUrl()}/gambling/matches/${gambleMatch.id}` : undefined,
    linkText: 'Full settlement',
  };
  await sendAnnouncementNotification(message);
}

/** Cancelled / voided with refunds. */
export async function announceCancelled(gambleMatch: GambleMatch, refundTotal: number): Promise<void> {
  const message: AnnouncementMessage = {
    title: '♻️ Gamble cancelled',
    subtitle: `${gambleMatch.red_player_name} vs ${gambleMatch.blue_player_name}`,
    paragraphs: [
      `The gamble was cancelled. All stakes and entry fees refunded — ${moose(refundTotal)} returned.`,
    ],
    linkUrl: baseUrl() ? `${baseUrl()}/gambling/matches/${gambleMatch.id}` : undefined,
    linkText: 'View match',
  };
  await sendAnnouncementNotification(message);
}