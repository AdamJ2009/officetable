'use client';

import Link from 'next/link';
import { useSelectedGame } from '../lib/hooks/useSelectedGame';
import { useTheme } from '../lib/contexts/ThemeContext';

function formatGameName(name: string): string {
  return name
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function Nav() {
  const { settings } = useTheme();
  const { selectedGame, selectedGameId, games, setSelectedGameId, isLoading } = useSelectedGame();

  return (
    <nav className="bg-white/80 backdrop-blur-md border-b border-gray-200/50 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Brand and Game Selector */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="relative">
                {settings.logo_url ? (
                  <img
                    src={settings.logo_url}
                    alt={settings.company_name || 'Logo'}
                    className="h-9 w-9 object-contain rounded-lg shadow-sm group-hover:shadow-md transition-shadow"
                  />
                ) : (
                  <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center text-white font-bold text-lg shadow-sm group-hover:shadow-md transition-shadow">
                    {settings.company_name?.charAt(0) || 'O'}
                  </div>
                )}
              </div>
              <span className="text-xl font-bold text-gray-900 group-hover:text-primary transition-colors">
                {settings.company_name || 'Office Games'}
              </span>
            </Link>

            {/* Game Selector */}
            <div className="flex items-center gap-2 pl-6 border-l border-gray-200">
              {isLoading ? (
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full">
                  <div className="w-5 h-5 bg-gray-300 rounded animate-pulse" />
                  <span className="text-sm text-gray-500">Loading...</span>
                </div>
              ) : (
                <div className="flex items-center">
                  <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-slate-800 to-slate-900 rounded-l-full text-white">
                    {selectedGame?.image_url ? (
                      <img
                        src={selectedGame.image_url}
                        alt={selectedGame.name}
                        className="w-5 h-5 rounded object-cover"
                      />
                    ) : (
                      <span className="text-lg">🎮</span>
                    )}
                    <span className="text-sm font-semibold">
                      {selectedGame ? formatGameName(selectedGame.name) : 'Select Game'}
                    </span>
                  </div>
                  <select
                    value={selectedGameId || ''}
                    onChange={(e) => setSelectedGameId(Number(e.target.value))}
                    className="px-3 py-2 text-sm font-medium bg-gray-100 border-0 rounded-r-full focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer hover:bg-gray-200 transition-colors"
                    aria-label="Select game"
                  >
                    {games.map((game) => (
                      <option key={game.id} value={game.id}>
                        {formatGameName(game.name)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Navigation Links */}
          <div className="flex items-center gap-1">
            <Link
              href="/"
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-primary hover:bg-gray-100 rounded-lg transition-all"
            >
              📊 Leaderboard
            </Link>
            <Link
              href="/players"
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-primary hover:bg-gray-100 rounded-lg transition-all"
            >
              👥 Players
            </Link>
            <Link
              href="/matches/new"
              className="px-4 py-2 text-sm font-semibold bg-primary text-white rounded-lg hover:bg-primary-hover transition-all shadow-sm hover:shadow-md"
            >
              + Record Match
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}