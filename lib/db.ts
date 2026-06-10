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

// Migration: Add edit tracking columns to matches table
try {
  db.exec(`ALTER TABLE matches ADD COLUMN is_edited INTEGER DEFAULT 0`);
} catch (e) {
  // Column already exists, ignore
}
try {
  db.exec(`ALTER TABLE matches ADD COLUMN edited_at DATETIME`);
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

// Migration: Add image_url column to games table for notification icons
try {
  db.exec(`ALTER TABLE games ADD COLUMN image_url TEXT`);
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

// Settings table for app configuration (branding, theming, etc.)
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Seed default settings if not exists
const seedSettings = db.prepare(`
  INSERT OR IGNORE INTO settings (key, value) VALUES
    ('company_name', 'Office Games'),
    ('logo_url', ''),
    ('primary_color', '#2563eb'),
    ('accent_color', '#dc2626'),
    ('inactive_threshold_days', '60')
`);
seedSettings.run();

// Seed games with scoring configuration if not exists
const seedGames = db.prepare(`
  INSERT OR IGNORE INTO games (name, score_type, score_value) VALUES
    ('foosball', 'best_of', 10),
    ('table-tennis', 'first_to', 11),
    ('pool', 'first_to', 7)
`);
seedGames.run();

// Achievements table - defines all possible achievements
db.exec(`
  CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    icon TEXT
  )
`);

// Player achievements - tracks achievements earned by players (can earn multiple times)
db.exec(`
  CREATE TABLE IF NOT EXISTS player_achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    game_id INTEGER NOT NULL,
    achievement_id INTEGER NOT NULL,
    match_id INTEGER,
    earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT,
    FOREIGN KEY (player_id) REFERENCES players(id),
    FOREIGN KEY (game_id) REFERENCES games(id),
    FOREIGN KEY (achievement_id) REFERENCES achievements(id),
    FOREIGN KEY (match_id) REFERENCES matches(id)
  )
`);

// Indexes for efficient queries
db.exec(`CREATE INDEX IF NOT EXISTS idx_player_achievements_player_game ON player_achievements(player_id, game_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_player_achievements_match ON player_achievements(match_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_player_achievements_achievement ON player_achievements(achievement_id)`);

// Critical performance indexes for match queries
db.exec(`CREATE INDEX IF NOT EXISTS idx_match_participants_player ON match_participants(player_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_match_participants_match ON match_participants(match_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_match_participants_match_player ON match_participants(match_id, player_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_matches_game_id ON matches(game_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_matches_played_at ON matches(played_at)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_player_ratings_game ON player_ratings(game_id)`);

// Seed achievements if not exists
const seedAchievements = db.prepare(`
  INSERT OR IGNORE INTO achievements (name, description, category, icon) VALUES
    ('fresh_blood', 'Claim points from a new player on their first game', 'special', '🩸'),
    ('flawless_victory', 'Beat an opponent without conceding a point', 'special', '💀'),
    ('mostly_harmless', 'Play 100 games', 'milestone', '🥉'),
    ('committed', 'Play 500 games', 'milestone', '🥈'),
    ('dangerous', 'Play 1,000 games', 'milestone', '🥇'),
    ('resident', 'Play 2,000 games', 'milestone', '🏅'),
    ('elite', 'Play 10,000 games', 'milestone', '👑'),
    ('against_the_odds', 'Beat a player 50 or more skillpoints higher than you', 'special', '⚡'),
    ('against_all_odds', 'Beat a player 100 or more skillpoints higher than you', 'special', '💫'),
    ('the_best', 'Go first in the rankings', 'ranking', '🏆'),
    ('the_worst', 'Go last in the rankings', 'ranking', '🔻'),
    ('improver', 'Gain 100 skill points from your lowest point', 'milestone', '📈'),
    ('unstable', 'See-saw 5 or more skill points in consecutive games', 'streak', '🎢'),
    ('comrades', 'Play 100 games against the same opponent', 'milestone', '🤝'),
    ('festive_cheer', 'Play a game on 25th December', 'time_based', '🎄'),
    ('night_owl', 'Play a game between 0000 and 0300 hours', 'time_based', '🦉'),
    ('dedication', 'Play a game at least once every 60 days for a year', 'streak', '🔥'),
    ('early_bird', 'Play and win the first game of the day', 'special', '🌅'),
    ('the_dominator', 'Defeat a player in 10 consecutive games', 'streak', '💪'),
    ('nothing_if_not_consistent', 'Finish 5 consecutive games with the same score', 'streak', '🎯'),
    ('boss_fight', 'Defeat the #1 ranked player in the ladder', 'special', '⚔️')
`);
seedAchievements.run();

// Update icons for existing achievements (migration)
const updateAchievementIcons = db.prepare(`
  UPDATE achievements SET icon = CASE name
    WHEN 'fresh_blood' THEN '🩸'
    WHEN 'flawless_victory' THEN '💀'
    WHEN 'mostly_harmless' THEN '🥉'
    WHEN 'committed' THEN '🥈'
    WHEN 'dangerous' THEN '🥇'
    WHEN 'resident' THEN '🏅'
    WHEN 'elite' THEN '👑'
    WHEN 'against_the_odds' THEN '⚡'
    WHEN 'against_all_odds' THEN '💫'
    WHEN 'the_best' THEN '🏆'
    WHEN 'the_worst' THEN '🔻'
    WHEN 'improver' THEN '📈'
    WHEN 'unstable' THEN '🎢'
    WHEN 'comrades' THEN '🤝'
    WHEN 'festive_cheer' THEN '🎄'
    WHEN 'night_owl' THEN '🦉'
    WHEN 'dedication' THEN '🔥'
    WHEN 'early_bird' THEN '🌅'
    WHEN 'the_dominator' THEN '💪'
    WHEN 'nothing_if_not_consistent' THEN '🎯'
    WHEN 'boss_fight' THEN '⚔️'
    ELSE icon
  END
  WHERE icon IS NULL OR icon = ''
`);
updateAchievementIcons.run();

export default db;
