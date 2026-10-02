'use client';

import { useSelectedGame } from '../lib/hooks/useSelectedGame';

function formatGameName(name: string): string {
  return name
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function GameIndicator() {
  const { selectedGame, selectedGameId, games, setSelectedGameId, isLoading } = useSelectedGame();

  if (isLoading || games.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 bg-muted rounded-lg">
        <div className="w-4 h-4 bg-gray-300 rounded animate-pulse" />
        <span className="text-sm text-gray-500">Loading...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {/* Current game indicator */}
      <div className="flex items-center gap-2 px-3 py-1 bg-muted rounded-lg">
        {selectedGame?.image_url && (
          <img
            src={selectedGame.image_url}
            alt={selectedGame.name}
            className="w-5 h-5 rounded object-cover"
          />
        )}
        <span className="text-sm font-medium text-gray-700">
          {selectedGame ? formatGameName(selectedGame.name) : 'Select Game'}
        </span>
      </div>

      {/* Game selector dropdown */}
      <select
        value={selectedGameId || ''}
        onChange={(e) => setSelectedGameId(Number(e.target.value))}
        className="px-2 py-1 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-card"
        aria-label="Select game"
      >
        {games.map((game) => (
          <option key={game.id} value={game.id}>
            {formatGameName(game.name)}
          </option>
        ))}
      </select>
    </div>
  );
}