/**
 * One-off: rebuild the ladder as Season 5 of a 5-season history ("the last
 * few years"), with Season 6 queued to start Monday 2026-11-02 (00:00 UTC),
 * so all the season scopes (current / past / all-time / upcoming) have real
 * data to inspect.
 *
 * Rather than guess at ledger values, this snapshots the raw match data,
 * wipes the derived data (participants/ratings/achievements/matches), defines
 * the new season scheme, then replays every historical match chronologically
 * through the real processMatch engine — which resolves each match's season
 * from its timestamp, resets season ledgers at boundaries and keeps the
 * all-time ledger continuous. Achievements are then rebuilt with
 * recalculateAllAchievements (per-season, resolved per match).
 *
 * is_edited / edited_at flags are preserved via positional pairing: the
 * replay iterates matches in the same deterministic order (played_at, id) as
 * the snapshot read, and each replayed match inserts exactly one new row.
 *
 * Usage: npx tsx scripts/split-seasons.ts
 */

import db from '../lib/db';
import { processMatch } from '../lib/elo';
import { recalculateAllAchievements } from '../lib/achievements';

const SEASONS: { name: string; start: string; end: string | null }[] = [
  { name: 'Season 1', start: '2016-05-25 00:00:00', end: '2018-01-01 00:00:00' },
  { name: 'Season 2', start: '2018-01-01 00:00:00', end: '2020-01-01 00:00:00' },
  { name: 'Season 3', start: '2020-01-01 00:00:00', end: '2023-01-01 00:00:00' },
  { name: 'Season 4', start: '2023-01-01 00:00:00', end: '2025-01-01 00:00:00' },
  { name: 'Season 5', start: '2025-01-01 00:00:00', end: '2026-11-02 00:00:00' },
  { name: 'Season 6', start: '2026-11-02 00:00:00', end: null }, // queued
];

const parseDbDate = (ts: string) => new Date(`${ts.replace(' ', 'T')}Z`);

interface OldMatch {
  id: number;
  game_id: number;
  played_at: string;
  notes: string | null;
  is_edited: number;
  edited_at: string | null;
}

interface OldParticipant {
  match_id: number;
  player_id: number;
  team: number;
  score: number;
}

async function main() {
  // ---- 1. Snapshot raw data ------------------------------------------------
  const oldMatches = db.prepare(`
    SELECT id, game_id, played_at, notes, is_edited, edited_at
    FROM matches
    ORDER BY played_at ASC, id ASC
  `).all() as OldMatch[];

  const oldParticipants = db.prepare(`
    SELECT match_id, player_id, team, score
    FROM match_participants
    ORDER BY match_id, id ASC
  `).all() as OldParticipant[];

  const participantsByMatch = new Map<number, OldParticipant[]>();
  for (const p of oldParticipants) {
    if (!participantsByMatch.has(p.match_id)) participantsByMatch.set(p.match_id, []);
    participantsByMatch.get(p.match_id)!.push(p);
  }

  console.log(`snapshot: ${oldMatches.length} matches, ${oldParticipants.length} participants`);

  // ---- 2. Wipe derived data + define the new season scheme ------------------
  db.transaction(() => {
    db.prepare('DELETE FROM season_hype').run();
    db.prepare('DELETE FROM player_achievements').run();
    db.prepare('DELETE FROM match_participants').run();
    db.prepare('DELETE FROM matches').run();
    db.prepare('DELETE FROM player_ratings').run();
    db.prepare('DELETE FROM seasons').run();
    db.prepare(`DELETE FROM sqlite_sequence WHERE name IN ('matches', 'match_participants', 'player_achievements', 'seasons')`).run();

    for (const s of SEASONS) {
      db.prepare('INSERT INTO seasons (name, start_date, end_date) VALUES (?, ?, ?)').run(s.name, s.start, s.end);
    }
  })();

  console.log('season scheme defined; wiped derived data');

  // ---- 3. Replay every match through processMatch ----------------------------
  // Achievements get checked during replay too, but that work is discarded:
  // step 4 wipes and rebuilds them across all seasons.
  const preserveFlags = db.prepare(`UPDATE matches SET is_edited = ?, edited_at = ? WHERE id = ?`);

  let done = 0;
  for (const old of oldMatches) {
    const parts = participantsByMatch.get(old.id) ?? [];
    const teams: { team: number; player_ids: number[]; score: number }[] = [];
    for (const p of parts) {
      let team = teams.find(t => t.team === p.team);
      if (!team) {
        team = { team: p.team, player_ids: [], score: p.score };
        teams.push(team);
      }
      team.player_ids.push(p.player_id);
    }

    const { matchId } = processMatch(
      {
        game_id: old.game_id,
        notes: old.notes ?? undefined,
        teams,
      },
      parseDbDate(old.played_at)
    );

    // is_edited/edited_at ride along positionally (same deterministic order)
    if (old.is_edited || old.edited_at) {
      preserveFlags.run(old.is_edited, old.edited_at, matchId);
    }

    done++;
    if (done % 500 === 0) console.log(`  replayed ${done}/${oldMatches.length}`);
  }
  console.log(`replay complete: ${done} matches`);

  // ---- 4. Rebuild achievements across all seasons ----------------------------
  console.log('recalculating achievements for all games...');
  const recalc = recalculateAllAchievements();
  for (const r of recalc) {
    console.log(`  ${r.game_name}: ${r.matches_processed} matches -> ${r.achievements_awarded} achievements`);
  }

  // ---- 5. Report -------------------------------------------------------------
  console.log('\n--- verification ---');

  const seasonStats = db.prepare(`
    SELECT s.id, s.name, s.end_date, COUNT(m.id) as matches
    FROM seasons s
    LEFT JOIN matches m ON m.season_id = s.id
    GROUP BY s.id ORDER BY s.start_date
  `).all() as { id: number; name: string; end_date: string | null; matches: number }[];
  for (const s of seasonStats) console.log(`  ${s.name}: ${s.matches} matches${s.end_date ? ` (ends ${s.end_date})` : ' (queued/open)'}`);

  const orphan = (db.prepare('SELECT COUNT(*) c FROM matches WHERE season_id = 0').get() as { c: number }).c;
  console.log(`\n  matches on all-time sentinel (must be 0): ${orphan}`);

  const partCount = (db.prepare('SELECT COUNT(*) c FROM match_participants').get() as { c: number }).c;
  console.log(`  participants (was ${oldParticipants.length}): ${partCount}`);

  // Zero-sum sanity: every match's deltas sum to 0 in both ledgers
  const ledgerSum = db.prepare(`
    SELECT m.id,
      SUM(mp.elo_after - mp.elo_before) as season_sum,
      SUM(mp.alltime_elo_after - mp.alltime_elo_before) as alltime_sum
    FROM matches m JOIN match_participants mp ON mp.match_id = m.id
    GROUP BY m.id
    HAVING ABS(season_sum) > 0.0001 OR ABS(alltime_sum) > 0.0001
  `).all() as unknown[];
  console.log(`  matches with non-zero-sum deltas (must be 0): ${ledgerSum.length}`);

  // Current vs all-time divergence on game 1
  for (const scope of ['current', 'alltime']) {
    const seasonId = scope === 'current'
      ? (db.prepare(`SELECT id FROM seasons WHERE start_date <= datetime('now') ORDER BY start_date DESC LIMIT 1`).get() as { id: number }).id
      : 0;
    const top = db.prepare(`
      SELECT p.name, pr.elo FROM player_ratings pr
      JOIN players p ON p.id = pr.player_id
      WHERE pr.game_id = 1 AND pr.season_id = ?
      ORDER BY pr.elo DESC LIMIT 5
    `).all(scope === 'current' ? seasonId : 0) as { name: string; elo: number }[];
    console.log(`\n  game 1 top 5 (${scope}, ledger ${scope === 'current' ? seasonId : 0}):`);
    for (const row of top) console.log(`    ${row.name.padEnd(10)} ${row.elo.toFixed(1)}`);
  }

  const achPerSeason = db.prepare(`
    SELECT season_id, COUNT(*) c FROM player_achievements GROUP BY season_id ORDER BY season_id
  `).all() as { season_id: number; c: number }[];
  console.log(`\n  achievements per season: ${JSON.stringify(achPerSeason)}`);

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });