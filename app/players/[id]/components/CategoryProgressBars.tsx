interface CategoryProgress {
  name: string;
  label: string;
  unlocked: number;
  total: number;
  color: string;
  bgColor: string;
  icon: string;
}

interface CategoryProgressBarsProps {
  categories: CategoryProgress[];
  totalUnlocked: number;
  totalPossible: number;
}

export function CategoryProgressBars({ categories, totalUnlocked, totalPossible }: CategoryProgressBarsProps) {
  const totalPct = totalPossible > 0 ? Math.round((totalUnlocked / totalPossible) * 100) : 0;

  return (
    <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border-t border-amber-100 px-6 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🏅</span>
          <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Achievements</span>
        </div>
        <span className="text-sm font-bold text-amber-700">
          {totalUnlocked}/{totalPossible} ({totalPct}%)
        </span>
      </div>

      <div className="space-y-2">
        {categories.map((cat) => {
          const pct = cat.total > 0 ? (cat.unlocked / cat.total) * 100 : 0;
          const isComplete = cat.unlocked === cat.total && cat.total > 0;

          return (
            <div key={cat.name} className="flex items-center gap-3">
              <span className="text-sm w-5 text-center">{cat.icon}</span>
              <span className={`text-xs w-20 ${isComplete ? 'font-bold text-green-700' : 'text-gray-600'}`}>
                {cat.label}
              </span>
              <div className="flex-1 h-2.5 rounded-full bg-gray-200 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${isComplete ? 'bg-gradient-to-r from-green-400 to-emerald-500' : cat.bgColor}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={`text-xs font-mono w-8 text-right ${isComplete ? 'text-green-700 font-bold' : 'text-gray-500'}`}>
                {cat.unlocked}/{cat.total}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Helper to build category progress data from allAchievements and unlocked IDs
export function buildCategoryProgress(
  allAchievements: { id: number; name: string; description: string; category: string; icon: string | null }[],
  unlockedIds: Set<number>
): CategoryProgress[] {
  const categoryConfig: Record<string, { label: string; color: string; bgColor: string; icon: string }> = {
    milestone: { label: 'Milestone', color: 'text-amber-700', bgColor: 'bg-gradient-to-r from-amber-400 to-yellow-500', icon: '🏅' },
    ranking: { label: 'Ranking', color: 'text-purple-700', bgColor: 'bg-gradient-to-r from-purple-400 to-violet-500', icon: '🏆' },
    streak: { label: 'Streak', color: 'text-orange-700', bgColor: 'bg-gradient-to-r from-orange-400 to-red-500', icon: '🎢' },
    special: { label: 'Special', color: 'text-blue-700', bgColor: 'bg-gradient-to-r from-blue-400 to-indigo-500', icon: '⚡' },
    time_based: { label: 'Time Based', color: 'text-teal-700', bgColor: 'bg-gradient-to-r from-teal-400 to-cyan-500', icon: '🕐' },
  };

  // Group by category
  const byCategory = new Map<string, { total: number; unlocked: number }>();
  for (const a of allAchievements) {
    const existing = byCategory.get(a.category) || { total: 0, unlocked: 0 };
    existing.total++;
    if (unlockedIds.has(a.id)) existing.unlocked++;
    byCategory.set(a.category, existing);
  }

  // Build in defined order
  const order = ['milestone', 'ranking', 'streak', 'special', 'time_based'];
  const result: CategoryProgress[] = [];

  for (const cat of order) {
    const data = byCategory.get(cat);
    if (!data) continue;
    const config = categoryConfig[cat] || { label: cat, color: 'text-gray-700', bgColor: 'bg-gray-400', icon: '•' };
    result.push({
      name: cat,
      label: config.label,
      unlocked: data.unlocked,
      total: data.total,
      color: config.color,
      bgColor: config.bgColor,
      icon: config.icon,
    });
  }

  return result;
}