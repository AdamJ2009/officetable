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
 * Next (queued, not-yet-started) season = the earliest season whose
 * start_date is still in the future. Null when nothing is queued.
 */
export function getNextSeason(now: Date = new Date()): Season | null {
  const nowStr = toDbDate(now);
  return (
    (db
      .prepare(
        `SELECT id, name, start_date, end_date FROM seasons
         WHERE start_date > ?
         ORDER BY start_date ASC, id ASC
         LIMIT 1`
      )
      .get(nowStr) as Season | undefined) ?? null
  );
}

/**
 * Derive the next season number from existing names ("Season 3" etc.).
 */
function nextSeasonName(): string {
  const seasons = getSeasons();
  let max = 0;
  let fallback = 0;
  for (const s of seasons) {
    fallback++;
    const m = s.name.match(/\d+/);
    if (m) max = Math.max(max, parseInt(m[0], 10));
  }
  return `Season ${max + 1 || fallback + 1}`;
}

/**
 * Queue a new season starting at `startRaw`. Seasons never overlap or gap:
 * the currently-latest season is closed exactly at the new season's start.
 * The new start must be strictly in the future and after every existing start.
 * Returns the created season.
 */
export function createSeason(startRaw: string, name?: string): Season {
  const startDate = normaliseStartDate(startRaw);
  const nowStr = toDbDate(new Date());

  if (startDate <= nowStr) {
    throw new Error('Season start must be in the future');
  }

  const seasons = getSeasons();
  const latest = seasons.length > 0 ? seasons[seasons.length - 1] : null;
  if (latest && startDate <= latest.start_date) {
    throw new Error(`Season start must be after ${latest.name} (starts ${latest.start_date})`);
  }

  const seasonName = name?.trim() || nextSeasonName();

  const tx = db.transaction(() => {
    // Align: close the latest season exactly where the new one begins
    if (latest) {
      db.prepare('UPDATE seasons SET end_date = ? WHERE id = ?').run(startDate, latest.id);
    }
    const result = db
      .prepare('INSERT INTO seasons (name, start_date, end_date) VALUES (?, ?, NULL)')
      .run(seasonName, startDate);
    return db
      .prepare('SELECT id, name, start_date, end_date FROM seasons WHERE id = ?')
      .get(result.lastInsertRowid as number) as Season;
  });

  return tx();
}

/**
 * Un-queue (delete) a season that hasn't started yet, re-opening the
 * previous season (its end_date goes back to NULL).
 */
export function deleteQueuedSeason(id: number): void {
  const season = getSeason(id);
  if (!season) throw new Error('Season not found');
  const nowStr = toDbDate(new Date());
  if (season.start_date <= nowStr) {
    throw new Error('Only queued (not-yet-started) seasons can be removed');
  }

  const tx = db.transaction(() => {
    const prev = db
      .prepare('SELECT id FROM seasons WHERE start_date < ? ORDER BY start_date DESC, id DESC LIMIT 1')
      .get(season.start_date) as { id: number } | undefined;
    if (prev) {
      db.prepare('UPDATE seasons SET end_date = NULL WHERE id = ?').run(prev.id);
    }
    db.prepare('DELETE FROM seasons WHERE id = ?').run(id);
  });

  tx();
}

/**
 * Parse a season start input to a DB datetime string.
 * Date-only ('YYYY-MM-DD') is treated as UTC midnight; anything with an
 * explicit time (e.g. datetime-local 'YYYY-MM-DDTHH:mm') is treated as local
 * time (office wall-clock) and converted to UTC.
 */
export function normaliseStartDate(input: string): string {
  const trimmed = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed} 00:00:00`;
  }
  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${input}`);
  }
  return toDbDate(parsed);
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