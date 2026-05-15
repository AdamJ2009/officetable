import { getGames, getLeaderboard, getGameStats, getGameRecords } from "@/lib/data";
import LeaderboardClient from "./LeaderboardClient";

export default async function Home() {
  // Fetch all data on the server
  const games = getGames();
  const initialGameId = games.length > 0 ? games[0].id : 0;

  // Fetch initial data in parallel
  const [initialLeaderboard, initialStats, initialRecords] = await Promise.all([
    Promise.resolve(getLeaderboard(initialGameId, false)),
    Promise.resolve(getGameStats(initialGameId)),
    Promise.resolve(getGameRecords(initialGameId))
  ]);

  return (
    <LeaderboardClient
      games={games}
      initialGameId={initialGameId}
      initialLeaderboard={initialLeaderboard}
      initialStats={initialStats}
      initialRecords={initialRecords}
    />
  );
}