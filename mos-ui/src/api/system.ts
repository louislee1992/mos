import { apiGet } from './client';
import type { DeviceInfo } from '../types/settings';
import type { SystemInfo } from '../types/system';

export function getSystemInfo() {
  return apiGet<SystemInfo>('/api/system/info');
}

export function getDeviceInfo() {
  return apiGet<DeviceInfo>('/api/system/device');
}
