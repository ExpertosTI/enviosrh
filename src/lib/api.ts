import { CapacitorHttp } from '@capacitor/core';

const BASE_URL = 'https://enviosrh.renace.tech/api';

function getToken() { return localStorage.getItem('enviosrh_token'); }
export function setToken(token: string) { localStorage.setItem('enviosrh_token', token); }
export function clearToken() {
  localStorage.removeItem('enviosrh_token');
  localStorage.removeItem('enviosrh_user');
}

async function apiCall<T>(method: string, path: string, body?: any): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const token = getToken();

  const options = {
    url,
    method: method as any,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    data: body,
  };

  try {
    const res = await CapacitorHttp.request(options);

    if (typeof res.data === 'string' && res.data.includes('<!DOCTYPE')) {
      throw new Error('Servidor retornó HTML. Verifica la URL.');
    }

    if (res.status >= 200 && res.status < 300) {
      return res.data as T;
    } else {
      throw new Error(res.data?.error || `Error ${res.status}`);
    }
  } catch (err: any) {
    throw new Error(err.message || 'Error de conexión');
  }
}

export const api = {
  post:   <T>(path: string, body?: any) => apiCall<T>('POST', path, body),
  get:    <T>(path: string)             => apiCall<T>('GET',  path),
  patch:  <T>(path: string, body?: any) => apiCall<T>('PATCH', path, body),
  delete: <T>(path: string)             => apiCall<T>('DELETE', path),
};

export const publicApi = {
  get:  <T>(path: string)             => apiCall<T>('GET',  path),
  post: <T>(path: string, body?: any) => apiCall<T>('POST', path, body),
};

export const uploadFile = async (file: File): Promise<{ url: string }> => {
  console.log('Upload file:', file.name);
  throw new Error('Upload no disponible');
};
