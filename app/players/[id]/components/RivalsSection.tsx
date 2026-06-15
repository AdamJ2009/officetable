import Link from 'next/link';
import { WinLossBar } from './WinLossBar';
import { StreakBadge } from './StreakBadge';

// Generate a consistent gradient based on player name
function getPlayerGradient(name: string): string {
  const gradients = [
    'from-blue-500 to-indigo-600',
    'from-emerald-500 to-teal-600',
    'from-purple-500 to-violet-600',
    'from-orange-500 to-amber-600',
    'from-pink-500 to-rose-600',
    'from-cyan-500 to-sky-600',
    'from-fuchsia-500 to-purple-600',
    'from-lime-500 to-green-600',
  ];
  const index = name.charCodeAt(0) % gradients.length;
  return gradients[index];
}

function formatGameName(name: string) {
  return name.charAt(0).toUpperCase() + name.slice(1).replace("-", " ");
}

interface HeadToHeadOpponent {
  opponent_id: number;
  opponent_name: string;
  game_id: number;
  game_name: string;
  wins: number;
  losses: number;
  draws: number;
  total_matches: number;
  net_skill: number;
  current_streak: string;
  last_played: string;
}

export function RivalsSection({ gameId, gameName, playerId, opponents, isLoading }: {
  gameId: number;
  gameName: string;
  playerId: number;
  opponents: HeadToHeadOpponent[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">⚔️</span>
          <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Rivals</span>
        </div>
        <div className="text-sm text-gray-400 animate-pulse">Loading rival data...</div>
      </div>
    );
  }

  if (opponents.length === 0) {
    return null;
  }

  // Find nemesis (worst win rate, min 5 matches) and bunny (best win rate, min 5 matches)
  const qualified = opponents.filter(o => o.total_matches >= 5);
  const nemesis = qualified.length > 0
    ? qualified.reduce((worst, curr) => {
        const worstRate = worst.wins / worst.total_matches;
        const currRate = curr.wins / curr.total_matches;
        return currRate < worstRate ? curr : worst;
      })
    : null;
  const bunny = qualified.length > 0
    ? qualified.reduce((best, curr) => {
        const bestRate = best.wins / best.total_matches;
        const currRate = curr.wins / curr.total_matches;
        return currRate > bestRate ? curr : best;
      })
    : null;

  return (
    <div className="border-t border-gray-100">
      <div className="px-6 py-3 bg-gradient-to-r from-indigo-50 to-purple-50">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚔️</span>
          <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Rivals</span>
          <span className="text-xs text-gray-400 ml-2">{opponents.length} opponent{opponents.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Nemesis & Bunny highlights */}
      {(nemesis || bunny) && (
        <div className="px-6 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gradient-to-r from-indigo-50/50 to-purple-50/50">
          {nemesis && (
            <Link
              href={`/matches?player_ids=${playerId},${nemesis.opponent_id}&game_id=${gameId}`}
              className="group bg-white rounded-xl border border-red-200 p-4 hover:shadow-lg hover:border-red-300 transition-all"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">🎯</span>
                <span className="text-xs font-bold text-red-600 uppercase tracking-wider">Nemesis</span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Link
                    href={`/players/${nemesis.opponent_id}`}
                    className="font-bold text-gray-900 group-hover:text-red-600 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {nemesis.opponent_name}
                  </Link>
                  <div className="text-sm text-gray-500 mt-0.5">
                    <span className="text-green-600 font-semibold">{nemesis.wins}</span>
                    <span className="text-gray-300"> - </span>
                    <span className="text-red-600 font-semibold">{nemesis.losses}</span>
                    <span className="text-gray-300"> - </span>
                    <span className="text-gray-500">{nemesis.draws}</span>
                    <span className="text-gray-400 ml-1 text-xs">
                      ({((nemesis.wins / nemesis.total_matches) * 100).toFixed(0)}% WR)
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-mono text-sm font-bold ${nemesis.net_skill >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {nemesis.net_skill >= 0 ? '+' : ''}{nemesis.net_skill.toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-400">net skill</div>
                </div>
              </div>
            </Link>
          )}
          {bunny && (
            <Link
              href={`/matches?player_ids=${playerId},${bunny.opponent_id}&game_id=${gameId}`}
              className="group bg-white rounded-xl border border-green-200 p-4 hover:shadow-lg hover:border-green-300 transition-all"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">🐇</span>
                <span className="text-xs font-bold text-green-600 uppercase tracking-wider">Bunny</span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Link
                    href={`/players/${bunny.opponent_id}`}
                    className="font-bold text-gray-900 group-hover:text-green-600 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {bunny.opponent_name}
                  </Link>
                  <div className="text-sm text-gray-500 mt-0.5">
                    <span className="text-green-600 font-semibold">{bunny.wins}</span>
                    <span className="text-gray-300"> - </span>
                    <span className="text-red-600 font-semibold">{bunny.losses}</span>
                    <span className="text-gray-300"> - </span>
                    <span className="text-gray-500">{bunny.draws}</span>
                    <span className="text-gray-400 ml-1 text-xs">
                      ({((bunny.wins / bunny.total_matches) * 100).toFixed(0)}% WR)
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-mono text-sm font-bold ${bunny.net_skill >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {bunny.net_skill >= 0 ? '+' : ''}{bunny.net_skill.toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-400">net skill</div>
                </div>
              </div>
            </Link>
          )}
        </div>
      )}

      {/* Rivalry cards grid */}
      <div className="px-6 py-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {opponents.map((opp) => {
          const totalGames = opp.wins + opp.losses + opp.draws;
          const winRate = totalGames > 0 ? (opp.wins / totalGames) * 100 : 0;
          const isPositive = opp.net_skill > 0;
          const isNegative = opp.net_skill < 0;
          const borderColor = isPositive ? 'border-green-300 hover:border-green-400' : isNegative ? 'border-red-300 hover:border-red-400' : 'border-gray-200 hover:border-gray-300';
          const borderLeft = isPositive ? 'border-l-green-500' : isNegative ? 'border-l-red-500' : 'border-l-gray-400';
          const daysAgo = Math.floor((Date.now() - new Date(opp.last_played).getTime()) / (1000 * 60 * 60 * 24));
          const lastPlayedText = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : daysAgo < 30 ? `${daysAgo}d ago` : daysAgo < 365 ? `${Math.floor(daysAgo / 30)}mo ago` : `${Math.floor(daysAgo / 365)}y ago`;

          return (
            <Link
              key={`${opp.opponent_id}-${opp.game_id}`}
              href={`/matches?player_ids=${playerId},${opp.opponent_id}&game_id=${gameId}`}
              className={`group bg-white rounded-xl border ${borderColor} border-l-4 ${borderLeft} p-3 hover:shadow-lg transition-all duration-200`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold bg-gradient-to-br ${getPlayerGradient(opp.opponent_name)} text-white shadow-sm`}>
                    {opp.opponent_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900 text-sm group-hover:text-primary transition-colors">
                      {opp.opponent_name}
                    </div>
                    <div className="text-xs text-gray-400">{lastPlayedText}</div>
                  </div>
                </div>
                <StreakBadge streak={opp.current_streak} />
              </div>

              {/* Win/Loss/Draw bar */}
              <WinLossBar wins={opp.wins} losses={opp.losses} draws={opp.draws} />

              {/* Stats row */}
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-green-600 font-semibold">{opp.wins}</span>
                  <span className="text-gray-300">-</span>
                  <span className="text-red-600 font-semibold">{opp.losses}</span>
                  <span className="text-gray-300">-</span>
                  <span className="text-gray-500">{opp.draws}</span>
                  <span className="text-gray-400 text-xs">({winRate.toFixed(0)}%)</span>
                </div>
                <div className={`font-mono text-xs font-bold ${isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-gray-400'}`}>
                  {opp.net_skill >= 0 ? '+' : ''}{opp.net_skill.toFixed(1)} skill
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export { getPlayerGradient };