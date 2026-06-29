/** Identificador de login: correo o nombre de usuario (se guarda en users.email) */
export function isValidLoginId(id: string): boolean {
  return /^\S+@\S+\.\S+$/.test(id) || /^[a-zA-Z0-9_.-]{3,30}$/.test(id);
}

export function isRealEmail(loginId: string): boolean {
  return /^\S+@\S+\.\S+$/.test(loginId);
}

export function resolveLoginId(input: {
  username?: string;
  email?: string;
  phone?: string;
  name?: string;
}): string | null {
  const direct = (input.username || input.email || '').trim().toLowerCase();
  if (direct && isValidLoginId(direct)) return direct;

  const digits = String(input.phone ?? '').replace(/\D/g, '');
  if (digits.length >= 8) {
    const fromPhone = `u${digits.slice(-10)}`;
    if (isValidLoginId(fromPhone)) return fromPhone;
  }

  const slug = String(input.name ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24);

  if (slug.length >= 3) return slug;
  return null;
}
