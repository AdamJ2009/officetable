interface GameStat {
  game_id: number;
  game_name: string;
  elo: number;
  total_matches: number;
  wins: number;
  losses: number;
  draws: number;
  achievements: { achievement_id: number; achievement_name: string; achievement_description: string; achievement_category: string; achievement_icon: string | null; count: number; first_earned_at: string }[];
  records: {
    highest_elo: number;
    highest_elo_date: string | null;
    longest_win_streak: number;
    longest_unbeaten_streak: number;
    biggest_gain: { gain: number } | null;
  };
}

interface CareerHighlightsProps {
  gameStats: GameStat[];
  totalAchievementsUnlocked: number;
  totalAchievementsPossible: number;
}

function formatGameName(name: string) {
  return name.charAt(0).toUpperCase() + name.slice(1).replace("-", " ");
}

export function CareerHighlights({ gameStats, totalAchievementsUnlocked, totalAchievementsPossible }: CareerHighlightsProps) {
  if (gameStats.length === 0) return null;

  const highlights: { icon: string; label: string; value: string; sublabel?: string }[] = [];

  // Find highest rating across all games
  const highestRating = gameStats.reduce((max, game) =>
    game.records.highest_elo > max.elo ? { elo: game.records.highest_elo, game: game.game_name, date: game.records.highest_elo_date } : max
  , { elo: 0, game: '', date: null as string | null });

  if (highestRating.elo > 0) {
    highlights.push({
      icon: '🏆',
      label: 'Peak Rating',
      value: highestRating.elo.toFixed(3),
      sublabel: `in ${formatGameName(highestRating.game)}`
    });
  }

  // Find longest win streak
  const longestStreak = gameStats.reduce((max, game) =>
    game.records.longest_win_streak > max.streak ? { streak: game.records.longest_win_streak, game: game.game_name } : max
  , { streak: 0, game: '' });

  if (longestStreak.streak >= 3) {
    highlights.push({
      icon: '🔥',
      label: 'Best Win Streak',
      value: `${longestStreak.streak} games`,
      sublabel: `in ${formatGameName(longestStreak.game)}`
    });
  }

  // Find longest unbeaten run
  const longestUnbeaten = gameStats.reduce((max, game) =>
    game.records.longest_unbeaten_streak > max.streak ? { streak: game.records.longest_unbeaten_streak, game: game.game_name } : max
  , { streak: 0, game: '' });

  if (longestUnbeaten.streak >= 5) {
    highlights.push({
      icon: '💪',
      label: 'Longest Unbeaten Run',
      value: `${longestUnbeaten.streak} games`,
      sublabel: `in ${formatGameName(longestUnbeaten.game)}`
    });
  }

  // Total achievements with progress
  if (totalAchievementsUnlocked > 0) {
    const pct = Math.round((totalAchievementsUnlocked / totalAchievementsPossible) * 100);
    highlights.push({
      icon: '🏅',
      label: 'Achievements',
      value: `${totalAchievementsUnlocked}/${totalAchievementsPossible}`,
      sublabel: `${pct}% complete`
    });
  }

  // Find biggest skill gain
  const biggestGain = gameStats.reduce((max, game) =>
    (game.records.biggest_gain?.gain || 0) > max.gain ? { gain: game.records.biggest_gain!.gain, game: game.game_name } : max
  , { gain: 0, game: '' });

  if (biggestGain.gain > 0) {
    highlights.push({
      icon: '⚡',
      label: 'Best Victory',
      value: `+${biggestGain.gain.toFixed(3)}`,
      sublabel: `in ${formatGameName(biggestGain.game)}`
    });
  }

  if (highlights.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
      {highlights.map((highlight, idx) => (
        <div key={idx} className="bg-card rounded-xl shadow-lg p-4 text-center">
          <div className="text-2xl mb-1">{highlight.icon}</div>
          <div className="text-2xl font-bold text-gray-900">{highlight.value}</div>
          <div className="text-sm font-semibold text-primary">{highlight.label}</div>
          {highlight.sublabel && (
            <div className="text-xs text-gray-500 mt-1">{highlight.sublabel}</div>
          )}
        </div>
      ))}
    </div>
  );
}