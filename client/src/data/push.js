import { api } from '../api';

// Web Push needs the VAPID key as a Uint8Array, and it travels as base64url.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// iOS only exposes push to a PWA launched from the Home Screen; in Safari itself the APIs are
// there but subscribing fails. Knowing which case we're in is what makes the UI honest.
export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  return navigator.serviceWorker.register('/sw.js').catch(() => null);
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/**
 * Asks for permission and registers this device with the server. Must be called from a user
 * gesture: iOS rejects a permission request that doesn't come from a tap.
 */
export async function enablePush() {
  if (!pushSupported()) throw new Error("Cet appareil ne gère pas les notifications web.");
  const { enabled, publicKey } = await api.getPushStatus();
  if (!enabled) throw new Error('Notifications non configurées sur le serveur.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications refusées dans les réglages du téléphone.');

  await registerServiceWorker();
  const reg = await navigator.serviceWorker.ready;
  const subscription =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));
  await api.subscribePush(subscription.toJSON());
  return subscription;
}

export async function disablePush() {
  const subscription = await currentSubscription();
  if (subscription) {
    await api.unsubscribePush(subscription.endpoint);
    await subscription.unsubscribe().catch(() => {});
  } else {
    await api.unsubscribePush(null);
  }
}
