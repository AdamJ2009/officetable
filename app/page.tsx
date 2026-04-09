"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Game {
  id: number;
  name: string;
  score_type: 'best_of' | 'first_to';
  score_value: number;
}

interface LeaderboardEntry {
  player_id: number;
  player_name: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  status?: 'active' | 'retired';
}

interface GameStats {
  total_matches: number;
  team0_points: number;
  team1_points: number;
  active_players: number;
  total_players: number;
}

export default function Home() {
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGame, setSelectedGame] = useState<number | null>(null);
  const [selectedGameData, setSelectedGameData] = useState<Game | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [gameStats, setGameStats] = useState<GameStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRetired, setShowRetired] = useState(false);

  useEffect(() => {
    fetch("/api/games")
      .then((res) => res.json())
      .then((data: Game[]) => {
        setGames(data);
        if (data.length > 0) {
          setSelectedGame(data[0].id);
        }
      });
  }, []);

  useEffect(() => {
    if (selectedGame) {
      setLoading(true);
      Promise.all([
        fetch(`/api/leaderboard?game_id=${selectedGame}&include_retired=${showRetired}`).then(res => res.json()),
        fetch(`/api/game-stats?game_id=${selectedGame}`).then(res => res.json())
      ]).then(([leaderboardData, statsData]) => {
        setLeaderboard(leaderboardData);
        setGameStats(statsData);
        setLoading(false);
      });
    }
  }, [selectedGame, showRetired]);

  useEffect(() => {
    if (selectedGame) {
      setSelectedGameData(games.find(g => g.id === selectedGame) || null);
    }
  }, [selectedGame, games]);

  const formatGameName = (name: string) => {
    return name.charAt(0).toUpperCase() + name.slice(1).replace("-", " ");
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
            href="/matches/new"
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
          onChange={(e) => setSelectedGame(Number(e.target.value))}
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

      <div className="mb-4">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={showRetired}
            onChange={(e) => setShowRetired(e.target.checked)}
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