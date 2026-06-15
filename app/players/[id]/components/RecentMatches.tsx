import Link from "next/link";

interface Opponent {
  player_name: string;
  score: number;
  team: number;
}

interface RecentMatch {
  id: number;
  game_id: number;
  played_at: string;
  notes: string | null;
  game_name: string;
  team: number;
  score: number;
  elo_before: number;
  elo_after: number;
  opponents: Opponent[];
  teammates: string[];
  opponent_score: number;
  result: 'win' | 'loss' | 'draw';
}

function formatDateTime(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRatingChange(before: number, after: number) {
  const diff = after - before;
  const sign = diff >= 0 ? "+" : "";
  return `${sign}${diff.toFixed(3)}`;
}

export function RecentMatches({ matches }: { matches: RecentMatch[] }) {
  if (matches.length === 0) return null;

  return (
    <div className="border-t border-gray-100">
      <div className="px-6 py-3 bg-gray-50 flex items-center gap-2">
        <span className="text-lg">🎮</span>
        <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Recent Matches</span>
      </div>
      <div className="divide-y divide-gray-50">
        {matches.slice(0, 5).map((match) => {
          const resultStyles = {
            win: {
              bg: "bg-gradient-to-r from-green-50 to-emerald-50",
              border: "border-l-4 border-l-green-500",
              text: "text-green-700"
            },
            loss: {
              bg: "bg-gradient-to-r from-red-50 to-rose-50",
              border: "border-l-4 border-l-red-500",
              text: "text-red-700"
            },
            draw: {
              bg: "bg-gradient-to-r from-gray-50 to-slate-50",
              border: "border-l-4 border-l-gray-400",
              text: "text-gray-700"
            }
          };
          const style = resultStyles[match.result];
          const eloChange = match.elo_after - match.elo_before;

          return (
            <Link
              key={match.id}
              href={`/matches/${match.id}`}
              className={`block px-6 py-4 ${style.bg} ${style.border} hover:opacity-80 transition-opacity`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className={`font-bold uppercase text-sm tracking-wide ${style.text}`}>
                    {match.result}
                  </span>
                  <span className="text-2xl font-bold text-gray-900">
                    {match.score}
                    <span className="text-gray-400 mx-1">-</span>
                    {match.opponent_score}
                  </span>
                  <span className="text-gray-600 text-sm">
                    {match.teammates.length > 0 && (
                      <>
                        <span className="text-gray-500">with </span>
                        <span className="font-medium">{match.teammates.join(", ")}</span>
                        <span className="text-gray-400 mx-1">vs</span>
                      </>
                    )}
                    {!match.teammates.length && <span className="text-gray-400">vs </span>}
                    {match.opponents.map(o => o.player_name).join(", ")}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className={`font-mono text-sm font-bold ${eloChange >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatRatingChange(match.elo_before, match.elo_after)}
                  </div>
                  <div className="text-sm text-gray-500 w-24 text-right">
                    {formatDateTime(match.played_at)}
                  </div>
                </div>
              </div>
              {match.notes && (
                <div className="mt-2 text-sm text-gray-500 italic">
                  "{match.notes}"
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}