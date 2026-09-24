"use client";

import { useState } from "react";
import { getPlayerGradient } from "@/lib/playerGradient";

interface PlayerAvatarProps {
  name: string;
  /** External avatar image URL; falls back to gradient initials when unset or broken */
  avatarUrl?: string | null;
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
 * Renders a player's avatar from their external image URL, falling back to a
 * gradient circle with the player's initial when unset or broken.
 */
export function PlayerAvatar({
  name,
  avatarUrl,
  size = 40,
  roundedClass = "rounded-full",
  className = "",
  ringClass = "shadow-sm",
  fallbackClassName = `bg-gradient-to-br ${getPlayerGradient(name)} text-white`,
}: PlayerAvatarProps) {
  const [failed, setFailed] = useState(false);

  if (avatarUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
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