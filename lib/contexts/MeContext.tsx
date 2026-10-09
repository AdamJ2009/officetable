'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import type { Player } from '../types';

// Gambling identity — this app has no login, so the gambler is whoever the
// user picks here (persisted per-browser in localStorage). All money rules
// are enforced server-side, so this only scopes what the UI shows.

interface MeContextType {
  me: Player | null;
  setMe: (player: Player | null) => void;
  players: Player[];
  isLoading: boolean;
}

const MeContext = createContext<MeContextType | null>(null);

const STORAGE_KEY = 'gamblingPlayerId';

export function MeProvider({ children }: { children: ReactNode }) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [me, setMeState] = useState<Player | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/players');
        if (res.ok) {
          const list = (await res.json()) as Player[];
          setPlayers(list);

          const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
          if (stored) {
            const id = parseInt(stored, 10);
            const found = list.find(p => p.id === id);
            if (found) setMeState(found);
          }
        }
      } catch (error) {
        console.error('Failed to load players for identity:', error);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const setMe = useCallback((player: Player | null) => {
    setMeState(player);
    if (typeof window !== 'undefined') {
      if (player) localStorage.setItem(STORAGE_KEY, String(player.id));
      else localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  return (
    <MeContext.Provider value={{ me, setMe, players, isLoading }}>
      {children}
    </MeContext.Provider>
  );
}

export function useMe() {
  const context = useContext(MeContext);
  if (!context) throw new Error('useMe must be used within a MeProvider');
  return context;
}