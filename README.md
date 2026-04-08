# Office Table

This project provides an office leaderboard table for multiple office games, tracking results and skill over time.

**It is a completely insecure application that is 100000% recommended to be run on private networks only!!**

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

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

