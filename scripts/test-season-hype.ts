// Exercises the season-hype pipeline end-to-end against the real webhook:
// queues a throwaway season far in the future, then forces the clock to each
// milestone's scheduled send time (09:00 office time) so the messages go out
// right now. Cleans up the test season + send log afterwards.
//
// Usage: npx tsx scripts/test-season-hype.ts

import * as fs from 'fs';
import * as path from 'path';

// Load .env (tsx doesn't do this automatically)
try {
  const envPath = path.join(__dirname, '..', '.env');
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*'?\"?([^'\"]*)'?\"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  // No .env file; rely on environment variables
}

import db from '../lib/db';
import { createSeason, deleteQueuedSeason } from '../lib/seasons';
import { checkSeasonHype } from '../lib/seasonHype';

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  console.log(`${cond ? 'ok' : 'FAIL'}: ${name}`, cond ? '' : (detail ?? ''));
  if (!cond) failures++;
}

async function main() {
  // 1. Queue a throwaway season: Monday 1 March 2027, 09:00
  const testSeason = createSeason('2027-03-01T09:00', 'Season TEST');
  console.log(`queued test season: ${testSeason.name} (id ${testSeason.id}, start ${testSeason.start_date})\n`);

  const logCount = () =>
    (db.prepare('SELECT COUNT(*) c FROM season_hype WHERE season_id = ?').get(testSeason.id) as { c: number }).c;

  // 2. Force the clock to one week before, 09:01 -> 'week' message should send
  let res = await checkSeasonHype(new Date('2027-02-22T09:01:00'));
  check('week milestone sends exactly one message', res.sent.length === 1 && res.sent[0].milestone === 'week', res.sent);
  check('week message logged', logCount() === 1, logCount());

  // 3. Same clock again -> nothing new (already sent)
  res = await checkSeasonHype(new Date('2027-02-22T09:01:00'));
  check('week milestone does not re-send', res.sent.length === 0, res.sent);

  // 4. Day before -> 'day' message
  res = await checkSeasonHype(new Date('2027-02-28T09:01:00'));
  check('day milestone sends exactly one message', res.sent.length === 1 && res.sent[0].milestone === 'day', res.sent);

  // 5. Day of (season just rolled over at 09:00) -> 'live' message; also makes
  //    sure week/day hype does NOT re-fire after the season started
  res = await checkSeasonHype(new Date('2027-03-01T09:01:00'));
  check('live milestone sends exactly one message on the day', res.sent.length === 1 && res.sent[0].milestone === 'live', res.sent);
  check('all three milestones logged', logCount() === 3, logCount());

  // 6. Stale: a season whose scheduled week message went past the grace window
  const staleSeason = createSeason('2028-03-01T09:00', 'Season STALE');
  res = await checkSeasonHype(new Date('2028-03-01T10:00:00')); // week was due 2028-02-23 09:00 -> >72h stale
  check('stale week message is skipped', !res.sent.find(s => s.season === 'Season STALE' && s.milestone === 'week'), res.sent);

  console.log(`\n${failures === 0 ? 'ALL HYPE CHECKS PASSED' : `${failures} HYPE CHECKS FAILED`} — messages above went to the test channel`);

  // 7. Clean up the test seasons and their send log (un-queue re-opens the
  //    previous season's end_date, so cleanup leaves no side effects)
  db.prepare('DELETE FROM season_hype WHERE season_id = ?').run(staleSeason.id);
  deleteQueuedSeason(staleSeason.id);
  db.prepare('DELETE FROM season_hype WHERE season_id = ?').run(testSeason.id);
  deleteQueuedSeason(testSeason.id);
  console.log('cleaned up test seasons + hype log');

  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });