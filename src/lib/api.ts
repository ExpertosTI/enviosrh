/** Cliente HTTP centralizado — apunta a /api en producción y al proxy de Vite en dev */

// En producción (Traefik) la API siempre está bajo /api
const BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('enviosrh_token');
}

export function setToken(token: string) {
  localStorage.setItem('enviosrh_token', token);
}

export function clearToken() {
  localStorage.removeItem('enviosrh_token');
  localStorage.removeItem('enviosrh_user');
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Error desconocido');
  }
  return res.json() as Promise<T>;
}

export const api = {
  post:  <T>(path: string, body: unknown) => req<T>('POST',  path, body),
  get:   <T>(path: string)                => req<T>('GET',   path),
  patch: <T>(path: string, body?: unknown) => req<T>('PATCH', path, body),
};

/** Rutas públicas (sin token) */
async function pub<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Error desconocido');
  }
  return res.json() as Promise<T>;
}

export const publicApi = {
  get:  <T>(path: string)                => pub<T>('GET',  path),
  post: <T>(path: string, body?: unknown) => pub<T>('POST', path, body),
};
