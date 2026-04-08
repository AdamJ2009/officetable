"use client";

import { useState, useEffect } from "react";

interface Player {
  id: number;
  name: string;
  status: 'active' | 'retired';
  created_at: string;
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRetired, setShowRetired] = useState(false);

  useEffect(() => {
    fetchPlayers();
  }, []);

  function fetchPlayers() {
    setLoading(true);
    fetch("/api/players")
      .then((res) => res.json())
      .then((data) => {
        setPlayers(data);
        setLoading(false);
      });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newPlayerName.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newPlayerName.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add player");
      }

      setNewPlayerName("");
      fetchPlayers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add player");
    } finally {
      setSubmitting(false);
    }
  }

  async function togglePlayerStatus(player: Player) {
    const newStatus = player.status === 'active' ? 'retired' : 'active';
    try {
      const res = await fetch("/api/players", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: player.id, status: newStatus }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update player");
      }

      fetchPlayers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update player");
    }
  }

  const activePlayers = players.filter(p => p.status === 'active' || !p.status);
  const retiredPlayers = players.filter(p => p.status === 'retired');

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Players</h1>

      <form onSubmit={handleSubmit} className="mb-8">
        <div className="flex gap-4">
          <input
            type="text"
            value={newPlayerName}
            onChange={(e) => setNewPlayerName(e.target.value)}
            placeholder="Enter player name"
            className="flex-1 max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={submitting}
          />
          <button
            type="submit"
            disabled={submitting || !newPlayerName.trim()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Adding..." : "Add Player"}
          </button>
        </div>
        {error && <p className="mt-2 text-red-600 text-sm">{error}</p>}
      </form>

      {loading ? (
        <div className="text-gray-500">Loading...</div>
      ) : players.length === 0 ? (
        <div className="text-gray-500">
          No players yet. Add your first player above!
        </div>
      ) : (
        <>
          {retiredPlayers.length > 0 && (
            <div className="mb-4">
              <button
                onClick={() => setShowRetired(!showRetired)}
                className="text-sm text-gray-600 hover:text-gray-900 underline"
              >
                {showRetired ? 'Hide' : 'Show'} retired players ({retiredPlayers.length})
              </button>
            </div>
          )}

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Added
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {activePlayers.map((player) => (
                  <tr key={player.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {player.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(player.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => togglePlayerStatus(player)}
                        className="text-gray-600 hover:text-gray-900 underline"
                      >
                        Retire
                      </button>
                    </td>
                  </tr>
                ))}
                {showRetired && retiredPlayers.map((player) => (
                  <tr key={player.id} className="bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-500 line-through">
                      {player.name}
                      <span className="ml-2 text-xs text-gray-400">(Retired)</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                      {new Date(player.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => togglePlayerStatus(player)}
                        className="text-blue-600 hover:text-blue-800 underline"
                      >
                        Reactivate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}