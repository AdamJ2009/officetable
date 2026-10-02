'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Client-side kill switch for seasonal theming (lib/seasonalTheme.ts).
 *
 * Persisted per-browser in localStorage — the server always renders with
 * seasonal effects on (it doesn't know about this preference), so the hook
 * returns `null` until after mount and callers must treat `null` as
 * "enabled" for the hydration pass. Disabling then applies as a normal
 * post-hydration re-render.
 */

const STORAGE_KEY = 'seasonal-effects';
/** Fired locally when the value flips; 'storage' handles other tabs. */
const CHANGE_EVENT = 'seasonal-effects-changed';

function readFromStorage(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function useSeasonalEffects() {
  // null = preference not read yet (SSR + first hydration render)
  const [enabled, setEnabledState] = useState<boolean | null>(null);

  useEffect(() => {
    const sync = () => setEnabledState(readFromStorage());
    sync();

    const handler = () => sync();
    window.addEventListener(CHANGE_EVENT, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(CHANGE_EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const setEnabled = useCallback((on: boolean) => {
    try {
      if (on) {
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        window.localStorage.setItem(STORAGE_KEY, 'off');
      }
      // Notify other hook instances on this page (e.g. Settings + leaderboard)
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
      // localStorage unavailable — just remember it for this visit
    }
    setEnabledState(on);
  }, []);

  return { enabled, setEnabled };
}