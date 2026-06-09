import postgres from 'postgres';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const sql = postgres(process.env.DATABASE_URL!, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
  onnotice: () => {},
});

export default sql;

/** Ejecuta las migraciones al arrancar */
export async function runMigrations() {
  // 1. Crear la tabla de tracking de migraciones si no existe
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // 2. Obtener las migraciones ya aplicadas
  const applied = await sql<{ version: string }[]>`SELECT version FROM schema_migrations`;
  const appliedSet = new Set(applied.map(row => row.version));

  const migrationsDir = join(__dirname, '../../migrations');
  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  
  let count = 0;
  for (const file of files) {
    if (appliedSet.has(file)) {
      continue;
    }
    console.log(`[db] Aplicando migración: ${file}`);
    const migrationSQL = readFileSync(join(migrationsDir, file), 'utf-8');
    
    // Ejecutar la migración en una transacción
    await sql.begin(async (sql) => {
      await sql.unsafe(migrationSQL);
      await sql`INSERT INTO schema_migrations (version) VALUES (${file})`;
    });
    count++;
  }
  console.log(`[db] ${count} migraciones nuevas aplicadas.`);
}
