"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Game {
  id: number;
  name: string;
}

interface LeaderboardEntry {
  player_id: number;
  player_name: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
}

export default function Home() {
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGame, setSelectedGame] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

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
      fetch(`/api/leaderboard?game_id=${selectedGame}`)
        .then((res) => res.json())
        .then((data) => {
          setLeaderboard(data);
          setLoading(false);
        });
    }
  }, [selectedGame]);

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
              {game.name.charAt(0).toUpperCase() + game.name.slice(1).replace("-", " ")}
            </option>
          ))}
        </select>
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
                return (
                  <tr key={entry.player_id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {entry.player_name}
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