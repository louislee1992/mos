let globalEndpoint = '';
let globalAccessKey = '';
let globalSecretKey = '';

export function setCredentials(endpoint: string, accessKey: string, secretKey: string) {
  globalEndpoint = endpoint.replace(/\/$/, '');
  globalAccessKey = accessKey;
  globalSecretKey = secretKey;
}

export function getCredentials() {
  return { endpoint: globalEndpoint, accessKey: globalAccessKey, secretKey: globalSecretKey };
}

function authHeader(): string {
  return 'Basic ' + btoa(`${globalAccessKey}:${globalSecretKey}`);
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(globalEndpoint + path, {
    headers: {
      'Authorization': authHeader(),
      'X-Minio-Endpoint': globalEndpoint,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(globalEndpoint + path, {
    method: 'POST',
    headers: {
      'Authorization': authHeader(),
      'X-Minio-Endpoint': globalEndpoint,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(globalEndpoint + path, {
    method: 'PUT',
    headers: {
      'Authorization': authHeader(),
      'X-Minio-Endpoint': globalEndpoint,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(globalEndpoint + path, {
    method: 'DELETE',
    headers: {
      'Authorization': authHeader(),
      'X-Minio-Endpoint': globalEndpoint,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function apiUpload<T>(path: string, file: File, extraFields?: Record<string, string>): Promise<T> {
  const fd = new FormData();
  fd.append('file', file);
  if (extraFields) {
    for (const [k, v] of Object.entries(extraFields)) fd.append(k, v);
  }
  const res = await fetch(globalEndpoint + path, {
    method: 'POST',
    headers: {
      'Authorization': authHeader(),
      'X-Minio-Endpoint': globalEndpoint,
    },
    body: fd,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Returns a download URL for a VFS file.
 *
 * NOTE: The returned URL is a bare endpoint URL. Browsers will NOT attach
 * Authorization or X-Minio-Endpoint headers when you use it in `<a href>`,
 * `window.open()`, or direct navigation. Use `downloadVfsFile()` instead
 * when you need authenticated downloads.
 */
export function downloadUrl(path: string): string {
  const params = new URLSearchParams({ path });
  return `${globalEndpoint}/api/vfs/download?${params}`;
}

/**
 * Triggers an authenticated browser download for a VFS file.
 * Uses fetch with auth headers -- works with any authenticated endpoint.
 */
export function downloadVfsFile(path: string, filename: string) {
  const params = new URLSearchParams({ path });
  return apiDownloadBlob(`/api/vfs/download?${params}`, filename);
}

export async function apiDownloadBlob(path: string, filename: string) {
  const res = await fetch(globalEndpoint + path, {
    headers: {
      'Authorization': authHeader(),
      'X-Minio-Endpoint': globalEndpoint,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
