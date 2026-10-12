import api from './api';

export async function subscribePush(region) {
  if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('Browser alerts require HTTPS and a browser that supports notifications');
  if (await Notification.requestPermission() !== 'granted') throw new Error('Notification permission was not granted');
  await navigator.serviceWorker.register(import.meta.env.DEV ? '/sw.js?dev=1' : '/sw.js');
  const registration = await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('Notification service did not activate; please retry')), 6000))]);
  const { data } = await api.get('/registry/vapid-public-key');
  if (!data.publicKey) throw new Error('Browser notifications are not configured on the server.');
  const base64 = data.publicKey.replace(/-/g, '+').replace(/_/g, '/');
  const key = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && (subscription.options.applicationServerKey?.byteLength !== key.length || !Array.from(new Uint8Array(subscription.options.applicationServerKey || [])).every((value, index) => value === key[index]))) {
    await subscription.unsubscribe(); subscription = null;
  }
  subscription ||= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await api.post('/registry/push', { ...subscription.toJSON(), region });
}
