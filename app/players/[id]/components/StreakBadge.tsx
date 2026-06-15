export function StreakBadge({ streak }: { streak: string }) {
  if (!streak || streak.length < 2) return null;
  const type = streak[0];
  const count = parseInt(streak.slice(1), 10);
  if (isNaN(count) || count === 0) return null;

  const config = {
    W: { emoji: '🔥', bg: 'bg-green-100 text-green-700', label: 'Win' },
    L: { emoji: '❄️', bg: 'bg-red-100 text-red-700', label: 'Loss' },
    D: { emoji: '➖', bg: 'bg-gray-100 text-gray-600', label: 'Draw' },
  }[type] || { emoji: '•', bg: 'bg-gray-100 text-gray-600', label: streak };

  return (
    <span title="Current streak against player" className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-semibold ${config.bg}`}>
      <span>{config.emoji}</span>{count}
    </span>
  );
}