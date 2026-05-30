import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { runMigrations } from './db/index.js';
import authRoutes from './routes/auth.js';
import deliveriesRoutes from './routes/deliveries.js';
import messengersRoutes from './routes/messengers.js';
import portalRoutes from './routes/portal.js';

const app = new Hono();

app.use('*', logger());
app.use('*', cors({
  origin: process.env.APP_URL ?? '*',
  allowHeaders: ['Authorization', 'Content-Type'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE'],
}));

// Health check
app.get('/health', (c) => c.text('ok'));

// Rutas de API (prefijadas por Traefik con /api → strip → llegan aquí como /)
app.route('/auth', authRoutes);
app.route('/deliveries', deliveriesRoutes);
app.route('/messengers', messengersRoutes);

// Rutas públicas de portal (sin prefijo /api)
app.route('/p', portalRoutes);

// Arrancar
const port = Number(process.env.PORT ?? 3000);

runMigrations()
  .then(() => {
    serve({ fetch: app.fetch, port }, () => {
      console.log(`[enviosrh-api] Escuchando en :${port}`);
    });
  })
  .catch((err) => {
    console.error('[enviosrh-api] Error en migraciones:', err);
    process.exit(1);
  });
