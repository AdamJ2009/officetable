# Office Table

This project provides an office leaderboard table for multiple office games, tracking results and skill over time.

**It is a completely insecure application that is 100000% recommended to be run on private networks only!!**

## Getting Started

Requires **Node.js 20 or later** (LTS recommended) and, on macOS, the Xcode Command Line Tools (see Troubleshooting below).

Install dependencies and run the development server:

```bash
npm install
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Troubleshooting

This app uses two packages with **native (compiled) code**: `better-sqlite3` (the database) and `lightningcss` (CSS processing). If `npm install` fails or `npm run dev` says `next: command not found` right after a fresh install, it's almost always one of these:

### macOS: "gyp ERR!" / "No Xcode or CLT version detected" when installing better-sqlite3

`better-sqlite3` normally downloads a prebuilt binary, but when none exists for your Node version it compiles from source, which requires the Xcode Command Line Tools:

```bash
xcode-select --install
# then verify:
clang --version
```

After installing, re-run `npm install`.

### Check your Node version and architecture

Prebuilt binaries are published for Node LTS releases. Very new or odd-numbered Node versions may not have a prebuild and require compilation:

```bash
node -v                     # prefer an LTS version (20.x or 22.x)
node -p process.arch        # should be arm64 on an M1/M2/M3 Mac (not x64)
```

If you're on an Apple Silicon Mac but this prints `x64`, your Node is running under Rosetta — install a native arm64 build (e.g. via [nvm](https://github.com/nvm-sh/nvm): `nvm install 22` and `nvm use 22`, or `brew install node@22`).

If you recently upgraded Node and the app stops loading the database (`ERR_DLOPEN_FAILED` / `NODE_MODULE_VERSION mismatch`), rebuild the native modules:

```bash
npm rebuild better-sqlite3
```

### Missing lightningcss / other native binaries ("Cannot find module lightningcss.darwin-arm64.node")

A stale `node_modules` can contain binaries for the wrong platform (e.g. after restoring from a backup, or switching machines/architecture). Wipe and reinstall:

```bash
rm -rf node_modules .next
npm install
```

### `next: command not found`

This means dependencies aren't installed (or `npm install` failed partway — scroll up for the real error). Fix the underlying install error first, then `npm install` again.

## Import Data

This can import historical data of 1v1 games in a space-separated list of format:
```
<Player on Team 2> <Score for Team 2> <Player for Team 1> <Score for Team 1> <UNIX timestamp>
```
(Team 2 then Team 1 for red/blue blue/red diff between this and old ladder)

Import with:
```bash
npx tsx scripts/import-matches.ts <game_id> < your-matches.txt
```

## Seasons

Elo is tracked as two independent ledgers over the same matches:

- **Season ledger** — flat-resets to 0 at each season start. This is the
  live competition (leaderboard default, rank shifts, season achievements).
- **All-time ledger** — never resets; continuous since the first match.

Each match gets both deltas (see any match detail page for the toggle), and
achievements can be re-earned once per season (except `fresh_blood`, which is
a first-game-*ever* award).

The first migration splits history into **Season 0** (everything before the
new season opens) and **Season 1** (the new, empty season). The Season 1
start date is configurable:

1. The `season_1_start` settings key (e.g. via `PUT /api/settings`
   `{"settings": {"season_1_start": "2026-11-02"}}`) — before first launch, or
2. The `SEASON_1_START_DATE` environment variable, or
3. Defaults to 00:00 UTC, 28 days after the migration first runs.

Every match's season is resolved from its played-at timestamp (not its insert
date), so late-entered matches slot into the correct season.

### Queueing future seasons

**Settings → Seasons** lets you queue a future season (pick a start
date/time; the name defaults to the next "Season N"). Seasons never gap or
overlap: queueing a season closes the current one exactly where the new one
starts, and the leaderboard shows a countdown to the big moment. Queued
seasons can be removed from the same screen until they begin.

Equivalently via API: `POST /api/seasons` `{"start_date": "2027-03-01"}` and
`DELETE /api/seasons` `{"id": <queued season id>}`.

## Skill System

This uses a modified Elo rating system. The rating change after each game uses:

```
delta = K × (actual_result - expected_result)
```

Where:
- K-factor = 25 (controls volatility)
- actual_result = point score ratio, not just win/loss
- expected_result = 1 / (1 + 10^((team1Elo - team2Elo) / 180))

Key Differences from Standard Elo

┌─────────────────┬───────────────┬─────────────────────┐
│     Aspect      │ Standard Elo  │     This System     │
├─────────────────┼───────────────┼─────────────────────┤
│ Result type     │ Win/Loss/Draw │ Score ratio         │
├─────────────────┼───────────────┼─────────────────────┤
│ Elo divisor     │ 400           │ 180 (more volatile) │
├─────────────────┼───────────────┼─────────────────────┤
│ Starting rating │ ~1200-1500    │ 0                   │
└─────────────────┴───────────────┴─────────────────────┘

How It Works

1. Zero-sum: Blue gains exactly what Red loses
2. Score matters: Winning 10-0 gives more points than winning 10-9
3. Inactive players: Excluded from rankings after 60 days of no games

Key Code Locations

- Algorithm: tntfl/ladder.py:124-132 — the _calculateSkillChange() method
- Player rating update: tntfl/player.py:34-62
- Game model: tntfl/game.py

Example

Red (ELO 100) vs Blue (ELO 50), Blue wins 10-5:
- Expected Blue score: ~34.5%
- Actual Blue score: 66.7%
- Delta: Blue gains ~8 ELO, Red loses ~8


### Why? 

This skill system enables skill to change at a reasonable rate with a small pool of players with varying skill levels participating in many matches. Most other systems end up so confident/stable in a player's skills that it actually demotivates players to play each other. 

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

