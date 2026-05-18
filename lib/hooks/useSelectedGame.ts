import { useGames } from '../contexts/GameContext';

export function useSelectedGame() {
  const { selectedGameId, setSelectedGameId, games, selectedGame, isLoading } = useGames();

  return {
    selectedGameId,
    setSelectedGameId,
    games,
    selectedGame,
    isLoading
  };
}