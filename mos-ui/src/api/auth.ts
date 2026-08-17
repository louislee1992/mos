import { apiGet } from './client';

export async function verifyCredentials(accessKey: string, secretKey: string) {
  const res = await fetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessKey, secretKey }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean; bucket: string; accessKey: string }>;
}

export function checkAdmin() {
  return apiGet<{ accessKey: string; isAdmin: boolean }>('/api/auth/admin');
}

export function getVersion() {
  return apiGet<{ version: string }>('/api/auth/version');
}
