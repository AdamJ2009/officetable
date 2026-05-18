'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { Game } from '../types';

interface GameContextType {
  selectedGameId: number | null;
  setSelectedGameId: (id: number) => void;
  games: Game[];
  selectedGame: Game | null;
  isLoading: boolean;
}

const GameContext = createContext<GameContextType | null>(null);

const STORAGE_KEY = 'selectedGameId';

interface GameProviderProps {
  children: ReactNode;
  initialGameId?: number | null;
}

export function GameProvider({ children, initialGameId }: GameProviderProps) {
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGameId, setSelectedGameIdState] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch games on mount
  useEffect(() => {
    async function fetchGames() {
      try {
        const res = await fetch('/api/games');
        if (res.ok) {
          const data = await res.json();
          setGames(data);

          // Determine initial game selection (priority: URL param > localStorage > first game)
          const storedId = typeof window !== 'undefined'
            ? localStorage.getItem(STORAGE_KEY)
            : null;

          let gameId: number | null = null;

          if (initialGameId && data.some((g: Game) => g.id === initialGameId)) {
            gameId = initialGameId;
          } else if (storedId) {
            const parsedId = parseInt(storedId, 10);
            if (data.some((g: Game) => g.id === parsedId)) {
              gameId = parsedId;
            }
          }

          // Default to first game if no valid selection
          if (!gameId && data.length > 0) {
            gameId = data[0].id;
          }

          setSelectedGameIdState(gameId);
        }
      } catch (error) {
        console.error('Failed to fetch games:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchGames();
  }, [initialGameId]);

  // Persist selection to localStorage
  const setSelectedGameId = useCallback((id: number) => {
    setSelectedGameIdState(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, String(id));
    }
  }, []);

  const selectedGame = games.find(g => g.id === selectedGameId) || null;

  return (
    <GameContext.Provider value={{
      selectedGameId,
      setSelectedGameId,
      games,
      selectedGame,
      isLoading
    }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGames() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGames must be used within a GameProvider');
  }
  return context;
}