'use client';

import { useMemo } from 'react';
import type { SeasonalTheme } from '@/lib/seasonalTheme';

/**
 * Small deterministic PRNG so particle placement is identical between the
 * server render and hydration — avoids layout/hydration mismatches while
 * still looking random.
 */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Particle {
  char: string;
  left: number; // % of viewport width
  size: number; // rem-ish font-size
  duration: number; // seconds to fall
  delay: number; // negative offset so some are already mid-flight
  drift: number; // horizontal drift, px
}

/**
 * Ambient seasonal particles drifting down the screen (snow, leaves,
 * pumpkins, blossoms...). Purely decorative: it has no pointer events and
 * is hidden from screen readers. Renders nothing for the 'none' theme.
 */
export function SeasonalDecor({ theme }: { theme: SeasonalTheme }) {
  const particles = useMemo<Particle[]>(() => {
    if (theme.id === 'none' || theme.particles.length === 0) return [];
    // Derive a stable seed from the theme identity + density
    const seed =
      theme.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) * 7919 +
      theme.particleCount;
    const rand = mulberry32(seed);
    return Array.from({ length: theme.particleCount }, () => ({
      char: theme.particles[Math.floor(rand() * theme.particles.length)],
      left: rand() * 100,
      size: 0.75 + rand() * 1.25,
      duration: 10 + rand() * 16,
      delay: -rand() * 26,
      drift: (rand() - 0.5) * 120,
    }));
  }, [theme.id, theme.particleCount, theme.particles]);

  if (particles.length === 0) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {particles.map((p, i) => (
        <span
          key={i}
          className="seasonal-fall"
          style={{
            left: `${p.left}%`,
            fontSize: `${p.size}rem`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            ['--drift' as string]: `${p.drift}px`,
          }}
        >
          {p.char}
        </span>
      ))}
    </div>
  );
}