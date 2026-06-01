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
  const migrationsDir = join(__dirname, '../../migrations');
  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  
  for (const file of files) {
    const migrationSQL = readFileSync(join(migrationsDir, file), 'utf-8');
    await sql.unsafe(migrationSQL);
  }
  console.log(`[db] ${files.length} migraciones aplicadas.`);
}
