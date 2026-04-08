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
  records: {
    highest_elo: number;
    lowest_elo: number;
    longest_win_streak: number;
    longest_lose_streak: number;
    longest_unbeaten_streak: number;
    biggest_win: number;
    biggest_loss: number;
  };
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

  const formatGameName = (name: string) => {
    return name.charAt(0).toUpperCase() + name.slice(1).replace("-", " ");
  };

  // Group matches by game
  const matchesByGame: Record<number, RecentMatch[]> = {};
  if (stats) {
    for (const match of stats.recentMatches) {
      if (!matchesByGame[match.game_id]) {
        matchesByGame[match.game_id] = [];
      }
      matchesByGame[match.game_id].push(match);
    }
  }

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

      {/* Game sections */}
      {stats.gameStats.length === 0 ? (
        <div className="text-gray-500">
          No games played yet.
        </div>
      ) : (
        <div className="space-y-8">
          {stats.gameStats.map((game) => {
            const totalGames = game.wins + game.losses + game.draws;
            const winRate = totalGames > 0 ? ((game.wins / totalGames) * 100).toFixed(1) : "0.0";
            const pointDiff = game.points_scored - game.points_conceded;
            const gameMatches = matchesByGame[game.game_id] || [];

            return (
              <div key={game.game_id} className="bg-white rounded-lg shadow overflow-hidden">
                {/* Game header */}
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-gray-900">
                      <Link
                        href={`/?game=${game.game_id}`}
                        className="hover:underline"
                      >
                        {formatGameName(game.game_name)}
                      </Link>
                    </h2>
                    <div className="text-sm text-gray-500">
                      {game.score_type === 'best_of' ? `Best of ${game.score_value}` : `First to ${game.score_value}`} points
                    </div>
                  </div>
                </div>

                {/* Game stats */}
                <div className="px-6 py-4 border-b border-gray-200">
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
                    <div>
                      <div className="text-sm text-gray-500">Rating</div>
                      <div className="text-xl font-bold font-mono">{game.elo.toFixed(3)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Matches</div>
                      <div className="text-xl font-bold">{game.total_matches}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Record</div>
                      <div className="text-xl font-bold">
                        <span className="text-green-600">{game.wins}</span>
                        <span className="text-gray-400">/</span>
                        <span className="text-red-600">{game.losses}</span>
                        <span className="text-gray-400">/</span>
                        <span className="text-gray-600">{game.draws}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Win Rate</div>
                      <div className="text-xl font-bold">{winRate}%</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Points</div>
                      <div className="text-xl font-bold">
                        <span className="text-green-600">{game.points_scored}</span>
                        <span className="text-gray-400">/</span>
                        <span className="text-red-600">{game.points_conceded}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Point Diff</div>
                      <div className={`text-xl font-bold ${pointDiff >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {pointDiff >= 0 ? "+" : ""}{pointDiff}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Records */}
                <div className="px-6 py-3 border-b border-gray-200 bg-gray-50">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Records</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">Peak Rating:</span>{" "}
                      <span className="font-semibold font-mono text-green-700">{game.records.highest_elo.toFixed(3)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Lowest:</span>{" "}
                      <span className="font-semibold font-mono text-red-700">{game.records.lowest_elo.toFixed(3)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Best Win Streak:</span>{" "}
                      <span className="font-semibold text-green-700">{game.records.longest_win_streak}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Worst Lose Streak:</span>{" "}
                      <span className="font-semibold text-red-700">{game.records.longest_lose_streak}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Unbeaten Run:</span>{" "}
                      <span className="font-semibold text-blue-700">{game.records.longest_unbeaten_streak}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Biggest Win:</span>{" "}
                      <span className="font-semibold text-green-700">+{game.records.biggest_win}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Heaviest Loss:</span>{" "}
                      <span className="font-semibold text-red-700">-{game.records.biggest_loss}</span>
                    </div>
                  </div>
                </div>

                {/* Recent matches for this game */}
                {gameMatches.length > 0 && (
                  <div className="divide-y divide-gray-100">
                    <div className="px-6 py-2 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Recent Matches
                    </div>
                    {gameMatches.slice(0, 5).map((match) => {
                      const resultColors = {
                        win: "bg-green-50 border-l-4 border-l-green-400",
                        loss: "bg-red-50 border-l-4 border-l-red-400",
                        draw: "bg-gray-50 border-l-4 border-l-gray-400"
                      };
                      const resultText = {
                        win: "text-green-700",
                        loss: "text-red-700",
                        draw: "text-gray-700"
                      };
                      const eloChange = match.elo_after - match.elo_before;

                      return (
                        <div key={match.id} className={`px-6 py-3 ${resultColors[match.result]}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <span className={`font-semibold ${resultText[match.result]} uppercase text-sm`}>
                                {match.result}
                              </span>
                              <span className="text-gray-900">
                                <span className="font-bold">{match.score}</span>
                                <span className="text-gray-400 mx-1">-</span>
                                <span className="font-bold">{match.opponent_score}</span>
                              </span>
                              <span className="text-gray-600 text-sm">
                                vs {match.opponents.map(o => o.player_name).join(", ")}
                              </span>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className={`font-mono text-sm ${eloChange >= 0 ? "text-green-600" : "text-red-600"}`}>
                                {formatRatingChange(match.elo_before, match.elo_after)}
                              </div>
                              <div className="text-sm text-gray-500 w-24 text-right">
                                {formatDateTime(match.played_at)}
                              </div>
                            </div>
                          </div>
                          {match.notes && (
                            <div className="mt-1 text-sm text-gray-500 italic">
                              {match.notes}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
