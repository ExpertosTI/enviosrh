import { Capacitor, CapacitorHttp } from '@capacitor/core';

export function getBaseUrl(): string {
  const env = import.meta.env.VITE_API_URL as string | undefined;
  if (env) return env.replace(/\/$/, '');
  if (Capacitor.isNativePlatform()) return 'https://enviosrh.renace.tech/api';
  return '/api';
}

function getToken() { return localStorage.getItem('enviosrh_token'); }
export function setToken(token: string) { localStorage.setItem('enviosrh_token', token); }
export function clearToken() {
  localStorage.removeItem('enviosrh_token');
  localStorage.removeItem('enviosrh_user');
}

async function apiCall<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const token = getToken();

  if (!Capacitor.isNativePlatform()) {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    return data as T;
  }

  const res = await CapacitorHttp.request({
    url,
    method: method as 'GET' | 'POST' | 'PATCH' | 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    data: body,
  });
  if (res.status >= 200 && res.status < 300) return res.data as T;
  throw new Error(res.data?.error || `Error ${res.status}`);
}

export const api = {
  post:   <T>(path: string, body?: unknown) => apiCall<T>('POST', path, body),
  get:    <T>(path: string) => apiCall<T>('GET', path),
  patch:  <T>(path: string, body?: unknown) => apiCall<T>('PATCH', path, body),
  put:    <T>(path: string, body?: unknown) => apiCall<T>('PUT', path, body),
  delete: <T>(path: string) => apiCall<T>('DELETE', path),
};

export const publicApi = {
  get:  <T>(path: string) => apiCall<T>('GET', path),
  post: <T>(path: string, body?: unknown) => apiCall<T>('POST', path, body),
};

export async function uploadFile(file: File): Promise<{ url: string }> {
  const url = `${getBaseUrl()}/upload`;
  const token = getToken();
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(url, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error al subir archivo');
  return data as { url: string };
}

export function sseUrl(path: string): string {
  return `${getBaseUrl()}${path}`;
}
