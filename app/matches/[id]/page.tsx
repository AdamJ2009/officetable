"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

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
  metadata?: Record<string, unknown>;
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

export default function MatchDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const matchId = params.id as string;
  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/matches/${matchId}`)
      .then((res) => {
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("Match not found");
          }
          throw new Error("Failed to load match");
        }
        return res.json();
      })
      .then((data) => {
        setMatch(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [matchId]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const formatRatingChange = (before: number, after: number) => {
    const diff = after - before;
    const sign = diff >= 0 ? "+" : "";
    return `${sign}${diff.toFixed(3)}`;
  };

  const getTeamResult = (team: number) => {
    if (!match) return { result: "unknown" as const, score: 0 };

    const teamParticipants = match.participants.filter((p) => p.team === team);
    const otherTeamParticipants = match.participants.filter((p) => p.team !== team);

    if (otherTeamParticipants.length === 0) return { result: "unknown" as const, score: 0 };

    const teamScore = teamParticipants[0]?.score ?? 0;
    const otherScore = otherTeamParticipants[0]?.score;
    const isDraw = teamScore === otherScore;

    const maxScore = Math.max(teamScore, otherScore);

    if (isDraw) {
      return { result: "draw" as const, score: teamScore };
    } else if (teamScore === maxScore) {
      return { result: "win" as const, score: teamScore };
    } else {
      return { result: "loss" as const, score: teamScore };
    }
  };

  const getTeams = () => {
    if (!match) return [];
    const teamSet = new Set(match.participants.map((p) => p.team));
    return Array.from(teamSet).sort((a, b) => a - b);
  };

  if (loading) {
    return (
      <div className="text-gray-500 p-8">
        Loading...
      </div>
    );
  }

  if (error || !match) {
    return (
      <div className="p-8">
        <div className="text-red-600 mb-4">{error || "Match not found"}</div>
        <button
          onClick={() => router.push("/matches")}
          className="text-blue-600 hover:underline"
        >
          ← Back to Match History
        </button>
      </div>
    );
  }

  const teams = getTeams();

  return (
    <div>
      <button
        onClick={() => router.push("/matches")}
        className="text-blue-600 hover:underline mb-4"
      >
        ← Back to Match History
      </button>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {/* Header */}
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                <Link
                  href={`/?game=${match.game_id}`}
                  className="hover:underline"
                >
                  {match.game_name.charAt(0).toUpperCase() + match.game_name.slice(1).replace("-", " ")}
                </Link>
              </h1>
              <div className="flex items-center gap-2 mt-1 text-gray-500">
                <span>{formatDate(match.played_at)}</span>
                {match.is_edited === 1 && (
                  <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded">
                    Edited
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Score */}
        <div className="px-6 py-6">
          <div className="grid grid-cols-2 gap-8">
            {teams.map((team) => {
              const teamParticipants = match.participants.filter((p) => p.team === team);
              const result = getTeamResult(team);
              const bgColor = result.result === "win" ? "bg-green-50" : result.result === "loss" ? "bg-red-50" : "bg-gray-50";
              const borderColor = result.result === "win" ? "border-green-200" : result.result === "loss" ? "border-red-200" : "border-gray-200";
              const resultBadge = result.result === "win" ? "bg-green-100 text-green-800" : result.result === "loss" ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-800";
              const resultText = result.result.charAt(0).toUpperCase() + result.result.slice(1);

              return (
                <div key={team} className={`rounded-lg border-2 ${borderColor} ${bgColor} p-4`}>
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-semibold text-lg">Team {team + 1}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-3xl font-bold">{result.score}</span>
                      <span className={`text-sm px-3 py-1 rounded-full ${resultBadge}`}>
                        {resultText}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {teamParticipants.map((p) => {
                      const eloChange = p.elo_after - p.elo_before;
                      const eloColor = eloChange >= 0 ? "text-green-600" : "text-red-600";

                      return (
                        <div key={p.player_id} className="bg-white bg-opacity-60 rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <Link
                              href={`/players/${p.player_id}`}
                              className="font-medium text-gray-900 hover:underline"
                            >
                              {p.player_name}
                            </Link>
                            <div className={`font-mono text-sm ${eloColor}`}>
                              {formatRatingChange(p.elo_before, p.elo_after)}
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
                            <span>Elo: {p.elo_before.toFixed(3)} → {p.elo_after.toFixed(3)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Notes */}
        {match.notes && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            <div className="text-sm text-gray-500 uppercase tracking-wide mb-1">Notes</div>
            <div className="text-gray-700 italic">"{match.notes}"</div>
          </div>
        )}

        {/* Achievements */}
        {match.achievements && match.achievements.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-200">
            <div className="text-sm text-gray-500 uppercase tracking-wide mb-3">Achievements Earned</div>
            <div className="flex flex-wrap gap-2">
              {match.achievements.map((achievement, idx) => (
                <div
                  key={idx}
                  className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5 hover:bg-amber-100 transition-colors"
                  title={achievement.achievement_description}
                >
                  <span className="text-lg">{achievement.achievement_icon || "🏅"}</span>
                  <span className="font-medium text-amber-900">{achievement.player_name}:</span>
                  <span className="text-amber-800">{achievement.achievement_name.replace(/_/g, " ")}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Punditry */}
        {match.punditry && match.punditry.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-200">
            <div className="text-sm text-gray-500 uppercase tracking-wide mb-3">Punditry</div>
            <ul className="space-y-2">
              {match.punditry.map((fact, idx) => (
                <li key={idx} className="text-gray-700 flex items-start gap-2">
                  <span className="text-blue-500 mt-1">•</span>
                  <span>{fact.description}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Match ID */}
        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 text-xs text-gray-400">
          Match ID: {match.id}
        </div>
      </div>
    </div>
  );
}