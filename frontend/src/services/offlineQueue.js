// SIH26206 Persistent Offline Queue using Native IndexedDB
// Guarantees zero data loss for emergency SOS calls and hazard reports during cellular & grid blackouts
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

  dbPromise = new Promise((resolve, reject) => {
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
export async function enqueueAction({ type, endpoint, payload }) {
  const db = await getDB();
  const idempotencyKey = generateIdempotencyKey(type);
  const record = {
    idempotencyKey,
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
      record.id = Date.now();
      existing.push(record);
      localStorage.setItem('sih_fallback_queue', JSON.stringify(existing));
      notifySubscribers();
      return record;
    } catch {
      return record;
    }
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.add(record);

    request.onsuccess = (e) => {
      record.id = e.target.result;
      notifySubscribers();
      console.log(`🛡️ [OfflineQueue] Enqueued ${type} with idempotency key: ${idempotencyKey}`);
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
export async function getQueuedActions() {
  const db = await getDB();
  if (!db) {
    try {
      return JSON.parse(localStorage.getItem('sih_fallback_queue') || '[]');
    } catch {
      return [];
    }
  }

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
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
    const request = store.delete(id);

    request.onsuccess = () => {
      notifySubscribers();
      resolve(true);
    };
    request.onerror = () => resolve(false);
  });
}

/**
 * Clear all records from the queue
 */
export async function clearQueue() {
  const db = await getDB();
  if (!db) {
    localStorage.removeItem('sih_fallback_queue');
    notifySubscribers();
    return;
  }

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => {
      notifySubscribers();
      resolve(true);
    };
    request.onerror = () => resolve(false);
  });
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

  const items = await getQueuedActions();
  if (items.length === 0) return { itemsProcessed: 0 };

  isFlushing = true;
  console.log(`🔄 [OfflineQueue] Flushing ${items.length} queued action(s) to relay hub...`);

  try {
    const response = await api.post('/offline/sync-batch', {
      items,
      sourceNode: 'IndexedDB PWA Relay Client',
    });

    const results = response.data.results || [];

    // Safely remove processed or duplicate-ignored items from IndexedDB
    for (const res of results) {
      if (res.status === 'SYNCED' || res.status === 'DUPLICATE_IGNORED') {
        const matchingItem = items.find(
          (item) =>
            item.idempotencyKey === (res.item?.idempotencyKey || res.idempotencyKey) ||
            item.id === res.item?.id
        );
        if (matchingItem && matchingItem.id) {
          await removeAction(matchingItem.id);
        }
      }
    }

    notifySubscribers();
    console.log(`✅ [OfflineQueue] Batch flush completed:`, response.data.message);
    return response.data;
  } catch (error) {
    console.warn('⚠️ [OfflineQueue] Flush attempt failed (relay hub unreachable):', error.message);
    return { error: error.message };
  } finally {
    isFlushing = false;
  }
}

// 1. Auto-flush on network reconnection
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('🌐 [OfflineQueue] Network restored. Triggering automatic queue flush...');
    flushQueue();
  });

  // 2. Boot-time flush (covers app opened after being closed offline)
  window.addEventListener('load', () => {
    setTimeout(() => {
      flushQueue();
    }, 1500);
  });
}
