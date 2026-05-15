"use client";

import { useState } from "react";
import Link from "next/link";
import type { LeaderboardEntry, Game } from "@/lib/types";
import type { GameStats, GameRecords } from "@/lib/data";

interface LeaderboardClientProps {
  games: Game[];
  initialGameId: number;
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
  games,
  initialGameId,
  initialLeaderboard,
  initialStats,
  initialRecords,
}: LeaderboardClientProps) {
  const [selectedGame, setSelectedGame] = useState(initialGameId);
  const [leaderboard, setLeaderboard] = useState(initialLeaderboard);
  const [gameStats, setGameStats] = useState(initialStats);
  const [gameRecords, setGameRecords] = useState(initialRecords);
  const [loading, setLoading] = useState(false);
  const [showRetired, setShowRetired] = useState(false);

  const selectedGameData = games.find(g => g.id === selectedGame);

  const formatGameName = (name: string) => {
    return name.charAt(0).toUpperCase() + name.slice(1).replace("-", " ");
  };

  const handleGameChange = async (newGameId: number) => {
    setSelectedGame(newGameId);
    setLoading(true);
    try {
      const [leaderboardData, statsData, recordsData] = await Promise.all([
        fetch(`/api/leaderboard?game_id=${newGameId}&include_retired=${showRetired}`).then(res => res.json()),
        fetch(`/api/game-stats?game_id=${newGameId}`).then(res => res.json()),
        fetch(`/api/game-records?game_id=${newGameId}`).then(res => res.json())
      ]);
      setLeaderboard(leaderboardData);
      setGameStats(statsData);
      setGameRecords(recordsData);
    } finally {
      setLoading(false);
    }
  };

  const handleRetiredToggle = async (show: boolean) => {
    setShowRetired(show);
    setLoading(true);
    try {
      const leaderboardData = await fetch(`/api/leaderboard?game_id=${selectedGame}&include_retired=${show}`).then(res => res.json());
      setLeaderboard(leaderboardData);
    } finally {
      setLoading(false);
    }
  };

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
            href={selectedGame ? `/matches/new?game=${selectedGame}` : "/matches/new"}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
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

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Game
        </label>
        <select
          value={selectedGame || ""}
          onChange={(e) => handleGameChange(Number(e.target.value))}
          className="block w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {games.map((game) => (
            <option key={game.id} value={game.id}>
              {formatGameName(game.name)}
            </option>
          ))}
        </select>
      </div>

      {gameStats && (
        <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Matches Played</div>
            <div className="text-2xl font-bold text-gray-900">{gameStats.total_matches}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Active Players</div>
            <div className="text-2xl font-bold text-gray-900">{gameStats.active_players}</div>
            {gameStats.total_players > gameStats.active_players && (
              <div className="text-xs text-gray-400">{gameStats.total_players} total</div>
            )}
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Team 1 Points</div>
            <div className="text-2xl font-bold text-blue-600">{gameStats.team0_points}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Team 2 Points</div>
            <div className="text-2xl font-bold text-red-600">{gameStats.team1_points}</div>
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
            onChange={(e) => handleRetiredToggle(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          Show retired players
        </label>
      </div>

      {loading ? (
        <div className="text-gray-500">Loading...</div>
      ) : leaderboard.length === 0 ? (
        <div className="text-gray-500">
          No players on the leaderboard yet.{" "}
          <Link href="/players" className="text-blue-600 hover:underline">
            Add players
          </Link>{" "}
          and record some matches!
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rank
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Player
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rating
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Trend
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  W/L/D
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Win Rate
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {leaderboard.map((entry, index) => {
                const totalGames = entry.wins + entry.losses + entry.draws;
                const winRate = totalGames > 0 ? ((entry.wins / totalGames) * 100).toFixed(0) : "-";
                const isRetired = entry.status === 'retired';
                return (
                  <tr key={entry.player_id} className={isRetired ? 'bg-gray-50 hover:bg-gray-100' : 'hover:bg-gray-50'}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {index + 1}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${isRetired ? 'text-gray-500' : 'text-gray-900'}`}>
                      <Link
                        href={`/players/${entry.player_id}`}
                        className={`hover:underline ${isRetired ? 'line-through' : ''}`}
                      >
                        {entry.player_name}
                      </Link>
                      {isRetired && <span className="ml-2 text-xs text-gray-400">(Retired)</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {entry.elo.toFixed(3)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <TrendSparkline deltas={entry.trend} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {entry.wins} / {entry.losses} / {entry.draws}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {totalGames > 0 ? `${winRate}%` : "-"}
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