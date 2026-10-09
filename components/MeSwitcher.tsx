'use client';

import { useMe } from '@/lib/contexts/MeContext';

// "Viewing as" identity picker for the gambling pages. Small dropdown in the
// gambling header; the context persists per-browser via localStorage.

export function MeSwitcher() {
  const { me, setMe, players, isLoading } = useMe();

  if (isLoading) {
    return <span className="text-sm text-gray-500 px-3 py-1.5">Loading players…</span>;
  }

  if (!me) {
    return (
      <select
        value=""
        onChange={(e) => {
          const found = players.find(p => p.id === parseInt(e.target.value, 10));
          if (found) setMe(found);
        }}
        className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-card text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        <option value="">Identity: choose player…</option>
        {players.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-gray-500">Viewing as</span>
      <span className="text-sm font-semibold text-gray-900">{me.name}</span>
      <button
        onClick={() => setMe(null)}
        className="text-gray-400 hover:text-gray-700 transition-colors"
        aria-label="Change identity"
      >
        ✕
      </button>
    </div>
  );
}