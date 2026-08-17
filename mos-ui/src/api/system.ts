import { apiGet } from './client';
import type { DeviceInfo, LoginHistoryEntry } from '../types/settings';
import type { SystemInfo } from '../types/system';

export function getSystemInfo() {
  return apiGet<SystemInfo>('/api/system/info');
}

export function getDeviceInfo() {
  return apiGet<DeviceInfo>('/api/system/device');
}

export function getLoginHistory() {
  return apiGet<LoginHistoryEntry[]>('/api/system/login-history');
}
