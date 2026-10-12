const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function queue({ indexedDB, post, failWrite = false } = {}) {
  const events = {};
  const storage = new Map([['sih_user', '{"id":1}'], ['sih_auth_token', 'test-token']]);
  const context = vm.createContext({ indexedDB, console: { log() {}, warn() {}, error() {} }, TextEncoder, crypto: require('node:crypto').webcrypto,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem(key, value) { if (failWrite) throw new Error('Quota exceeded'); storage.set(key, value); }, removeItem: key => storage.delete(key) },
    navigator: { onLine: true }, window: { addEventListener(name,handler) {events[name]=handler;}, dispatchEvent() {} }, CustomEvent: class {}, setTimeout,
    api: { post: post || (async (_, { items }) => ({ data: { results: items.map(item => ({ item, status: 'SYNCED' })) } })) },
  });
  const source = fs.readFileSync(path.resolve(__dirname, '../src/services/offlineQueue.js'), 'utf8').replace("import api from './api';", '').replaceAll('export ', '');
  vm.runInContext(source + ';globalThis.queue = { enqueueAction, getQueuedActions, flushQueue, setManualOffline, clearQueue };', context);
  return { ...context.queue, storage, events };
}
test('fallback queue is isolated by account, including account-scoped clearing', async () => {
  const q = queue();
  await q.enqueueAction({ type: 'SOS', payload: { message: 'first' } });
  q.storage.set('sih_user', '{"id":2}');
  assert.equal((await q.getQueuedActions()).length, 0);
  await q.enqueueAction({ type: 'SOS', payload: { message: 'second' } });
  await q.clearQueue();
  q.storage.set('sih_user', '{"id":1}');
  assert.equal((await q.getQueuedActions()).length, 1);
});
test('quota errors reject rather than falsely reporting a saved emergency', async () => {
  await assert.rejects(queue({ failWrite: true }).enqueueAction({ type: 'SOS', payload: {} }), /Could not save/);
});
test('a failed live send retains its receipt key and repeated local saves do not add another report',async()=>{
  const q=queue(), payload={lat:30,lng:78,message:'Help',idempotencyKey:'sos_existing_receipt'};
  const first=await q.enqueueAction({type:'SOS',payload});const second=await q.enqueueAction({type:'SOS',payload});
  assert.equal(first.idempotencyKey,payload.idempotencyKey);assert.equal(second.id,first.id);assert.equal((await q.getQueuedActions()).length,1);
  await assert.rejects(q.enqueueAction({type:'SOS',payload:{...payload,message:'Other'}}),/different details/);
});
test('relay reconnection synchronizes saved reports and respects a forced outage',async()=>{
  const q=queue();await q.enqueueAction({type:'SOS',payload:{message:'Help'}});q.setManualOffline(true);
  await q.events['sih:relay-connected']();assert.equal((await q.getQueuedActions()).length,1);
  q.setManualOffline(false);await q.events['sih:relay-connected']();assert.equal((await q.getQueuedActions()).length,0);
});
test('IndexedDB opening and commit failures return usable, truthful results', async () => {
  let tx;
  const indexedDB = { open() {
    const request = {};
    queueMicrotask(() => { request.result = { transaction() { tx = { objectStore() { return { getAll() { const read={};queueMicrotask(()=>{read.result=[];read.onsuccess?.();});return read; }, add() { const add = {}; queueMicrotask(() => { add.onsuccess?.({ target: { result: 1 } }); queueMicrotask(() => { tx.error = new Error('Quota exceeded'); tx.onabort?.(); }); }); return add; } }; } }; return tx; } }; request.onsuccess(); });
    return request;
  } };
  const q = queue({ indexedDB });
  await assert.rejects(q.enqueueAction({ type: 'SOS', payload: {} }), /Quota exceeded/);
});
test('flush keeps failed records and removes only server-acknowledged actions', async () => {
  const q = queue({ post: async (_, { items }) => ({ data: { results: items.map((item, i) => ({ item, status: i === 0 ? 'SYNCED' : 'FAILED', error: 'Approval required' })) } }) });
  await q.enqueueAction({ type: 'SOS', payload: {} }); await q.enqueueAction({ type: 'SHELTER_EVENT', payload: {} });
  const result = await q.flushQueue();
  assert.equal(result.syncedCount, 1); assert.equal(result.failedCount, 1);
  assert.equal((await q.getQueuedActions()).length, 1);
});
test('offline and logged-out flushes retain actions without making requests', async () => {
  const q = queue({ post: () => { throw new Error('Unexpected request'); } });
  await q.enqueueAction({ type: 'SOS', payload: {} });
  q.setManualOffline(true); assert.equal((await q.flushQueue()).skipped, true);
  q.setManualOffline(false); q.storage.delete('sih_auth_token'); assert.equal((await q.flushQueue()).skipped, true);
  assert.equal((await q.getQueuedActions()).length, 1);
});

test('account changes stop subsequent batches and concurrent flushes cannot duplicate work', async () => {
  let q, calls = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  q = queue({ post: async (_, { items }, config) => {
    calls++; assert.equal(config.headers.Authorization, 'Bearer test-token');
    await gate; q.storage.set('sih_auth_token', 'other-token'); q.storage.set('sih_user', '{"id":2}');
    return { data: { results: items.map(item => ({ item, status: 'SYNCED' })) } };
  } });
  for (let i=0; i<51; i++) await q.enqueueAction({ type: 'SOS', payload: {} });
  const first = q.flushQueue();
  const second = await q.flushQueue(); assert.equal(second.skipped, true);
  release(); const result = await first;
  assert.match(result.error, /Account changed/); assert.equal(calls, 1);
  q.storage.set('sih_user', '{"id":1}'); assert.equal((await q.getQueuedActions()).length, 1);
});
