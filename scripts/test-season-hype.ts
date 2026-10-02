// Exercises the season-hype pipeline end-to-end against the real webhook:
// queues throwaway seasons far in the future, then forces the clock to each
// milestone's scheduled send time so the messages go out right now.
// Also verifies weekday-aware scheduling (weekend milestones nudge back to
// Friday 09:00) and the exactly-once semantics. Cleans up afterwards.
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

function sentMilestones(res: { sent: { season: string; milestone: string }[] }, season: string): string[] {
  return res.sent.filter(s => s.season === season).map(s => s.milestone);
}

async function main() {
  // 1. Monday 1 March 2027, 09:00 — all milestone days are weekdays except
  //    the day-before (Sun 28 Feb, which should nudge to Fri 26 Feb)
  const mondaySeason = createSeason('2027-03-01T09:00', 'Season TEST');
  console.log(`queued ${mondaySeason.name} (id ${mondaySeason.id}, start ${mondaySeason.start_date})\n`);

  const logCount = (seasonId: number) =>
    (db.prepare('SELECT COUNT(*) c FROM season_hype WHERE season_id = ?').get(seasonId) as { c: number }).c;

  // 2. One week before (Mon 22 Feb, 09:01) -> 'week'
  let res = await checkSeasonHype(new Date('2027-02-22T09:01:00'));
  check('week milestone sends exactly one message', sentMilestones(res, mondaySeason.name).join(',') === 'week', res.sent);
  check('week message logged', logCount(mondaySeason.id) === 1, logCount(mondaySeason.id));

  // 3. Same clock again -> nothing new (already sent)
  res = await checkSeasonHype(new Date('2027-02-22T09:01:00'));
  check('week milestone does not re-send', res.sent.length === 0, res.sent);

  // 4. Weekend-shifted day-before (Fri 26 Feb 09:01 — the Sun was nudged back)
  res = await checkSeasonHype(new Date('2027-02-26T09:01:00'));
  check('day milestone sends on the Friday (weekend shift)', sentMilestones(res, mondaySeason.name).join(',') === 'day', res.sent);

  // 5. Day of (season rolled over at 09:00) -> 'live'; week/day hype must
  //    NOT re-fire after the season started
  res = await checkSeasonHype(new Date('2027-03-01T09:01:00'));
  check('live milestone sends exactly one message on the day', sentMilestones(res, mondaySeason.name).join(',') === 'live', res.sent);
  check('all three milestones logged', logCount(mondaySeason.id) === 3, logCount(mondaySeason.id));

  // 6. Sunday start: week milestone (Sun 28 Feb) nudges back to Fri 26 Feb
  //    with a truthful "9 days to go" copy
  const sundaySeason = createSeason('2027-03-07T09:00', 'Season SUNDAY');
  console.log(`queued ${sundaySeason.name} (id ${sundaySeason.id}, start ${sundaySeason.start_date})`);
  res = await checkSeasonHype(new Date('2027-02-26T09:05:00'));
  check('Sunday-start week message sends on the Friday', sentMilestones(res, sundaySeason.name).join(',') === 'week', res.sent);

  // 7. Stale: a season whose scheduled week message went past the grace window
  const staleSeason = createSeason('2028-03-01T09:00', 'Season STALE');
  res = await checkSeasonHype(new Date('2028-03-01T10:00:00')); // week was due late Feb -> >72h stale
  check('stale week message is skipped', !sentMilestones(res, staleSeason.name).includes('week'), res.sent);

  console.log(`\n${failures === 0 ? 'ALL HYPE CHECKS PASSED' : `${failures} HYPE CHECKS FAILED`} — messages above went to the test channel`);

  // 8. Clean up: un-queue re-opens the previous season's end_date, so
  //    cleanup leaves no side effects
  for (const season of [mondaySeason, sundaySeason, staleSeason]) {
    db.prepare('DELETE FROM season_hype WHERE season_id = ?').run(season.id);
    deleteQueuedSeason(season.id);
  }
  console.log('cleaned up test seasons + hype log');

  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });