export interface AiResultCardField {
  label: string;
  value: string;
  copyable?: boolean;
  secret?: boolean;
}

export interface AiResultCard {
  type: 'team_member_created' | 'team_member_updated';
  title: string;
  fields: AiResultCardField[];
}

export function cardFromToolResult(name: string, result: unknown): AiResultCard | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;
  if (r.error || !r.ok) return null;

  const user = r.user as Record<string, string> | undefined;
  if (!user) return null;

  const roleLabel = user.role === 'messenger' ? 'Mensajero' : user.role === 'operator' ? 'Colaborador / Vendedor' : user.role;

  if (name === 'create_team_member') {
    const fields: AiResultCardField[] = [
      { label: 'Nombre', value: user.name, copyable: true },
      { label: 'Usuario / Email', value: user.email, copyable: true },
      { label: 'Rol', value: roleLabel },
    ];
    if (user.phone) fields.push({ label: 'Teléfono', value: user.phone, copyable: true });
    if (r.temp_password) {
      fields.push({
        label: 'Contraseña temporal',
        value: String(r.temp_password),
        copyable: true,
        secret: true,
      });
    }
    return { type: 'team_member_created', title: String(r.message ?? 'Colaborador creado'), fields };
  }

  if (name === 'update_team_member') {
    const active = (user as { active?: boolean }).active;
    const fields: AiResultCardField[] = [
      { label: 'Nombre', value: user.name, copyable: true },
      { label: 'Usuario / Email', value: user.email, copyable: true },
      { label: 'Rol', value: roleLabel },
      { label: 'Estado', value: active === false ? 'Inactivo' : 'Activo' },
    ];
    if (user.phone) fields.push({ label: 'Teléfono', value: user.phone, copyable: true });
    return { type: 'team_member_updated', title: String(r.message ?? 'Usuario actualizado'), fields };
  }

  return null;
}
