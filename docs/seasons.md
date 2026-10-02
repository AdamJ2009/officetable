# Officetable — Seasons + Dual-Ledger Elo

## Goal
Introduce seasons: per-season Elo that flat-resets to 0 at each season start, alongside a never-resetting all-time ledger. Same matches, independently computed deltas per ledger. Achievements scoped to the current season (re-earnable each season). All-time views are aggregates over all data.

## 1. Data model
- New `seasons` table: `id INTEGER PK`, `name TEXT`, `start_date DATETIME NOT NULL`, `end_date DATETIME NULL` (NULL = open). Intervals are half-open `[start_date, end_date)`.
- Reserve `season_id = 0` as the **all-time ledger sentinel** (never a real season row; note SQLite treats NULL as non-unique in UNIQUE indexes, hence sentinel, not NULL).
- `matches`: add `season_id INTEGER NOT NULL` + index `(game_id, season_id, played_at)`. Season is resolved from `played_at`, not from insert date (late-entered matches slot correctly).
- `player_ratings`: add `season_id INTEGER NOT NULL DEFAULT 0`; unique constraint becomes `UNIQUE(player_id, game_id, season_id)`.
- `match_participants`: add `alltime_elo_before REAL`, `alltime_elo_after REAL` (existing `elo_before/elo_after` keep their meaning: the match's own **season ledger**).
- `player_achievements`: add `season_id INTEGER NOT NULL`.
- Helper: `resolveSeason(playedAt) → number` — the season whose interval contains the timestamp.

## 2. Elo engine (`lib/elo.ts`)
- `getOrCreatePlayerRating(playerId, gameId, seasonId)` — creates missing rows at `DEFAULT_ELO = 0` (new players seed 0 in **both** ledgers; all-time just never resets).
- `processMatch` runs the existing delta computation **twice**, once per ledger:
  - All-time ledger: seeded from continuous all-time ratings.
  - Season ledger: seeded from current-season ratings (0 at season start).
  - Expected-score inputs come from each ledger's own ratings — do NOT share deltas between ledgers. Persist both deltas on the participants row.
- `correctMatch` / `deleteMatchAndReplay`: replay **both** ledgers in order. While replaying, resolve each match's season from its timestamp; when the replay crosses into a new season, reset every player's in-memory rating map to 0 for the **season** ledger only. All-time ledger replays straight through, no resets.
- Rank-shift calc + inactive filtering in `app/api/matches/route.ts`: rank before/after within the **season** ledger (that's the live competition).

## 3. Migration (idempotent, existing try/catch ALTER style in `db.ts`)
1. Create `seasons`; insert **Season 0** (`start_date` = earliest match timestamp, `end_date` = new season start) and **Season 1** (`start_date` = the set date a few weeks out, `end_date` NULL). Make the boundary date configurable.
2. Backfill all `matches.season_id` = Season 0.
3. Existing `player_ratings` rows: set `season_id` = Season 0. Then duplicate each row with `season_id = 0` (all-time), same elo. Current values are already correct for both — no replay required.
4. Backfill `alltime_elo_before/after` = existing `elo_before/elo_after` values.
5. Backfill `player_achievements.season_id` = Season 0 (match-linked earns resolve via their match's season).

## 4. API + Views
- Add `scope` param (`season` | `alltime`, default `season`) + optional `season_id` (past seasons) to: `leaderboard`, `matches`, `player-stats`, `game-stats`, `head-to-head`. `scope=alltime` ⇒ `season_id=0`.
- Current season = the season with `start_date <= now`, greatest `start_date`.
- **Inactivity rule (60 days)** applies to the current-season leaderboard and rank notifications only. Past-season and all-time views show everyone — historical views shouldn't banish people.
- UI: season picker + all-time toggle on the leaderboard (default = current season). Player `EloChart`: all-time = one continuous series; season scope = segmented series so resets are visible discontinuities. Match detail shows season ledger deltas by default, with all-time values available.

## 5. Achievements
- `checkAchievements` context gains `seasonId`; game-count and streak queries filter matches to the season; elo-diff achievements (`against_the_odds`, `boss_fight`, rank ones) use the **season ledger**.
- Re-earnable per season: uniqueness per `(player_id, game_id, achievement_id, season_id)`.
- **Exception to confirm:** `fresh_blood` should stay "first game *ever*" (all-time definition). Season-scoping it would mint it for every matchup at each season opener — achievement farm simulator.
- Admin `recalculate-achievements` route gains a season param.

## 6. Acceptance checks
- Post-migration: current leaderboard and all-time leaderboard identical to pre-migration values, byte for byte.
- Delta divergence: after Season 1 starts, a match's `elo_after` (season) ≠ `alltime_elo_after` where skill gaps exist; identical when the season is fresh and both ledgers agree.
- Correct a match one game after a season boundary: season ledger re-seeds from 0, all-time ledger replays continuously.
- Import script (`scripts/import-matches.ts`) spanning the Season 0→1 boundary resolves seasons correctly by date.
- Audit `lib/punditry.ts` for elo reads — scope them to the season ledger.
