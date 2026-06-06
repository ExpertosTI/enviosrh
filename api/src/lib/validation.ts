/**
 * Helpers de validación para prevenir inyecciones y errores inesperados
 */

/** Valida si una cadena cumple el formato estándar de UUID (v1-v5) */
export function isValidUuid(id: string | undefined | null): boolean {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

/** Valida si un token público tiene exactamente 40 caracteres hexadecimales */
export function isValidToken(token: string | undefined | null): boolean {
  if (!token) return false;
  return /^[0-9a-f]{40}$/.test(token);
}

/** Valida si un color cumple con la sintaxis CSS hexadecimal (#fff, #ffffff) */
export function isValidColor(color: string | undefined | null): boolean {
  if (!color) return false;
  return /^#[0-9a-f]{3,6}$/i.test(color);
}

/** Valida si un logotipo es una URL http/https o un Data URI Base64 de tipo imagen */
export function isValidLogoUrl(url: string | undefined | null): boolean {
  if (!url) return true; // puede ser nulo o vacío
  return (
    /^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,/i.test(url) ||
    /^https?:\/\//i.test(url)
  );
}
