const SESSION_KEY = 'mos-session';

function loadSession(): { accessKey: string; secretKey: string } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(accessKey: string, secretKey: string) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ accessKey, secretKey }));
  } catch { /* ignore */ }
}

const saved = loadSession();
let globalAccessKey = saved?.accessKey ?? '';
let globalSecretKey = saved?.secretKey ?? '';

export function setCredentials(accessKey: string, secretKey: string) {
  globalAccessKey = accessKey;
  globalSecretKey = secretKey;
  saveSession(globalAccessKey, globalSecretKey);
}

export function clearCredentials() {
  globalAccessKey = '';
  globalSecretKey = '';
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

export function getCredentials() {
  return { accessKey: globalAccessKey, secretKey: globalSecretKey };
}

export function hasSession(): boolean {
  return !!globalAccessKey;
}

function authHeader(): string {
  return 'Basic ' + btoa(`${globalAccessKey}:${globalSecretKey}`);
}

export async function apiGet<T>(path: string, opts?: { raw?: boolean }): Promise<T> {
  console.debug(`[API] → ${path}`);
  const res = await fetch(path, {
    headers: {
      'Authorization': authHeader(),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const msg = err.error || `HTTP ${res.status}`;
    console.error(`[API] ${res.status} response on ${path} — ${msg}`);
    throw new Error(msg);
  }
  if (opts?.raw) return res.blob() as unknown as T;
  return res.json();
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  console.debug(`[API] → ${path}`);
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Authorization': authHeader(),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const msg = err.error || `HTTP ${res.status}`;
    console.error(`[API] ${res.status} response on ${path} — ${msg}`);
    throw new Error(msg);
  }
  return res.json();
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  console.debug(`[API] → ${path}`);
  const res = await fetch(path, {
    method: 'PUT',
    headers: {
      'Authorization': authHeader(),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const msg = err.error || `HTTP ${res.status}`;
    console.error(`[API] ${res.status} response on ${path} — ${msg}`);
    throw new Error(msg);
  }
  return res.json();
}

export async function apiDelete<T>(path: string): Promise<T> {
  console.debug(`[API] → ${path}`);
  const res = await fetch(path, {
    method: 'DELETE',
    headers: {
      'Authorization': authHeader(),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const msg = err.error || `HTTP ${res.status}`;
    console.error(`[API] ${res.status} response on ${path} — ${msg}`);
    throw new Error(msg);
  }
  return res.json();
}

export function apiUpload<T>(
  path: string,
  file: File,
  extraFields?: Record<string, string>,
  onProgress?: (loaded: number, total: number) => void,
  onUploaded?: () => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', path);
    xhr.setRequestHeader('Authorization', authHeader());
    let lastProgressTs = 0;
    let uploadedNotified = false;
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      if (e.loaded >= e.total && !uploadedNotified) {
        uploadedNotified = true;
        onUploaded?.();
      }
      if (!onProgress) return;
      const now = Date.now();
      if (now - lastProgressTs < 100 && e.loaded < e.total) return;
      lastProgressTs = now;
      onProgress(e.loaded, e.total);
    };
    xhr.onload = () => {
      let body: Record<string, unknown> = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as T);
      } else {
        const msg = (body.error as string) || `HTTP ${xhr.status}`;
        console.error(`[API] ${xhr.status} response on ${path} — ${msg}`);
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error('网络错误'));
    xhr.onabort = () => reject(new Error('上传已取消'));
    const fd = new FormData();
    fd.append('file', file);
    if (extraFields) {
      for (const [k, v] of Object.entries(extraFields)) fd.append(k, v);
    }
    console.debug(`[API] → ${path}`);
    xhr.send(fd);
  });
}

export function downloadUrl(path: string): string {
  const params = new URLSearchParams({ path });
  return `/api/vfs/download?${params}`;
}

export function downloadVfsFile(path: string, filename: string) {
  const params = new URLSearchParams({ path });
  return apiDownloadBlob(`/api/vfs/download?${params}`, filename);
}

export async function apiDownloadBlob(path: string, filename: string) {
  console.debug(`[API] → ${path}`);
  const res = await fetch(path, {
    headers: {
      'Authorization': authHeader(),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const msg = err.error || `HTTP ${res.status}`;
    console.error(`[API] ${res.status} response on ${path} — ${msg}`);
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
