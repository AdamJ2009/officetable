import { AchievementProgressRing } from './AchievementProgressRing';
import { getPlayerGradient } from './RivalsSection';

interface PlayerHeaderProps {
  player: {
    id: number;
    name: string;
    status: string;
    created_at: string;
    first_played_at: string | null;
  };
  achievementUnlocked: number;
  achievementTotal: number;
  onStatusChange: (newStatus: string) => void;
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function PlayerHeader({ player, achievementUnlocked, achievementTotal, onStatusChange }: PlayerHeaderProps) {
  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl shadow-xl overflow-hidden mb-6">
      <div className="px-8 py-6">
        <div className="flex items-center gap-6">
          {/* Avatar */}
          <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${getPlayerGradient(player.name)} flex items-center justify-center text-white text-4xl font-bold shadow-lg`}>
            {player.name.charAt(0).toUpperCase()}
          </div>

          {/* Name and status */}
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-white">
                {player.name}
              </h1>
              {player.status === "retired" && (
                <span className="px-3 py-1 bg-gray-600 text-gray-200 text-sm rounded-full font-medium">
                  Retired
                </span>
              )}
              <button
                onClick={async () => {
                  const newStatus = player.status === 'retired' ? 'active' : 'retired';
                  try {
                    const res = await fetch('/api/players', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ id: player.id, status: newStatus }),
                    });
                    if (!res.ok) throw new Error('Failed to update');
                    onStatusChange(newStatus);
                  } catch {
                    alert('Failed to update player status');
                  }
                }}
                className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                  player.status === 'retired'
                    ? 'bg-green-700/30 text-green-300 hover:bg-green-700/50'
                    : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600/50'
                }`}
              >
                {player.status === 'retired' ? '↩ Reactivate' : '👋 Retire'}
              </button>
            </div>
            <div className="text-slate-400 mt-1 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {player.first_played_at
                ? `Playing since ${formatDate(player.first_played_at)}`
                : 'Yet to play'}
            </div>
          </div>

          {/* Achievement Progress Ring */}
          <AchievementProgressRing
            unlocked={achievementUnlocked}
            total={achievementTotal}
            size={90}
          />
        </div>
      </div>
    </div>
  );
}