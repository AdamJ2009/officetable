"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";

interface EloHistoryPoint {
  elo: number;
  date: string;
}

interface SkillGainRecord {
  gain: number;
  date: string;
  score: number;
  opponent_score: number;
  opponents: string[];
  teammates: string[];
}

interface SkillLossRecord {
  loss: number;
  date: string;
  score: number;
  opponent_score: number;
  opponents: string[];
  teammates: string[];
}

interface GameRecords {
  highest_elo: number;
  highest_elo_date: string | null;
  lowest_elo: number;
  lowest_elo_date: string | null;
  longest_win_streak: number;
  longest_win_streak_start: string | null;
  longest_win_streak_end: string | null;
  longest_lose_streak: number;
  longest_lose_streak_start: string | null;
  longest_lose_streak_end: string | null;
  longest_unbeaten_streak: number;
  longest_unbeaten_streak_start: string | null;
  longest_unbeaten_streak_end: string | null;
  biggest_gain: SkillGainRecord | null;
  biggest_loss: SkillLossRecord | null;
}

interface Achievement {
  achievement_id: number;
  achievement_name: string;
  achievement_description: string;
  achievement_category: string;
  achievement_icon: string | null;
  count: number;
  first_earned_at: string;
}

interface GameStat {
  game_id: number;
  game_name: string;
  score_type: string;
  score_value: number;
  image_url?: string | null;
  elo: number;
  total_matches: number;
  wins: number;
  losses: number;
  draws: number;
  points_scored: number;
  points_conceded: number;
  records: GameRecords;
  elo_history: EloHistoryPoint[];
  achievements: Achievement[];
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
  teammates: string[];
  opponent_score: number;
  result: 'win' | 'loss' | 'draw';
}

interface HeadToHeadOpponent {
  opponent_id: number;
  opponent_name: string;
  game_id: number;
  game_name: string;
  wins: number;
  losses: number;
  draws: number;
  total_matches: number;
  net_skill: number;
  current_streak: string;
  last_played: string;
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

function StreakBadge({ streak }: { streak: string }) {
  if (!streak || streak.length < 2) return null;
  const type = streak[0];
  const count = parseInt(streak.slice(1), 10);
  if (isNaN(count) || count === 0) return null;

  const config = {
    W: { emoji: '🔥', bg: 'bg-green-100 text-green-700', label: 'Win' },
    L: { emoji: '❄️', bg: 'bg-red-100 text-red-700', label: 'Loss' },
    D: { emoji: '➖', bg: 'bg-gray-100 text-gray-600', label: 'Draw' },
  }[type] || { emoji: '•', bg: 'bg-gray-100 text-gray-600', label: streak };

  return (
    <span title="Current streak against player" className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-semibold ${config.bg}`}>
      <span>{config.emoji}</span>{count}
    </span>
  );
}

function WinLossBar({ wins, losses, draws }: { wins: number; losses: number; draws: number }) {
  const total = wins + losses + draws;
  if (total === 0) return null;
  const winPct = (wins / total) * 100;
  const lossPct = (losses / total) * 100;
  const drawPct = (draws / total) * 100;

  return (
    <div className="h-2.5 rounded-full overflow-hidden flex bg-gray-200">
      {winPct > 0 && (
        <div className="bg-gradient-to-r from-green-400 to-emerald-500" style={{ width: `${winPct}%` }} />
      )}
      {drawPct > 0 && (
        <div className="bg-gray-400" style={{ width: `${drawPct}%` }} />
      )}
      {lossPct > 0 && (
        <div className="bg-gradient-to-r from-red-400 to-rose-500" style={{ width: `${lossPct}%` }} />
      )}
    </div>
  );
}

function RivalsSection({ gameId, gameName, playerId, opponents, isLoading }: {
  gameId: number;
  gameName: string;
  playerId: number;
  opponents: HeadToHeadOpponent[];
  isLoading: boolean;
}) {
  const formatGameName = (name: string) => name.charAt(0).toUpperCase() + name.slice(1).replace("-", " ");

  if (isLoading) {
    return (
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">⚔️</span>
          <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Rivals</span>
        </div>
        <div className="text-sm text-gray-400 animate-pulse">Loading rival data...</div>
      </div>
    );
  }

  if (opponents.length === 0) {
    return null;
  }

  // Find nemesis (worst win rate, min 5 matches) and bunny (best win rate, min 5 matches)
  const qualified = opponents.filter(o => o.total_matches >= 5);
  const nemesis = qualified.length > 0
    ? qualified.reduce((worst, curr) => {
        const worstRate = worst.wins / worst.total_matches;
        const currRate = curr.wins / curr.total_matches;
        return currRate < worstRate ? curr : worst;
      })
    : null;
  const bunny = qualified.length > 0
    ? qualified.reduce((best, curr) => {
        const bestRate = best.wins / best.total_matches;
        const currRate = curr.wins / curr.total_matches;
        return currRate > bestRate ? curr : best;
      })
    : null;

  return (
    <div className="border-t border-gray-100">
      <div className="px-6 py-3 bg-gradient-to-r from-indigo-50 to-purple-50">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚔️</span>
          <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Rivals</span>
          <span className="text-xs text-gray-400 ml-2">{opponents.length} opponent{opponents.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Nemesis & Bunny highlights */}
      {(nemesis || bunny) && (
        <div className="px-6 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gradient-to-r from-indigo-50/50 to-purple-50/50">
          {nemesis && (
            <Link
              href={`/matches?player_ids=${playerId},${nemesis.opponent_id}&game_id=${gameId}`}
              className="group bg-white rounded-xl border border-red-200 p-4 hover:shadow-lg hover:border-red-300 transition-all"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">🎯</span>
                <span className="text-xs font-bold text-red-600 uppercase tracking-wider">Nemesis</span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Link
                    href={`/players/${nemesis.opponent_id}`}
                    className="font-bold text-gray-900 group-hover:text-red-600 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {nemesis.opponent_name}
                  </Link>
                  <div className="text-sm text-gray-500 mt-0.5">
                    <span className="text-green-600 font-semibold">{nemesis.wins}</span>
                    <span className="text-gray-300"> - </span>
                    <span className="text-red-600 font-semibold">{nemesis.losses}</span>
                    <span className="text-gray-300"> - </span>
                    <span className="text-gray-500">{nemesis.draws}</span>
                    <span className="text-gray-400 ml-1 text-xs">
                      ({((nemesis.wins / nemesis.total_matches) * 100).toFixed(0)}% WR)
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-mono text-sm font-bold ${nemesis.net_skill >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {nemesis.net_skill >= 0 ? '+' : ''}{nemesis.net_skill.toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-400">net skill</div>
                </div>
              </div>
            </Link>
          )}
          {bunny && (
            <Link
              href={`/matches?player_ids=${playerId},${bunny.opponent_id}&game_id=${gameId}`}
              className="group bg-white rounded-xl border border-green-200 p-4 hover:shadow-lg hover:border-green-300 transition-all"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">🐇</span>
                <span className="text-xs font-bold text-green-600 uppercase tracking-wider">Bunny</span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Link
                    href={`/players/${bunny.opponent_id}`}
                    className="font-bold text-gray-900 group-hover:text-green-600 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {bunny.opponent_name}
                  </Link>
                  <div className="text-sm text-gray-500 mt-0.5">
                    <span className="text-green-600 font-semibold">{bunny.wins}</span>
                    <span className="text-gray-300"> - </span>
                    <span className="text-red-600 font-semibold">{bunny.losses}</span>
                    <span className="text-gray-300"> - </span>
                    <span className="text-gray-500">{bunny.draws}</span>
                    <span className="text-gray-400 ml-1 text-xs">
                      ({((bunny.wins / bunny.total_matches) * 100).toFixed(0)}% WR)
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-mono text-sm font-bold ${bunny.net_skill >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {bunny.net_skill >= 0 ? '+' : ''}{bunny.net_skill.toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-400">net skill</div>
                </div>
              </div>
            </Link>
          )}
        </div>
      )}

      {/* Rivalry cards grid */}
      <div className="px-6 py-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {opponents.map((opp) => {
          const totalGames = opp.wins + opp.losses + opp.draws;
          const winRate = totalGames > 0 ? (opp.wins / totalGames) * 100 : 0;
          const isPositive = opp.net_skill > 0;
          const isNegative = opp.net_skill < 0;
          const borderColor = isPositive ? 'border-green-300 hover:border-green-400' : isNegative ? 'border-red-300 hover:border-red-400' : 'border-gray-200 hover:border-gray-300';
          const borderLeft = isPositive ? 'border-l-green-500' : isNegative ? 'border-l-red-500' : 'border-l-gray-400';
          const daysAgo = Math.floor((Date.now() - new Date(opp.last_played).getTime()) / (1000 * 60 * 60 * 24));
          const lastPlayedText = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : daysAgo < 30 ? `${daysAgo}d ago` : daysAgo < 365 ? `${Math.floor(daysAgo / 30)}mo ago` : `${Math.floor(daysAgo / 365)}y ago`;

          return (
            <Link
              key={`${opp.opponent_id}-${opp.game_id}`}
              href={`/matches?player_ids=${playerId},${opp.opponent_id}&game_id=${gameId}`}
              className={`group bg-white rounded-xl border ${borderColor} border-l-4 ${borderLeft} p-3 hover:shadow-lg transition-all duration-200`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold bg-gradient-to-br ${getPlayerGradient(opp.opponent_name)} text-white shadow-sm`}>
                    {opp.opponent_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900 text-sm group-hover:text-primary transition-colors">
                      {opp.opponent_name}
                    </div>
                    <div className="text-xs text-gray-400">{lastPlayedText}</div>
                  </div>
                </div>
                <StreakBadge streak={opp.current_streak} />
              </div>

              {/* Win/Loss/Draw bar */}
              <WinLossBar wins={opp.wins} losses={opp.losses} draws={opp.draws} />

              {/* Stats row */}
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-green-600 font-semibold">{opp.wins}</span>
                  <span className="text-gray-300">-</span>
                  <span className="text-red-600 font-semibold">{opp.losses}</span>
                  <span className="text-gray-300">-</span>
                  <span className="text-gray-500">{opp.draws}</span>
                  <span className="text-gray-400 text-xs">({winRate.toFixed(0)}%)</span>
                </div>
                <div className={`font-mono text-xs font-bold ${isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-gray-400'}`}>
                  {opp.net_skill >= 0 ? '+' : ''}{opp.net_skill.toFixed(1)} skill
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// Generate a consistent gradient based on player name
function getPlayerGradient(name: string): string {
  const gradients = [
    'from-blue-500 to-indigo-600',
    'from-emerald-500 to-teal-600',
    'from-purple-500 to-violet-600',
    'from-orange-500 to-amber-600',
    'from-pink-500 to-rose-600',
    'from-cyan-500 to-sky-600',
    'from-fuchsia-500 to-purple-600',
    'from-lime-500 to-green-600',
  ];
  const index = name.charCodeAt(0) % gradients.length;
  return gradients[index];
}

export default function PlayerProfilePage() {
  const params = useParams();
  const router = useRouter();
  const playerId = params.id as string;
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedGames, setExpandedGames] = useState<Set<number>>(new Set());
  const [headToHeadData, setHeadToHeadData] = useState<Map<number, HeadToHeadOpponent[]>>(new Map());
  const [headToHeadLoading, setHeadToHeadLoading] = useState<Set<number>>(new Set());

  // Calculate career highlights across all games
  const getCareerHighlights = () => {
    if (!stats || stats.gameStats.length === 0) return null;

    const highlights: { icon: string; label: string; value: string; sublabel?: string }[] = [];

    // Find highest rating across all games
    const highestRating = stats.gameStats.reduce((max, game) =>
      game.records.highest_elo > max.elo ? { elo: game.records.highest_elo, game: game.game_name, date: game.records.highest_elo_date } : max
    , { elo: 0, game: '', date: null as string | null });

    if (highestRating.elo > 0) {
      highlights.push({
        icon: '🏆',
        label: 'Peak Rating',
        value: highestRating.elo.toFixed(3),
        sublabel: `in ${formatGameName(highestRating.game)}`
      });
    }

    // Find longest win streak
    const longestStreak = stats.gameStats.reduce((max, game) =>
      game.records.longest_win_streak > max.streak ? { streak: game.records.longest_win_streak, game: game.game_name } : max
    , { streak: 0, game: '' });

    if (longestStreak.streak >= 3) {
      highlights.push({
        icon: '🔥',
        label: 'Best Win Streak',
        value: `${longestStreak.streak} games`,
        sublabel: `in ${formatGameName(longestStreak.game)}`
      });
    }

    // Find longest unbeaten run
    const longestUnbeaten = stats.gameStats.reduce((max, game) =>
      game.records.longest_unbeaten_streak > max.streak ? { streak: game.records.longest_unbeaten_streak, game: game.game_name } : max
    , { streak: 0, game: '' });

    if (longestUnbeaten.streak >= 5) {
      highlights.push({
        icon: '💪',
        label: 'Longest Unbeaten Run',
        value: `${longestUnbeaten.streak} games`,
        sublabel: `in ${formatGameName(longestUnbeaten.game)}`
      });
    }

    // Total achievements count
    const totalAchievements = stats.gameStats.reduce((sum, game) => sum + (game.achievements?.length || 0), 0);
    if (totalAchievements > 0) {
      highlights.push({
        icon: '🏅',
        label: 'Achievements',
        value: `${totalAchievements}`,
        sublabel: `across ${stats.gameStats.length} ${stats.gameStats.length === 1 ? 'game' : 'games'}`
      });
    }

    // Find biggest skill gain
    const biggestGain = stats.gameStats.reduce((max, game) =>
      (game.records.biggest_gain?.gain || 0) > max.gain ? { gain: game.records.biggest_gain!.gain, game: game.game_name } : max
    , { gain: 0, game: '' });

    if (biggestGain.gain > 0) {
      highlights.push({
        icon: '⚡',
        label: 'Best Victory',
        value: `+${biggestGain.gain.toFixed(3)}`,
        sublabel: `in ${formatGameName(biggestGain.game)}`
      });
    }

    return highlights.length > 0 ? highlights : null;
  };

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

  const toggleGame = (gameId: number) => {
    setExpandedGames((prev) => {
      const next = new Set(prev);
      const isExpanding = !next.has(gameId);
      if (next.has(gameId)) {
        next.delete(gameId);
      } else {
        next.add(gameId);
      }

      // Fetch head-to-head data when expanding (if not already loaded)
      if (isExpanding && !headToHeadData.has(gameId) && !headToHeadLoading.has(gameId)) {
        setHeadToHeadLoading(prev2 => new Set(prev2).add(gameId));
        fetch(`/api/head-to-head?player_id=${playerId}&game_id=${gameId}`)
          .then(res => res.json())
          .then(data => {
            setHeadToHeadData(prev3 => {
              const next3 = new Map(prev3);
              next3.set(gameId, data.opponents || []);
              return next3;
            });
          })
          .catch(err => console.error('Failed to load head-to-head:', err))
          .finally(() => {
            setHeadToHeadLoading(prev2 => {
              const next2 = new Set(prev2);
              next2.delete(gameId);
              return next2;
            });
          });
      }

      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <div className="text-4xl mb-3">😕</div>
          <div className="text-red-700 font-semibold mb-2">{error || "Player not found"}</div>
          <button
            onClick={() => router.push("/players")}
            className="text-primary hover:underline font-medium"
          >
            ← Back to Players
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Back link */}
      <Link
        href="/players"
        className="inline-flex items-center gap-2 text-gray-500 hover:text-primary transition-colors mb-6"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Players
      </Link>

      {/* Player Header */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl shadow-xl overflow-hidden mb-6">
        <div className="px-8 py-6">
          <div className="flex items-center gap-6">
            {/* Avatar */}
            <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${getPlayerGradient(stats.player.name)} flex items-center justify-center text-white text-4xl font-bold shadow-lg`}>
              {stats.player.name.charAt(0).toUpperCase()}
            </div>

            {/* Name and status */}
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-white">
                  {stats.player.name}
                </h1>
                {stats.player.status === "retired" && (
                  <span className="px-3 py-1 bg-gray-600 text-gray-200 text-sm rounded-full font-medium">
                    Retired
                  </span>
                )}
              </div>
              <div className="text-slate-400 mt-1 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Player since {formatDate(stats.player.created_at)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Career Highlights */}
      {getCareerHighlights() && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          {getCareerHighlights()!.map((highlight, idx) => (
            <div key={idx} className="bg-white rounded-xl shadow-lg p-4 text-center">
              <div className="text-2xl mb-1">{highlight.icon}</div>
              <div className="text-2xl font-bold text-gray-900">{highlight.value}</div>
              <div className="text-sm font-semibold text-primary">{highlight.label}</div>
              {highlight.sublabel && (
                <div className="text-xs text-gray-500 mt-1">{highlight.sublabel}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Game sections */}
      {stats.gameStats.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl shadow-lg">
          <div className="text-6xl mb-4">🎮</div>
          <p className="text-gray-500 text-lg">No games played yet</p>
          <Link
            href="/matches/new"
            className="inline-block mt-4 px-6 py-3 bg-primary text-white rounded-xl font-semibold hover:bg-primary-hover transition-all shadow-lg hover:shadow-xl"
          >
            Record First Match
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {stats.gameStats.map((game) => {
            const totalGames = game.wins + game.losses + game.draws;
            const winRate = totalGames > 0 ? ((game.wins / totalGames) * 100).toFixed(1) : "0.0";
            const pointDiff = game.points_scored - game.points_conceded;
            const pointRatio = game.points_scored / game.points_conceded;
            const gameMatches = matchesByGame[game.game_id] || [];
            const isExpanded = expandedGames.has(game.game_id);

            return (
              <div key={game.game_id} className="bg-white rounded-2xl shadow-lg overflow-hidden">
                {/* Game header - clickable */}
                <button
                  onClick={() => toggleGame(game.game_id)}
                  className="w-full px-6 py-4 bg-gradient-to-r from-slate-100 to-slate-50 hover:from-slate-150 hover:to-slate-100 transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    {game.image_url ? (
                      <img
                        src={game.image_url}
                        alt={game.game_name}
                        className="w-8 h-8 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center text-white text-sm">
                        🎮
                      </div>
                    )}
                    <h2 className="text-xl font-bold text-gray-900">
                      {formatGameName(game.game_name)}
                    </h2>
                    <span className="text-sm text-gray-500">
                      {game.score_type === 'best_of' ? `Best of ${game.score_value}` : `First to ${game.score_value}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-2xl font-bold font-mono text-primary">{game.elo.toFixed(3)}</div>
                      <div className="text-xs text-gray-500">Rating</div>
                    </div>
                    <svg
                      className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-gray-100">
                    {/* Stats Grid */}
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-px bg-gray-100">
                      <div className="bg-white p-4 text-center">
                        <div className="text-2xl font-bold font-mono text-primary">{game.elo.toFixed(3)}</div>
                        <div className="text-xs text-gray-500 mt-1">Rating</div>
                      </div>
                      <div className="bg-white p-4 text-center">
                        <div className="text-2xl font-bold">{game.total_matches}</div>
                        <div className="text-xs text-gray-500 mt-1">Matches</div>
                      </div>
                      <div className="bg-white p-4 text-center">
                        <div className="text-2xl font-bold">
                          <span className="text-green-600">{game.wins}</span>
                          <span className="text-gray-300">/</span>
                          <span className="text-red-600">{game.losses}</span>
                          <span className="text-gray-300">/</span>
                          <span className="text-gray-500">{game.draws}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">W/L/D</div>
                      </div>
                      <div className="bg-white p-4 text-center">
                        <div className="text-2xl font-bold">{winRate}%</div>
                        <div className="text-xs text-gray-500 mt-1">Win Rate</div>
                      </div>
                      <div className="bg-white p-4 text-center">
                        <div className="text-2xl font-bold">
                          <span className="text-green-600">{game.points_scored}</span>
                          <span className="text-gray-300">-</span>
                          <span className="text-red-600">{game.points_conceded}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">Points</div>
                      </div>
                      <div className="bg-white p-4 text-center">
                        <div className={`text-2xl font-bold ${pointRatio >= 1 ? "text-green-600" : "text-red-600"}`}>
                          {pointRatio.toFixed(3)}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">Point Ratio</div>
                      </div>
                    </div>

                    {/* Records */}
                    <div className="px-6 py-4 bg-gradient-to-r from-amber-50 to-orange-50 border-t border-amber-100">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg">🏆</span>
                        <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Records</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        {/* Peak Rating */}
                        <div className="bg-white rounded-xl p-3 shadow-sm">
                          <div className="text-xs text-gray-500 mb-1">Peak Rating</div>
                          <div className="font-bold font-mono text-green-700 text-lg">{game.records.highest_elo.toFixed(3)}</div>
                          {game.records.highest_elo_date && (
                            <div className="text-xs text-gray-400">{formatDate(game.records.highest_elo_date)}</div>
                          )}
                        </div>
                        {/* Lowest Rating */}
                        <div className="bg-white rounded-xl p-3 shadow-sm">
                          <div className="text-xs text-gray-500 mb-1">Lowest Rating</div>
                          <div className="font-bold font-mono text-red-700 text-lg">{game.records.lowest_elo.toFixed(3)}</div>
                          {game.records.lowest_elo_date && (
                            <div className="text-xs text-gray-400">{formatDate(game.records.lowest_elo_date)}</div>
                          )}
                        </div>
                        {/* Best Win Streak */}
                        <div className="bg-white rounded-xl p-3 shadow-sm">
                          <div className="text-xs text-gray-500 mb-1">Best Win Streak</div>
                          <div className="font-bold text-green-700 text-lg">{game.records.longest_win_streak} 🔥</div>
                          {game.records.longest_win_streak_start && game.records.longest_win_streak_end && (
                            <div className="text-xs text-gray-400">
                              {formatDate(game.records.longest_win_streak_start)}
                              {game.records.longest_win_streak_start !== game.records.longest_win_streak_end && (
                                <> - {formatDate(game.records.longest_win_streak_end)}</>
                              )}
                            </div>
                          )}
                        </div>
                        {/* Worst Lose Streak */}
                        <div className="bg-white rounded-xl p-3 shadow-sm">
                          <div className="text-xs text-gray-500 mb-1">Worst Lose Streak</div>
                          <div className="font-bold text-red-700 text-lg">{game.records.longest_lose_streak} 😢</div>
                          {game.records.longest_lose_streak_start && game.records.longest_lose_streak_end && (
                            <div className="text-xs text-gray-400">
                              {formatDate(game.records.longest_lose_streak_start)}
                              {game.records.longest_lose_streak_start !== game.records.longest_lose_streak_end && (
                                <> - {formatDate(game.records.longest_lose_streak_end)}</>
                              )}
                            </div>
                          )}
                        </div>
                        {/* Unbeaten Run */}
                        <div className="bg-white rounded-xl p-3 shadow-sm">
                          <div className="text-xs text-gray-500 mb-1">Unbeaten Run</div>
                          <div className="font-bold text-blue-700 text-lg">{game.records.longest_unbeaten_streak} 💪</div>
                          {game.records.longest_unbeaten_streak_start && game.records.longest_unbeaten_streak_end && (
                            <div className="text-xs text-gray-400">
                              {formatDate(game.records.longest_unbeaten_streak_start)}
                              {game.records.longest_unbeaten_streak_start !== game.records.longest_unbeaten_streak_end && (
                                <> - {formatDate(game.records.longest_unbeaten_streak_end)}</>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Notable Matches */}
                    {(game.records.biggest_gain || game.records.biggest_loss) && (
                      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-lg">⚡</span>
                          <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Notable Matches</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {game.records.biggest_gain && (
                            <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-semibold text-green-800">Biggest Gain</span>
                                <span className="font-mono text-lg font-bold text-green-600">+{game.records.biggest_gain.gain.toFixed(3)}</span>
                              </div>
                              <div className="text-sm text-gray-600">
                                {game.records.biggest_gain.teammates && game.records.biggest_gain.teammates.length > 0 && (
                                  <>
                                    <span className="text-gray-500">with </span>
                                    <span className="font-medium">{game.records.biggest_gain.teammates.join(", ")}</span>
                                    <span className="text-gray-400 mx-1">vs</span>
                                  </>
                                )}
                                {(!game.records.biggest_gain.teammates || game.records.biggest_gain.teammates.length === 0) && (
                                  <span className="text-gray-400">vs </span>
                                )}
                                {game.records.biggest_gain.opponents.join(", ")}
                              </div>
                              <div className="flex items-center justify-between mt-2">
                                <span className="font-bold text-lg">
                                  <span className="text-green-600">{game.records.biggest_gain.score}</span>
                                  <span className="text-gray-400 mx-1">-</span>
                                  <span>{game.records.biggest_gain.opponent_score}</span>
                                </span>
                                <span className="text-xs text-gray-400">{formatDate(game.records.biggest_gain.date)}</span>
                              </div>
                            </div>
                          )}
                          {game.records.biggest_loss && (
                            <div className="bg-gradient-to-br from-red-50 to-rose-50 border border-red-200 rounded-xl p-4">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-semibold text-red-800">Biggest Loss</span>
                                <span className="font-mono text-lg font-bold text-red-600">{game.records.biggest_loss.loss.toFixed(3)}</span>
                              </div>
                              <div className="text-sm text-gray-600">
                                {game.records.biggest_loss.teammates && game.records.biggest_loss.teammates.length > 0 && (
                                  <>
                                    <span className="text-gray-500">with </span>
                                    <span className="font-medium">{game.records.biggest_loss.teammates.join(", ")}</span>
                                    <span className="text-gray-400 mx-1">vs</span>
                                  </>
                                )}
                                {(!game.records.biggest_loss.teammates || game.records.biggest_loss.teammates.length === 0) && (
                                  <span className="text-gray-400">vs </span>
                                )}
                                {game.records.biggest_loss.opponents.join(", ")}
                              </div>
                              <div className="flex items-center justify-between mt-2">
                                <span className="font-bold text-lg">
                                  <span>{game.records.biggest_loss.score}</span>
                                  <span className="text-gray-400 mx-1">-</span>
                                  <span className="text-red-600">{game.records.biggest_loss.opponent_score}</span>
                                </span>
                                <span className="text-xs text-gray-400">{formatDate(game.records.biggest_loss.date)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Head to Head - Rivals Section */}
                    <RivalsSection
                      gameId={game.game_id}
                      gameName={game.game_name}
                      playerId={parseInt(playerId)}
                      opponents={headToHeadData.get(game.game_id) || []}
                      isLoading={headToHeadLoading.has(game.game_id)}
                    />

                    {/* Achievements */}
                    {game.achievements && game.achievements.length > 0 && (
                      <div className="px-6 py-4 bg-gradient-to-r from-amber-50 to-yellow-50 border-t border-amber-100">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-lg">🏅</span>
                          <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Achievements</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {game.achievements.map((achievement) => (
                            <div
                              key={achievement.achievement_id}
                              className="flex items-center gap-2 bg-white border border-amber-200 rounded-full px-4 py-2 hover:shadow-md transition-shadow cursor-default"
                              title={achievement.achievement_description}
                            >
                              <span className="text-xl">{achievement.achievement_icon || '🏅'}</span>
                              <span className="font-medium text-amber-900">{achievement.achievement_name.replace(/_/g, ' ')}</span>
                              {achievement.count > 1 && (
                                <span className="text-xs bg-amber-200 text-amber-800 rounded-full px-2 py-0.5 font-semibold">×{achievement.count}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Elo History Chart */}
                    {game.elo_history.length > 1 && (
                      <div className="px-6 py-4 bg-white border-t border-gray-100">
                        <div className="flex items-center gap-2 mb-4">
                          <span className="text-lg">📈</span>
                          <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Skill History</span>
                        </div>
                        <div className="h-48">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart
                              data={game.elo_history.map((point, index) => ({
                                match: index + 1,
                                elo: point.elo,
                                date: new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                              }))}
                              margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                            >
                              <defs>
                                <linearGradient id="eloGradient" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                              <XAxis
                                dataKey="match"
                                tick={{ fontSize: 10, fill: '#6b7280' }}
                                tickLine={false}
                                axisLine={{ stroke: '#e5e7eb' }}
                              />
                              <YAxis
                                tick={{ fontSize: 10, fill: '#6b7280' }}
                                tickLine={false}
                                axisLine={{ stroke: '#e5e7eb' }}
                                tickFormatter={(value) => value.toFixed(0)}
                                domain={['auto', 'auto']}
                              />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: 'white',
                                  border: 'none',
                                  borderRadius: '12px',
                                  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                                  fontSize: '12px'
                                }}
                                formatter={(value) => [(value as number).toFixed(3), 'Rating']}
                                labelFormatter={(label) => `Match ${label}`}
                              />
                              <Area
                                type="monotone"
                                dataKey="elo"
                                stroke="#3b82f6"
                                strokeWidth={2}
                                fill="url(#eloGradient)"
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {/* Recent matches */}
                    {gameMatches.length > 0 && (
                      <div className="border-t border-gray-100">
                        <div className="px-6 py-3 bg-gray-50 flex items-center gap-2">
                          <span className="text-lg">🎮</span>
                          <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Recent Matches</span>
                        </div>
                        <div className="divide-y divide-gray-50">
                          {gameMatches.slice(0, 5).map((match) => {
                            const resultStyles = {
                              win: {
                                bg: "bg-gradient-to-r from-green-50 to-emerald-50",
                                border: "border-l-4 border-l-green-500",
                                text: "text-green-700"
                              },
                              loss: {
                                bg: "bg-gradient-to-r from-red-50 to-rose-50",
                                border: "border-l-4 border-l-red-500",
                                text: "text-red-700"
                              },
                              draw: {
                                bg: "bg-gradient-to-r from-gray-50 to-slate-50",
                                border: "border-l-4 border-l-gray-400",
                                text: "text-gray-700"
                              }
                            };
                            const style = resultStyles[match.result];
                            const eloChange = match.elo_after - match.elo_before;

                            return (
                              <Link
                                key={match.id}
                                href={`/matches/${match.id}`}
                                className={`block px-6 py-4 ${style.bg} ${style.border} hover:opacity-80 transition-opacity`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-4">
                                    <span className={`font-bold uppercase text-sm tracking-wide ${style.text}`}>
                                      {match.result}
                                    </span>
                                    <span className="text-2xl font-bold text-gray-900">
                                      {match.score}
                                      <span className="text-gray-400 mx-1">-</span>
                                      {match.opponent_score}
                                    </span>
                                    <span className="text-gray-600 text-sm">
                                      {match.teammates.length > 0 && (
                                        <>
                                          <span className="text-gray-500">with </span>
                                          <span className="font-medium">{match.teammates.join(", ")}</span>
                                          <span className="text-gray-400 mx-1">vs</span>
                                        </>
                                      )}
                                      {!match.teammates.length && <span className="text-gray-400">vs </span>}
                                      {match.opponents.map(o => o.player_name).join(", ")}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <div className={`font-mono text-sm font-bold ${eloChange >= 0 ? "text-green-600" : "text-red-600"}`}>
                                      {formatRatingChange(match.elo_before, match.elo_after)}
                                    </div>
                                    <div className="text-sm text-gray-500 w-24 text-right">
                                      {formatDateTime(match.played_at)}
                                    </div>
                                  </div>
                                </div>
                                {match.notes && (
                                  <div className="mt-2 text-sm text-gray-500 italic">
                                    "{match.notes}"
                                  </div>
                                )}
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    )}
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
