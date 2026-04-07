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
    mu REAL DEFAULT 25,
    sigma REAL DEFAULT 8.333,
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
    mu_before REAL NOT NULL,
    mu_after REAL NOT NULL,
    sigma_before REAL NOT NULL,
    sigma_after REAL NOT NULL,
    FOREIGN KEY (match_id) REFERENCES matches(id),
    FOREIGN KEY (player_id) REFERENCES players(id)
  );
`);

// Add score_type and score_value columns to games table if they don't exist
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

// Seed games with scoring configuration if not exists
const seedGames = db.prepare(`
  INSERT OR IGNORE INTO games (name, score_type, score_value) VALUES
    ('foosball', 'best_of', 10),
    ('table-tennis', 'first_to', 11),
    ('pool', 'first_to', 7)
`);
seedGames.run();

export default db;