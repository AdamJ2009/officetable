"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Game {
  id: number;
  name: string;
  score_type: 'best_of' | 'first_to';
  score_value: number;
  image_url?: string | null;
}

export default function SettingsPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [editedUrls, setEditedUrls] = useState<Record<number, string>>({});
  const [recalculating, setRecalculating] = useState(false);
  const [recalcResults, setRecalcResults] = useState<{ game_name: string; matches_processed: number; achievements_awarded: number }[] | null>(null);

  useEffect(() => {
    fetch("/api/games")
      .then((res) => res.json())
      .then((data: Game[]) => {
        setGames(data);
        const urls: Record<number, string> = {};
        data.forEach(g => {
          if (g.image_url) urls[g.id] = g.image_url;
        });
        setEditedUrls(urls);
        setLoading(false);
      });
  }, []);

  const formatGameName = (name: string) => {
    return name.charAt(0).toUpperCase() + name.slice(1).replace("-", " ");
  };

  async function saveImageUrl(gameId: number) {
    setSaving(gameId);
    try {
      const res = await fetch("/api/games", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: gameId,
          image_url: editedUrls[gameId] || null
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save");
      }

      // Update local state
      setGames(games.map(g =>
        g.id === gameId ? { ...g, image_url: editedUrls[gameId] || null } : g
      ));
    } catch (err) {
      console.error(err);
      alert("Failed to save image URL");
    } finally {
      setSaving(null);
    }
  }

  async function recalculateAchievements() {
    setRecalculating(true);
    setRecalcResults(null);
    try {
      const res = await fetch("/api/admin/recalculate-achievements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });

      if (!res.ok) {
        throw new Error("Failed to recalculate");
      }

      const data = await res.json();
      setRecalcResults(data.games);
    } catch (err) {
      console.error(err);
      alert("Failed to recalculate achievements");
    } finally {
      setRecalculating(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Settings</h1>
        <Link
          href="/"
          className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors"
        >
          Back to Leaderboard
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Game Images</h2>
        <p className="text-gray-600 mb-6">
          Set an image URL for each game to be used in Google Chat notifications.
          This can be any publicly accessible image URL (e.g., from a CDN or image hosting service).
        </p>

        {loading ? (
          <div className="text-gray-500">Loading...</div>
        ) : (
          <div className="space-y-4">
            {games.map((game) => (
              <div key={game.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {formatGameName(game.name)}
                  </label>
                  <input
                    type="url"
                    value={editedUrls[game.id] || ""}
                    onChange={(e) => setEditedUrls({ ...editedUrls, [game.id]: e.target.value })}
                    placeholder="https://example.com/game-icon.png"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {game.image_url && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="text-xs text-gray-500">Current:</div>
                      <img
                        src={game.image_url}
                        alt={`${game.name} icon`}
                        className="w-8 h-8 object-contain rounded border"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                </div>
                <button
                  onClick={() => saveImageUrl(game.id)}
                  disabled={saving === game.id}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving === game.id ? "Saving..." : "Save"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-6 mt-6">
        <h2 className="text-xl font-semibold mb-4">Achievements</h2>
        <p className="text-gray-600 mb-6">
          Recalculate achievements for all historical match data. This is useful after editing or deleting matches
          to ensure achievement data is accurate, or when new achievements have been added.
        </p>

        <button
          onClick={recalculateAchievements}
          disabled={recalculating}
          className="bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {recalculating ? "Recalculating..." : "Recalculate All Achievements"}
        </button>

        {recalcResults && (
          <div className="mt-6">
            <h3 className="font-semibold mb-2">Results:</h3>
            <div className="space-y-2">
              {recalcResults.map((result) => (
                <div key={result.game_name} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="font-medium">{formatGameName(result.game_name)}</span>
                  <span className="text-sm text-gray-600">
                    {result.matches_processed} matches processed, {result.achievements_awarded} achievements awarded
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}