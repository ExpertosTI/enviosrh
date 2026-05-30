import postgres from 'postgres';
import { readFileSync } from 'fs';
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
  const migrationPath = join(__dirname, '../../migrations/001_init.sql');
  const migrationSQL = readFileSync(migrationPath, 'utf-8');
  await sql.unsafe(migrationSQL);
  console.log('[db] Migraciones aplicadas.');
}
