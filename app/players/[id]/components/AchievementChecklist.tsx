interface AllAchievement {
  id: number;
  name: string;
  description: string;
  category: string;
  icon: string | null;
}

interface UnlockedDetail {
  count: number;
  first_earned_at: string;
}

interface AchievementChecklistProps {
  allAchievements: AllAchievement[];
  unlockedIds: Set<number>;
  unlockedDetails: Map<number, UnlockedDetail>;
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

const LOCK_ICON = (
  <svg className="w-4 h-4 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
  </svg>
);

function AchievementCard({ achievement, isUnlocked, details }: {
  achievement: AllAchievement;
  isUnlocked: boolean;
  details?: UnlockedDetail;
}) {
  const displayName = achievement.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div
      className={`rounded-xl p-3 border transition-all ${
        isUnlocked
          ? 'bg-white border-amber-200 shadow-sm hover:shadow-md'
          : 'bg-gray-50/50 border-dashed border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <span className={`text-xl flex-shrink-0 ${isUnlocked ? '' : 'grayscale opacity-30'}`}>
            {achievement.icon || '🏅'}
          </span>
          <div className="min-w-0">
            <div className={`font-medium text-sm leading-tight ${
              isUnlocked ? 'text-amber-900' : 'text-gray-400'
            }`}>
              {displayName}
            </div>
            <div className={`text-xs mt-0.5 leading-snug ${
              isUnlocked ? 'text-gray-600' : 'text-gray-400'
            }`}>
              {achievement.description}
            </div>
          </div>
        </div>
        {!isUnlocked && LOCK_ICON}
      </div>
      {isUnlocked && details && (
        <div className="mt-1.5 flex items-center gap-2 text-xs text-gray-400">
          <span>Earned {formatDate(details.first_earned_at)}</span>
          {details.count > 1 && (
            <span className="bg-amber-100 text-amber-700 px-1.5 rounded-full font-semibold">
              ×{details.count}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function AchievementChecklist({ allAchievements, unlockedIds, unlockedDetails }: AchievementChecklistProps) {
  // Group achievements by category for visual separation
  const categories = ['milestone', 'ranking', 'streak', 'special', 'time_based'] as const;
  const categoryLabels: Record<string, string> = {
    milestone: '🏅 Milestones',
    ranking: '🏆 Ranking',
    streak: '🎢 Streaks',
    special: '⚡ Special',
    time_based: '🕐 Time Based',
  };

  return (
    <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/30">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">📋</span>
        <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">All Achievements</span>
        <span className="text-xs text-gray-400 ml-1">
          {unlockedIds.size}/{allAchievements.length} unlocked
        </span>
      </div>

      {categories.map((cat) => {
        const catAchievements = allAchievements.filter(a => a.category === cat);
        if (catAchievements.length === 0) return null;

        return (
          <div key={cat} className="mb-4 last:mb-0">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              {categoryLabels[cat] || cat}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {catAchievements.map((achievement) => {
                const isUnlocked = unlockedIds.has(achievement.id);
                const details = unlockedDetails.get(achievement.id);

                return (
                  <AchievementCard
                    key={achievement.id}
                    achievement={achievement}
                    isUnlocked={isUnlocked}
                    details={details}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}