import { apiGet, apiPost, apiPut, apiDelete, apiUpload } from './client';
import type { VfsEntry } from '../types/vfs';

export function listVfs(path = '') {
  return apiGet<VfsEntry[]>(`/api/vfs?path=${encodeURIComponent(path)}`);
}

export function createFolder(path: string) {
  return apiPost('/api/vfs/folder', { path });
}

export function createFile(path: string) {
  return apiPost('/api/vfs/file', { path });
}

export function createWordDoc(path: string) {
  return apiPost('/api/vfs/word', { path });
}

export function uploadFile(file: File, path: string, onProgress?: (loaded: number, total: number) => void, onUploaded?: () => void) {
  return apiUpload('/api/vfs/upload', file, { path }, onProgress, onUploaded);
}

export function readText(path: string) {
  return apiGet<{ content: string }>(`/api/vfs/text?path=${encodeURIComponent(path)}`);
}

export function writeText(path: string, content: string) {
  return apiPut('/api/vfs/text', { path, content });
}

export function copyVfs(source: string, dest: string) {
  return apiPost('/api/vfs/copy', { source, dest });
}

export function renameVfs(oldPath: string, newPath: string) {
  return apiPut('/api/vfs/rename', { oldPath, newPath });
}

export function deleteVfs(path: string) {
  return apiDelete(`/api/vfs?path=${encodeURIComponent(path)}`);
}

export function moveToTrash(path: string) {
  return apiPost('/api/vfs/trash', { path });
}
