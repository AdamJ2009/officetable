import db from './db';

/**
 * Seasons + dual-ledger support.
 *
 * The `seasons` table holds real seasons with half-open intervals
 * [start_date, end_date). `season_id = 0` is reserved as the **all-time
 * ledger sentinel** — it is never a real season row (SQLite treats NULL as
 * non-unique in UNIQUE indexes, hence a numeric sentinel instead of NULL).
 *
 * Dates are stored in the same format the app uses for `played_at`:
 * 'YYYY-MM-DD HH:MM:SS' in UTC, so plain lexicographic string comparison
 * works consistently in both SQL and JS.
 */

export const ALLTIME_SEASON_ID = 0;

export interface Season {
  id: number;
  name: string;
  start_date: string;
  end_date: string | null;
}

/** Format a Date as the app's canonical DB datetime string (UTC, no millis). */
export function toDbDate(d: Date): string {
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
}

/** Normalise fuzzy input ('2026-11-01', ISO strings, ...) to a DB datetime string at 00:00:00. */
export function normaliseDbDate(input: string): string {
  const trimmed = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed} 00:00:00`;
  }
  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${input}`);
  }
  return toDbDate(parsed).substring(0, 19);
}

export function getSeasons(): Season[] {
  return db
    .prepare('SELECT id, name, start_date, end_date FROM seasons ORDER BY start_date ASC, id ASC')
    .all() as Season[];
}

export function getSeason(id: number): Season | undefined {
  return db
    .prepare('SELECT id, name, start_date, end_date FROM seasons WHERE id = ?')
    .get(id) as Season | undefined;
}

/**
 * Current season = the season with start_date <= now with the greatest
 * start_date. Returns null if no season has started yet.
 */
export function getCurrentSeason(): Season | null {
  const nowStr = toDbDate(new Date());
  return (
    (db
      .prepare(
        `SELECT id, name, start_date, end_date FROM seasons
         WHERE start_date <= ?
         ORDER BY start_date DESC, id DESC
         LIMIT 1`
      )
      .get(nowStr) as Season | undefined) ?? null
  );
}

/**
 * Resolve which season a match belongs to, based on its played_at timestamp
 * (NOT the insert date — late-entered matches slot correctly).
 *
 * Intervals are half-open [start_date, end_date).
 */
export function resolveSeason(playedAt: Date | string): number {
  const ts = typeof playedAt === 'string' ? playedAt : toDbDate(playedAt);
  const seasons = getSeasons();

  if (seasons.length === 0) {
    return ALLTIME_SEASON_ID;
  }

  // Find the season whose interval contains the timestamp: [start, end)
  for (const season of seasons) {
    if (ts >= season.start_date && (season.end_date === null || ts < season.end_date)) {
      return season.id;
    }
  }

  // Timestamp falls outside every interval: before the first season start
  // (clock skew / very old backfilled data) or after the last one ended
  // (season closed without a successor opening). Clamp sensibly.
  const first = seasons[0];
  if (ts < first.start_date) {
    return first.id;
  }
  return seasons[seasons.length - 1].id;
}

/**
 * Resolve a `scope` (`season` | `alltime`) + optional explicit `season_id`
 * pair into a ledger season id (0 = all-time). Explicit past-season ids win.
 */
export function resolveScopeSeasonId(scope?: string | null, seasonId?: string | null): number {
  if (seasonId) {
    const parsed = parseInt(seasonId, 10);
    if (!isNaN(parsed)) {
      if (parsed === ALLTIME_SEASON_ID || getSeason(parsed)) return parsed;
    }
  }
  if (scope === 'alltime') return ALLTIME_SEASON_ID;
  return getCurrentSeason()?.id ?? ALLTIME_SEASON_ID;
}