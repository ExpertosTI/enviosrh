import { Hono } from 'hono';
import sql from '../db/index.js';
import { auth, operatorOnly } from '../middleware/auth.js';
import { isValidUuid } from '../lib/validation.js';
import { sendTrackingLink } from '../lib/whatsappApi.js';
import { waLink, customerMessage } from '../lib/whatsapp.js';

const whatsapp = new Hono();

whatsapp.post('/send-tracking/:deliveryId', auth, operatorOnly, async (c) => {
  const user = c.get('user');
  const { deliveryId } = c.req.param();
  if (!isValidUuid(deliveryId)) return c.json({ error: 'ID inválido' }, 400);

  const [row] = await sql`
    SELECT d.customer_token, c.name AS customer_name, c.phone AS customer_phone
    FROM deliveries d
    JOIN customers c ON c.id = d.customer_id
    WHERE d.id = ${deliveryId} AND d.tenant_id = ${user.tenant_id}
  `;
  if (!row?.customer_phone) return c.json({ error: 'Cliente sin teléfono' }, 404);

  const sent = await sendTrackingLink({
    customerName: row.customer_name ?? 'Cliente',
    customerPhone: row.customer_phone,
    customerToken: row.customer_token,
  });

  const msg = customerMessage({
    customerName: row.customer_name ?? 'Cliente',
    customerToken: row.customer_token,
  });

  return c.json({
    sent,
    wa_link: waLink(row.customer_phone, msg),
    message: sent ? 'WhatsApp enviado' : 'API no configurada — usa el enlace wa.me',
  });
});

export default whatsapp;
