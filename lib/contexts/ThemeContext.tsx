'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';

interface ThemeSettings {
  company_name: string;
  logo_url: string;
  primary_color: string;
  accent_color: string;
}

interface ThemeContextType {
  settings: ThemeSettings;
  updateSettings: (newSettings: Partial<ThemeSettings>) => Promise<void>;
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

const defaultSettings: ThemeSettings = {
  company_name: 'Office Games',
  logo_url: '',
  primary_color: '#2563eb',
  accent_color: '#dc2626'
};

// Helper to generate hover and light variants from a hex color
function deriveColors(primary: string, accent: string) {
  // Generate hover (slightly darker) and light variants
  const primaryHover = adjustBrightness(primary, -15);
  const primaryLight = adjustBrightness(primary, 10);
  const accentLight = adjustBrightness(accent, 10);

  return { primaryHover, primaryLight, accentLight };
}

function adjustBrightness(hex: string, percent: number): string {
  // Remove # if present
  const cleanHex = hex.replace('#', '');

  // Parse RGB
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  // Adjust brightness
  const adjust = (value: number) => {
    const adjusted = value + Math.round((255 - value) * (percent / 100));
    return Math.min(255, Math.max(0, adjusted));
  };

  const newR = adjust(r);
  const newG = adjust(g);
  const newB = adjust(b);

  // Convert back to hex
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [settings, setSettings] = useState<ThemeSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  // Apply CSS variables when settings change
  const applyTheme = useCallback((newSettings: ThemeSettings) => {
    if (typeof window === 'undefined') return;

    const root = document.documentElement;
    const { primaryHover, primaryLight, accentLight } = deriveColors(
      newSettings.primary_color,
      newSettings.accent_color
    );

    root.style.setProperty('--primary', newSettings.primary_color);
    root.style.setProperty('--primary-hover', primaryHover);
    root.style.setProperty('--primary-light', primaryLight);
    root.style.setProperty('--accent', newSettings.accent_color);
    root.style.setProperty('--accent-light', accentLight);
  }, []);

  // Fetch settings on mount
  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          const mergedSettings = { ...defaultSettings, ...data };
          setSettings(mergedSettings);
          applyTheme(mergedSettings);
        }
      } catch (error) {
        console.error('Failed to fetch settings:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchSettings();
  }, [applyTheme]);

  // Update settings
  const updateSettings = async (newSettings: Partial<ThemeSettings>) => {
    const merged = { ...settings, ...newSettings };
    setSettings(merged);
    applyTheme(merged);

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: newSettings })
      });

      if (!res.ok) {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      console.error('Failed to update settings:', error);
      // Revert on failure
      setSettings(settings);
      applyTheme(settings);
      throw error;
    }
  };

  return (
    <ThemeContext.Provider value={{ settings, updateSettings, isLoading }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}