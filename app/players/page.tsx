"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { prepareAvatarForUpload, uploadPlayerAvatar, removePlayerAvatar } from "@/lib/avatarUpload";

interface Player {
  id: number;
  name: string;
  status: 'active' | 'retired';
  created_at: string;
  first_played_at: string | null;
  has_avatar?: boolean;
  avatar_updated_at?: string | null;
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRetired, setShowRetired] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<number | null>(null);

  useEffect(() => {
    fetchPlayers();
  }, []);

  function fetchPlayers() {
    setLoading(true);
    fetch("/api/players?status=all")
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

  async function handleAvatarFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const playerId = uploadTargetRef.current;
    // Reset so selecting the same file again still triggers change
    e.target.value = "";
    if (!file || !playerId) return;

    setAvatarBusy(playerId);
    setError(null);
    try {
      const blob = await prepareAvatarForUpload(file);
      await uploadPlayerAvatar(playerId, blob);
      fetchPlayers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload avatar");
    } finally {
      setAvatarBusy(null);
    }
  }

  function openAvatarPicker(playerId: number) {
    uploadTargetRef.current = playerId;
    fileInputRef.current?.click();
  }

  async function handleRemoveAvatar(playerId: number) {
    setAvatarBusy(playerId);
    setError(null);
    try {
      await removePlayerAvatar(playerId);
      fetchPlayers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove avatar");
    } finally {
      setAvatarBusy(null);
    }
  }

  const activePlayers = players.filter(p => p.status === 'active' || !p.status);
  const retiredPlayers = players.filter(p => p.status === 'retired');

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Players</h1>
          <p className="text-gray-500 mt-1">{activePlayers.length} active players</p>
        </div>
      </div>

      {/* Add Player Form */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4">Add New Player</h2>
        <form onSubmit={handleSubmit} className="flex gap-4">
          <input
            type="text"
            value={newPlayerName}
            onChange={(e) => setNewPlayerName(e.target.value)}
            placeholder="Enter player name..."
            className="flex-1 max-w-md px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-lg"
            disabled={submitting}
          />
          <button
            type="submit"
            disabled={submitting || !newPlayerName.trim()}
            className="px-6 py-3 bg-primary text-white rounded-xl font-semibold hover:bg-primary-hover transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Adding..." : "+ Add Player"}
          </button>
        </form>
        {error && (
          <p className="mt-3 text-red-600 text-sm bg-red-50 px-4 py-2 rounded-lg">{error}</p>
        )}
      </div>

      {/* Hidden file input for avatar uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={handleAvatarFileSelected}
      />

      {/* Players Grid */}
      {loading ? (
        <div className="text-gray-500">Loading...</div>
      ) : players.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl shadow-lg">
          <div className="text-6xl mb-4">👥</div>
          <p className="text-gray-500 text-lg">No players yet</p>
          <p className="text-gray-400">Add your first player above to get started!</p>
        </div>
      ) : (
        <>
          {/* Active Players */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {activePlayers.map((player) => (
              <div
                key={player.id}
                className="group relative"
              >
                <Link href={`/players/${player.id}`}>
                  <div className="bg-white rounded-xl shadow hover:shadow-lg transition-all p-4 text-center">
                    <div className="relative w-16 h-16 mx-auto mb-3 group/avatar">
                      <PlayerAvatar
                        playerId={player.id}
                        name={player.name}
                        hasAvatar={player.has_avatar}
                        updatedAt={player.avatar_updated_at}
                        size={64}
                        className="group-hover:scale-110 transition-transform"
                      />
                      <button
                        onClick={(e) => { e.preventDefault(); openAvatarPicker(player.id); }}
                        disabled={avatarBusy === player.id}
                        className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full text-white text-lg opacity-0 group-hover/avatar:opacity-100 transition-opacity"
                        title={player.has_avatar ? 'Change avatar' : 'Add avatar'}
                      >
                        {avatarBusy === player.id ? '…' : '📷'}
                      </button>
                    </div>
                    <h3 className="font-semibold text-gray-900 group-hover:text-primary transition-colors truncate">
                      {player.name}
                    </h3>
                    <p className="text-xs text-gray-400 mt-1">
                      {player.first_played_at
                        ? `Playing since ${new Date(player.first_played_at).toLocaleDateString()}`
                        : 'Yet to play'}
                    </p>
                    {player.has_avatar && (
                      <button
                        onClick={(e) => { e.preventDefault(); handleRemoveAvatar(player.id); }}
                        className="text-xs text-gray-400 hover:text-red-500 mt-1 transition-colors"
                      >
                        Remove avatar
                      </button>
                    )}
                  </div>
                </Link>
                <button
                  onClick={(e) => { e.preventDefault(); togglePlayerStatus(player); }}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-gray-400 hover:text-red-500 bg-white/80 rounded px-1.5 py-0.5 backdrop-blur-sm"
                  title="Retire player"
                >
                  👋
                </button>
              </div>
            ))}
          </div>

          {/* Retired Players */}
          {retiredPlayers.length > 0 && (
            <div className="mt-8">
              <button
                onClick={() => setShowRetired(!showRetired)}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 font-medium"
              >
                <span className="text-lg">{showRetired ? '▼' : '▶'}</span>
                {showRetired ? 'Hide' : 'Show'} retired players ({retiredPlayers.length})
              </button>

              {showRetired && (
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {retiredPlayers.map((player) => (
                    <div
                      key={player.id}
                      className="bg-gray-50 rounded-xl p-4 text-center opacity-60"
                    >
                    <div className="w-16 h-16 mx-auto mb-3 rounded-full grayscale">
                      <PlayerAvatar
                        playerId={player.id}
                        name={player.name}
                        hasAvatar={player.has_avatar}
                        updatedAt={player.avatar_updated_at}
                        size={64}
                        className="grayscale"
                      />
                    </div>
                      <h3 className="font-semibold text-gray-500 truncate line-through">
                        {player.name}
                      </h3>
                      <span className="text-xs text-gray-400">(Retired)</span>
                      <button
                        onClick={() => togglePlayerStatus(player)}
                        className="block mx-auto mt-2 text-xs text-primary hover:underline"
                      >
                        Reactivate
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Quick Actions */}
          {activePlayers.length > 0 && (
            <div className="mt-8 flex justify-center">
              <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-4">
                <span className="text-sm text-gray-500">Quick actions:</span>
                <Link
                  href="/matches/new"
                  className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary-hover transition-colors"
                >
                  Record a Match
                </Link>
                <Link
                  href="/"
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-100 transition-colors"
                >
                  View Leaderboard
                </Link>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}