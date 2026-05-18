'use client';

import Link from 'next/link';
import { useTheme } from '../lib/contexts/ThemeContext';
import { GameIndicator } from './GameIndicator';

export function Nav() {
  const { settings } = useTheme();

  return (
    <nav className="bg-white border-b border-border px-6 py-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-xl font-bold text-gray-900">
            {settings.logo_url && (
              <img
                src={settings.logo_url}
                alt={settings.company_name || 'Logo'}
                className="h-8 w-8 object-contain rounded"
              />
            )}
            <span>{settings.company_name || 'Office Games'}</span>
          </Link>
          <GameIndicator />
        </div>
        <div className="flex gap-6">
          <Link href="/" className="text-gray-600 hover:text-primary">
            Leaderboard
          </Link>
          <Link href="/players" className="text-gray-600 hover:text-primary">
            Players
          </Link>
          <Link href="/matches/new" className="text-gray-600 hover:text-primary">
            Record Match
          </Link>
        </div>
      </div>
    </nav>
  );
}