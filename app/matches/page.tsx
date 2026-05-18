"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useSelectedGame } from "@/lib/hooks/useSelectedGame";

interface Game {
  id: number;
  name: string;
}

interface Player {
  id: number;
  name: string;
}

interface MatchAchievement {
  achievement_id: number;
  achievement_name: string;
  achievement_description: string;
  achievement_icon: string | null;
  player_id: number;
  player_name: string;
}

interface PunditryFact {
  type: string;
  player_id: number;
  player_name: string;
  description: string;
}

interface Match {
  id: number;
  game_id: number;
  played_at: string;
  notes: string | null;
  is_edited?: number;
  edited_at?: string | null;
  game_name: string;
  participants: {
    id: number;
    match_id: number;
    player_id: number;
    team: number;
    score: number;
    elo_before: number;
    elo_after: number;
    player_name: string;
  }[];
  achievements?: MatchAchievement[];
  punditry?: PunditryFact[];
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function MatchesPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { selectedGameId } = useSelectedGame();

  // Get initial values from URL params
  const initialPage = parseInt(searchParams.get('page') || '1', 10);
  const initialLimit = parseInt(searchParams.get('limit') || '20', 10);
  const initialDateFrom = searchParams.get('date_from') || '';
  const initialDateTo = searchParams.get('date_to') || '';
  const initialPlayerIds = searchParams.get('player_ids')?.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id)) || [];
  const initialPlayerCount = searchParams.get('player_count') || '';
  const initialHasAchievements = searchParams.get('has_achievements') === 'true';
  const initialMinSkillChange = searchParams.get('min_skill_change') || '';

  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [editScores, setEditScores] = useState<{ [team: number]: string }>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pagination state (separate from API response)
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);
  const totalPages = Math.ceil(totalMatches / limit);

  // Filter state
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState(initialDateTo);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<number[]>(initialPlayerIds);
  const [playerCount, setPlayerCount] = useState(initialPlayerCount);
  const [hasAchievements, setHasAchievements] = useState(initialHasAchievements);
  const [minSkillChange, setMinSkillChange] = useState(initialMinSkillChange);
  const [showFilters, setShowFilters] = useState(false);

  // Build URL params for API call and navigation
  const buildQueryParams = (pageArg?: number, limitArg?: number) => {
    const params = new URLSearchParams();
    if (selectedGameId) params.set('game_id', selectedGameId.toString());
    params.set('page', (pageArg ?? page).toString());
    params.set('limit', (limitArg ?? limit).toString());
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (selectedPlayerIds.length > 0) params.set('player_ids', selectedPlayerIds.join(','));
    if (playerCount) params.set('player_count', playerCount);
    if (hasAchievements) params.set('has_achievements', 'true');
    if (minSkillChange) params.set('min_skill_change', minSkillChange);
    return params;
  };

  // Update URL without triggering fetch
  const updateUrl = (pageArg?: number, limitArg?: number) => {
    const params = buildQueryParams(pageArg, limitArg);
    router.push(`/matches?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    fetch("/api/players")
      .then((res) => res.json())
      .then((data: Player[]) => setPlayers(data));
  }, []);

  useEffect(() => {
    if (selectedGameId) {
      setLoading(true);
      const params = buildQueryParams();
      fetch(`/api/matches?${params.toString()}`)
        .then((res) => res.json())
        .then((data) => {
          setMatches(data.matches);
          setTotalMatches(data.pagination.total);
          setLoading(false);
        });
    }
  }, [selectedGameId, page, limit, dateFrom, dateTo, JSON.stringify(selectedPlayerIds), playerCount, hasAchievements, minSkillChange]);

  const formatDate = (dateStr: string) => {
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

  const getTeamResult = (match: Match, team: number) => {
    const teamParticipants = match.participants.filter((p) => p.team === team);
    const otherTeam = match.participants.find((p) => p.team !== team);
    if (!otherTeam) return { result: "unknown", score: 0 };

    const teamScore = teamParticipants[0]?.score ?? 0;
    const otherScore = otherTeam.score;
    const isDraw = teamScore === otherScore;

    // Find the max score to determine winner
    const allScores = match.participants.map((p) => p.score);
    const maxScore = Math.max(...allScores);

    if (isDraw) {
      return { result: "draw" as const, score: teamScore };
    } else if (teamScore === maxScore) {
      return { result: "win" as const, score: teamScore };
    } else {
      return { result: "loss" as const, score: teamScore };
    }
  };

  const getTeams = (match: Match) => {
    const teamSet = new Set(match.participants.map((p) => p.team));
    return Array.from(teamSet).sort((a, b) => a - b);
  };

  const isWithinEditWindow = (playedAt: string) => {
    const matchTime = new Date(playedAt.replace(" ", "T"));
    const now = new Date();
    const hoursSince = (now.getTime() - matchTime.getTime()) / (1000 * 60 * 60);
    return hoursSince <= 24;
  };

  const canEdit = (match: Match) => {
    return isWithinEditWindow(match.played_at);
  };

  const startEdit = (match: Match) => {
    const teams = getTeams(match);
    const scores: { [team: number]: string } = {};
    for (const team of teams) {
      const teamParticipants = match.participants.filter((p) => p.team === team);
      scores[team] = String(teamParticipants[0]?.score ?? 0);
    }
    setEditScores(scores);
    setEditingMatch(match);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingMatch(null);
    setEditScores({});
    setError(null);
  };

  const saveEdit = async (match: Match) => {
    setSaving(true);
    setError(null);

    const teams = getTeams(match);
    const teamsData = teams.map((team) => {
      const teamParticipants = match.participants.filter((p) => p.team === team);
      return {
        team,
        player_ids: teamParticipants.map((p) => p.player_id),
        score: parseInt(editScores[team] || "0", 10),
      };
    });

    try {
      const res = await fetch(`/api/matches/${match.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teams: teamsData }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update match");
      }

      // Refresh matches
      const params = buildQueryParams();
      const matchesRes = await fetch(`/api/matches?${params.toString()}`);
      const matchesData = await matchesRes.json();
      setMatches(matchesData.matches);
      setTotalMatches(matchesData.pagination.total);
      setEditingMatch(null);
      setEditScores({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update match");
    } finally {
      setSaving(false);
    }
  };

  const deleteMatch = async (match: Match) => {
    if (!confirm("Are you sure you want to delete this match? This cannot be undone.")) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/matches/${match.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete match");
      }

      // Refresh matches
      const params = buildQueryParams();
      const matchesRes = await fetch(`/api/matches?${params.toString()}`);
      const matchesData = await matchesRes.json();
      setMatches(matchesData.matches);
      setTotalMatches(matchesData.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete match");
    } finally {
      setSaving(false);
    }
  };

  const goToPage = (newPage: number) => {
    const clampedPage = Math.max(1, Math.min(newPage, totalPages || 1));
    setPage(clampedPage);
    updateUrl(clampedPage);
  };

  const changeLimit = (newLimit: number) => {
    setLimit(newLimit);
    setPage(1);
    updateUrl(1, newLimit);
  };

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setSelectedPlayerIds([]);
    setPlayerCount('');
    setHasAchievements(false);
    setMinSkillChange('');
    setPage(1);
  };

  const hasActiveFilters = dateFrom || dateTo || selectedPlayerIds.length > 0 || playerCount || hasAchievements || minSkillChange;

  const togglePlayer = (playerId: number) => {
    setSelectedPlayerIds(prev =>
      prev.includes(playerId)
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
    setPage(1);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Match History</h1>
        <Link
          href={selectedGameId ? `/matches/new?game=${selectedGameId}` : "/matches/new"}
          className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-hover transition-colors"
        >
          Record Match
        </Link>
      </div>

      <div className="mb-6 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2 rounded-lg border transition-colors ${showFilters ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            {showFilters ? 'Hide Filters' : 'Show Filters'}
            {hasActiveFilters && !showFilters && ' (active)'}
          </button>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-sm text-red-600 hover:text-red-800"
            >
              Clear Filters
            </button>
          )}
        </div>

        {showFilters && (
          <div className="bg-gray-50 rounded-lg p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Player Count</label>
                <input
                  type="number"
                  min="2"
                  max="20"
                  value={playerCount}
                  onChange={(e) => { setPlayerCount(e.target.value); setPage(1); }}
                  placeholder="Any"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Skill Change</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={minSkillChange}
                  onChange={(e) => { setMinSkillChange(e.target.value); setPage(1); }}
                  placeholder="Any"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Players (must include all selected)</label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-white rounded-lg border">
                {players.map((player) => (
                  <button
                    key={player.id}
                    onClick={() => togglePlayer(player.id)}
                    className={`px-3 py-1 text-sm rounded-full transition-colors ${
                      selectedPlayerIds.includes(player.id)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {player.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="hasAchievements"
                checked={hasAchievements}
                onChange={(e) => { setHasAchievements(e.target.checked); setPage(1); }}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="hasAchievements" className="text-sm text-gray-700">Only matches with achievements</label>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-gray-500">Loading...</div>
      ) : matches.length === 0 ? (
        <div className="text-gray-500">
          No matches recorded yet.{" "}
          <Link href={selectedGameId ? `/matches/new?game=${selectedGameId}` : "/matches/new"} className="text-primary hover:underline">
            Record your first match
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {matches.map((match) => {
            const teams = getTeams(match);
            const team0Result = getTeamResult(match, teams[0]);
            const team1Result = getTeamResult(match, teams[1]);
            const isEditing = editingMatch?.id === match.id;
            const editable = canEdit(match);

            return (
              <div key={match.id} className="bg-white rounded-lg shadow p-4">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <div className="text-sm text-gray-500">{formatDate(match.played_at)}</div>
                    {match.is_edited === 1 && (
                      <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded">
                        Edited
                      </span>
                    )}
                    {match.punditry && match.punditry.length > 0 && (
                      <span className="text-sm" title="This match has punditry">
                        🎙️
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {match.notes && (
                      <div className="text-sm text-gray-600 italic">{match.notes}</div>
                    )}
                    <Link
                      href={`/matches/${match.id}`}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      View
                    </Link>
                    {editable && !isEditing && (
                      <button
                        onClick={() => startEdit(match)}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {teams.map((team) => {
                    const teamParticipants = match.participants.filter((p) => p.team === team);
                    const result = getTeamResult(match, team);
                    const bgColor = result.result === "win" ? "bg-green-50" : result.result === "loss" ? "bg-red-50" : "bg-gray-50";
                    const borderColor = result.result === "win" ? "border-green-200" : result.result === "loss" ? "border-red-200" : "border-gray-200";
                    const resultBadge = result.result === "win" ? "bg-green-100 text-green-800" : result.result === "loss" ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-800";

                    return (
                      <div key={team} className={`rounded-lg border ${borderColor} ${bgColor} p-3`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold">Team {team + 1}</span>
                          <div className="flex items-center gap-2">
                            {isEditing ? (
                              <input
                                type="number"
                                min="0"
                                value={editScores[team] ?? "0"}
                                onChange={(e) => setEditScores({ ...editScores, [team]: e.target.value })}
                                className="w-16 px-2 py-1 text-lg font-bold text-center border border-gray-300 rounded"
                              />
                            ) : (
                              <>
                                <span className="text-lg font-bold">{result.score}</span>
                                <span className={`text-xs px-2 py-1 rounded ${resultBadge}`}>
                                  {result.result}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="space-y-2">
                          {teamParticipants.map((p) => {
                            return (
                              <div key={p.player_id} className="text-sm">
                                <div className="font-medium">{p.player_name}</div>
                                {!isEditing && (
                                  <div className="flex gap-4 text-gray-600 text-xs">
                                    <span className={p.elo_after > p.elo_before ? "text-green-600" : p.elo_after < p.elo_before ? "text-red-600" : ""}>
                                      Elo: {formatRatingChange(p.elo_before, p.elo_after)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {match.achievements && match.achievements.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="flex flex-wrap gap-2">
                      {match.achievements.map((achievement, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1.5 text-xs bg-amber-50 text-amber-900 border border-amber-200 rounded-full px-2.5 py-1 hover:bg-amber-100 transition-colors"
                          title={achievement.achievement_description}
                        >
                          <span className="text-sm">{achievement.achievement_icon || '🏅'}</span>
                          <span className="font-medium">{achievement.player_name}:</span>
                          <span>{achievement.achievement_name.replace(/_/g, ' ')}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {isEditing && (
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => saveEdit(match)}
                      disabled={saving}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                    <button
                      onClick={cancelEdit}
                      disabled={saving}
                      className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => deleteMatch(match)}
                      disabled={saving}
                      className="ml-auto bg-red-100 text-red-700 px-4 py-2 rounded-lg hover:bg-red-200 transition-colors"
                    >
                      Delete Match
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalMatches > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">
            Showing {((page - 1) * limit) + 1}-{Math.min(page * limit, totalMatches)} of {totalMatches} matches
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>

            <div className="flex items-center gap-1">
              {page > 2 && (
                <>
                  <button
                    onClick={() => goToPage(1)}
                    className="w-8 h-8 text-sm border border-gray-300 rounded hover:bg-gray-50"
                  >
                    1
                  </button>
                  {page > 3 && <span className="px-1">...</span>}
                </>
              )}

              {page > 1 && (
                <button
                  onClick={() => goToPage(page - 1)}
                  className="w-8 h-8 text-sm border border-gray-300 rounded hover:bg-gray-50"
                >
                  {page - 1}
                </button>
              )}

              <span className="w-8 h-8 flex items-center justify-center text-sm bg-blue-600 text-white rounded">
                {page}
              </span>

              {page < totalPages && (
                <button
                  onClick={() => goToPage(page + 1)}
                  className="w-8 h-8 text-sm border border-gray-300 rounded hover:bg-gray-50"
                >
                  {page + 1}
                </button>
              )}

              {page < totalPages - 1 && (
                <>
                  {page < totalPages - 2 && <span className="px-1">...</span>}
                  <button
                    onClick={() => goToPage(totalPages)}
                    className="w-8 h-8 text-sm border border-gray-300 rounded hover:bg-gray-50"
                  >
                    {totalPages}
                  </button>
                </>
              )}
            </div>

            <button
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>

            <div className="flex items-center gap-2 ml-4">
              <span className="text-sm text-gray-600">Per page:</span>
              <select
                value={limit}
                onChange={(e) => changeLimit(Number(e.target.value))}
                className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MatchesPage() {
  return (
    <Suspense fallback={<div className="text-gray-500">Loading...</div>}>
      <MatchesPageContent />
    </Suspense>
  );
}