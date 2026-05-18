'use client';

import { ReactNode } from 'react';
import { GameProvider } from '../lib/contexts/GameContext';
import { ThemeProvider } from '../lib/contexts/ThemeContext';

interface ProvidersProps {
  children: ReactNode;
  initialGameId?: number | null;
}

export function Providers({ children, initialGameId }: ProvidersProps) {
  return (
    <ThemeProvider>
      <GameProvider initialGameId={initialGameId}>
        {children}
      </GameProvider>
    </ThemeProvider>
  );
}