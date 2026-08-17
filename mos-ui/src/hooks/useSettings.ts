import { useState, useCallback, useEffect } from 'react';
import { loadSettings, saveSettings } from '../api/settings';
import { getCredentials } from '../api/client';
import type { UserSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../types/settings';

export function useSettings(accessKey: string | null) {
  const [settings, setSettings] = useState<UserSettings | null>(null);

  useEffect(() => {
    const { accessKey: globalAk } = getCredentials();
    if (!accessKey || !globalAk) return;
    loadSettings()
      .then(setSettings)
      .catch((err) => {
        console.error('Failed to load settings:', err);
        setSettings(DEFAULT_SETTINGS);
      });
  }, [accessKey]);

  const updateSettings = useCallback(
    async (patch: Partial<UserSettings>) => {
      if (!settings) return;
      const updated = { ...settings, ...patch, updatedAt: Date.now() };
      try {
        await saveSettings(updated);
        setSettings(updated);
      } catch (err) {
        console.error('Failed to save settings:', err);
      }
    },
    [settings],
  );

  return { settings, updateSettings };
}
