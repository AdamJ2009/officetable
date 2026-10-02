import { getLeaderboard, getGameStats, getGameRecords, getGames } from "@/lib/data";
import { getCurrentSeason } from "@/lib/seasons";
import { getSeasonalTheme } from "@/lib/seasonalTheme";
import LeaderboardClient from "./LeaderboardClient";

// Revalidate every 30 seconds to pick up new matches
export const revalidate = 30;

export default async function Home() {
  // Fetch initial data for the first game
  const games = getGames();
  const initialGameId = games.length > 0 ? games[0].id : 0;

  // Fetch initial data in parallel
  const [initialLeaderboard, initialStats, initialRecords] = await Promise.all([
    Promise.resolve(getLeaderboard(initialGameId, { includeRetired: false })),
    Promise.resolve(getGameStats(initialGameId)),
    Promise.resolve(getGameRecords(initialGameId))
  ]);

  return (
    <LeaderboardClient
      initialLeaderboard={initialLeaderboard}
      initialStats={initialStats}
      initialRecords={initialRecords}
      currentSeasonId={getCurrentSeason()?.id ?? 0}
      seasonalTheme={getSeasonalTheme()}
    />
  );
}