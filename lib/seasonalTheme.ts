/**
 * Seasonal theming for the ladder.
 *
 * Purely date-driven and deterministic: the same date always produces the
 * same theme, so server-rendered and client-rendered HTML agree (no
 * hydration mismatches). Anything wanting festive flavour pulls its
 * colours/emoji/labels from here instead of hardcoding.
 *
 * Themes:
 *  - halloween  October (extra spooky in the final week)
 *  - festive    December (snowfall; heavier from mid-December)
 *  - newyear    1–14 January (fireworks)
 *  - valentines 9–19 February (±5 days around Valentine's Day)
 *  - none       everything else (normal service)
 */

export type SeasonalThemeId =
  | 'none'
  | 'halloween'
  | 'festive'
  | 'newyear'
  | 'valentines';

export interface SeasonalTheme {
  id: SeasonalThemeId;
  /** Short label shown in a badge next to the Leaderboard title */
  label: string;
  /** Emoji decorating the page title */
  titleEmoji: string;
  /** Emoji pool for the drifting overlay particles */
  particles: string[];
  /** How many particles drift down the screen */
  particleCount: number;
  /** Tailwind gradient classes for dark table/card headers (white text sits on top) */
  headerGradient: string;
  /** Tailwind gradient classes for the small title badge */
  badgeGradient: string;
}

export const NO_SEASONAL_THEME: SeasonalTheme = {
  id: 'none',
  label: '',
  titleEmoji: '',
  particles: [],
  particleCount: 0,
  headerGradient: 'from-slate-800 to-slate-900',
  badgeGradient: 'from-slate-600 to-slate-500',
};

function build(
  id: SeasonalThemeId,
  label: string,
  titleEmoji: string,
  particles: string[],
  particleCount: number,
  headerGradient: string,
  badgeGradient: string
): SeasonalTheme {
  return { id, label, titleEmoji, particles, particleCount, headerGradient, badgeGradient };
}

export function getSeasonalTheme(date: Date = new Date()): SeasonalTheme {
  const month = date.getMonth(); // 0-indexed
  const day = date.getDate();

  switch (month) {
    case 9: {
      // October — Halloween, ramping up through the month
      const ramp = day >= 24 ? 1.7 : day >= 17 ? 1.25 : 1;
      return build(
        'halloween',
        'Spooky Season',
        '🎃',
        ['🎃', '👻', '🦇', '🕸️', '🕷️'],
        Math.round(11 * ramp),
        'from-purple-950 via-purple-900 to-orange-700',
      'from-purple-800 to-orange-600'
      );
    }
    case 10:
      // November intentionally gets no seasonal theme
      return NO_SEASONAL_THEME;
    case 11: {
      // December — snowfall gets heavier as the holidays approach
      const ramp = day >= 15 ? 1.8 : 1;
      return build(
        'festive',
        'Festive Freeze',
        '🎄',
        ['❄️', '❄️', '❄️', '❄️', '⛄', '🎄'],
        Math.round(14 * ramp),
        'from-red-800 via-red-700 to-green-800',
        'from-red-600 to-green-600'
      );
    }
    case 0:
      // Fresh Start runs through mid-January, then normal service resumes
      return day <= 14
        ? build(
            'newyear',
            'Fresh Start',
            '🎆',
            ['🎊', '✨', '🎉'],
            16,
            'from-indigo-900 to-purple-900',
            'from-indigo-600 to-purple-600'
          )
        : NO_SEASONAL_THEME;
    case 1:
      // Valentine's Day ± 5 days (9–19 February)
      return day >= 9 && day <= 19
        ? build(
            'valentines',
            "Cupid's Cup",
            '💘',
            ['❤️', '💕', '🌹'],
            12,
            'from-rose-600 to-pink-500',
            'from-rose-500 to-pink-400'
          )
        : NO_SEASONAL_THEME;
    default:
      return NO_SEASONAL_THEME;
  }
}