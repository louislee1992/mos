import { useCallback } from 'react';
import { loadSettings, saveSettings } from '../api/settings';
import type { UserSettings } from '../types/settings';

export function useSettings() {
  const load = useCallback(async (): Promise<UserSettings> => {
    return await loadSettings();
  }, []);

  const save = useCallback(async (settings: UserSettings): Promise<void> => {
    await saveSettings(settings);
  }, []);

  return { load, save };
}
