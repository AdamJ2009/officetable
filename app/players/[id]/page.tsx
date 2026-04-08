"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface GameStat {
  game_id: number;
  game_name: string;
  score_type: string;
  score_value: number;
  elo: number;
  total_matches: number;
  wins: number;
  losses: number;
  draws: number;
  points_scored: number;
  points_conceded: number;
}

interface Opponent {
  player_name: string;
  score: number;
  team: number;
}

interface RecentMatch {
  id: number;
  game_id: number;
  played_at: string;
  notes: string | null;
  game_name: string;
  team: number;
  score: number;
  elo_before: number;
  elo_after: number;
  opponents: Opponent[];
  opponent_score: number;
  result: 'win' | 'loss' | 'draw';
}

interface PlayerStats {
  player: {
    id: number;
    name: string;
    status: string;
    created_at: string;
  };
  overallStats: {
    total_matches: number;
    total_wins: number;
    total_losses: number;
    total_draws: number;
    total_points_scored: number;
    total_points_conceded: number;
  };
  gameStats: GameStat[];
  recentMatches: RecentMatch[];
}

export default function PlayerProfilePage() {
  const params = useParams();
  const router = useRouter();
  const playerId = params.id as string;
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/player-stats?player_id=${playerId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Player not found");
        return res.json();
      })
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [playerId]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const formatRatingChange = (before: number, after: number) => {
    const diff = after - before;
    const sign = diff >= 0 ? "+" : "";
    return `${sign}${diff.toFixed(3)}`;
  };

  if (loading) {
    return (
      <div className="text-gray-500 p-8">
        Loading...
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="p-8">
        <div className="text-red-600 mb-4">{error || "Player not found"}</div>
        <button
          onClick={() => router.push("/players")}
          className="text-blue-600 hover:underline"
        >
          ← Back to Players
        </button>
      </div>
    );
  }

  const winRate = stats.overallStats.total_matches > 0
    ? ((stats.overallStats.total_wins / stats.overallStats.total_matches) * 100).toFixed(1)
    : "0.0";

  const pointDiff = stats.overallStats.total_points_scored - stats.overallStats.total_points_conceded;

  return (
    <div>
      <button
        onClick={() => router.push("/players")}
        className="text-blue-600 hover:underline mb-4"
      >
        ← Back to Players
      </button>

      <div className="flex items-center gap-4 mb-8">
        <h1 className="text-3xl font-bold">
          {stats.player.name}
          {stats.player.status === "retired" && (
            <span className="text-lg font-normal text-gray-500 ml-2">(Retired)</span>
          )}
        </h1>
        <span className="text-sm text-gray-500">
          Player since {formatDate(stats.player.created_at)}
        </span>
      </div>

      {/* Overall Stats */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Overall Statistics</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Matches</div>
            <div className="text-2xl font-bold text-gray-900">{stats.overallStats.total_matches}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Record</div>
            <div className="text-2xl font-bold text-gray-900">
              <span className="text-green-600">{stats.overallStats.total_wins}</span>
              <span className="text-gray-400 mx-1">/</span>
              <span className="text-red-600">{stats.overallStats.total_losses}</span>
              <span className="text-gray-400 mx-1">/</span>
              <span className="text-gray-600">{stats.overallStats.total_draws}</span>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Win Rate</div>
            <div className="text-2xl font-bold text-gray-900">{winRate}%</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Points For</div>
            <div className="text-2xl font-bold text-green-600">{stats.overallStats.total_points_scored}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Points Against</div>
            <div className="text-2xl font-bold text-red-600">{stats.overallStats.total_points_conceded}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Point Diff</div>
            <div className={`text-2xl font-bold ${pointDiff >= 0 ? "text-green-600" : "text-red-600"}`}>
              {pointDiff >= 0 ? "+" : ""}{pointDiff}
            </div>
          </div>
        </div>
      </div>

      {/* Game-by-Game Stats */}
      {stats.gameStats.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Game Statistics</h2>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Game</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rating</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">W/L/D</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Win Rate</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Points</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {stats.gameStats.map((game) => {
                  const totalGames = game.wins + game.losses + game.draws;
                  const winRate = totalGames > 0 ? ((game.wins / totalGames) * 100).toFixed(1) : "0.0";
                  const pointDiff = game.points_scored - game.points_conceded;
                  return (
                    <tr key={game.game_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Link
                          href={`/?game=${game.game_id}`}
                          className="text-blue-600 hover:underline font-medium"
                        >
                          {game.game_name.charAt(0).toUpperCase() + game.game_name.slice(1).replace("-", " ")}
                        </Link>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">
                        {game.elo.toFixed(3)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className="text-green-600">{game.wins}</span>
                        <span className="text-gray-400 mx-1">/</span>
                        <span className="text-red-600">{game.losses}</span>
                        <span className="text-gray-400 mx-1">/</span>
                        <span className="text-gray-600">{game.draws}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {winRate}%
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className="text-green-600">{game.points_scored}</span>
                        <span className="text-gray-400 mx-1">/</span>
                        <span className="text-red-600">{game.points_conceded}</span>
                        <span className={`ml-2 ${pointDiff >= 0 ? "text-green-600" : "text-red-600"}`}>
                          ({pointDiff >= 0 ? "+" : ""}{pointDiff})
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Matches */}
      {stats.recentMatches.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Recent Matches</h2>
          <div className="space-y-3">
            {stats.recentMatches.map((match) => {
              const resultColors = {
                win: "bg-green-50 border-green-200",
                loss: "bg-red-50 border-red-200",
                draw: "bg-gray-50 border-gray-200"
              };
              const resultBadges = {
                win: "bg-green-100 text-green-800",
                loss: "bg-red-100 text-red-800",
                draw: "bg-gray-100 text-gray-800"
              };
              const eloChange = match.elo_after - match.elo_before;

              return (
                <div
                  key={match.id}
                  className={`rounded-lg border ${resultColors[match.result]} p-4`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <Link
                        href={`/matches`}
                        className="font-medium text-gray-900 hover:underline"
                      >
                        {match.game_name.charAt(0).toUpperCase() + match.game_name.slice(1).replace("-", " ")}
                      </Link>
                      <div className="text-sm text-gray-500">{formatDateTime(match.played_at)}</div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${resultBadges[match.result]}`}>
                      {match.result.toUpperCase()}
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-lg font-bold ${match.team === 0 ? "text-blue-600" : "text-red-600"}`}>
                          Team {match.team + 1}
                        </span>
                        <span className="text-xl font-bold">{match.score}</span>
                      </div>
                      <div className="text-sm text-gray-600">
                        vs {match.opponents.map(o => o.player_name).join(", ")} ({match.opponent_score})
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-500">Elo change</div>
                      <div className={`font-mono ${eloChange >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatRatingChange(match.elo_before, match.elo_after)}
                      </div>
                    </div>
                  </div>

                  {match.notes && (
                    <div className="mt-2 text-sm text-gray-600 italic">
                      {match.notes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}