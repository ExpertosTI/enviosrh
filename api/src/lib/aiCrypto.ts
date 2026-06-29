import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGO = 'aes-256-gcm';

function deriveKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET requerido para cifrar API keys de IA (mín. 32 caracteres)');
  }
  return scryptSync(secret, 'enviosrh-ai-keys', 32);
}

export function encryptSecret(plain: string): string {
  if (!plain) return '';
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptSecret(stored: string | null | undefined): string {
  if (!stored) return '';
  if (!stored.startsWith('v1:')) return stored;
  try {
    const parts = stored.split(':');
    if (parts.length !== 4) return '';
    const [, ivB64, tagB64, dataB64] = parts;
    const key = deriveKey();
    const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);
    return dec.toString('utf8');
  } catch {
    return '';
  }
}

export function maskSecret(value: string | null | undefined): string {
  if (!value) return '';
  try {
    const plain = value.startsWith('v1:') ? decryptSecret(value) : value;
    if (!plain) return '••••••••';
    if (plain.length <= 8) return '••••••••';
    return `${plain.slice(0, 4)}••••${plain.slice(-4)}`;
  } catch {
    return '••••••••';
  }
}
