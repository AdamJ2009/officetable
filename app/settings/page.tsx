"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTheme } from "@/lib/contexts/ThemeContext";

interface Game {
  id: number;
  name: string;
  score_type: 'best_of' | 'first_to';
  score_value: number;
  image_url?: string | null;
}

const COLOR_PRESETS = [
  { name: 'Ocean Blue', primary: '#2563eb', accent: '#dc2626', emoji: '🌊' },
  { name: 'Forest', primary: '#16a34a', accent: '#dc2626', emoji: '🌲' },
  { name: 'Royal Purple', primary: '#9333ea', accent: '#f97316', emoji: '👑' },
  { name: 'Sunset Orange', primary: '#ea580c', accent: '#0891b2', emoji: '🌅' },
  { name: 'Teal Wave', primary: '#0d9488', accent: '#f43f5e', emoji: '🏄' },
  { name: 'Cherry Red', primary: '#dc2626', accent: '#2563eb', emoji: '🍒' },
];

export default function SettingsPage() {
  const { settings: themeSettings, updateSettings: updateTheme, isLoading: themeLoading } = useTheme();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [editedUrls, setEditedUrls] = useState<Record<number, string>>({});
  const [recalculating, setRecalculating] = useState(false);
  const [recalcResults, setRecalcResults] = useState<{ game_name: string; matches_processed: number; achievements_awarded: number }[] | null>(null);
  const [inactiveThreshold, setInactiveThreshold] = useState('60');
  const [savingThreshold, setSavingThreshold] = useState(false);

  // Local form state for theme settings
  const [companyName, setCompanyName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('');
  const [accentColor, setAccentColor] = useState('');
  const [savingTheme, setSavingTheme] = useState(false);

  // Sync local form state with theme context
  useEffect(() => {
    if (!themeLoading) {
      setCompanyName(themeSettings.company_name || '');
      setLogoUrl(themeSettings.logo_url || '');
      setPrimaryColor(themeSettings.primary_color || '#2563eb');
      setAccentColor(themeSettings.accent_color || '#dc2626');
    }
  }, [themeSettings, themeLoading]);

  useEffect(() => {
    fetch("/api/games")
      .then((res) => res.json())
      .then((data: Game[]) => {
        setGames(data);
        const urls: Record<number, string> = {};
        data.forEach(g => {
          if (g.image_url) urls[g.id] = g.image_url;
        });
        setEditedUrls(urls);
        setLoading(false);
      });
  }, []);

  // Load inactive threshold from settings
  useEffect(() => {
    async function loadThreshold() {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          if (data.inactive_threshold_days) {
            setInactiveThreshold(data.inactive_threshold_days);
          }
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    }
    loadThreshold();
  }, []);

  const formatGameName = (name: string) => {
    return name.charAt(0).toUpperCase() + name.slice(1).replace("-", " ");
  };

  async function saveImageUrl(gameId: number) {
    setSaving(gameId);
    try {
      const res = await fetch("/api/games", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: gameId,
          image_url: editedUrls[gameId] || null
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save");
      }

      // Update local state
      setGames(games.map(g =>
        g.id === gameId ? { ...g, image_url: editedUrls[gameId] || null } : g
      ));
    } catch (err) {
      console.error(err);
      alert("Failed to save image URL");
    } finally {
      setSaving(null);
    }
  }

  async function saveInactiveThreshold() {
    setSavingThreshold(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { inactive_threshold_days: inactiveThreshold } })
      });
      if (!res.ok) {
        throw new Error('Failed to save');
      }
      alert('Inactivity threshold saved!');
    } catch (err) {
      console.error(err);
      alert('Failed to save inactivity threshold');
    } finally {
      setSavingThreshold(false);
    }
  }

  async function handleThemeSave() {
    setSavingTheme(true);
    try {
      await updateTheme({
        company_name: companyName,
        logo_url: logoUrl,
        primary_color: primaryColor,
        accent_color: accentColor,
      });
      alert('Theme settings saved!');
    } catch (err) {
      console.error(err);
      alert('Failed to save theme settings');
    } finally {
      setSavingTheme(false);
    }
  }

  function applyPreset(preset: typeof COLOR_PRESETS[0]) {
    setPrimaryColor(preset.primary);
    setAccentColor(preset.accent);
  }

  async function recalculateAchievements() {
    setRecalculating(true);
    setRecalcResults(null);
    try {
      const res = await fetch("/api/admin/recalculate-achievements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });

      if (!res.ok) {
        throw new Error("Failed to recalculate");
      }

      const data = await res.json();
      setRecalcResults(data.games);
    } catch (err) {
      console.error(err);
      alert("Failed to recalculate achievements");
    } finally {
      setRecalculating(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-gray-500 mt-1">Customize your Office Games experience</p>
        </div>
        <Link
          href="/"
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
        >
          ← Back
        </Link>
      </div>

      {/* Branding Section */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-6">
        <div className="px-6 py-4 bg-gradient-to-r from-slate-800 to-slate-900">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-xl">✏️</span> Branding
          </h2>
          <p className="text-slate-300 text-sm mt-1">Customize the app name and logo</p>
        </div>
        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              App Name
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Office Games"
              className="w-full max-w-md px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-lg"
            />
            <p className="text-xs text-gray-500 mt-2">
              This name will appear in the navigation bar.
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Logo URL
            </label>
            <div className="flex gap-4 items-start">
              <div className="flex-1 max-w-md">
                <input
                  type="url"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://example.com/logo.png"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
              <div className="w-16 h-16 bg-gray-100 rounded-xl flex items-center justify-center overflow-hidden">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Logo preview"
                    className="w-12 h-12 object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <span className="text-2xl text-gray-400">🖼️</span>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Enter a URL to your logo image (PNG, JPG, or SVG)
            </p>
          </div>
        </div>
      </div>

      {/* Colors Section */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-6">
        <div className="px-6 py-4 bg-gradient-to-r from-purple-600 to-pink-600">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-xl">🎨</span> Colors
          </h2>
          <p className="text-purple-200 text-sm mt-1">Choose your app's color scheme</p>
        </div>
        <div className="p-6 space-y-6">
          {/* Presets */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Quick Presets
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => applyPreset(preset)}
                  className="group relative p-3 border-2 border-gray-200 rounded-xl hover:border-primary transition-all hover:shadow-md"
                >
                  <div className="text-2xl mb-2">{preset.emoji}</div>
                  <div className="text-sm font-medium text-gray-700">{preset.name}</div>
                  <div className="flex justify-center gap-1 mt-2">
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: preset.primary }}
                    />
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: preset.accent }}
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Colors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Primary Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-14 h-14 border-2 border-gray-200 rounded-xl cursor-pointer"
                />
                <div className="flex-1">
                  <input
                    type="text"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-mono"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">Used for buttons, links, and primary actions</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Accent Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-14 h-14 border-2 border-gray-200 rounded-xl cursor-pointer"
                />
                <div className="flex-1">
                  <input
                    type="text"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-mono"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">Used for highlights and warnings</p>
            </div>
          </div>

          {/* Live Preview */}
          <div className="p-5 bg-gray-50 rounded-xl border border-gray-200">
            <label className="block text-sm font-semibold text-gray-500 mb-4 uppercase tracking-wide">
              Live Preview
            </label>
            <div className="bg-white rounded-xl shadow-lg p-4">
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {companyName?.charAt(0) || 'O'}
                  </div>
                  <span className="font-bold text-lg">{companyName || 'Office Games'}</span>
                </div>
                <span style={{ color: primaryColor }} className="font-medium">Link</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  className="px-4 py-2 rounded-lg text-white font-medium shadow-sm"
                  style={{ backgroundColor: primaryColor }}
                >
                  Primary Button
                </button>
                <button
                  className="px-4 py-2 rounded-lg bg-gray-200 text-gray-800 font-medium"
                >
                  Secondary
                </button>
                <span style={{ color: accentColor }} className="font-medium">
                  Accent
                </span>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={handleThemeSave}
              disabled={savingTheme}
              className="px-6 py-3 bg-primary text-white rounded-xl font-semibold hover:bg-primary-hover transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingTheme ? "Saving..." : "💾 Save Theme"}
            </button>
          </div>
        </div>
      </div>

      {/* Game Images Section */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-6">
        <div className="px-6 py-4 bg-gradient-to-r from-blue-500 to-cyan-500">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-xl">🎮</span> Game Images
          </h2>
          <p className="text-blue-100 text-sm mt-1">Set images for each game (used in notifications)</p>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="text-gray-500">Loading...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {games.map((game) => (
                <div key={game.id} className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center overflow-hidden">
                      {editedUrls[game.id] || game.image_url ? (
                        <img
                          src={editedUrls[game.id] || game.image_url || ''}
                          alt={game.name}
                          className="w-8 h-8 object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <span className="text-xl">🎯</span>
                      )}
                    </div>
                    <span className="font-semibold text-gray-900">{formatGameName(game.name)}</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={editedUrls[game.id] || ""}
                      onChange={(e) => setEditedUrls({ ...editedUrls, [game.id]: e.target.value })}
                      placeholder="https://example.com/icon.png"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                    />
                    <button
                      onClick={() => saveImageUrl(game.id)}
                      disabled={saving === game.id}
                      className="px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
                    >
                      {saving === game.id ? "..." : "Save"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Inactivity Threshold Section */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-6">
        <div className="px-6 py-4 bg-gradient-to-r from-gray-600 to-gray-700">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-xl">💤</span> Inactivity
          </h2>
          <p className="text-gray-300 text-sm mt-1">Hide players from leaderboards who haven&apos;t played recently</p>
        </div>
        <div className="p-6">
          <div className="max-w-md">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Inactive threshold (days)
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Players who haven&apos;t played a match in this game type for more than this many days will be hidden from the leaderboard by default.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="1"
                value={inactiveThreshold}
                onChange={(e) => setInactiveThreshold(e.target.value)}
                className="w-24 px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-center text-lg font-semibold"
              />
              <span className="text-sm text-gray-500">days</span>
              <button
                onClick={saveInactiveThreshold}
                disabled={savingThreshold}
                className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingThreshold ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Achievements Section */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-amber-500 to-orange-500">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-xl">🏆</span> Achievements
          </h2>
          <p className="text-amber-100 text-sm mt-1">Recalculate achievement data</p>
        </div>
        <div className="p-6">
          <p className="text-gray-600 mb-4">
            Recalculate achievements for all historical match data. Useful after editing matches or when new achievements are added.
          </p>
          <button
            onClick={recalculateAchievements}
            disabled={recalculating}
            className="px-4 py-2 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {recalculating ? "Recalculating..." : "🔄 Recalculate All Achievements"}
          </button>

          {recalcResults && (
            <div className="mt-6 space-y-2">
              <h3 className="font-semibold text-gray-900">Results:</h3>
              {recalcResults.map((result) => (
                <div key={result.game_name} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="font-medium">{formatGameName(result.game_name)}</span>
                  <span className="text-sm text-gray-600">
                    {result.matches_processed} matches • {result.achievements_awarded} achievements
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}