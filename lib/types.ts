export interface Player {
  id: number;
  name: string;
  created_at: string;
}

export interface Game {
  id: number;
  name: string;
  created_at: string;
}

export interface PlayerRating {
  id: number;
  player_id: number;
  game_id: number;
  mu: number;
  sigma: number;
  player_name?: string;
}

export interface Match {
  id: number;
  game_id: number;
  played_at: string;
  notes: string | null;
}

export interface MatchParticipant {
  id: number;
  match_id: number;
  player_id: number;
  team: number;
  score: number;
}

export interface MatchWithParticipants extends Match {
  participants: (MatchParticipant & { player_name: string })[];
  game_name: string;
}

export interface LeaderboardEntry {
  player_id: number;
  player_name: string;
  mu: number;
  sigma: number;
  rating: number; // mu - 3*sigma (conservative rating)
  wins: number;
  losses: number;
  draws: number;
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