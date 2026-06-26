import webpush from 'web-push';
import sql from '../db/index.js';

let vapidReady = false;

function initVapid() {
  if (vapidReady) return !!process.env.VAPID_PUBLIC_KEY;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:admin@enviosrh.local';
  if (pub && priv) {
    webpush.setVapidDetails(subject, pub, priv);
    vapidReady = true;
    return true;
  }
  return false;
}

export function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

export async function sendWebPushToDelivery(
  deliveryId: string,
  payload: { title: string; body: string; url?: string },
  roles?: string[],
) {
  if (!initVapid()) return 0;

  const subs = roles?.length
    ? await sql`
        SELECT endpoint, p256dh, auth_key FROM push_subscriptions
        WHERE delivery_id = ${deliveryId} AND role = ANY(${roles})
      `
    : await sql`
        SELECT endpoint, p256dh, auth_key FROM push_subscriptions
        WHERE delivery_id = ${deliveryId}
      `;

  const data = JSON.stringify(payload);
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
        data,
      );
      sent++;
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await sql`DELETE FROM push_subscriptions WHERE endpoint = ${s.endpoint}`;
      }
    }
  }
  return sent;
}

export async function sendFcmToDelivery(
  deliveryId: string,
  payload: { title: string; body: string },
  roles?: string[],
) {
  const serverKey = process.env.FCM_SERVER_KEY;
  if (!serverKey) return 0;

  const tokens = roles?.length
    ? await sql`
        SELECT token FROM device_push_tokens
        WHERE delivery_id = ${deliveryId} AND role = ANY(${roles})
      `
    : await sql`
        SELECT token FROM device_push_tokens WHERE delivery_id = ${deliveryId}
      `;

  let sent = 0;
  for (const { token } of tokens) {
    try {
      const res = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          Authorization: `key=${serverKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: token,
          notification: { title: payload.title, body: payload.body },
          priority: 'high',
        }),
      });
      if (res.ok) sent++;
      else if (res.status === 404) {
        await sql`DELETE FROM device_push_tokens WHERE token = ${token}`;
      }
    } catch { /* optional */ }
  }
  return sent;
}

export async function notifyDelivery(
  deliveryId: string,
  payload: { title: string; body: string; url?: string },
  roles?: string[],
) {
  const w = await sendWebPushToDelivery(deliveryId, payload, roles);
  const f = await sendFcmToDelivery(deliveryId, payload, roles);
  return w + f;
}
