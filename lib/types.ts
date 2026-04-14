export interface Player {
  id: number;
  name: string;
  status: 'active' | 'retired';
  created_at: string;
}

export interface Game {
  id: number;
  name: string;
  score_type: 'best_of' | 'first_to';
  score_value: number;
  image_url?: string | null;
  created_at: string;
}

export interface PlayerRating {
  id: number;
  player_id: number;
  game_id: number;
  elo: number;
  player_name?: string;
}

export interface Match {
  id: number;
  game_id: number;
  played_at: string;
  notes: string | null;
  is_edited?: number;
  edited_at?: string | null;
}

export interface MatchParticipant {
  id: number;
  match_id: number;
  player_id: number;
  team: number;
  score: number;
  elo_before: number;
  elo_after: number;
}

export interface MatchWithParticipants extends Match {
  participants: (MatchParticipant & { player_name: string })[];
  game_name: string;
  achievements?: MatchAchievement[];
}

export interface LeaderboardEntry {
  player_id: number;
  player_name: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  status?: 'active' | 'retired';
  trend: number[];
}

export interface CreateMatchInput {
  game_id: number;
  notes?: string;
  teams: {
    team: number;
    player_ids: number[];
    score: number;
  }[];
}

export interface GameStats {
  game_id: number;
  total_matches: number;
  team0_points: number;
  team1_points: number;
  active_players: number;
  total_players: number;
}

export interface Achievement {
  id: number;
  name: string;
  description: string;
  category: string;
  icon?: string | null;
}

export interface PlayerAchievement {
  id: number;
  player_id: number;
  game_id: number;
  achievement_id: number;
  match_id: number | null;
  earned_at: string;
  metadata?: string | null;
}

export interface AchievementWithCount {
  id: number;
  name: string;
  description: string;
  category: string;
  icon?: string | null;
  count: number;
  first_earned_at: string;
}

export interface MatchAchievement {
  achievement_id: number;
  achievement_name: string;
  achievement_description: string;
  achievement_icon: string | null;
  player_id: number;
  player_name: string;
}