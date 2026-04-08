"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

interface Game {
  id: number;
  name: string;
}

interface Player {
  id: number;
  name: string;
}

interface PlayerRating {
  player_id: number;
  player_name: string;
  elo: number;
}

export default function NewMatchPage() {
  const router = useRouter();
  const [games, setGames] = useState<Game[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [ratings, setRatings] = useState<PlayerRating[]>([]);
  const [selectedGame, setSelectedGame] = useState<number | null>(null);
  const selectedGameData = games.find(g => g.id === selectedGame);
  const [team1Players, setTeam1Players] = useState<number[]>([]);
  const [team2Players, setTeam2Players] = useState<number[]>([]);
  const [team1Score, setTeam1Score] = useState<string>("0");
  const [team2Score, setTeam2Score] = useState<string>("0");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/games").then((res) => res.json()),
      fetch("/api/players").then((res) => res.json()),
    ]).then(([gamesData, playersData]) => {
      setGames(gamesData);
      if (gamesData.length > 0) {
        setSelectedGame(gamesData[0].id);
      }
      setPlayers(playersData);
    });
  }, []);

  useEffect(() => {
    if (selectedGame) {
      fetch(`/api/leaderboard?game_id=${selectedGame}`)
        .then((res) => res.json())
        .then((data) => {
          setRatings(data);
        });
    }
  }, [selectedGame]);

  function togglePlayer(team: 1 | 2, playerId: number) {
    if (team === 1) {
      setTeam1Players((prev) =>
        prev.includes(playerId)
          ? prev.filter((id) => id !== playerId)
          : [...prev, playerId]
      );
      setTeam2Players((prev) => prev.filter((id) => id !== playerId));
    } else {
      setTeam2Players((prev) =>
        prev.includes(playerId)
          ? prev.filter((id) => id !== playerId)
          : [...prev, playerId]
      );
      setTeam1Players((prev) => prev.filter((id) => id !== playerId));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedGame) return;

    if (team1Players.length === 0 || team2Players.length === 0) {
      setError("Each team must have at least one player");
      return;
    }

    const score1 = parseInt(team1Score, 10);
    const score2 = parseInt(team2Score, 10);

    if (isNaN(score1) || isNaN(score2) || score1 < 0 || score2 < 0) {
      setError("Scores must be valid non-negative numbers");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game_id: selectedGame,
          notes: notes || null,
          teams: [
            {
              team: 0,
              player_ids: team1Players,
              score: score1,
            },
            {
              team: 1,
              player_ids: team2Players,
              score: score2,
            },
          ],
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to record match");
      }

      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record match");
    } finally {
      setSubmitting(false);
    }
  }

  const availablePlayers = players.filter(
    (p) => !team1Players.includes(p.id) && !team2Players.includes(p.id)
  );

  const score1 = parseInt(team1Score, 10) || 0;
  const score2 = parseInt(team2Score, 10) || 0;
  const winnerText = score1 > score2 ? "Team 1 wins" : score2 > score1 ? "Team 2 wins" : "Tie";

  // Calculate predicted result based on team Elo
  const prediction = useMemo(() => {
    if (team1Players.length === 0 || team2Players.length === 0) return null;

    const team1Elo = team1Players.reduce((sum, id) => {
      const r = ratings.find((r) => r.player_id === id);
      return sum + (r?.elo ?? 0);
    }, 0) / team1Players.length;

    const team2Elo = team2Players.reduce((sum, id) => {
      const r = ratings.find((r) => r.player_id === id);
      return sum + (r?.elo ?? 0);
    }, 0) / team2Players.length;

    // Expected result formula: 1 / (1 + 10^((opponentElo - teamElo) / 180))
    const expectedTeam1 = 1 / (1 + Math.pow(10, (team2Elo - team1Elo) / 180));
    const expectedTeam2 = 1 / (1 + Math.pow(10, (team1Elo - team2Elo) / 180));

    let expectedTeam1Score, expectedTeam2Score
    // Expected score
    if (selectedGameData.score_type === 'best_of') {
        // For best of, we just take the ratios of the score_value, easy!
        expectedTeam1Score = Math.round(expectedTeam1 * selectedGameData.score_value);
        expectedTeam2Score = Math.round(expectedTeam2 * selectedGameData.score_value);
    } else if (selectedGameData.score_type === 'first_to') {
        // For first_to:
        // - Highest ratio = winner, full score
        // - Second ratio = double ratio of total score but capped at total - 1
        //
        // Note: Second ratio being doubled means results are closer for skill ranks that
        // are closer. This doesn't oblige by game-specific restrictions such as Table 
        // Tennis where are lead of 2 points is needed
        if (expectedTeam1 > 0.5) {
            expectedTeam1Score = selectedGameData.score_value;
            expectedTeam2Score = Math.min((selectedGameData.score_value - 1), Math.round(expectedTeam2 * 2 * selectedGameData.score_value));
        } else {
            expectedTeam1Score = Math.min((selectedGameData.score_value - 1), Math.round(expectedTeam1 * 2 * selectedGameData.score_value));
            expectedTeam2Score = selectedGameData.score_value;
        }
    }

    return {
      team1Elo,
      team2Elo,
      expectedTeam1,
      expectedTeam1Score,
      expectedTeam2,
      expectedTeam2Score
    };
  }, [team1Players, team2Players, ratings]);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Record Match</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Game Type
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

        <div className="grid grid-cols-2 gap-8">
          <div>
            <h2 className="text-lg font-semibold mb-4">Team 1</h2>
            <div className="space-y-2 min-h-[100px] p-4 bg-blue-50 rounded-lg">
              {team1Players.length === 0 ? (
                <p className="text-gray-500 text-sm">No players selected</p>
              ) : (
                team1Players.map((playerId) => {
                  const player = players.find((p) => p.id === playerId);
                  return (
                    <div
                      key={playerId}
                      className="flex items-center justify-between bg-white px-3 py-2 rounded"
                    >
                      <span>{player?.name}</span>
                      <button
                        type="button"
                        onClick={() => togglePlayer(1, playerId)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-4">Team 2</h2>
            <div className="space-y-2 min-h-[100px] p-4 bg-red-50 rounded-lg">
              {team2Players.length === 0 ? (
                <p className="text-gray-500 text-sm">No players selected</p>
              ) : (
                team2Players.map((playerId) => {
                  const player = players.find((p) => p.id === playerId);
                  return (
                    <div
                      key={playerId}
                      className="flex items-center justify-between bg-white px-3 py-2 rounded"
                    >
                      <span>{player?.name}</span>
                      <button
                        type="button"
                        onClick={() => togglePlayer(2, playerId)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Score
          </label>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-blue-700">Team 1:</span>
              <input
                type="number"
                value={team1Score}
                onChange={(e) => setTeam1Score(e.target.value)}
                min="0"
                className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <span className="text-gray-400 text-xl">-</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-red-700">Team 2:</span>
              <input
                type="number"
                value={team2Score}
                onChange={(e) => setTeam2Score(e.target.value)}
                min="0"
                className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            Result: <span className="font-semibold">{winnerText}</span>
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Close scores result in smaller rating changes; blowouts result in larger changes.
          </p>

          {prediction && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium text-gray-700 mb-2">Expected Result (based on current Elo ratings)</p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-blue-700">Team 1:</span>
                  <span className="font-mono">
                    {prediction.expectedTeam1Score}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-red-700">Team 2:</span>
                  <span className="font-mono">
                    {prediction.expectedTeam2Score}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-xs text-blue-700">(score ratio: {prediction.expectedTeam1.toFixed(3)}, team elo: {prediction.team1Elo.toFixed(1)})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-red-700">(score ratio: {prediction.expectedTeam2.toFixed(3)}, team elo: {prediction.team2Elo.toFixed(1)})</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {availablePlayers.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Add Players
            </label>
            <div className="flex flex-wrap gap-2">
              {availablePlayers.map((player) => (
                <div key={player.id} className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => togglePlayer(1, player.id)}
                    className="px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded hover:bg-blue-200"
                  >
                    {player.name} → T1
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePlayer(2, player.id)}
                    className="px-3 py-1 text-sm bg-red-100 text-red-800 rounded hover:bg-red-200"
                  >
                    → T2
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Notes (optional)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., Great comeback!"
            className="block w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={submitting || team1Players.length === 0 || team2Players.length === 0}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Recording..." : "Record Match"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>

      {players.length === 0 && (
        <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-yellow-800">
            No players available.{" "}
            <a href="/players" className="underline">
              Add players first
            </a>{" "}
            before recording a match.
          </p>
        </div>
      )}
    </div>
  );
}
