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
}

export interface LeaderboardEntry {
  player_id: number;
  player_name: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  status?: 'active' | 'retired';
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