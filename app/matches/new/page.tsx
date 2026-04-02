"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Game {
  id: number;
  name: string;
}

interface Player {
  id: number;
  name: string;
}

export default function NewMatchPage() {
  const router = useRouter();
  const [games, setGames] = useState<Game[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedGame, setSelectedGame] = useState<number | null>(null);
  const [team1Players, setTeam1Players] = useState<number[]>([]);
  const [team2Players, setTeam2Players] = useState<number[]>([]);
  const [team1Score, setTeam1Score] = useState<string>("");
  const [team2Score, setTeam2Score] = useState<string>("");
  const [winningTeam, setWinningTeam] = useState<1 | 2>(1);
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

    setSubmitting(true);
    setError(null);

    try {
      const score1 = team1Score !== "" ? parseInt(team1Score, 10) : undefined;
      const score2 = team2Score !== "" ? parseInt(team2Score, 10) : undefined;

      // Validate scores if both provided
      if ((score1 !== undefined || score2 !== undefined) && (score1 === undefined || score2 === undefined || isNaN(score1) || isNaN(score2))) {
        setError("Both scores must be provided together");
        setSubmitting(false);
        return;
      }

      // Auto-set winner based on scores if provided
      let finalWinner = winningTeam;
      if (score1 !== undefined && score2 !== undefined) {
        if (score1 > score2) finalWinner = 1;
        else if (score2 > score1) finalWinner = 2;
        // If equal, keep the manual selection (or could error)
      }

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
              won: finalWinner === 1,
              score: score1,
            },
            {
              team: 1,
              player_ids: team2Players,
              won: finalWinner === 2,
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
            Score (optional)
          </label>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-blue-700">Team 1:</span>
              <input
                type="number"
                value={team1Score}
                onChange={(e) => setTeam1Score(e.target.value)}
                placeholder="0"
                min="0"
                className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <span className="text-gray-400">-</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-red-700">Team 2:</span>
              <input
                type="number"
                value={team2Score}
                onChange={(e) => setTeam2Score(e.target.value)}
                placeholder="0"
                min="0"
                className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Close scores weight rating changes lower; blowouts weight higher.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Winner
          </label>
          <div className="flex gap-4">
            <label className="flex items-center">
              <input
                type="radio"
                name="winner"
                checked={winningTeam === 1}
                onChange={() => setWinningTeam(1)}
                className="mr-2"
              />
              Team 1
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="winner"
                checked={winningTeam === 2}
                onChange={() => setWinningTeam(2)}
                className="mr-2"
              />
              Team 2
            </label>
          </div>
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
            placeholder="e.g., Close game, 11-9"
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