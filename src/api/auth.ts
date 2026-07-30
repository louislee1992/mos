import { apiPost, apiGet } from './client';

export function verifyCredentials(endpoint: string, accessKey: string, secretKey: string) {
  return apiPost<{ ok: boolean; bucket: string; accessKey: string }>('/api/auth/verify', {
    endpoint, accessKey, secretKey,
  });
}

export function checkAdmin() {
  return apiGet<{ accessKey: string; isAdmin: boolean }>('/api/auth/admin');
}

export function getVersion() {
  return apiGet<{ version: string }>('/api/auth/version');
}
