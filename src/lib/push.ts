import { LocalNotifications } from '@capacitor/local-notifications';
import { getBaseUrl } from './api';

let proximityNotified = false;
let vapidKey: string | null = null;

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function loadVapidKey() {
  if (vapidKey !== null) return vapidKey;
  try {
    const res = await fetch(`${getBaseUrl()}/push/vapid-public-key`);
    const data = await res.json() as { enabled: boolean; publicKey?: string };
    vapidKey = data.enabled && data.publicKey ? data.publicKey : '';
  } catch {
    vapidKey = '';
  }
  return vapidKey;
}

export async function requestNotificationPermission() {
  try {
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display === 'granted') return true;
  } catch { /* web */ }
  if ('Notification' in window) {
    const r = await Notification.requestPermission();
    return r === 'granted';
  }
  return false;
}

export async function notifyProximity(title: string, body: string) {
  if (proximityNotified) return;
  proximityNotified = true;
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: Date.now() % 100000,
        title,
        body,
        schedule: { at: new Date(Date.now() + 500) },
      }],
    });
  } catch {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  }
}

export function resetProximityFlag() { proximityNotified = false; }

export async function subscribeWebPush(deliveryId: string, role: string) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const key = await loadVapidKey();
  if (!key) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
    const json = sub.toJSON();
    await fetch(`${getBaseUrl()}/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: json.keys,
        delivery_id: deliveryId,
        role,
      }),
    });
  } catch { /* optional */ }
}

export async function registerNativePush(deliveryId: string, role: string) {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return;
    await PushNotifications.register();
    PushNotifications.addListener('registration', async (token) => {
      await fetch(`${getBaseUrl()}/push/device-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token.value,
          platform: /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'ios' : 'android',
          role,
          delivery_id: deliveryId,
        }),
      });
    });
  } catch { /* native only */ }
}

export async function setupPushForDelivery(deliveryId: string, role: string) {
  await requestNotificationPermission();
  await subscribeWebPush(deliveryId, role);
  await registerNativePush(deliveryId, role);
}
