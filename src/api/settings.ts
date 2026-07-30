import { apiGet, apiPut, apiDelete, apiUpload } from './client';
import type { UserSettings } from '../types/settings';

export function loadSettings() {
  return apiGet<UserSettings>('/api/settings');
}

export function saveSettings(settings: UserSettings) {
  return apiPut('/api/settings', settings);
}

export function uploadConfig(file: File, key: string) {
  return apiUpload('/api/config/upload', file, { key });
}

export function deleteConfig(key: string) {
  return apiDelete(`/api/config/${encodeURIComponent(key)}`);
}

export function readConfig(key: string) {
  return apiGet<{ content: string }>(`/api/config/${encodeURIComponent(key)}`);
}
