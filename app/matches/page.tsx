"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Game {
  id: number;
  name: string;
}

interface Match {
  id: number;
  game_id: number;
  played_at: string;
  notes: string | null;
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
}

export default function MatchesPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGame, setSelectedGame] = useState<number | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
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
      fetch(`/api/matches?game_id=${selectedGame}`)
        .then((res) => res.json())
        .then((data) => {
          setMatches(data);
          setLoading(false);
        });
    }
  }, [selectedGame]);

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
    return `${sign}${Math.round(diff)}`;
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

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Match History</h1>
        <Link
          href="/matches/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Record Match
        </Link>
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
      ) : matches.length === 0 ? (
        <div className="text-gray-500">
          No matches recorded yet.{" "}
          <Link href="/matches/new" className="text-blue-600 hover:underline">
            Record your first match
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {matches.map((match) => {
            const teams = getTeams(match);
            const team0Result = getTeamResult(match, teams[0]);
            const team1Result = getTeamResult(match, teams[1]);

            return (
              <div key={match.id} className="bg-white rounded-lg shadow p-4">
                <div className="flex justify-between items-start mb-3">
                  <div className="text-sm text-gray-500">{formatDate(match.played_at)}</div>
                  {match.notes && (
                    <div className="text-sm text-gray-600 italic">{match.notes}</div>
                  )}
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
                            <span className="text-lg font-bold">{result.score}</span>
                            <span className={`text-xs px-2 py-1 rounded ${resultBadge}`}>
                              {result.result}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {teamParticipants.map((p) => {
                            return (
                              <div key={p.player_id} className="text-sm">
                                <div className="font-medium">{p.player_name}</div>
                                <div className="flex gap-4 text-gray-600 text-xs">
                                  <span className={p.elo_after > p.elo_before ? "text-green-600" : p.elo_after < p.elo_before ? "text-red-600" : ""}>
                                    Elo: {formatRatingChange(p.elo_before, p.elo_after)}
                                  </span>
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
            );
          })}
        </div>
      )}
    </div>
  );
}
