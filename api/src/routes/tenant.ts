import { Hono } from 'hono';
import sql from '../db/index.js';
import { auth, operatorOnly } from '../middleware/auth.js';
import { isValidColor, isValidLogoUrl } from '../lib/validation.js';

const tenant = new Hono();

// Obtener datos del inquilino (branding y perfil)
tenant.get('/', auth, async (c) => {
  const user = c.get('user');
  
  const [row] = await sql`
    SELECT id, name, slug, logo_url, favicon_url, custom_domain,
           primary_color, secondary_color, accent_color, theme_mode,
           contact_email, contact_phone, address, created_at, updated_at
    FROM tenants
    WHERE id = ${user.tenant_id}
    LIMIT 1
  `;

  if (!row) {
    return c.json({ error: 'Inquilino no encontrado' }, 404);
  }

  return c.json(row);
});

// Actualizar branding y perfil del inquilino (Solo operadores)
tenant.patch('/', auth, operatorOnly, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    name?: string;
    logo_url?: string | null;
    primary_color?: string;
    secondary_color?: string;
    accent_color?: string;
    theme_mode?: 'light' | 'dark' | 'glass';
    contact_email?: string | null;
    contact_phone?: string | null;
    address?: string | null;
    custom_domain?: string | null;
    favicon_url?: string | null;
  }>();

  // Validar tamaño de logotipo
  if (body.logo_url && body.logo_url.length > 512 * 1024 * 1.37) {
    return c.json({ error: 'El logotipo no debe superar los 500KB' }, 400);
  }

  // Validar formato del logotipo (sólo Data URIs seguros o HTTP/HTTPS)
  if (body.logo_url && !isValidLogoUrl(body.logo_url)) {
    return c.json({ error: 'Formato de logotipo no válido (debe ser imagen Base64 o URL HTTP/HTTPS)' }, 400);
  }

  // Validar colores
  if (body.primary_color && !isValidColor(body.primary_color)) {
    return c.json({ error: 'Color primario no válido (debe ser código hexadecimal, ej. #5b8af9)' }, 400);
  }
  if (body.secondary_color && !isValidColor(body.secondary_color)) {
    return c.json({ error: 'Color secundario no válido (debe ser código hexadecimal, ej. #4f46e5)' }, 400);
  }
  if (body.accent_color && !isValidColor(body.accent_color)) {
    return c.json({ error: 'Color de acento no válido (debe ser código hexadecimal, ej. #f59e0b)' }, 400);
  }

  // Validar tema
  if (body.theme_mode && !['light', 'dark', 'glass'].includes(body.theme_mode)) {
    return c.json({ error: 'Modo de tema no válido (debe ser light, dark o glass)' }, 400);
  }

  const [existing] = await sql`
    SELECT id FROM tenants WHERE id = ${user.tenant_id} LIMIT 1
  `;
  if (!existing) {
    return c.json({ error: 'Inquilino no encontrado' }, 404);
  }

  const [updated] = await sql`
    UPDATE tenants
    SET
      name            = COALESCE(${body.name ?? null}, name),
      logo_url        = COALESCE(${body.logo_url ?? null}, logo_url),
      primary_color   = COALESCE(${body.primary_color ?? null}, primary_color),
      secondary_color = COALESCE(${body.secondary_color ?? null}, secondary_color),
      accent_color    = COALESCE(${body.accent_color ?? null}, accent_color),
      theme_mode      = COALESCE(${body.theme_mode ?? null}, theme_mode),
      contact_email   = COALESCE(${body.contact_email ?? null}, contact_email),
      contact_phone   = COALESCE(${body.contact_phone ?? null}, contact_phone),
      address         = COALESCE(${body.address ?? null}, address),
      custom_domain   = COALESCE(${body.custom_domain ?? null}, custom_domain),
      favicon_url     = COALESCE(${body.favicon_url ?? null}, favicon_url),
      updated_at      = now()
    WHERE id = ${user.tenant_id}
    RETURNING *
  `;

  return c.json(updated);
});

export default tenant;
