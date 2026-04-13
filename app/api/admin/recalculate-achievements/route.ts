import { NextRequest, NextResponse } from 'next/server';
import { recalculateAchievementsForGame, recalculateAllAchievements } from '@/lib/achievements';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { game_id } = body;

    if (game_id) {
      // Recalculate for a specific game
      const result = recalculateAchievementsForGame(game_id);
      return NextResponse.json({
        success: true,
        game_id,
        matches_processed: result.matchesProcessed,
        achievements_awarded: result.achievementsAwarded
      });
    } else {
      // Recalculate for all games
      const results = recalculateAllAchievements();
      return NextResponse.json({
        success: true,
        games: results,
        total_achievements: results.reduce((sum, r) => sum + r.achievements_awarded, 0)
      });
    }
  } catch (error) {
    console.error('Error recalculating achievements:', error);
    return NextResponse.json(
      { error: 'Failed to recalculate achievements' },
      { status: 500 }
    );
  }
}