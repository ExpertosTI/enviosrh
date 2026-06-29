import bcrypt from 'bcryptjs';
import sql from '../db/index.js';
import { isValidUuid } from './aiSecurity.js';
import { sendEmployeeWelcomeEmail } from './email.js';
import { isValidLoginId, resolveLoginId, isRealEmail } from './userLogin.js';
import type { AiToolContext } from './aiTools.js';

export const USER_AI_TOOL_DEFINITIONS = [
  {
    name: 'list_team_members',
    description: 'Lista colaboradores del equipo: mensajeros, vendedores/operadores y pendientes de aprobación.',
    parameters: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'Filtrar: messenger, operator, pending o all (default all)' },
        limit: { type: 'number', description: 'Máximo resultados (default 20)' },
      },
    },
  },
  {
    name: 'search_team_member',
    description: 'Busca un colaborador por nombre, email o teléfono.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Nombre, email o teléfono' } },
      required: ['query'],
    },
  },
  {
    name: 'create_team_member',
    description: 'Crea mensajero o colaborador. Solo necesitas nombre y usuario (sin correo). Si no hay usuario, se genera del teléfono o nombre.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nombre completo' },
        username: { type: 'string', description: 'Nombre de usuario para login (sin @, 3-30 caracteres)' },
        email: { type: 'string', description: 'Opcional: correo si quieres enviar bienvenida por email' },
        phone: { type: 'string', description: 'Teléfono (opcional, sirve para generar usuario)' },
        role: { type: 'string', description: 'messenger o operator' },
      },
      required: ['name', 'role'],
    },
  },
  {
    name: 'update_team_member',
    description: 'Actualiza datos de un colaborador: nombre, email, teléfono, rol, estado activo, contraseña.',
    parameters: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'UUID del usuario' },
        name: { type: 'string', description: 'Nuevo nombre' },
        email: { type: 'string', description: 'Nuevo email/usuario' },
        phone: { type: 'string', description: 'Nuevo teléfono' },
        role: { type: 'string', description: 'messenger, operator o pending' },
        active: { type: 'boolean', description: 'Activar o desactivar cuenta' },
        status: { type: 'string', description: 'Estado visible (ej. disponible, ocupado)' },
        password: { type: 'string', description: 'Nueva contraseña (mín. 6 caracteres)' },
      },
      required: ['user_id'],
    },
  },
  {
    name: 'approve_team_member',
    description: 'Aprueba un usuario pendiente y le asigna rol definitivo (mensajero u operador).',
    parameters: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'UUID del usuario pendiente' },
        role: { type: 'string', description: 'messenger u operator' },
      },
      required: ['user_id', 'role'],
    },
  },
  {
    name: 'deactivate_team_member',
    description: 'Desactiva la cuenta de un colaborador (no puede iniciar sesión). No elimina historial.',
    parameters: {
      type: 'object',
      properties: { user_id: { type: 'string', description: 'UUID del usuario' } },
      required: ['user_id'],
    },
  },
] as const;

function assertOperator(ctx: AiToolContext): string | null {
  if (ctx.user.role !== 'operator') return 'Solo operadores pueden gestionar el equipo';
  return null;
}

function validEmailOrUsername(value: string): boolean {
  return isValidLoginId(value);
}

export async function executeUserAiTool(
  name: string,
  args: Record<string, unknown>,
  ctx: AiToolContext,
): Promise<unknown | null> {
  const denied = assertOperator(ctx);
  if (denied) return { error: denied };

  const { tenantId, user } = ctx;

  switch (name) {
    case 'list_team_members': {
      const limit = Math.min(Number(args.limit ?? 20), 30);
      const role = String(args.role ?? 'all').toLowerCase();
      const roleFilter = role === 'messenger' || role === 'operator' || role === 'pending'
        ? sql`AND u.role = ${role}`
        : sql`AND u.role IN ('operator', 'messenger', 'pending')`;
      const rows = await sql`
        SELECT u.id, u.name, u.email, u.phone, u.role, u.active, u.status, u.created_at,
          COUNT(d.id) FILTER (WHERE d.state IN ('assigned','in_transit'))::int AS active_deliveries
        FROM users u
        LEFT JOIN deliveries d ON d.messenger_id = u.id AND d.tenant_id = ${tenantId}
        WHERE u.tenant_id = ${tenantId} ${roleFilter}
        GROUP BY u.id
        ORDER BY u.role, u.name ASC
        LIMIT ${limit}
      `;
      return { count: rows.length, members: rows };
    }

    case 'search_team_member': {
      const q = String(args.query ?? '').trim();
      if (!q) return { error: 'Query vacío' };
      const like = `%${q}%`;
      const rows = await sql`
        SELECT id, name, email, phone, role, active, status, created_at
        FROM users
        WHERE tenant_id = ${tenantId}
          AND role IN ('operator', 'messenger', 'pending')
          AND (name ILIKE ${like} OR email ILIKE ${like} OR phone ILIKE ${like})
        ORDER BY name ASC LIMIT 10
      `;
      return { count: rows.length, members: rows };
    }

    case 'create_team_member': {
      const memberName = String(args.name ?? '').trim();
      const phone = args.phone ? String(args.phone).trim() : null;
      const role = String(args.role ?? '').toLowerCase();
      const loginId = resolveLoginId({
        username: args.username ? String(args.username) : undefined,
        email: args.email ? String(args.email) : undefined,
        phone: phone ?? undefined,
        name: memberName,
      });

      if (!memberName) return { error: 'El nombre es obligatorio' };
      if (!loginId) {
        return { error: 'Indica un nombre de usuario (ej. michael_m) o un teléfono para generarlo' };
      }
      if (role !== 'operator' && role !== 'messenger') {
        return { error: 'Rol debe ser operator (vendedor/colaborador) o messenger (mensajero)' };
      }

      const [existing] = await sql`SELECT id FROM users WHERE email = ${loginId} LIMIT 1`;
      if (existing) return { error: 'Ese usuario ya está registrado' };

      const tempPassword = Math.random().toString(36).substring(2, 10).toUpperCase();
      const hashed = await bcrypt.hash(tempPassword, 10);

      const [tenant] = await sql`SELECT name, slug FROM tenants WHERE id = ${tenantId} LIMIT 1`;

      const [newUser] = await sql`
        INSERT INTO users (name, phone, email, password, role, active, tenant_id)
        VALUES (${memberName}, ${phone}, ${loginId}, ${hashed}, ${role}, true, ${tenantId})
        RETURNING id, name, email, phone, role, active, created_at
      `;

      if (isRealEmail(loginId)) {
        sendEmployeeWelcomeEmail(
          newUser.email,
          newUser.name,
          newUser.role,
          tempPassword,
          tenant?.name ?? 'EnviaYa!!',
          tenant?.slug ?? 'enviaya',
        ).catch(err => console.error('[AI Welcome-Email]', err));
      }

      return {
        ok: true,
        message: `${role === 'messenger' ? 'Mensajero' : 'Colaborador'} creado correctamente`,
        user: newUser,
        username: loginId,
        temp_password: tempPassword,
        note: isRealEmail(loginId)
          ? 'Se envió correo de bienvenida.'
          : 'Sin correo — comparte usuario y contraseña temporal con el colaborador.',
      };
    }

    case 'update_team_member': {
      const userId = String(args.user_id ?? '').trim();
      if (!isValidUuid(userId)) return { error: 'user_id inválido' };
      if (userId === user.sub) return { error: 'No puedes editar tu propia cuenta desde aquí — usa Ajustes de perfil' };

      const [existing] = await sql`
        SELECT id, role FROM users
        WHERE id = ${userId} AND tenant_id = ${tenantId}
          AND role IN ('operator', 'messenger', 'pending')
        LIMIT 1
      `;
      if (!existing) return { error: 'Usuario no encontrado' };

      const updates: Record<string, unknown> = {};
      if (args.name !== undefined) updates.name = String(args.name).trim();
      if (args.phone !== undefined) updates.phone = String(args.phone).trim() || null;
      if (args.email !== undefined) {
        const emailLower = String(args.email).trim().toLowerCase();
        if (!validEmailOrUsername(emailLower)) return { error: 'Email o usuario inválido' };
        const [dup] = await sql`SELECT id FROM users WHERE email = ${emailLower} AND id != ${userId} LIMIT 1`;
        if (dup) return { error: 'Ese email ya está en uso' };
        updates.email = emailLower;
      }
      if (args.role !== undefined) {
        const r = String(args.role).toLowerCase();
        if (!['operator', 'messenger', 'pending'].includes(r)) return { error: 'Rol inválido' };
        updates.role = r;
      }
      if (args.active !== undefined) updates.active = Boolean(args.active);
      if (args.status !== undefined) updates.status = String(args.status).trim();
      if (args.password !== undefined) {
        const pwd = String(args.password);
        if (pwd.length < 6) return { error: 'Contraseña mínimo 6 caracteres' };
        updates.password = await bcrypt.hash(pwd, 10);
      }

      if (!Object.keys(updates).length) return { error: 'No hay campos para actualizar' };

      const [updated] = await sql`
        UPDATE users SET ${sql(updates)}
        WHERE id = ${userId} AND tenant_id = ${tenantId}
        RETURNING id, name, email, phone, role, active, status
      `;

      return { ok: true, message: 'Usuario actualizado', user: updated };
    }

    case 'approve_team_member': {
      const userId = String(args.user_id ?? '').trim();
      const role = String(args.role ?? '').toLowerCase();
      if (!isValidUuid(userId)) return { error: 'user_id inválido' };
      if (role !== 'operator' && role !== 'messenger') {
        return { error: 'Rol debe ser operator o messenger' };
      }

      const [updated] = await sql`
        UPDATE users SET role = ${role}, active = true
        WHERE id = ${userId} AND tenant_id = ${tenantId} AND role = 'pending'
        RETURNING id, name, email, role, active
      `;
      if (!updated) return { error: 'Usuario pendiente no encontrado o ya aprobado' };
      return { ok: true, message: `${updated.name} aprobado como ${role}`, user: updated };
    }

    case 'deactivate_team_member': {
      const userId = String(args.user_id ?? '').trim();
      if (!isValidUuid(userId)) return { error: 'user_id inválido' };
      if (userId === user.sub) return { error: 'No puedes desactivar tu propia cuenta' };

      const [updated] = await sql`
        UPDATE users SET active = false
        WHERE id = ${userId} AND tenant_id = ${tenantId}
          AND role IN ('operator', 'messenger')
        RETURNING id, name, email, role, active
      `;
      if (!updated) return { error: 'Usuario no encontrado' };
      return { ok: true, message: `${updated.name} desactivado`, user: updated };
    }

    default:
      return null;
  }
}

export const USER_TOOL_NAMES = USER_AI_TOOL_DEFINITIONS.map(t => t.name);
