interface GameTab {
  id: number;
  name: string;
  image_url: string | null;
  elo: number;
}

interface GameTabBarProps {
  games: GameTab[];
  selectedGameId: number | null;
  onSelect: (gameId: number | null) => void;
}

function formatGameName(name: string) {
  return name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export function GameTabBar({ games, selectedGameId, onSelect }: GameTabBarProps) {
  return (
    <div className="bg-card rounded-2xl shadow-lg overflow-hidden mb-6">
      <div className="flex overflow-x-auto scrollbar-hide">
        {/* All Games tab */}
        <button
          onClick={() => onSelect(null)}
          className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
            selectedGameId === null
              ? 'border-primary text-primary bg-primary/5'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <span className="text-lg">🎮</span>
          <span>All Games</span>
        </button>

        {/* Game tabs */}
        {games.map((game) => (
          <button
            key={game.id}
            onClick={() => onSelect(game.id)}
            className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
              selectedGameId === game.id
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {game.image_url ? (
              <img
                src={game.image_url}
                alt={game.name}
                className="w-5 h-5 rounded object-cover"
              />
            ) : (
              <span className="text-lg">🎮</span>
            )}
            <span>{formatGameName(game.name)}</span>
            <span className={`font-mono text-xs ${selectedGameId === game.id ? 'text-primary' : 'text-gray-400'}`}>
              {game.elo.toFixed(3)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}