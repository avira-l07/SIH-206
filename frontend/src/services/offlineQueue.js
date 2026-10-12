// SIH26206 Persistent Offline Queue using Native IndexedDB
// Saves pending reports on this device until the signed-in account can synchronize them.
import api from './api';

const DB_NAME = 'SIH_DISASTER_DB';
const DB_VERSION = 1;
const STORE_NAME = 'offline_actions';
const MANUAL_OFFLINE_KEY = 'sih_manual_offline_sim';

let dbPromise = null;
const subscribers = new Set();
let isFlushing = false;

/**
 * Open or upgrade the native IndexedDB database
 */
function getDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      console.warn('[OfflineQueue] IndexedDB not available in current environment');
      return resolve(null);
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('idempotencyKey', 'idempotencyKey', { unique: false });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('queuedAt', 'queuedAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.error('[OfflineQueue] IndexedDB error:', request.error);
      resolve(null);
    };
  });

  return dbPromise;
}

/**
 * Generate a collision-resistant idempotency key
 */
function generateIdempotencyKey(type) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${type.toLowerCase()}_${crypto.randomUUID()}`;
  }
  return `${type.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Notify all registered React subscribers when queue changes
 */
async function notifySubscribers() {
  const count = await getQueueCount();
  subscribers.forEach((cb) => {
    try {
      cb(count);
    } catch (err) {
      console.error('[OfflineQueue] Subscriber callback error:', err);
    }
  });
}

/**
 * Subscribe to queue count changes
 * @param {Function} callback (count: number) => void
 * @returns {Function} unsubscribe function
 */
export function subscribeQueue(callback) {
  subscribers.add(callback);
  getQueueCount().then(callback);
  return () => subscribers.delete(callback);
}

/**
 * Enqueue an emergency action into IndexedDB
 */
export async function enqueueAction({ type, endpoint, payload, idempotencyKey: suppliedKey }) {
  const db = await getDB();
  const idempotencyKey = suppliedKey || payload?.idempotencyKey || generateIdempotencyKey(type);
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(idempotencyKey)) throw new Error('Invalid saved action receipt');
  const duplicate = (await getQueuedActions()).find(action => action.idempotencyKey === idempotencyKey);
  if (duplicate) {
    if (duplicate.type !== type || JSON.stringify(duplicate.payload) !== JSON.stringify(payload)) throw new Error('Saved receipt belongs to different details');
    return duplicate;
  }
  const record = {
    idempotencyKey,
    ownerId: JSON.parse(localStorage.getItem('sih_user') || 'null')?.id || null,
    type,
    endpoint,
    payload,
    queuedAt: new Date().toISOString(),
    status: 'QUEUED',
  };

  if (!db) {
    // Fallback to localStorage if IndexedDB is blocked
    try {
      const existing = JSON.parse(localStorage.getItem('sih_fallback_queue') || '[]');
      record.id = idempotencyKey;
      existing.push(record);
      localStorage.setItem('sih_fallback_queue', JSON.stringify(existing));
      notifySubscribers();
      return record;
    } catch {
      throw new Error('Could not save the action on this device. Free storage space and try again.');
    }
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.add(record);

    request.onsuccess = (e) => {
      record.id = e.target.result;

    };
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('Device storage write failed'));
    tx.oncomplete = () => {
      notifySubscribers();
      resolve(record);
    };

    request.onerror = () => {
      console.error('[OfflineQueue] Failed to enqueue record:', request.error);
      reject(request.error);
    };
  });
}

/**
 * Retrieve all pending queued actions from IndexedDB
 */
function visibleActions(actions) {
  const userId = JSON.parse(localStorage.getItem('sih_user') || 'null')?.id || null;
  return actions.filter(action => (action.ownerId || action.payload?.userId || null) === userId);
}

export async function getQueuedActions() {
  const db = await getDB();
  if (!db) {
    try {
      return visibleActions(JSON.parse(localStorage.getItem('sih_fallback_queue') || '[]'));
    } catch {
      return [];
    }
  }

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(visibleActions(request.result || []));
    request.onerror = () => resolve([]);
  });
}

/**
 * Get count of pending actions
 */
export async function getQueueCount() {
  const actions = await getQueuedActions();
  return actions.length;
}

/**
 * Remove an action by ID
 */
export async function removeAction(id) {
  const db = await getDB();
  if (!db) {
    try {
      const existing = JSON.parse(localStorage.getItem('sih_fallback_queue') || '[]');
      const filtered = existing.filter((item) => item.id !== id);
      localStorage.setItem('sih_fallback_queue', JSON.stringify(filtered));
      notifySubscribers();
    } catch {}
    return;
  }

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);

    tx.oncomplete = () => { notifySubscribers(); resolve(true); };
    tx.onerror = tx.onabort = () => resolve(false);
  });
}

/**
 * Clear all records from the queue
 */
export async function clearQueue() {
  for (const action of await getQueuedActions()) await removeAction(action.id);
  await notifySubscribers();
}

/**
 * Manual Outage Override State (Presenter Safety Net)
 */
export function isManualOffline() {
  return localStorage.getItem(MANUAL_OFFLINE_KEY) === 'true';
}

export function setManualOffline(val) {
  if (val) {
    localStorage.setItem(MANUAL_OFFLINE_KEY, 'true');
  } else {
    localStorage.removeItem(MANUAL_OFFLINE_KEY);
  }
  notifySubscribers();
  window.dispatchEvent(new CustomEvent('sih:connectivity-changed'));
}

/**
 * Flush all queued items to the server using batch API with idempotency
 */
export async function flushQueue() {
  if (isFlushing) return { skipped: true, reason: 'Already flushing' };
  if (isManualOffline()) {
    return { skipped: true, reason: 'Manual outage override is currently active' };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { skipped: true, reason: 'Browser reports offline network interface' };
  }

  const sessionToken = localStorage.getItem('sih_auth_token');
  const sessionOwner = localStorage.getItem('sih_user');
  if (!sessionToken) return { skipped: true, reason: 'Sign in to synchronize saved actions' };
  isFlushing = true;
  try {
    const items = await getQueuedActions();
    let syncedCount = 0, failedCount = 0;
    const errors = [];
    while (items.length) {
      if (localStorage.getItem('sih_auth_token') !== sessionToken || localStorage.getItem('sih_user') !== sessionOwner) return { syncedCount, failedCount, error: 'Account changed during synchronization. Remaining actions are saved for their original account.' };
      const batch = [];
      let bytes = 100;
      while (items.length && batch.length < 50) {
        const size = new TextEncoder().encode(JSON.stringify(items[0])).length;
        if (batch.length && bytes + size > 900000) break;
        batch.push(items.shift()); bytes += size;
      }
      const response = await api.post('/offline/sync-batch', { items: batch, sourceNode: 'IndexedDB PWA Relay Client' }, { headers: { Authorization: 'Bearer ' + sessionToken } });
      for (const result of response.data.results || []) {
        const action = batch.find(item => item.idempotencyKey === result.item?.idempotencyKey);
        if (action && ['SYNCED', 'DUPLICATE_IGNORED'].includes(result.status)) { await removeAction(action.id); syncedCount++; }
        else if (result.status === 'FAILED') { failedCount++; errors.push(result.error); }
      }
    }
    await notifySubscribers();
    window.dispatchEvent(new CustomEvent('sih:queue-synced'));
    return { syncedCount, failedCount, errors, message: syncedCount + ' synchronized, ' + failedCount + ' failed' };
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  } finally { isFlushing = false; }
}

// 1. Auto-flush on network reconnection
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('🌐 [OfflineQueue] Network restored. Triggering automatic queue flush...');
    flushQueue();
  });
  window.addEventListener('sih:session-changed', () => { notifySubscribers(); flushQueue(); });
  window.addEventListener('sih:relay-connected', async () => {
    if (await getQueueCount()) return flushQueue();
  });

  // 2. Boot-time flush (covers app opened after being closed offline)
  window.addEventListener('load', () => {
    setTimeout(() => {
      flushQueue();
    }, 1500);
  });
}
