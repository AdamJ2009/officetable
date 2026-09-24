"use client";

// Client-side helpers for managing a player's avatar image URL.

export class AvatarError extends Error {}

export async function setPlayerAvatarUrl(playerId: number, url: string): Promise<void> {
  const res = await fetch(`/api/players/${playerId}/avatar`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new AvatarError(data.error || 'Failed to set avatar');
  }
}

export async function removePlayerAvatar(playerId: number): Promise<void> {
  const res = await fetch(`/api/players/${playerId}/avatar`, { method: 'DELETE' });
  if (!res.ok) {
    throw new AvatarError('Failed to remove avatar');
  }
}