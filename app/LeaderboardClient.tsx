"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSelectedGame } from "@/lib/hooks/useSelectedGame";
import type { LeaderboardEntry } from "@/lib/types";
import type { GameStats, GameRecords } from "@/lib/data";

interface LeaderboardClientProps {
  initialLeaderboard: LeaderboardEntry[];
  initialStats: GameStats;
  initialRecords: GameRecords;
}

function TrendSparkline({ deltas }: { deltas: number[] }) {
  if (deltas.length === 0) {
    return <span className="text-gray-300">—</span>;
  }

  const netChange = deltas.reduce((sum, d) => sum + d, 0);
  const isPositive = netChange >= 0;
  const color = isPositive ? '#16a34a' : '#dc2626';

  const cumulative: number[] = [];
  let running = 0;
  for (const d of deltas) {
    running += d;
    cumulative.push(running);
  }

  const min = Math.min(...cumulative, 0);
  const max = Math.max(...cumulative, 0);
  const range = Math.max(max - min, 1);

  const width = 60;
  const height = 20;
  const padding = 2;

  const points = cumulative.map((val, i) => {
    const x = padding + (i / Math.max(cumulative.length - 1, 1)) * (width - 2 * padding);
    const y = padding + (1 - (val - min) / range) * (height - 2 * padding);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="inline-block align-middle">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function LeaderboardClient({
  initialLeaderboard,
  initialStats,
  initialRecords,
}: LeaderboardClientProps) {
  const { selectedGameId, selectedGame, games } = useSelectedGame();
  const [leaderboard, setLeaderboard] = useState(initialLeaderboard);
  const [gameStats, setGameStats] = useState(initialStats);
  const [gameRecords, setGameRecords] = useState(initialRecords);
  const [loading, setLoading] = useState(false);
  const [showRetired, setShowRetired] = useState(false);

  // Fetch data when selected game changes
  useEffect(() => {
    if (selectedGameId === null) return;

    async function fetchData() {
      setLoading(true);
      try {
        const [leaderboardData, statsData, recordsData] = await Promise.all([
          fetch(`/api/leaderboard?game_id=${selectedGameId}&include_retired=${showRetired}`).then(res => res.json()),
          fetch(`/api/game-stats?game_id=${selectedGameId}`).then(res => res.json()),
          fetch(`/api/game-records?game_id=${selectedGameId}`).then(res => res.json())
        ]);
        setLeaderboard(leaderboardData);
        setGameStats(statsData);
        setGameRecords(recordsData);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [selectedGameId, showRetired]);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Leaderboard</h1>
        <div className="flex gap-3">
          <Link
            href="/matches"
            className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Match History
          </Link>
          <Link
            href={selectedGameId ? `/matches/new?game=${selectedGameId}` : "/matches/new"}
            className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-hover transition-colors"
          >
            Record Match
          </Link>
          <Link
            href="/settings"
            className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Settings
          </Link>
        </div>
      </div>

      {gameStats && (
        <div className="mb-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-5 text-white shadow-lg">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🎮</span>
              <span className="text-sm font-medium text-slate-300 uppercase tracking-wide">Matches</span>
            </div>
            <div className="text-3xl font-bold">{gameStats.total_matches.toLocaleString()}</div>
          </div>
          <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-xl p-5 text-white shadow-lg">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">👥</span>
              <span className="text-sm font-medium text-emerald-200 uppercase tracking-wide">Players</span>
            </div>
            <div className="text-3xl font-bold">{gameStats.active_players}</div>
            {gameStats.total_players > gameStats.active_players && (
              <div className="text-xs text-emerald-200 mt-1">{gameStats.total_players} total</div>
            )}
          </div>
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-5 text-white shadow-lg">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🔵</span>
              <span className="text-sm font-medium text-blue-200 uppercase tracking-wide">Team 1</span>
            </div>
            <div className="text-3xl font-bold">{gameStats.team0_points.toLocaleString()}</div>
          </div>
          <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-5 text-white shadow-lg">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🔴</span>
              <span className="text-sm font-medium text-red-200 uppercase tracking-wide">Team 2</span>
            </div>
            <div className="text-3xl font-bold">{gameStats.team1_points.toLocaleString()}</div>
          </div>
        </div>
      )}

      {gameRecords && (
        <div className="mb-6 bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-medium text-gray-700 uppercase tracking-wider">Game Records</h2>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {gameRecords.peak_skill_ever && (
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Peak Skill Ever</span>
                  <Link href={`/players/${gameRecords.peak_skill_ever.player_id}`} className="font-semibold text-green-700 hover:underline">
                    {gameRecords.peak_skill_ever.player_name}
                  </Link>
                  <span className="text-sm font-mono text-green-600">{(gameRecords.peak_skill_ever.value as number).toFixed(3)}</span>
                  {gameRecords.peak_skill_ever.date && (
                    <span className="text-xs text-gray-400">{gameRecords.peak_skill_ever.date.split(' ')[0]}</span>
                  )}
                </div>
              )}
              {gameRecords.trough_skill_ever && (
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Trough Skill Ever</span>
                  <Link href={`/players/${gameRecords.trough_skill_ever.player_id}`} className="font-semibold text-red-700 hover:underline">
                    {gameRecords.trough_skill_ever.player_name}
                  </Link>
                  <span className="text-sm font-mono text-red-600">{(gameRecords.trough_skill_ever.value as number).toFixed(3)}</span>
                  {gameRecords.trough_skill_ever.date && (
                    <span className="text-xs text-gray-400">{gameRecords.trough_skill_ever.date.split(' ')[0]}</span>
                  )}
                </div>
              )}
              {gameRecords.most_games && (
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Most Games</span>
                  <Link href={`/players/${gameRecords.most_games.player_id}`} className="font-semibold text-blue-700 hover:underline">
                    {gameRecords.most_games.player_name}
                  </Link>
                  <span className="text-sm text-blue-600">{gameRecords.most_games.value} games</span>
                </div>
              )}
              {gameRecords.highest_win_rate && (
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Highest Win Rate</span>
                  <Link href={`/players/${gameRecords.highest_win_rate.player_id}`} className="font-semibold text-green-700 hover:underline">
                    {gameRecords.highest_win_rate.player_name}
                  </Link>
                  <span className="text-sm text-green-600">{(gameRecords.highest_win_rate.value as number).toFixed(1)}%</span>
                  <span className="text-xs text-gray-400">(min 20 games)</span>
                </div>
              )}
              {gameRecords.longest_win_streak && (
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Longest Win Streak</span>
                  <Link href={`/players/${gameRecords.longest_win_streak.player_id}`} className="font-semibold text-green-700 hover:underline">
                    {gameRecords.longest_win_streak.player_name}
                  </Link>
                  <span className="text-sm text-green-600">{gameRecords.longest_win_streak.value} games</span>
                  {gameRecords.longest_win_streak.date && (
                    <span className="text-xs text-gray-400">{gameRecords.longest_win_streak.date}</span>
                  )}
                </div>
              )}
              {gameRecords.longest_lose_streak && (
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Longest Lose Streak</span>
                  <Link href={`/players/${gameRecords.longest_lose_streak.player_id}`} className="font-semibold text-red-700 hover:underline">
                    {gameRecords.longest_lose_streak.player_name}
                  </Link>
                  <span className="text-sm text-red-600">{gameRecords.longest_lose_streak.value} games</span>
                  {gameRecords.longest_lose_streak.date && (
                    <span className="text-xs text-gray-400">{gameRecords.longest_lose_streak.date}</span>
                  )}
                </div>
              )}
              {gameRecords.longest_unbeaten_streak && (
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Longest Unbeaten</span>
                  <Link href={`/players/${gameRecords.longest_unbeaten_streak.player_id}`} className="font-semibold text-blue-700 hover:underline">
                    {gameRecords.longest_unbeaten_streak.player_name}
                  </Link>
                  <span className="text-sm text-blue-600">{gameRecords.longest_unbeaten_streak.value} games</span>
                  {gameRecords.longest_unbeaten_streak.date && (
                    <span className="text-xs text-gray-400">{gameRecords.longest_unbeaten_streak.date}</span>
                  )}
                </div>
              )}
              {gameRecords.biggest_skill_gain && (
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Biggest Skill Gain</span>
                  <Link href={`/players/${gameRecords.biggest_skill_gain.player_id}`} className="font-semibold text-green-700 hover:underline">
                    {gameRecords.biggest_skill_gain.player_name}
                  </Link>
                  <span className="text-sm font-mono text-green-600">+{(gameRecords.biggest_skill_gain.value as number).toFixed(3)}</span>
                  {gameRecords.biggest_skill_gain.date && (
                    <span className="text-xs text-gray-400">{gameRecords.biggest_skill_gain.date.split(' ')[0]}</span>
                  )}
                </div>
              )}
              {gameRecords.biggest_skill_loss && (
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Biggest Skill Loss</span>
                  <Link href={`/players/${gameRecords.biggest_skill_loss.player_id}`} className="font-semibold text-red-700 hover:underline">
                    {gameRecords.biggest_skill_loss.player_name}
                  </Link>
                  <span className="text-sm font-mono text-red-600">-{(gameRecords.biggest_skill_loss.value as number).toFixed(3)}</span>
                  {gameRecords.biggest_skill_loss.date && (
                    <span className="text-xs text-gray-400">{gameRecords.biggest_skill_loss.date.split(' ')[0]}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mb-4">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={showRetired}
            onChange={(e) => setShowRetired(e.target.checked)}
            className="rounded border-border text-primary focus:ring-primary"
          />
          Show retired players
        </label>
      </div>

      {loading ? (
        <div className="text-gray-500">Loading...</div>
      ) : leaderboard.length === 0 ? (
        <div className="text-gray-500">
          No players on the leaderboard yet.{" "}
          <Link href="/players" className="text-primary hover:underline">
            Add players
          </Link>{" "}
          and record some matches!
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <table className="min-w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Rank
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Player
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Rating
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Trend
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  W/L/D
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Win Rate
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leaderboard.map((entry, index) => {
                const totalGames = entry.wins + entry.losses + entry.draws;
                const winRate = totalGames > 0 ? ((entry.wins / totalGames) * 100).toFixed(0) : "0";
                const isRetired = entry.status === 'retired';
                const rank = index + 1;

                // Rank badge component
                const rankBadge = () => {
                  if (rank === 1) return <span className="text-2xl">🥇</span>;
                  if (rank === 2) return <span className="text-2xl">🥈</span>;
                  if (rank === 3) return <span className="text-2xl">🥉</span>;
                  return <span className="text-sm font-bold text-gray-400">#{rank}</span>;
                };

                // Row background for top 3
                const rowBg = rank === 1 ? 'bg-gradient-to-r from-amber-50 to-yellow-50' :
                              rank === 2 ? 'bg-gradient-to-r from-slate-50 to-gray-50' :
                              rank === 3 ? 'bg-gradient-to-r from-orange-50 to-amber-50' :
                              isRetired ? 'bg-gray-50' : 'bg-white';

                return (
                  <tr
                    key={entry.player_id}
                    className={`${rowBg} hover:brightness-95 transition-all duration-150`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      {rankBadge()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link
                        href={`/players/${entry.player_id}`}
                        className={`group flex items-center gap-3 ${isRetired ? 'opacity-60' : ''}`}
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${
                          rank === 1 ? 'bg-gradient-to-br from-amber-400 to-yellow-500 text-white shadow-md' :
                          rank === 2 ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-white shadow-md' :
                          rank === 3 ? 'bg-gradient-to-br from-orange-400 to-amber-500 text-white shadow-md' :
                          'bg-gray-200 text-gray-600'
                        }`}>
                          {entry.player_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className={`font-semibold text-gray-900 group-hover:text-primary transition-colors ${isRetired ? 'line-through' : ''}`}>
                            {entry.player_name}
                          </span>
                          {isRetired && (
                            <span className="ml-2 text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full">
                              Retired
                            </span>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-gray-900">
                          {entry.elo.toFixed(0)}
                        </span>
                        <span className="text-xs text-gray-400 font-mono">
                          .{Math.abs(entry.elo % 1).toFixed(3).slice(2)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <TrendSparkline deltas={entry.trend} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="text-green-600 font-semibold">{entry.wins}</span>
                        <span className="text-gray-300">/</span>
                        <span className="text-red-500 font-semibold">{entry.losses}</span>
                        <span className="text-gray-300">/</span>
                        <span className="text-gray-500">{entry.draws}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full"
                            style={{ width: `${winRate}%` }}
                          />
                        </div>
                        <span className="text-sm font-semibold text-gray-700">{winRate}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}