import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import bcrypt from 'bcryptjs';
import { runMigrations } from './db/index.js';
import sql from './db/index.js';
import authRoutes from './routes/auth.js';
import deliveriesRoutes from './routes/deliveries.js';
import messengersRoutes from './routes/messengers.js';
import usersRoutes from './routes/users.js';
import portalRoutes from './routes/portal.js';

// ── Validar variables críticas antes de arrancar ────────────
const JWT_SECRET = process.env.JWT_SECRET ?? '';
if (JWT_SECRET.length < 32) {
  console.error('[enviosrh-api] FATAL: JWT_SECRET debe tener al menos 32 caracteres');
  process.exit(1);
}

const APP_URL = process.env.APP_URL ?? '';
if (!APP_URL) {
  console.error('[enviosrh-api] FATAL: APP_URL no está configurado');
  process.exit(1);
}

// ── Bootstrap: crear admin si no hay operadores ─────────────
async function bootstrapAdmin() {
  const adminEmail    = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) return;

  const [existing] = await sql`
    SELECT id FROM users WHERE role = 'operator' LIMIT 1
  `;
  if (existing) return; // Ya existe al menos un operador

  const hash = await bcrypt.hash(adminPassword, 12);
  await sql`
    INSERT INTO users (name, email, password, role)
    VALUES ('Administrador', ${adminEmail}, ${hash}, 'operator')
    ON CONFLICT (email) DO NOTHING
  `;
  console.log(`[enviosrh-api] Admin inicial creado: ${adminEmail}`);
}

// ── App ─────────────────────────────────────────────────────
const app = new Hono();

app.use('*', logger());
app.use('*', cors({
  origin: APP_URL,
  allowHeaders: ['Authorization', 'Content-Type'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE'],
  credentials: true,
}));

// Health check
app.get('/health', (c) => c.text('ok'));

// Rutas de API (Traefik strips /api → llegan como /)
app.route('/auth', authRoutes);
app.route('/deliveries', deliveriesRoutes);
app.route('/messengers', messengersRoutes);
app.route('/users', usersRoutes);

// Rutas públicas de portal (sin prefijo /api, token en URL)
app.route('/p', portalRoutes);

// Arrancar
const port = Number(process.env.PORT ?? 3000);

runMigrations()
  .then(() => bootstrapAdmin())
  .then(() => {
    serve({ fetch: app.fetch, port }, () => {
      console.log(`[enviosrh-api] Escuchando en :${port}`);
    });
  })
  .catch((err) => {
    console.error('[enviosrh-api] Error de arranque:', err);
    process.exit(1);
  });
