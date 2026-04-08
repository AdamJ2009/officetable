import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'officetable.db');
const db = new Database(dbPath);

// Initialize schema
db.exec(`
  -- Players table
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Games table (game types)
  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Player ratings per game (separate skill tracking)
  CREATE TABLE IF NOT EXISTS player_ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    game_id INTEGER NOT NULL,
    elo REAL DEFAULT 0,
    UNIQUE(player_id, game_id),
    FOREIGN KEY (player_id) REFERENCES players(id),
    FOREIGN KEY (game_id) REFERENCES games(id)
  );

  -- Matches table
  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    FOREIGN KEY (game_id) REFERENCES games(id)
  );

  -- Match participants (supports teams)
  CREATE TABLE IF NOT EXISTS match_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    team INTEGER NOT NULL,
    score INTEGER NOT NULL,
    elo_before REAL NOT NULL,
    elo_after REAL NOT NULL,
    FOREIGN KEY (match_id) REFERENCES matches(id),
    FOREIGN KEY (player_id) REFERENCES players(id)
  );
`);

// Migration: Add status column to players table if it doesn't exist
try {
  db.exec(`ALTER TABLE players ADD COLUMN status TEXT DEFAULT 'active'`);
} catch (e) {
  // Column already exists, ignore
}

// Migration: Add score_type and score_value columns to games table if they don't exist
try {
  db.exec(`ALTER TABLE games ADD COLUMN score_type TEXT DEFAULT 'first_to'`);
} catch (e) {
  // Column already exists, ignore
}
try {
  db.exec(`ALTER TABLE games ADD COLUMN score_value INTEGER DEFAULT 10`);
} catch (e) {
  // Column already exists, ignore
}

// Migration: Add elo column to player_ratings if it doesn't exist (old schema had mu/sigma)
try {
  db.exec(`ALTER TABLE player_ratings ADD COLUMN elo REAL DEFAULT 0`);
} catch (e) {
  // Column already exists, ignore
}

// Migration: Add elo_before/elo_after to match_participants if they don't exist
try {
  db.exec(`ALTER TABLE match_participants ADD COLUMN elo_before REAL DEFAULT 0`);
} catch (e) {
  // Column already exists, ignore
}
try {
  db.exec(`ALTER TABLE match_participants ADD COLUMN elo_after REAL DEFAULT 0`);
} catch (e) {
  // Column already exists, ignore
}

// Migration: Convert existing mu values to elo (if mu exists and elo is null/default)
try {
  // Check if mu column exists (old schema)
  const tableInfo = db.prepare(`PRAGMA table_info(player_ratings)`).all() as { name: string }[];
  const hasMu = tableInfo.some(col => col.name === 'mu');

  if (hasMu) {
    // Convert mu to elo: scale from ~25 centered to 0 centered
    // mu values typically range 0-50, so multiply by 40 to get to 0-2000 range, then subtract 1000
    db.exec(`UPDATE player_ratings SET elo = ROUND(mu * 40 - 1000) WHERE elo IS NULL OR elo = 0`);
  }
} catch (e) {
  // Migration failed or already done, ignore
}

// Migration: Convert existing mu_before/mu_after in match_participants to elo
try {
  const tableInfo = db.prepare(`PRAGMA table_info(match_participants)`).all() as { name: string }[];
  const hasMuBefore = tableInfo.some(col => col.name === 'mu_before');

  if (hasMuBefore) {
    db.exec(`UPDATE match_participants SET elo_before = ROUND(mu_before * 40 - 1000) WHERE elo_before IS NULL OR elo_before = 0`);
    db.exec(`UPDATE match_participants SET elo_after = ROUND(mu_after * 40 - 1000) WHERE elo_after IS NULL OR elo_after = 0`);
  }
} catch (e) {
  // Migration failed or already done, ignore
}

// Migration: Shift all existing elo values from 1000-centered to 0-centered
// This only runs once when transitioning from the old 1000-default system
try {
  // Check if we need to migrate (elo values around 1000 indicate old system)
  const sampleRating = db.prepare(`SELECT elo FROM player_ratings WHERE elo IS NOT NULL LIMIT 1`).get() as { elo: number } | undefined;

  // If no ratings yet, nothing to migrate
  // If elo is around 1000 (old default), we need to shift all values by -1000
  // The mu migration already handles conversion to 0-centered, so we only shift if needed
  if (sampleRating && sampleRating.elo >= 500) {
    // Values are from the old 1000-centered system, shift them
    db.exec(`UPDATE player_ratings SET elo = elo - 1000 WHERE elo IS NOT NULL`);
    db.exec(`UPDATE match_participants SET elo_before = elo_before - 1000 WHERE elo_before IS NOT NULL`);
    db.exec(`UPDATE match_participants SET elo_after = elo_after - 1000 WHERE elo_after IS NOT NULL`);
  }
} catch (e) {
  // Migration failed or already done, ignore
}

// Seed games with scoring configuration if not exists
const seedGames = db.prepare(`
  INSERT OR IGNORE INTO games (name, score_type, score_value) VALUES
    ('foosball', 'best_of', 10),
    ('table-tennis', 'first_to', 11),
    ('pool', 'first_to', 7)
`);
seedGames.run();

export default db;