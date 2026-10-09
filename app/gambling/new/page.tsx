'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMe } from '@/lib/contexts/MeContext';
import { useSelectedGame } from '@/lib/hooks/useSelectedGame';
import { GambleOddsBoard } from '@/components/GambleOddsBoard';
import type { OddsLadder } from '@/lib/types';

// New challenge: pick opponent, game, entry fee, side and time. The odds
// preview is computed live in the browser from the same lib/ math the
// accept path server-side uses — display only, never authoritative.

export default function NewChallengePage() {
  const { me, players } = useMe();
  const { selectedGameId, games, selectedGame, setSelectedGameId } = useSelectedGame();
  const router = useRouter();

  const [opponentId, setOpponentId] = useState<number | null>(null);
  const [entryFee, setEntryFee] = useState(50);
  const [side, setSide] = useState<'red' | 'blue'>('red');
  const [scheduledLocal, setScheduledLocal] = useState(() => {
    // Default: one hour from now, local ISO datetime-local format
    const d = new Date(Date.now() + 60 * 60_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live odds preview (client-side lib math); season ratings come from the
  // server normally — for the preview we fetch nothing: we need elo, so we
  // call the ladder preview endpoint instead — see effect below.
  const [ladder, setLadder] = useState<OddsLadder | null>(null);
  const [preview, setPreview] = useState<{
    redName: string; blueName: string; predicted: string; total: number;
  } | null>(null);
  const [previewTimer, setPreviewTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const opponent = players.find(p => p.id === opponentId) ?? null;
  const redName = side === 'red' ? (me?.name ?? 'Red player') : (opponent?.name ?? 'Red player');
  const blueName = side === 'blue' ? (me?.name ?? 'Blue player') : (opponent?.name ?? 'Blue player');

  // Debounced preview fetch — the client lib needs Elo ratings from the DB,
  // so the preview runs through the games/odds endpoint.
  const gameId = selectedGameId;
  useEffect(() => {
    if (!gameId || !me || !opponentId) { setLadder(null); setPreview(null); return; }
    if (previewTimer) clearTimeout(previewTimer);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/gambling/odds-preview?game_id=${gameId}&red=${side === 'red' ? me.id : opponentId}&blue=${side === 'blue' ? me.id : opponentId}`
        );
        if (res.ok) {
          const data = await res.json();
          setLadder(data.ladder);
          setPreview({
            redName,
            blueName,
            predicted: data.ladder.predictedLine,
            total: data.player_totals_total,
          });
        }
      } catch {
        // preview failing is non-fatal
      }
    }, 400);
    setPreviewTimer(timer);
    return () => clearTimeout(timer);
  }, [gameId, me?.id, opponentId, side, redName, blueName]);

  async function submit() {
    if (!me || !opponentId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/gambling/challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenger_id: me.id,
          opponent_id: opponentId,
          game_id: selectedGameId,
          entry_fee: entryFee,
          scheduled_at: scheduledLocal,
          side,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? 'Failed to create the challenge');
        return;
      }
      router.push(`/gambling/challenges/${body.challenge_id}`);
    } finally {
      setSubmitting(false);
    }
  }

  const feeInvalid = !Number.isInteger(entryFee) || entryFee < 10 || entryFee > 500;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-card p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Opponent */}
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Challenging</span>
            <select
              value={opponentId ?? ''}
              onChange={e => setOpponentId(parseInt(e.target.value, 10) || null)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 bg-background text-gray-800"
            >
              <option value="">Choose a player…</option>
              {players.filter(p => p.id !== me?.id).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <span className="text-xs text-gray-400">
              You are {me?.name ?? 'unknown'} — pick who you are top right if wrong.
            </span>
          </label>

          {/* Game */}
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Game</span>
            <select
              value={selectedGameId ?? ''}
              onChange={e => {
                const id = parseInt(e.target.value, 10);
                if (id) setSelectedGameId(id);
              }}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 bg-background text-gray-800"
            >
              {games.map(g => (
                <option key={g.id} value={g.id}>{g.name} (to {g.score_value})</option>
              ))}
            </select>
            <span className="text-xs text-gray-400">
              {selectedGame?.score_type === 'best_of'
                ? 'Fixed-total game — betting on the exact score.'
                : selectedGame ? 'This game has no fixed score total, betting unavailable.' : ''}
            </span>
          </label>

          {/* Entry fee */}
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Entry fee (moose bucks each)</span>
            <input
              type="number"
              min={10}
              max={500}
              value={entryFee}
              onChange={e => setEntryFee(parseInt(e.target.value, 10) || 0)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 bg-background text-gray-800"
            />
            <span className="text-xs text-gray-400">Between 10 and 500. Both players pay the same on accept.</span>
          </label>

          {/* Time */}
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">When (your local time)</span>
            <input
              type="datetime-local"
              value={scheduledLocal}
              onChange={e => setScheduledLocal(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 bg-background text-gray-800"
            />
            <span className="text-xs text-gray-400">Bets close 2 minutes before this.</span>
          </label>
        </div>

        {/* Side */}
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Your side</span>
          <div className="flex gap-2 mt-1">
            {(['red', 'blue'] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setSide(s)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  side === s
                    ? s === 'red' ? 'bg-red-600 text-white border-red-600' : 'bg-blue-600 text-white border-blue-600'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {s === 'red' ? '🔴 Red' : '🔵 Blue'}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-400">
            Red side: {redName} · Blue side: {blueName}
          </span>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>
        )}

        <button
          onClick={submit}
          disabled={!me || !opponentId || !selectedGameId || feeInvalid || submitting}
          className="w-full sm:w-auto font-semibold bg-primary text-white rounded-lg px-6 py-2.5 hover:bg-primary-hover shadow-sm disabled:opacity-40"
        >
          {submitting ? 'Sending…' : 'Send challenge'}
        </button>
        <p className="text-xs text-gray-400">
          No money moves until your opponent accepts. They can accept, decline, or counter your terms.
        </p>
      </div>

      {/* Odds preview */}
      {ladder && (
        <div className="rounded-xl border border-gray-200 bg-card p-5">
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">
            Odds preview — Elo + head-to-head
          </div>
          <div className="text-sm text-gray-700 mb-3">
            <span className="font-semibold text-red-600">{preview?.redName}</span> vs{' '}
            <span className="font-semibold text-blue-600">{preview?.blueName}</span>
            {' · '}bookie's line <b>{ladder.predictedLine}</b>
          </div>
          <GambleOddsBoard ladder={ladder.outcomes} predictedLine={ladder.predictedLine} total={ladder.total} />
        </div>
      )}
    </div>
  );
}