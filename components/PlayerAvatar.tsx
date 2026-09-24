"use client";

import { useState } from "react";
import { getPlayerGradient } from "@/lib/playerGradient";

interface PlayerAvatarProps {
  playerId: number;
  name: string;
  /** Whether the player has an uploaded avatar. If undefined, the image is attempted and falls back on error. */
  hasAvatar?: boolean;
  /** Cache-busting timestamp (avatar_updated_at) */
  updatedAt?: string | null;
  /** Rendered size in px (square) */
  size?: number;
  /** Tailwind border-radius class; defaults to fully rounded */
  roundedClass?: string;
  className?: string;
  /** Optional ring/shadow classes for the image variant */
  ringClass?: string;
  /** Override classes for the fallback initials circle (e.g. rank-based gradients) */
  fallbackClassName?: string;
}

/**
 * Renders a player's uploaded avatar if they have one, otherwise falls back to
 * a gradient circle with the player's initial (matching the original design).
 */
export function PlayerAvatar({
  playerId,
  name,
  hasAvatar,
  updatedAt,
  size = 40,
  roundedClass = "rounded-full",
  className = "",
  ringClass = "shadow-sm",
  fallbackClassName = `bg-gradient-to-br ${getPlayerGradient(name)} text-white`,
}: PlayerAvatarProps) {
  const [failed, setFailed] = useState(false);

  const showImage = (hasAvatar === undefined || hasAvatar) && !failed;

  if (showImage) {
    const cacheBuster = updatedAt ? `?v=${encodeURIComponent(updatedAt)}` : "";
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/players/${playerId}/avatar${cacheBuster}`}
        alt={name}
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className={`${roundedClass} object-cover flex-shrink-0 ${ringClass} ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  const fontSize = Math.max(10, Math.round(size * 0.42));
  return (
    <div
      className={`${roundedClass} flex items-center justify-center ${fallbackClassName} font-bold flex-shrink-0 ${ringClass} ${className}`}
      style={{ width: size, height: size, fontSize }}
      aria-hidden="true"
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}