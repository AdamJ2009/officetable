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
        <div className="mb-8 bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-slate-800 to-slate-900">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>🏆</span> Game Records
            </h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {gameRecords.peak_skill_ever && (
                <Link
                  href={`/players/${gameRecords.peak_skill_ever.player_id}`}
                  className="group bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-200 rounded-xl p-4 hover:shadow-lg hover:border-emerald-300 transition-all duration-200"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">📈</span>
                    <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Peak Skill</span>
                  </div>
                  <div className="font-bold text-gray-900 group-hover:text-emerald-700 transition-colors">
                    {gameRecords.peak_skill_ever.player_name}
                  </div>
                  <div className="text-2xl font-bold text-emerald-600 mt-1">
                    {(gameRecords.peak_skill_ever.value as number).toFixed(0)}
                  </div>
                </Link>
              )}
              {gameRecords.trough_skill_ever && (
                <Link
                  href={`/players/${gameRecords.trough_skill_ever.player_id}`}
                  className="group bg-gradient-to-br from-red-50 to-orange-50 border border-red-200 rounded-xl p-4 hover:shadow-lg hover:border-red-300 transition-all duration-200"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">📉</span>
                    <span className="text-xs font-semibold text-red-700 uppercase tracking-wide">Lowest Skill</span>
                  </div>
                  <div className="font-bold text-gray-900 group-hover:text-red-700 transition-colors">
                    {gameRecords.trough_skill_ever.player_name}
                  </div>
                  <div className="text-2xl font-bold text-red-600 mt-1">
                    {(gameRecords.trough_skill_ever.value as number).toFixed(0)}
                  </div>
                </Link>
              )}
              {gameRecords.most_games && (
                <Link
                  href={`/players/${gameRecords.most_games.player_id}`}
                  className="group bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 hover:shadow-lg hover:border-blue-300 transition-all duration-200"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">🎮</span>
                    <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Most Games</span>
                  </div>
                  <div className="font-bold text-gray-900 group-hover:text-blue-700 transition-colors">
                    {gameRecords.most_games.player_name}
                  </div>
                  <div className="text-2xl font-bold text-blue-600 mt-1">
                    {gameRecords.most_games.value}
                  </div>
                </Link>
              )}
              {gameRecords.highest_win_rate && (
                <Link
                  href={`/players/${gameRecords.highest_win_rate.player_id}`}
                  className="group bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 rounded-xl p-4 hover:shadow-lg hover:border-amber-300 transition-all duration-200"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">👑</span>
                    <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Best Win %</span>
                  </div>
                  <div className="font-bold text-gray-900 group-hover:text-amber-700 transition-colors">
                    {gameRecords.highest_win_rate.player_name}
                  </div>
                  <div className="text-2xl font-bold text-amber-600 mt-1">
                    {(gameRecords.highest_win_rate.value as number).toFixed(0)}%
                  </div>
                </Link>
              )}
              {gameRecords.longest_win_streak && (
                <Link
                  href={`/players/${gameRecords.longest_win_streak.player_id}`}
                  className="group bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4 hover:shadow-lg hover:border-green-300 transition-all duration-200"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">🔥</span>
                    <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">Win Streak</span>
                  </div>
                  <div className="font-bold text-gray-900 group-hover:text-green-700 transition-colors">
                    {gameRecords.longest_win_streak.player_name}
                  </div>
                  <div className="text-2xl font-bold text-green-600 mt-1">
                    {gameRecords.longest_win_streak.value}
                  </div>
                </Link>
              )}
              {gameRecords.longest_lose_streak && (
                <Link
                  href={`/players/${gameRecords.longest_lose_streak.player_id}`}
                  className="group bg-gradient-to-br from-rose-50 to-pink-50 border border-rose-200 rounded-xl p-4 hover:shadow-lg hover:border-rose-300 transition-all duration-200"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">💔</span>
                    <span className="text-xs font-semibold text-rose-700 uppercase tracking-wide">Lose Streak</span>
                  </div>
                  <div className="font-bold text-gray-900 group-hover:text-rose-700 transition-colors">
                    {gameRecords.longest_lose_streak.player_name}
                  </div>
                  <div className="text-2xl font-bold text-rose-600 mt-1">
                    {gameRecords.longest_lose_streak.value}
                  </div>
                </Link>
              )}
              {gameRecords.longest_unbeaten_streak && (
                <Link
                  href={`/players/${gameRecords.longest_unbeaten_streak.player_id}`}
                  className="group bg-gradient-to-br from-cyan-50 to-teal-50 border border-cyan-200 rounded-xl p-4 hover:shadow-lg hover:border-cyan-300 transition-all duration-200"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">🛡️</span>
                    <span className="text-xs font-semibold text-cyan-700 uppercase tracking-wide">Unbeaten</span>
                  </div>
                  <div className="font-bold text-gray-900 group-hover:text-cyan-700 transition-colors">
                    {gameRecords.longest_unbeaten_streak.player_name}
                  </div>
                  <div className="text-2xl font-bold text-cyan-600 mt-1">
                    {gameRecords.longest_unbeaten_streak.value}
                  </div>
                </Link>
              )}
              {gameRecords.biggest_skill_gain && (
                <Link
                  href={`/players/${gameRecords.biggest_skill_gain.player_id}`}
                  className="group bg-gradient-to-br from-lime-50 to-green-50 border border-lime-200 rounded-xl p-4 hover:shadow-lg hover:border-lime-300 transition-all duration-200"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">🚀</span>
                    <span className="text-xs font-semibold text-lime-700 uppercase tracking-wide">Biggest Gain</span>
                  </div>
                  <div className="font-bold text-gray-900 group-hover:text-lime-700 transition-colors">
                    {gameRecords.biggest_skill_gain.player_name}
                  </div>
                  <div className="text-2xl font-bold text-lime-600 mt-1">
                    +{(gameRecords.biggest_skill_gain.value as number).toFixed(0)}
                  </div>
                </Link>
              )}
              {gameRecords.biggest_skill_loss && (
                <Link
                  href={`/players/${gameRecords.biggest_skill_loss.player_id}`}
                  className="group bg-gradient-to-br from-orange-50 to-red-50 border border-orange-200 rounded-xl p-4 hover:shadow-lg hover:border-orange-300 transition-all duration-200"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">💫</span>
                    <span className="text-xs font-semibold text-orange-700 uppercase tracking-wide">Biggest Loss</span>
                  </div>
                  <div className="font-bold text-gray-900 group-hover:text-orange-700 transition-colors">
                    {gameRecords.biggest_skill_loss.player_name}
                  </div>
                  <div className="text-2xl font-bold text-orange-600 mt-1">
                    -{(gameRecords.biggest_skill_loss.value as number).toFixed(0)}
                  </div>
                </Link>
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