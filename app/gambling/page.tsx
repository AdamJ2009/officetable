'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMe } from '@/lib/contexts/MeContext';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import type { Challenge } from '@/lib/types';

interface ChallengeWithNames extends Challenge {
  game_name?: string;
  challenger_name?: string;
  opponent_name?: string;
  terms_by_name?: string;
}

interface GamblerStanding {
  player_id: number;
  name: string;
  avatar_url?: string | null;
  balance: number;
  net: number;
  wagered: number;
  bets_won: number;
  bets_lost: number;
  gambles_played: number;
  retired?: number;
  is_inactive?: boolean;
}

interface Standings {
  house_balance: number;
  house_net: number;
  players: GamblerStanding[];
}

interface LobbyData {
  me: { player_id: number; balance: number } | null;
  house_balance: number;
  my_challenges: ChallengeWithNames[];
  broadcast_challenges: ChallengeWithNames[];
  live_matches: {
    id: number;
    game_name?: string;
    red_player_name?: string;
    blue_player_name?: string;
    scheduled_at: string;
    entry_fee: number;
    derived_status: string;
    seconds_to_close: number;
    pool: number;
    payout_line: string;
    special_rules?: string | null;
    top_odds: { redScore: number; blueScore: number; fractional: string }[];
    predicted: string;
  }[];
  settled_matches: {
    id: number;
    game_name?: string;
    red_player_name?: string;
    blue_player_name?: string;
    entry_fee: number;
    settled_at?: string;
  }[];
}

const STATUS_BADGE: Record<string, string> = {
  open: 'bg-green-100 text-green-800',
  bets_closed: 'bg-amber-100 text-amber-800',
  awaiting_score: 'bg-amber-100 text-amber-800',
  settled: 'bg-gray-200 text-gray-700',
  cancelled: 'bg-gray-200 text-gray-700',
};

const STATUS_LABEL: Record<string, string> = {
  open: 'OPEN — accepting bets',
  bets_closed: 'Bets closed',
  awaiting_score: 'Bets closed — waiting on score',
  settled: 'Settled',
  cancelled: 'Cancelled',
};

const STATUS_LABEL_CHALLENGE: Record<string, string> = {
  pending: 'Awaiting response',
  countered: 'Countered — waiting on you',
};

const EVENS: Record<string, string> = {
  true_even: 'evens on a draw (5-5)',
  elo_even: "evens on the bookie's line",
};

const evensLabel = (line: string) => EVENS[line] ?? `evens on ${line}`;

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return 'closed';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function GamblingLobby() {
  const { me } = useMe();
  const router = useRouter();
  const [data, setData] = useState<LobbyData | null>(null);
  const [standings, setStandings] = useState<Standings | null>(null);
  const [showRetired, setShowRetired] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (me) qs.set('player_id', String(me.id));
    const [res, standRes] = await Promise.all([
      fetch(`/api/gambling/lobby?${qs}`),
      fetch('/api/gambling/leaderboard'),
    ]);
    if (res.ok) setData(await res.json());
    if (standRes.ok) setStandings(await standRes.json());
  }, [me?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [load]);

  async function respond(challengeId: number, action: 'accept' | 'decline' | 'cancel') {
    if (!me) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/gambling/challenges/${challengeId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: me.id, action }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? 'Something went wrong');
        return;
      }
      if (action === 'accept' && body.gambleMatch?.id) {
        router.push(`/gambling/matches/${body.gambleMatch.id}`);
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>
      )}

      {/* Identity + bank */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 bg-card p-4 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500">My moose bucks</div>
            <div className="text-2xl font-bold text-gray-900">
              {data?.me ? data.me.balance.toLocaleString() : me ? '…' : '—'}
            </div>
          </div>
          {data?.me && (
            <a
              href={`/api/gambling/bank?player_id=${me?.id}`}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              ledger
            </a>
          )}
        </div>
        <div className="rounded-xl border border-gray-200 bg-card p-4 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500">The bank</div>
            <div className="text-2xl font-bold text-gray-900">{data ? data.house_balance.toLocaleString() : '—'}</div>
          </div>
          <Link
            href="/gambling/new"
            className="text-sm font-semibold bg-primary text-white rounded-lg px-4 py-2 hover:bg-primary-hover shadow-sm"
          >
            + New Challenge
          </Link>
        </div>
      </div>

      {/* Live gamble matches — front and centre, right below the bank */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Live gambles</h2>
        {data && data.live_matches.length === 0 ? (
          <p className="text-sm text-gray-500">No gambles running. Schedule one below.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data?.live_matches.map((m) => (
              <Link
                key={m.id}
                href={`/gambling/matches/${m.id}`}
                className="rounded-xl border border-gray-200 bg-card p-4 hover:border-primary/50 hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[m.derived_status] ?? 'bg-gray-100'}`}>
                    {STATUS_LABEL[m.derived_status] ?? m.derived_status}
                  </span>
                  {m.derived_status === 'open' && (
                    <span className="text-xs text-gray-500">closes in {formatCountdown(m.seconds_to_close)}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 font-semibold text-gray-900">
                  <span className="text-red-600">{m.red_player_name}</span>
                  <span className="text-gray-400">vs</span>
                  <span className="text-blue-600">{m.blue_player_name}</span>
                </div>
                <div className="text-xs text-gray-500">
                  {m.game_name} at {new Date(m.scheduled_at.replace(' ', 'T') + 'Z').toLocaleString('en-GB', {
                    weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
                  })} · pot {m.pool} moose bucks · {evensLabel(m.payout_line)}
                </div>
                {m.special_rules && (
                  <div className="text-xs text-amber-700 italic mt-0.5">📜 {m.special_rules}</div>
                )}
                <div className="text-[11px] text-gray-400 mt-0.5">
                  House rule: max total payout is the two pots (bet pool + house bank) minus 1 — the casino always keeps a moose buck.
                </div>
                <div className="mt-2 flex gap-2 text-xs">
                  {m.top_odds.map(o => (
                    <span key={`${o.redScore}-${o.blueScore}`} className="px-2 py-0.5 bg-gray-100 rounded-full text-gray-700">
                      {o.redScore}-{o.blueScore} @{o.fractional}
                    </span>
                  ))}
                  <span className="text-amber-600 self-center">line {m.predicted}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {!me && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 text-sm">
          Pick who you are (top right) to manage challenges, bet, and see your balance.
        </div>
      )}

      {/* Gambler standings — same look as the office game leaderboards */}
      {standings && standings.players.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold">🎲 Gambling Leaderboard</h1>
            <span className="text-sm text-gray-500">
              the casino is{' '}
              <b className={standings.house_net >= 0 ? 'text-green-700' : 'text-red-700'}>
                {standings.house_net >= 0 ? '+' : ''}{standings.house_net.toLocaleString()}
              </b>{' '}
              moose bucks
            </span>
          </div>

          {/* Stat cards, office style */}
          <div className="mb-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-5 text-white shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">🏦</span>
                <span className="text-sm font-medium text-slate-200 uppercase tracking-wide">House Pot</span>
              </div>
              <div className="text-3xl font-bold">{standings.house_balance.toLocaleString()}</div>
            </div>
            <div className={`rounded-xl p-5 text-white shadow-lg bg-gradient-to-br ${
              standings.house_net >= 0 ? 'from-emerald-600 to-emerald-700' : 'from-rose-600 to-red-700'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">🎩</span>
                <span className="text-sm font-medium text-white/80 uppercase tracking-wide">Casino P&amp;L</span>
              </div>
              <div className="text-3xl font-bold">
                {standings.house_net >= 0 ? '+' : ''}{standings.house_net.toLocaleString()}
              </div>
            </div>
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-5 text-white shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">🪙</span>
                <span className="text-sm font-medium text-white/80 uppercase tracking-wide">In Play</span>
              </div>
              <div className="text-3xl font-bold">
                {data ? data.live_matches.reduce((s, m) => s + m.pool, 0).toLocaleString() : '—'}
              </div>
              <div className="text-xs text-white/80 mt-1">
                {data ? data.live_matches.length : 0} live gamble{data && data.live_matches.length === 1 ? '' : 's'}
              </div>
            </div>
            <div className="bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl p-5 text-white shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">⚔️</span>
                <span className="text-sm font-medium text-white/80 uppercase tracking-wide">Challenges</span>
              </div>
              <div className="text-3xl font-bold">
                {data ? (data.my_challenges.length + data.broadcast_challenges.length) : '—'}
              </div>
              <div className="text-xs text-white/80 mt-1">open including broadcasts</div>
            </div>
          </div>

          {/* Retired / inactive toggles, same as the office leaderboards */}
          <div className="mb-4 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={showRetired}
                onChange={(e) => setShowRetired(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary"
              />
              Show retired players
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary"
              />
              Show inactive players
            </label>
          </div>

          {/* Ranked table, office style */}
          <div className="bg-card rounded-xl shadow-lg overflow-hidden">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gradient-to-r from-amber-500 to-orange-600 border-b border-black/20">
                  {['Rank', 'Player', 'Net', 'Staked', 'Gambles / Bets', 'Balance'].map(heading => (
                    <th
                      key={heading}
                      className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-white/80"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {standings.players
                  .filter(p => (p.retired ? showRetired : true) && (p.is_inactive ? showInactive : true))
                  .map((p, index) => {
                  const rank = index + 1;
                  const betGames = p.bets_won + p.bets_lost;
                  const betRate = betGames > 0 ? ((p.bets_won / betGames) * 100).toFixed(0) : '0';
                  const rankBadge = rank === 1 ? <span className="text-2xl">🥇</span>
                    : rank === 2 ? <span className="text-2xl">🥈</span>
                    : rank === 3 ? <span className="text-2xl">🥉</span>
                    : <span className="text-sm font-bold text-gray-400">#{rank}</span>;
                  const rowBg = rank === 1 ? 'bg-gradient-to-r from-amber-50 to-yellow-50'
                    : rank === 2 ? 'bg-gradient-to-r from-slate-50 to-gray-50'
                    : rank === 3 ? 'bg-gradient-to-r from-orange-50 to-amber-50'
                    : p.retired ? 'bg-gray-50' : 'bg-card';
                  return (
                    <tr key={p.player_id} className={`${rowBg} hover:brightness-95 transition-all duration-150`}>
                      <td className="px-6 py-4 whitespace-nowrap">{rankBadge}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Link
                          href={`/players/${p.player_id}`}
                          className="group flex items-center gap-3"
                        >
                          <PlayerAvatar
                            name={p.name}
                            avatarUrl={p.avatar_url}
                            size={40}
                            ringClass="shadow-md"
                            fallbackClassName={
                              rank === 1 ? 'bg-gradient-to-br from-amber-400 to-yellow-500 text-white'
                              : rank === 2 ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-white'
                              : rank === 3 ? 'bg-gradient-to-br from-orange-400 to-amber-500 text-white'
                              : 'bg-gray-200 text-gray-600'
                            }
                          />
                          <span className={`font-semibold text-gray-900 group-hover:text-primary transition-colors ${p.retired ? 'line-through' : ''}`}>
                            {p.name}
                          </span>
                          {!!p.retired && (
                            <span className="ml-2 text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full">Retired</span>
                          )}
                          {!p.retired && p.is_inactive && (
                            <span className="ml-2 text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">Inactive</span>
                          )}
                        </Link>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`text-lg font-bold ${p.net > 0 ? 'text-green-600' : p.net < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                          {p.net > 0 ? '+' : ''}{p.net.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 tabular-nums">
                        {p.wagered.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-sm">
                          <span className="text-gray-500">{p.gambles_played} played</span>
                          <span className="text-gray-300">·</span>
                          <span className="text-green-600 font-semibold">{p.bets_won}</span>
                          <span className="text-gray-300">/</span>
                          <span className="text-red-500 font-semibold">{p.bets_lost}</span>
                          {betGames > 0 && <span className="text-xs text-gray-400">({betRate}%)</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-lg font-bold text-gray-900 tabular-nums">{p.balance.toLocaleString()}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Challenges on me / sent by me */}
      {me && data?.my_challenges && data.my_challenges.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Challenges</h2>
          <div className="space-y-2">
            {data.my_challenges.map((c) => {
              const iSentTerms = c.terms_by === me.id;
              const amChallenger = c.challenger_id === me.id;
              const counterpart = amChallenger ? c.opponent_name : c.challenger_name;
              return (
                <div key={c.id} className="rounded-xl border border-gray-200 bg-card p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">
                      {c.broadcast
                        ? (amChallenger ? 'You broadcast a challenge (no opponent yet)' : 'Broadcast challenge')
                        : `${amChallenger ? 'You' : counterpart} challenged ${amChallenger ? counterpart : 'you'}`} · {c.game_name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {c.entry_fee} moose bucks each · red:{' '}
                      <span className="font-medium text-red-600 font-semibold">
                        {c.red_player_id == null ? 'first to accept' : c.red_player_id === c.challenger_id ? c.challenger_name : c.opponent_name}
                      </span>{' '}
                      · {evensLabel(c.payout_line)} · at {new Date(c.scheduled_at.replace(' ', 'T') + 'Z').toLocaleString('en-GB', {
                        weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
                      })} · {STATUS_LABEL_CHALLENGE[c.status] ?? c.status} (terms by {c.terms_by_name})
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/gambling/challenges/${c.id}`}
                      className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700"
                    >
                      Details
                    </Link>
                    {!iSentTerms ? (
                      <>
                        <button
                          disabled={busy}
                          onClick={() => respond(c.id, 'accept')}
                          className="text-sm font-semibold bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50"
                        >
                          Accept {c.entry_fee}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => respond(c.id, 'decline')}
                          className="text-sm px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          Decline
                        </button>
                      </>
                    ) : (
                      <button
                        disabled={busy}
                        onClick={() => respond(c.id, 'cancel')}
                        className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Cancel terms
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Broadcast challenges: open to anyone */}
      {data?.broadcast_challenges && data.broadcast_challenges.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Broadcast challenges — first to accept</h2>
          <div className="space-y-2">
            {data.broadcast_challenges.map((c) => (
              <div key={c.id} className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-gray-900">
                    {c.challenger_name} challenged · nobody yet (first to accept) · {c.game_name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {c.entry_fee} moose bucks each · {c.challenger_side === 'red' ? (
                      <><span className="font-medium text-red-600 font-semibold">they play red</span>, you'd be blue</>
                    ) : (
                      <><span className="font-medium text-blue-600 font-semibold">they play blue</span>, you'd be red</>
                    )}{' '}
                    · {evensLabel(c.payout_line)} · at {new Date(c.scheduled_at.replace(' ', 'T') + 'Z').toLocaleString('en-GB', {
                      weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
                    })}
                  </div>
                  {c.special_rules && (
                    <div className="text-xs text-amber-700 italic mt-0.5">📜 {c.special_rules}</div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/gambling/challenges/${c.id}`}
                    className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700"
                  >
                    Details
                  </Link>
                  {me ? (
                    <button
                      disabled={busy}
                      onClick={() => respond(c.id, 'accept')}
                      className="text-sm font-semibold bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      Accept {c.entry_fee}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Settled */}
      {data && data.settled_matches.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Recently settled</h2>
          <div className="space-y-1">
            {data.settled_matches.map(m => (
              <Link
                key={m.id}
                href={`/gambling/matches/${m.id}`}
                className="flex items-center justify-between rounded-lg border border-gray-100 bg-card px-4 py-2 text-sm hover:bg-gray-50"
              >
                <span>
                  <span className="font-medium text-gray-800">{m.red_player_name}</span>
                  <span className="text-gray-400"> vs </span>
                  <span className="font-medium text-gray-800">{m.blue_player_name}</span>
                  <span className="text-gray-500"> · {m.game_name} · entry {m.entry_fee}</span>
                </span>
                <span className="text-xs text-gray-400">
                  {m.settled_at?.replace('T', ' ').substring(0, 16)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}