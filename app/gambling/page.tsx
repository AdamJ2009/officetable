'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMe } from '@/lib/contexts/MeContext';
import type { Challenge } from '@/lib/types';

interface ChallengeWithNames extends Challenge {
  game_name?: string;
  challenger_name?: string;
  opponent_name?: string;
  terms_by_name?: string;
}

interface LobbyData {
  me: { player_id: number; balance: number } | null;
  house_balance: number;
  my_challenges: ChallengeWithNames[];
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (me) qs.set('player_id', String(me.id));
    const res = await fetch(`/api/gambling/lobby?${qs}`);
    if (res.ok) setData(await res.json());
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

      {!me && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 text-sm">
          Pick who you are (top right) to manage challenges, bet, and see your balance.
        </div>
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
                      {amChallenger ? 'You' : counterpart} challenged {amChallenger ? counterpart : 'you'} · {c.game_name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {c.entry_fee} moose bucks each · red:{' '}
                      <span className="font-medium text-red-600 font-semibold">
                        {c.red_player_id === c.challenger_id ? c.challenger_name : c.opponent_name}
                      </span>{' '}
                      · at {new Date(c.scheduled_at.replace(' ', 'T') + 'Z').toLocaleString('en-GB', {
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

      {/* Live gamble matches */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Live gambles</h2>
        {data && data.live_matches.length === 0 ? (
          <p className="text-sm text-gray-500">No gambles running. Schedule one above.</p>
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
                  })} · pot {m.pool} moose bucks
                </div>
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