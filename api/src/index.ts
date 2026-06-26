import { serve } from '@hono/node-server';
import { createNodeWebSocket } from '@hono/node-ws';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { bodyLimit } from 'hono/body-limit';
import bcrypt from 'bcryptjs';
import { runMigrations } from './db/index.js';
import sql from './db/index.js';
import authRoutes from './routes/auth.js';
import deliveriesRoutes from './routes/deliveries.js';
import messengersRoutes from './routes/messengers.js';
import usersRoutes from './routes/users.js';
import tenantRoutes from './routes/tenant.js';
import portalRoutes from './routes/portal.js';
import uploadsRoutes from './routes/uploads.js';
import zonesRoutes from './routes/zones.js';
import analyticsRoutes from './routes/analytics.js';
import realtimeRoutes from './routes/realtime.js';
import pushRoutes from './routes/push.js';
import billingRoutes from './routes/billing.js';
import assignRulesRoutes from './routes/assignRules.js';
import whatsappRoutes from './routes/whatsapp.js';
import liveRoutes from './routes/live.js';
import { registerWsRoutes } from './routes/ws.js';
import { captureException } from './lib/observability.js';
import { serveStatic } from '@hono/node-server/serve-static';

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

// ── Bootstrap: crear admin y usuario maestro si no existen ──
async function bootstrapAdmin() {
  const adminEmail    = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  
  // Asegurar que existe inquilino por defecto
  await sql`
    INSERT INTO tenants (id, name, slug, primary_color, secondary_color, accent_color, theme_mode)
    VALUES ('d0000000-0000-0000-0000-000000000000', 'Envíos App', 'enviosrh', '#5b8af9', '#4f46e5', '#f59e0b', 'light')
    ON CONFLICT (slug) DO UPDATE SET name = 'Envíos App' WHERE tenants.name = 'EnvíosRH'
  `;

  if (adminEmail && adminPassword) {
    const [existing] = await sql`
      SELECT id FROM users WHERE role = 'operator' LIMIT 1
    `;
    if (!existing) {
      const hash = await bcrypt.hash(adminPassword, 12);
      await sql`
        INSERT INTO users (name, email, password, role, tenant_id)
        VALUES ('Administrador', ${adminEmail}, ${hash}, 'operator', 'd0000000-0000-0000-0000-000000000000')
        ON CONFLICT (email) DO NOTHING
      `;
      console.log(`[enviosrh-api] Admin inicial creado: ${adminEmail}`);
    }
  }

  // Crear usuario maestro enviorh / 101284 en Node.js
  const [existingMaster] = await sql`
    SELECT id FROM users WHERE email = 'enviorh' LIMIT 1
  `;
  if (!existingMaster) {
    const masterHash = await bcrypt.hash('101284', 12);
    await sql`
      INSERT INTO users (name, email, password, role, active, tenant_id)
      VALUES ('Usuario Maestro', 'enviorh', ${masterHash}, 'operator', true, 'd0000000-0000-0000-0000-000000000000')
      ON CONFLICT (email) DO NOTHING
    `;
    console.log('[enviosrh-api] Usuario maestro enviorh creado.');
  }

  // Crear mensajero mensajero07 / 101214 en Node.js
  const [existingMessenger] = await sql`
    SELECT id FROM users WHERE email = 'mensajero07' LIMIT 1
  `;
  if (!existingMessenger) {
    const messengerHash = await bcrypt.hash('101214', 12);
    await sql`
      INSERT INTO users (name, email, password, role, active, tenant_id)
      VALUES ('Mensajero 07', 'mensajero07', ${messengerHash}, 'messenger', true, 'd0000000-0000-0000-0000-000000000000')
      ON CONFLICT (email) DO NOTHING
    `;
    console.log('[enviosrh-api] Mensajero mensajero07 creado.');
  }
}

// ── App ─────────────────────────────────────────────────────
const app = new Hono();
const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });
registerWsRoutes(app, upgradeWebSocket);

// Servir archivos estáticos de uploads
app.use('/uploads/*', serveStatic({ root: './' }));

// Middlewares de seguridad y logs
app.use('*', secureHeaders());
app.use('*', logger());
app.use('*', cors({
  origin: APP_URL,
  allowHeaders: ['Authorization', 'Content-Type'],
  allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  credentials: true,
}));

// Límite de consumo de recursos: Max 2MB payload (excepto para cargas de archivos)
app.use('*', async (c, next) => {
  if (c.req.path.startsWith('/upload')) {
    return next();
  }
  return bodyLimit({
    maxSize: 2 * 1024 * 1024,
    onError: (c) => c.json({ error: 'Tamaño de solicitud excedido (máximo 2MB)' }, 413)
  })(c, next);
});

// ── Cache-Control headers ────────────────────────────────────
// GET /p/c/:token y /p/m/:token → 5s caché (stale-while-revalidate)
// GET /p/*/chat, POST y mutaciones → siempre no-store
app.use('*', async (c, next) => {
  await next();
  const method = c.req.method;
  const path   = c.req.path;

  if (method !== 'GET') {
    // Mutaciones: nunca cachear
    c.res.headers.set('Cache-Control', 'no-store');
    return;
  }

  if (path.match(/^\/p\/(c|m)\/[^/]+$/) ) {
    // Portal principal del cliente / mensajero: caché 5s con revalidación en background
    c.res.headers.set('Cache-Control', 'private, max-age=5, stale-while-revalidate=10');
  } else if (path.startsWith('/p/')) {
    // Chat y sub-rutas del portal: siempre fresco
    c.res.headers.set('Cache-Control', 'no-store');
  } else {
    // Rutas autenticadas de API: no cachear en cliente
    c.res.headers.set('Cache-Control', 'no-store');
  }
});

// Manejo centralizado de errores (Security: no revelar stack traces en prod)
app.onError((err, c) => {
  captureException(err, { path: c.req.path, method: c.req.method });
  return c.json({ error: 'Error interno del servidor' }, 500);
});

app.notFound((c) => {
  return c.json({ error: 'Ruta no encontrada' }, 404);
});

// Health check
app.get('/health', (c) => c.text('ok'));

// Rutas de API (Traefik strips /api → llegan como /)
app.route('/auth', authRoutes);
app.route('/deliveries', deliveriesRoutes);
app.route('/messengers', messengersRoutes);
app.route('/users', usersRoutes);
app.route('/tenant', tenantRoutes);
app.route('/upload', uploadsRoutes);
app.route('/zones', zonesRoutes);
app.route('/analytics', analyticsRoutes);
app.route('/', realtimeRoutes);
app.route('/push', pushRoutes);
app.route('/billing', billingRoutes);
app.route('/assign-rules', assignRulesRoutes);
app.route('/whatsapp', whatsappRoutes);
app.route('/live', liveRoutes);

// Rutas públicas de portal (sin prefijo /api, token en URL)
app.route('/p', portalRoutes);

// Arrancar
const port = Number(process.env.PORT ?? 3000);

runMigrations()
  .then(() => bootstrapAdmin())
  .then(() => {
    const server = serve({ fetch: app.fetch, port }, () => {
      console.log(`[enviosrh-api] Escuchando en :${port}`);
    });
    injectWebSocket(server);
  })
  .catch((err) => {
    console.error('[enviosrh-api] Error de arranque:', err);
    process.exit(1);
  });
