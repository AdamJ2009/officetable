/**
 * Import historic matches from space-separated format:
 * "Player on Team 2" "Score for Team 2" "Player for Team 1" "Score for Team 1" "UNIX epoch time"
 *
 * Usage: npx tsx scripts/import-matches.ts <game_id> < input.txt
 *
 * Example input:
 * Alice 10 Bob 5 1712053200
 */

import * as readline from 'readline';
import db from '../lib/db';
import { processMatch } from '../lib/elo';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function main() {
  const gameId = parseInt(process.argv[2], 10);

  if (!gameId) {
    console.error('Usage: npx tsx scripts/import-matches.ts <game_id> < input.txt');
    console.error('Example: npx tsx scripts/import-matches.ts 1 < matches.txt');
    process.exit(1);
  }

  // Verify game exists
  const game = db.prepare('SELECT id FROM games WHERE id = ?').get(gameId) as { id: number } | undefined;
  if (!game) {
    console.error(`Game with id ${gameId} not found`);
    process.exit(1);
  }

  console.log(`Importing matches for game_id=${gameId}...`);
  console.log('Format: Player2 Score2 Player1 Score1 Timestamp');
  console.log('---');

  // Get or create player
  function getOrCreatePlayer(name: string): number {
    const existing = db.prepare('SELECT id FROM players WHERE name = ?').get(name) as { id: number } | undefined;
    if (existing) return existing.id;

    const result = db.prepare('INSERT INTO players (name) VALUES (?)').run(name);
    console.log(`  Created new player: ${name}`);
    return result.lastInsertRowid as number;
  }

  // Process a single match
  function processMatchWithTimestamp(
    player1Name: string,
    player1Score: number,
    player2Name: string,
    player2Score: number,
    timestamp: number
  ) {
    const player1Id = getOrCreatePlayer(player1Name);
    const player2Id = getOrCreatePlayer(player2Name);

    // Get current ratings before processing
    const rating1Before = db.prepare('SELECT elo FROM player_ratings WHERE player_id = ? AND game_id = ?')
      .get(player1Id, gameId) as { elo: number } | undefined;
    const rating2Before = db.prepare('SELECT elo FROM player_ratings WHERE player_id = ? AND game_id = ?')
      .get(player2Id, gameId) as { elo: number } | undefined;

    // Process the match with the timestamp
    const matchDate = new Date(timestamp * 1000);
    processMatch({
      game_id: gameId,
      teams: [
        { team: 0, player_ids: [player1Id], score: player1Score },
        { team: 1, player_ids: [player2Id], score: player2Score },
      ],
    }, matchDate);

    // Get ratings after
    const rating1After = db.prepare('SELECT elo FROM player_ratings WHERE player_id = ? AND game_id = ?')
      .get(player1Id, gameId) as { elo: number };
    const rating2After = db.prepare('SELECT elo FROM player_ratings WHERE player_id = ? AND game_id = ?')
      .get(player2Id, gameId) as { elo: number };

    const result = player1Score > player2Score ? 'W' : player1Score < player2Score ? 'L' : 'D';
    console.log(`  ${player1Name} (${player1Score}) vs ${player2Name} (${player2Score}) [${result}]`);
    console.log(`    ${player1Name}: Elo ${rating1Before?.elo ?? 0} → ${rating1After.elo}`);
    console.log(`    ${player2Name}: Elo ${rating2Before?.elo ?? 0} → ${rating2After.elo}`);
  }

  const lines: string[] = [];

  for await (const line of rl) {
    lines.push(line.trim());
  }

  // Sort by timestamp (last column)
  lines.sort((a, b) => {
    const aParts = a.split(/\s+/);
    const bParts = b.split(/\s+/);
    const aTime = parseInt(aParts[aParts.length - 1], 10);
    const bTime = parseInt(bParts[bParts.length - 1], 10);
    return aTime - bTime;
  });

  console.log(`Found ${lines.length} matches to import.\n`);

  for (const line of lines) {
    if (!line) continue;

    const parts = line.split(/\s+/);
    if (parts.length !== 5) {
      console.error(`Skipping invalid line: ${line}`);
      continue;
    }

    const [player2Name, score2Str, player1Name, score1Str, timestampStr] = parts;

    const score2 = parseInt(score2Str, 10);
    const score1 = parseInt(score1Str, 10);
    const timestamp = parseInt(timestampStr, 10);

    if (isNaN(score1) || isNaN(score2) || isNaN(timestamp)) {
      console.error(`Skipping invalid line: ${line}`);
      continue;
    }

    processMatchWithTimestamp(player1Name, score1, player2Name, score2, timestamp);
  }

  console.log('\n---');
  console.log('Import complete!');

  // Show final leaderboard
  console.log('\nFinal Leaderboard:');
  const leaderboard = db.prepare(`
    SELECT p.name, pr.elo
    FROM player_ratings pr
    JOIN players p ON pr.player_id = p.id
    WHERE pr.game_id = ?
    ORDER BY pr.elo DESC
  `).all(gameId) as { name: string; elo: number }[];

  console.log('Player                 Elo');
  console.log('-'.repeat(30));
  for (const entry of leaderboard) {
    console.log(`${entry.name.padEnd(20)} ${Math.round(entry.elo).toString().padStart(8)}`);
  }

  process.exit(0);
}

main();