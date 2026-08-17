import { apiGet, apiPost, apiPut, apiDelete, apiUpload } from './client';
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
  return apiDelete(`/api/config/delete?key=${encodeURIComponent(key)}`);
}

export function readConfig(key: string) {
  return apiGet<Blob>(`/api/config/download?key=${encodeURIComponent(key)}`, { raw: true });
}

// Favorites
export interface FavoriteEntry {
  path: string;
  name: string;
  isDirectory: boolean;
  favoritedAt: string;
}

export function listFavorites() {
  return apiGet<FavoriteEntry[]>('/api/favorites');
}

export function addFavorite(path: string, name: string, isDirectory: boolean) {
  return apiPost('/api/favorites', { path, name, isDirectory });
}

export function removeFavorite(path: string) {
  return apiDelete(`/api/favorites?path=${encodeURIComponent(path)}`);
}

// VFS file-access history
export interface VfsHistoryEntry {
  path: string;
  name: string;
  isDirectory: boolean;
  accessedAt: string;
}

export function listVfsHistory() {
  return apiGet<VfsHistoryEntry[]>('/api/history/vfs');
}

export function recordVfsHistory(path: string, name: string, isDirectory: boolean) {
  return apiPost('/api/history/vfs', { path, name, isDirectory });
}

export function removeVfsHistory(path: string) {
  return apiDelete(`/api/history/vfs?path=${encodeURIComponent(path)}`);
}
