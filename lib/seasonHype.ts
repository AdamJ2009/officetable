import db from './db';
import { getSeasons, getCurrentSeason, type Season } from './seasons';
import { sendAnnouncementNotification } from './notifications';

/**
 * Season hype: announces upcoming seasons in Google Chat so people race to
 * finish as high as possible in the current one before the reset.
 *
 * Three milestones per future season, each scheduled for a sensible time of
 * day (09:00 office time = the SERVER's local timezone):
 *   - `week`: 7 days before the start
 *   - `day`:  the day before
 *   - `live`: the day of the start, at 09:00 that day (or at the start time
 *     itself if it's later — by then the season has rolled over)
 *
 * Messages only go out while they're fresh: a milestone is eligible from its
 * scheduled time for GRACE_HOURS after (covering evenings/weekends when the
 * server might be off), after which it's skipped so we never post stale hype.
 * Count-down messages are never sent once the season has actually started.
 *
 * A Next.js app has no cron, so the scheduler lives in instrumentation.ts and
 * runs while the server is up; sends are recorded in the `season_hype` table
 * (UNIQUE per season+milestone) so nothing ever goes out twice.
 */

const SEND_HOUR = 9; // 09:00 local
const GRACE_HOURS = 72; // window after the scheduled send time

interface Milestone {
  key: 'week' | 'day' | 'live';
  daysBefore: number;
}

const MILESTONES: Milestone[] = [
  { key: 'week', daysBefore: 7 },
  { key: 'day', daysBefore: 1 },
  { key: 'live', daysBefore: 0 },
];

/** Scheduled send time for a milestone: local 09:00 on the milestone day. */
function scheduledFor(seasonStart: Date, daysBefore: number): Date {
  const scheduled = new Date(seasonStart.getTime());
  scheduled.setDate(scheduled.getDate() - daysBefore);
  scheduled.setHours(SEND_HOUR, 0, 0, 0);
  // "It's live!" only makes sense once the season has actually rolled over
  if (daysBefore === 0 && scheduled < seasonStart) {
    return new Date(seasonStart.getTime());
  }
  return scheduled;
}

function parseDbDateUtc(dateStr: string): Date {
  return new Date(`${dateStr.replace(' ', 'T')}Z`);
}

function formatDbDate(dateStr: string): string {
  return parseDbDateUtc(dateStr).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function buildHypeMessage(milestone: Milestone, season: Season, currentSeason: Season | null) {
  const kickoff = formatDbDate(season.start_date);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  const seasonLabel = `<b>${season.name}</b>`;
  const currentLabel = currentSeason ? `<b>${currentSeason.name}</b>` : 'the current season';

  switch (milestone.key) {
    case 'week':
      return {
        title: `⏳ One week to go until ${season.name}!`,
        subtitle: `New season begins ${kickoff}`,
        paragraphs: [
          `In one week, ${seasonLabel} kicks off and the board resets to zero.`,
          `Make it count: finish as high as you can in ${currentLabel} before the reset — every point between now and then is permanent bragging rights. 🏆`,
        ],
        linkUrl: baseUrl,
        linkText: 'See the current standings',
      };
    case 'day':
      return {
        title: `🚨 ${season.name} starts tomorrow!`,
        subtitle: `Final day of ${currentSeason?.name ?? 'the current season'}`,
        paragraphs: [
          `${seasonLabel} begins ${kickoff} — one last day to climb.`,
          `Whether you're chasing the top or scrambling off the bottom, ${currentLabel} won't wait. A win today matters forever. 💪`,
        ],
        linkUrl: baseUrl,
        linkText: 'Check where you stand',
      };
    case 'live':
      return {
        title: `🎉 ${season.name} is LIVE!`,
        subtitle: 'Board reset — every game counts from now on',
        paragraphs: [
          `${seasonLabel} has begun and everyone starts from zero.`,
          `First match claims the early crown; last place haunts you all season. Who's brave enough to play the opener? ⚔️`,
        ],
        linkUrl: baseUrl,
        linkText: 'The board is open — be the first',
      };
  }
}

// Single-flight guard so overlapping ticks don't double-send
let checking = false;

export interface HypeCheckResult {
  sent: { season: string; milestone: string }[];
  skipped: number;
}

/**
 * Check every season × milestone; send + record anything that's due.
 * `nowOverride` exists for testing.
 */
export async function checkSeasonHype(nowOverride?: Date): Promise<HypeCheckResult> {
  const result: HypeCheckResult = { sent: [], skipped: 0 };
  if (checking) return result;
  checking = true;

  try {
    const now = nowOverride ?? new Date();
    const nowMs = now.getTime();
    const currentSeason = getCurrentSeason();
    const webhookConfigured = Boolean(process.env.GOOGLE_CHAT_WEBHOOK_URL);

    const seasons = getSeasons();
    const checkSent = db.prepare('SELECT 1 as already FROM season_hype WHERE season_id = ? AND milestone = ?');
    const recordSent = db.prepare('INSERT INTO season_hype (season_id, milestone) VALUES (?, ?)');

    for (const season of seasons) {
      const seasonStart = parseDbDateUtc(season.start_date);
      const startMs = seasonStart.getTime();

      for (const milestone of MILESTONES) {
        const scheduledMs = scheduledFor(seasonStart, milestone.daysBefore).getTime();

        if (nowMs < scheduledMs) { result.skipped++; continue; } // not due yet
        if (nowMs > scheduledMs + GRACE_HOURS * 3600000) { result.skipped++; continue; } // stale
        if (milestone.daysBefore > 0 && nowMs >= startMs) { result.skipped++; continue; } // count-down hype after the fact: pointless
        if (checkSent.get(season.id, milestone.key)) { result.skipped++; continue; }

        if (!webhookConfigured) {
          // No webhook: don't record, so enabling one later still delivers
          result.skipped++;
          continue;
        }

        const message = buildHypeMessage(milestone, season, currentSeason);
        try {
          await sendAnnouncementNotification(message);
        } catch (err) {
          // Don't record on failure — the next tick retries
          console.error(`Failed to send season hype (${season.name}/${milestone.key}):`, err);
          continue;
        }
        recordSent.run(season.id, milestone.key);
        result.sent.push({ season: season.name, milestone: milestone.key });
      }
    }

    return result;
  } finally {
    checking = false;
  }
}

let schedulerStarted = false;

/**
 * Called once from instrumentation.ts (nodejs runtime only). Checks
 * immediately, then every 5 minutes while the server is up.
 */
export function startSeasonHypeScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const tick = () => {
    checkSeasonHype().catch(err => console.error('Season hype check failed:', err));
  };

  tick();
  setInterval(tick, 5 * 60 * 1000);
  console.log('Season hype scheduler started (checks every 5 minutes)');
}