// Sends test match notifications through the real pipeline (buildMatchNotification
// + sendGoogleChatNotification) so you can see how the cards look in Google Chat.
//
// Reads GOOGLE_CHAT_WEBHOOK_URL and NEXT_PUBLIC_BASE_URL from the environment / .env.
//
// Usage:
//   npx tsx scripts/send-test-notifications.ts            # send to Google Chat
//   npx tsx scripts/send-test-notifications.ts --dry-run  # just print the payloads

import { buildMatchNotification, sendGoogleChatNotification, buildChatCardsPayload } from '../lib/notifications';
import fs from 'fs';
import path from 'path';

// Load .env from the project root (tsx doesn't do this automatically)
try {
  const envPath = path.join(__dirname, '..', '.env');
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*'?"?([^'"]*)'?"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  // No .env file; rely on environment variables
}

const DRY_RUN = process.argv.includes('--dry-run');
const DUMP_DIR = process.argv.includes('--dump-cards') ? '/tmp/chat-payloads' : null;

// Stand-in avatars to simulate what uploaded player avatars look like in the card.
// In real notifications these URLs point at the app's /api/players/<id>/avatar endpoint.
const avatars = new Map<number, string>([
  [1, 'https://i.pravatar.cc/150?img=12'],
  [2, 'https://i.pravatar.cc/150?img=32'],
  [3, 'https://i.pravatar.cc/150?img=57'],
]);

const elo = (before: number, after: number) => ({ before, after, change: after - before });

async function send(label: string, ...args: Parameters<typeof buildMatchNotification>) {
  const notification = buildMatchNotification(...args);
  if (DUMP_DIR) {
    const payload = buildChatCardsPayload(notification);
    const file = path.join(DUMP_DIR, `${label.replace(/\s+/g, '-')}.json`);
    fs.writeFileSync(file, JSON.stringify(payload));
    console.log('dumped:', file);
    return;
  }
  if (DRY_RUN) {
    console.log(`--- ${label} ---`);
    console.log(JSON.stringify(notification, (_k, v) => (v instanceof Map ? Object.fromEntries(v) : v), 2));
    return;
  }
  await sendGoogleChatNotification(notification);
  console.log('sent:', label);
  // Be polite to the webhook endpoint
  await new Promise(r => setTimeout(r, 1500));
}

async function main() {
  if (DUMP_DIR) fs.mkdirSync(DUMP_DIR, { recursive: true });

  if (!DRY_RUN && !DUMP_DIR && !process.env.GOOGLE_CHAT_WEBHOOK_URL) {
    console.error('GOOGLE_CHAT_WEBHOOK_URL is not set (add it to .env or the environment).');
    process.exit(1);
  }

  // Header always shows the sport (game image, or emoji when unset).
  // The face-off section always renders: avatars where available, person placeholders otherwise.

  // 1. WIN 1v2 with avatars, game has an image -> sport header + face-off columns (2 rows vs 1)
  await send(
    'win with avatars',
    'table-tennis',
    9001,
    [{ player_ids: [1], score: 10 }, { player_ids: [2, 3], score: 7 }],
    new Map([[1, 'Alex'], [2, 'Sam'], [3, 'Jamie']]),
    new Map([[1, elo(120.5, 124.8)], [2, elo(90.2, 87.9)], [3, elo(80.1, 77.8)]]),
    'https://images.pexels.com/photos/11891365/pexels-photo-11891365.jpeg', // game image
    'What a comeback in the final rally!',
    new Map([[1, 1], [2, -1], [3, -1]]),
    [{ playerId: 1, achievementName: 'on_fire', achievementIcon: '🔥' }],
    [{ description: 'Alex has now won 5 in a row against Sam.' }],
    avatars
  );

  // 2. WIN 1v1 without avatars, game has an image -> sport header + face-off with person placeholders
  await send(
    'win without avatars with game image',
    'foosball',
    9002,
    [{ player_ids: [4], score: 3 }, { player_ids: [5], score: 10 }],
    new Map([[4, 'Priya'], [5, 'Tom']]),
    new Map([[4, elo(75.0, 72.1)], [5, elo(60.0, 62.9)]]),
    'https://images.pexels.com/photos/11725503/pexels-photo-11725503.jpeg', // game image
    null,
    new Map([[4, -1], [5, 1]]),
    [],
    [{ description: 'Tom flips the table standings with this win.' }],
    undefined
  );

  // 3. DRAW without avatars, game has no image -> default handshake emoji + face-off with person placeholders
  await send(
    'draw without avatars',
    'pool',
    9003,
    [{ player_ids: [6], score: 5 }, { player_ids: [7], score: 5 }],
    new Map([[6, 'Nadia'], [7, 'Ben']]),
    new Map([[6, elo(88.0, 89.0)], [7, elo(88.0, 89.0)]]),
    null,
    null,
    new Map([[6, 0], [7, 0]]),
    [],
    [],
    undefined
  );

  // 4. DRAW 2v2 with mixed avatars, game has no image -> emoji header + face-off (2 players each)
  await send(
    'draw with avatars',
    'table-tennis',
    9004,
    [{ player_ids: [1, 2], score: 9 }, { player_ids: [3, 4], score: 9 }],
    new Map([[1, 'Alex'], [2, 'Sam'], [3, 'Jamie'], [4, 'Priya']]),
    new Map([[1, elo(124.8, 125.6)], [2, elo(87.9, 88.7)], [3, elo(80.1, 81.1)], [4, elo(60.0, 61.0)]]),
    null,
    null,
    new Map([[1, 0], [2, 0], [3, 0], [4, 0]]),
    [],
    [],
    avatars
  );

  console.log(DRY_RUN ? 'dry run complete' : DUMP_DIR ? 'payloads dumped' : 'all test notifications sent');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });