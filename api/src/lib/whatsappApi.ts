import { customerMessage } from './whatsapp.js';

const appUrl = () => process.env.APP_URL ?? 'https://enviosrh.renace.tech';

/** Envía mensaje vía WhatsApp Cloud API si está configurado */
export async function sendWhatsAppText(phone: string, message: string): Promise<boolean> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) return false;

  const clean = phone.replace(/\D/g, '');
  const to = clean.length === 10 ? `1${clean}` : clean;

  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendTrackingLink(opts: {
  customerName: string;
  customerPhone: string;
  customerToken: string;
}) {
  const msg = customerMessage({
    customerName: opts.customerName,
    customerToken: opts.customerToken,
  });
  return sendWhatsAppText(opts.customerPhone, msg);
}

export function trackingLinkForToken(token: string) {
  return `${appUrl()}/tracking/${token}`;
}
