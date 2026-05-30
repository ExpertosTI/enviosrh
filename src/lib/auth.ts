import type { User } from '../types';
import { setToken, clearToken } from './api';

const USER_KEY = 'enviosrh_user';

export function saveSession(token: string, user: User) {
  setToken(token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getSession(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function logout() {
  clearToken();
  localStorage.removeItem(USER_KEY);
}
