const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { io: connectSocket } = require('socket.io-client');

const tempDir = fs.mkdtempSync(path.join(__dirname, '.sih-audit-'));
process.env.DATABASE_URL = 'file:' + path.join(tempDir, 'test.db').replaceAll('\\', '/');
process.env.JWT_SECRET = 'test-only-secret-generated-for-isolated-regression-tests';
process.env.NODE_ENV = 'test';
process.env.DISABLE_RATE_LIMITS = 'true';
process.env.DISABLE_EXTERNAL_DELIVERY = 'true';
process.env.OPENWEATHER_API_KEY = 'mock_mode_active';
let appServer, socketServer, prisma, base;
const people = {};
const tokens = {};
// Workflow regressions below use this same disposable database, never prisma/dev.db.
let shelter;

async function request(method, route, body, token, extraHeaders = {}) {
  const response = await fetch(base + '/api' + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...extraHeaders }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
async function newSOS() {
  const result = await request('POST', '/sos', { lat: 30, lng: 78, message: 'Integration distress test' }, tokens.citizen);
  assert.equal(result.status, 201, JSON.stringify(result.data)); return result.data.sos;
}
async function socket(token) {
  const client = connectSocket(base, { auth: token ? { token } : {}, transports: ['websocket'], reconnection: false });
  await new Promise((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); });
  return client;
}

before(async () => {
  fs.writeFileSync(path.join(tempDir, 'test.db'), '');
  execFileSync(process.execPath, [path.resolve(__dirname, '../node_modules/prisma/build/index.js'), 'db', 'push', '--skip-generate'], { cwd: path.resolve(__dirname, '..'), env: process.env, stdio: 'inherit' });
  const backend = require('../src/server'); appServer = backend.server; socketServer = backend.io;
  prisma = require('../src/db');
  const passwordHash = await bcrypt.hash('testing123', 4);
  for (const [key, role, trusted] of [['admin', 'ADMIN', true], ['volunteer', 'VOLUNTEER', true], ['volunteer2', 'VOLUNTEER', true], ['pending', 'VOLUNTEER', false], ['citizen', 'CITIZEN', false], ['other', 'CITIZEN', false]]) {
    const user = await prisma.user.create({ data: { name: key, email: key + '@test.invalid', passwordHash, role, trusted, lat: 30, lng: 78 } });
    people[key] = user; tokens[key] = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
  }
  shelter = await prisma.shelter.create({ data: { name: 'Test shelter', address: 'Test district', contact: '112', lat: 30, lng: 78, capacity: 100, currentOccupancy: 10, waterLitersRemaining: 500, rationsUnitsRemaining: 100 } });
  await new Promise(resolve => appServer.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + appServer.address().port;
});
after(async () => {
  if (socketServer) await new Promise(resolve => socketServer.close(resolve));
  if (prisma) await prisma.$disconnect();
  // Remove only this test's verified, randomly created temporary directory.
  if (path.dirname(tempDir) === __dirname && path.basename(tempDir).startsWith('.sih-audit-')) fs.rmSync(tempDir, { recursive: true, force: true });
});

test('public routes, health and unknown routes have consistent JSON responses', async () => {
  for (const route of ['/health', '/alerts', '/shelters', '/hazards', '/supplies', '/supply', '/supply-requests', '/supply-shipments', '/registry/stats', '/registry/vapid-public-key']) assert.equal((await request('GET', route)).status, 200, route);
  assert.equal((await request('GET', '/does-not-exist')).status, 404);
  assert.equal((await request('GET', '/health')).data.database.userCount, undefined);
});
test('authentication, role approval, revoked trust and forged roles are enforced', async () => {
  assert.equal((await request('GET', '/sos')).status, 401);
  assert.equal((await request('GET', '/sos', undefined, tokens.citizen)).status, 403);
  assert.equal((await request('GET', '/sos', undefined, tokens.pending)).status, 403);
  const forgedRole = jwt.sign({ id: people.citizen.id, role: 'ADMIN' }, process.env.JWT_SECRET);
  assert.equal((await request('GET', '/auth/users', undefined, forgedRole)).status, 403);
  assert.equal((await request('POST', '/sos', { lat: 30, lng: 78, message: 'invalid token test' }, 'invalid')).status, 401);
  const registration = await request('POST', '/auth/register', { name: 'Test', email: 'registrant@test.invalid', password: 'testing123', role: 'ADMIN' });
  assert.equal(registration.status, 403);
  assert.equal((await request('PATCH', `/auth/users/${people.pending.id}/trust`, { trusted: 'false' }, tokens.admin)).status, 400);
  assert.equal((await request('PATCH', `/auth/users/${people.pending.id}/trust`, { trusted: true }, tokens.admin)).status, 200);
  assert.equal((await request('GET', '/sos', undefined, tokens.pending)).status, 200);
  assert.equal((await request('PATCH', `/auth/users/${people.pending.id}/trust`, { trusted: false }, tokens.admin)).status, 200);
  assert.equal((await request('GET', '/sos', undefined, tokens.pending)).status, 403);
});
test('malformed inputs and invalid IDs return client errors', async () => {
  for (const body of [null, [], { lat: 91, lng: 78, message: 'invalid' }, { lat: 30, lng: 78, message: {} }, { lat: 30, lng: 78, message: '   ' }, { lat: 30, lng: 78, message: 'test', capturedAt: 'invalid date' }, { lat: 30, lng: 78, message: 'test', batteryLevel: -1 }]) assert.equal((await request('POST', '/sos', body, tokens.citizen)).status, 400);
  for (const id of ['abc', '1oops', '-1', '0']) assert.equal((await request('PATCH', `/sos/${id}/assign`, {}, tokens.admin)).status, 400);
  assert.equal((await request('PATCH', '/sos/999999/status', { status: 'ON_SCENE' }, tokens.admin)).status, 404);
  assert.equal((await request('POST', '/supplies', { shelterId: shelter.id, itemName: 'test', quantityNeeded: -3 }, tokens.admin)).status, 400);
});
test('CORS and push endpoints reject hostile origins and private network targets', async () => {
  for (const origin of ['https://localhost.evil.test', 'https://evil.vercel.app', 'https://192.168.1.1.evil.test', 'null']) assert.equal((await request('GET', '/alerts', undefined, undefined, { Origin: origin })).status, 403);
  assert.equal((await request('GET', '/alerts', undefined, undefined, { Origin: 'http://localhost:5173' })).status, 200);
  for (const endpoint of ['http://127.0.0.1/metadata', 'https://127.0.0.1/', 'https://fcm.googleapis.com.evil.test/', 'https://fcm.googleapis.com@evil.test/']) assert.equal((await request('POST', '/registry/push', { endpoint, keys: { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) } })).status, 400);
});
test('SOS lifecycle cannot be reset, hijacked or reopened before resolution', async () => {
  const sos = await newSOS();
  assert.equal((await request('PATCH', `/sos/${sos.id}/assign`, {}, tokens.volunteer)).status, 400);
  assert.equal((await request('PATCH', `/sos/${sos.id}/citizen-verify`, { confirmed: false }, tokens.citizen)).status, 409);
  assert.equal((await request('PATCH', `/sos/${sos.id}/verify`, {}, tokens.admin)).status, 200);
  const claims = await Promise.all([tokens.volunteer, tokens.volunteer2].map(token => request('PATCH', `/sos/${sos.id}/assign`, {}, token)));
  assert.deepEqual(claims.map(result => result.status).sort(), [200, 409]);
  const assigned = claims[0].status === 200 ? tokens.volunteer : tokens.volunteer2;
  const other = claims[0].status === 200 ? tokens.volunteer2 : tokens.volunteer;
  assert.equal((await request('PATCH', `/sos/${sos.id}/status`, { status: 'ON_SCENE' }, other)).status, 403);
  for (const status of ['ON_SCENE', 'EVACUATED', 'HANDED_OVER_TO_MEDICAL', 'RESOLVED']) assert.equal((await request('PATCH', `/sos/${sos.id}/status`, { status }, assigned)).status, 200);
  assert.equal((await request('PATCH', `/sos/${sos.id}/assign`, {}, assigned)).status, 409);
  assert.equal((await request('PATCH', `/sos/${sos.id}/citizen-verify`, { confirmed: true }, tokens.other)).status, 403);
  assert.equal((await request('PATCH', `/sos/${sos.id}/citizen-verify`, { confirmed: false }, tokens.citizen)).data.sos.priority, 'URGENT');
  const cancelled = await newSOS();
  assert.equal((await request('PATCH', `/sos/${cancelled.id}/cancel`, { cancelReason: 'False alarm' }, tokens.admin)).status, 200);
  assert.equal((await request('PATCH', `/sos/${cancelled.id}/resolve`, {}, tokens.admin)).status, 400);
});
test('SOS and pickup sockets only reach responders and the owner', async () => {
  const clients = await Promise.all([socket(), socket(tokens.other), socket(tokens.citizen), socket(tokens.volunteer), socket(tokens.pending)]);
  try {
    const received = clients.map(() => []);
    clients.forEach((client, index) => client.on('sos:created', data => received[index].push(data)));
    clients[0].emit('join:role', { role: 'ADMIN' });
    clients[1].emit('join:role', { role: 'VOLUNTEER' });
    await newSOS(); await new Promise(resolve => setTimeout(resolve, 100));
    assert.deepEqual(received.map(items => items.length), [0, 0, 1, 1, 0]);
    const pickups = clients.map(() => []);
    clients.forEach((client, index) => client.on('supply:distributed', data => pickups[index].push(data)));
    const stock = await prisma.supplyRequest.create({ data: { shelterId: shelter.id, itemName: 'Rice', quantityNeeded: 10, quantityFulfilled: 5, unit: 'bags' } });
    const pickup = await request('POST', '/supplies/distributions', { scannedCode: 'SUPPLY:' + shelter.id + ':' + stock.id + ':rice', quantity: 1 }, tokens.citizen);
    assert.equal(pickup.status, 201, JSON.stringify(pickup.data));
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.deepEqual(pickups.map(items => items.length), [0, 0, 1, 1, 0]);
  } finally { clients.forEach(client => client.disconnect()); }
});
test('online and offline photos use the same validated image contract', async () => {
  const payload = { lat: 30, lng: 78, hazardNote: 'Photo evidence test', severityBenchmark: 'WAIST', photoUrl: 'data:image/jpeg;base64,/9j/AA==' };
  assert.equal((await request('POST', '/hazards', payload, tokens.citizen)).status, 201);
  assert.equal((await request('POST', '/hazards', { ...payload, photoUrl: 'data:image/svg+xml,<svg onload=alert(1)>' }, tokens.citizen)).status, 400);
  const offline = await request('POST', '/offline/sync-batch', { items: [{ type: 'HAZARD', idempotencyKey: 'photo_hazard', payload: { ...payload, userId: people.other.id } }] }, tokens.citizen);
  assert.equal(offline.data.syncedCount, 1, JSON.stringify(offline.data));
  assert.equal(offline.data.results[0].record.userId, people.citizen.id);
});
test('offline actions enforce owner identity, role permissions and durable idempotency', async () => {
  const items = [{ type: 'SOS', idempotencyKey: 'offline_sos', payload: { userId: people.other.id, lat: 30, lng: 78, message: 'Offline emergency' } }, { type: 'SHELTER_EVENT', idempotencyKey: 'blocked_delta', payload: { shelterId: shelter.id, deltaOccupancy: 20 } }, { type: 'SAFETY_STATUS', idempotencyKey: 'own_safety', payload: { userId: people.other.id, safetyStatus: 'SAFE' } }];
  const synced = await request('POST', '/offline/sync-batch', { items }, tokens.citizen);
  assert.equal(synced.data.syncedCount, 2, JSON.stringify(synced.data)); assert.equal(synced.data.failedCount, 1);
  assert.equal(synced.data.results[0].record.userId, people.citizen.id);
  const replay = await request('POST', '/offline/sync-batch', { items }, tokens.citizen);
  assert.equal(replay.data.dupeCount, 2);
  assert.equal((await prisma.user.findUnique({ where: { id: people.other.id } })).safetyStatus, 'UNKNOWN');
  assert.equal((await request('POST', '/offline/sms-ingest', { payload: `SHTR ${shelter.id} F99 W0` }, tokens.citizen)).status, 403);
  assert.equal((await request('GET', '/offline/logs', undefined, tokens.citizen)).status, 403);
});
test('shelter deltas preserve concurrent updates and cannot duplicate across replays', async () => {
  const calls = await Promise.all([1, 2].map(i => request('POST', `/shelters/${shelter.id}/events`, { deltaOccupancy: 5, idempotencyKey: 'delta_' + i }, tokens.volunteer)));
  calls.forEach(result => assert.equal(result.status, 201, JSON.stringify(result.data)));
  const current = await prisma.shelter.findUnique({ where: { id: shelter.id } }); assert.equal(current.currentOccupancy, 20);
  assert.equal((await request('POST', `/shelters/${shelter.id}/events`, { deltaOccupancy: 5, idempotencyKey: 'delta_1' }, tokens.volunteer)).data.duplicateIgnored, true);
  assert.equal((await request('PATCH', `/shelters/${shelter.id}/audit`, { capacity: 1 }, tokens.admin)).status, 409);
});
test('supply pickups enforce stock, cooldown, identity and atomic shipment accounting', async () => {
  const created = await request('POST', '/supplies', { shelterId: shelter.id, itemName: 'Water', quantityNeeded: 10, quantityFulfilled: 1 }, tokens.admin); assert.equal(created.status, 201);
  const id = created.data.supply.id; const code = (await request('POST', `/supplies/${id}/generate-code`, {}, tokens.admin)).data.code;
  const claims = await Promise.all([tokens.citizen, tokens.other].map((token, i) => request('POST', '/supplies/distributions', { scannedCode: code, idempotencyKey: 'pickup_' + i }, token)));
  assert.deepEqual(claims.map(result => result.status).sort(), [201, 409], JSON.stringify(claims));
  assert.equal((await prisma.supplyRequest.findUnique({ where: { id } })).quantityFulfilled, 0);
  assert.equal(await prisma.supplyDistribution.count({ where: { supplyRequestId: id } }), 1);
  const winningIndex = claims[0].status === 201 ? 0 : 1;
  const winning = winningIndex === 0 ? tokens.citizen : tokens.other;
  const losing = winningIndex === 0 ? tokens.other : tokens.citizen;
  assert.equal((await request('POST', '/supplies/distributions', { scannedCode: code, idempotencyKey: 'pickup_' + winningIndex }, losing)).status, 409);
  assert.equal((await request('POST', '/supplies/distributions', { scannedCode: code, idempotencyKey: 'pickup_again' }, winning)).status, 429);
  assert.equal((await request('POST', '/supply-shipments', { shelterId: shelter.id, supplyRequestId: id, itemName: 'Wrong item', quantityClaimed: 5, quantityVerified: 5 }, tokens.volunteer)).status, 400);
  const shipment = await request('POST', '/supply-shipments', { shelterId: shelter.id, supplyRequestId: id, itemName: 'Water', quantityClaimed: 5, quantityVerified: 5 }, tokens.volunteer); assert.equal(shipment.status, 201, JSON.stringify(shipment.data));
  assert.equal(shipment.data.updatedSupplyRequest.quantityFulfilled, 5);
});
test('registry, missing persons, assets, alerts and risk simulation work with validation', async () => {
  assert.equal((await request('POST', '/registry/phone', { phoneNumber: '9876543210', region: 'Test district' })).status, 200);
  assert.equal((await request('GET', '/missing-persons')).status, 401);
  const missing = await request('POST', '/missing-persons', { reportedByName: 'Reporter', contactPhone: '9876543210', fullName: 'Missing person', lastSeenLocation: 'Test district', age: 12 }); assert.equal(missing.status, 201);
  assert.equal((await request('PATCH', `/missing-persons/${missing.data.report.id}/status`, { status: 'LOCATED' }, tokens.volunteer)).status, 200);
  assert.equal((await request('PATCH', '/missing-persons/' + missing.data.report.id + '/status', { status: 'SAFE_AT_SHELTER' }, tokens.volunteer)).status, 400);
  const infant = await request('POST', '/missing-persons', { reportedByName: 'Reporter', contactPhone: '9876543210', fullName: 'Infant test', lastSeenLocation: 'Test district', age: 0 }); assert.equal(infant.status, 201); assert.equal(infant.data.report.age, 0);
  assert.equal((await request('POST', '/missing-persons', { reportedByName: 'Reporter', contactPhone: '-------', fullName: 'Test', lastSeenLocation: 'Test' })).status, 400);

  const asset = await request('POST', '/assets', { ownerName: 'Owner', contact: '112', type: 'BOAT', title: 'Rescue boat', lat: 30, lng: 78 }, tokens.citizen); assert.equal(asset.status, 201);
  assert.equal((await request('PATCH', `/assets/${asset.data.asset.id}/status`, { available: false }, tokens.other)).status, 403);
  assert.equal((await request('PATCH', `/assets/${asset.data.asset.id}/status`, { available: false }, tokens.citizen)).status, 200);
  const alert = await request('POST', '/alerts', { region: 'Test district', message: 'Test advisory' }, tokens.admin); assert.equal(alert.status, 201);
  assert.equal((await request('DELETE', `/alerts/${alert.data.alert.id}`, undefined, tokens.admin)).status, 409);
  assert.equal((await request('PATCH', `/alerts/${alert.data.alert.id}/deactivate`, {}, tokens.admin)).status, 200);
  assert.equal((await request('DELETE', `/alerts/${alert.data.alert.id}`, undefined, tokens.admin)).status, 200);
  const simulation = await request('POST', '/alerts/simulate', { region: 'Test', lat: 0, lng: 0, telemetry: { rain1h: 75 } }, tokens.admin); assert.equal(simulation.status, 200); assert.equal(simulation.data.alert.lat, 0); assert.equal(simulation.data.alert.lng, 0);
  assert.equal((await request('POST', '/alerts/simulate', { customTelemetry: { condition: {} } }, tokens.admin)).status, 400);
});


test('JSON limits, integer types and private-cache headers are enforced', async () => {
  const badJSON = await fetch(base + '/api/sos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' }); assert.equal(badJSON.status, 400);
  assert.equal((await request('POST', '/sos', { lat: 30, lng: 78, message: 'x'.repeat(1100000) })).status, 413);
  for (const quantity of [true, '', {}, [], 1.5]) assert.equal((await request('POST', '/supplies', { shelterId: shelter.id, itemName: 'test', quantityNeeded: quantity }, tokens.admin)).status, 400);
  assert.equal((await fetch(base + '/api/sos/my', { headers: { Authorization: 'Bearer ' + tokens.citizen } })).headers.get('cache-control'), 'no-store');
  assert.equal((await request('POST', '/alerts/simulate', { telemetry: { rain1h: 75, lat: 95, lng: 78 } }, tokens.admin)).status, 400);
});
test('failed audits commit nothing and untouched unknown inventory remains unknown', async () => {
  const before = await prisma.shelter.findUnique({ where: { id: shelter.id } });
  const count = await prisma.shelterEvent.count({ where: { shelterId: shelter.id } });
  assert.equal((await request('PATCH', '/shelters/' + shelter.id + '/audit', { currentOccupancy: 50, capacity: 1, waterLitersRemaining: 2 }, tokens.admin)).status, 409);
  const after = await prisma.shelter.findUnique({ where: { id: shelter.id } });
  assert.equal(after.currentOccupancy, before.currentOccupancy); assert.equal(after.waterLitersRemaining, before.waterLitersRemaining);
  assert.equal(await prisma.shelterEvent.count({ where: { shelterId: shelter.id } }), count);
  assert.equal(after.medicalKitsRemaining, null); assert.equal(after.blanketsRemaining, null);
});
test('asset contacts are available only to their owner and approved responders', async () => {
  assert.equal((await request('GET', '/assets')).status, 401);
  assert.equal((await request('GET', '/assets', undefined, tokens.other)).data.assets.length, 0);
  assert.ok((await request('GET', '/assets', undefined, tokens.volunteer)).data.assets.length > 0);
  assert.equal((await request('GET', '/assets/suggestions?lat=30&lng=78', undefined, tokens.citizen)).status, 403);
  assert.equal((await request('GET', '/assets/suggestions?lat=invalid&lng=78', undefined, tokens.volunteer)).status, 400);
});
test('concurrent hazard votes preserve totals and never return password hashes', async () => {
  const hazard = (await request('POST', '/hazards', { lat: 30, lng: 78, hazardNote: 'Flood test', severityBenchmark: 'KNEE' }, tokens.citizen)).data.report;
  const votes = await Promise.all([tokens.other, tokens.volunteer].map(token => request('POST', '/hazards/' + hazard.id + '/confirm', {}, token)));
  votes.forEach(result => { assert.equal(result.status, 200, JSON.stringify(result.data)); assert.equal(JSON.stringify(result.data).includes('passwordHash'), false); });
  const latest = await prisma.hazardReport.findUnique({ where: { id: hazard.id } }); assert.equal(latest.confirmationsCount, 2);
  assert.equal((await request('POST', '/hazards/' + hazard.id + '/confirm', {}, tokens.citizen)).status, 400);
});
test('register, login, profile, location and exact safety lookup work end to end', async () => {
  const registration = await request('POST', '/auth/register', { name: 'Exact Citizen', email: 'exact@test.invalid', phone: '+919999999999', password: 'testpass123' }); assert.equal(registration.status, 201);
  const login = await request('POST', '/auth/login', { email: 'exact@test.invalid', password: 'testpass123' }); assert.equal(login.status, 200); assert.equal(login.data.user.passwordHash, undefined);
  const token = login.data.token;
  assert.equal((await request('GET', '/auth/me', undefined, token)).status, 200);
  assert.equal((await request('PATCH', '/auth/location', { lat: 0, lng: 0 }, token)).status, 200);
  assert.equal((await request('PATCH', '/auth/safety-status', { safetyStatus: 'SAFE' }, token)).status, 200);
  assert.equal((await request('GET', '/auth/safety-lookup?query=Exact', undefined, tokens.citizen)).status, 404);
  assert.equal((await request('GET', '/auth/safety-lookup?query=Exact%20Citizen', undefined, tokens.citizen)).data.status, 'SAFE');
});


test('SMS syntax rejects partial numbers and applies telemetry with its log atomically', async () => {
  const { parseSMSPayload, applyParsedPayload } = require('../src/services/smsParser.service');
  for (const payload of [' ', 'SHTR 1junk F20', 'SHTR 1 F1000', 'SHTR 1 Wyes', 'SHTR 1 Bjunk', 'SOS 30junk 78 FLOOD none help']) assert.equal(parseSMSPayload(payload).success, false, payload);
  const snapshot = await prisma.shelter.findUnique({ where: { id: shelter.id } });
  const eventCount = await prisma.shelterEvent.count();
  const duplicateKey = 'sms_tx_failure';
  await prisma.offlineSyncLog.create({ data: { idempotencyKey: duplicateKey, rawPayload: 'test', parsedData: '{}', sourceNode: 'test' } });
  await assert.rejects(() => applyParsedPayload(parseSMSPayload('SHTR ' + shelter.id + ' F80 W0'), 'test', { idempotencyKey: duplicateKey }));
  assert.equal((await prisma.shelter.findUnique({ where: { id: shelter.id } })).currentOccupancy, snapshot.currentOccupancy);
  assert.equal(await prisma.shelterEvent.count(), eventCount);
  const sosCount = await prisma.sOSRequest.count();
  await assert.rejects(() => applyParsedPayload(parseSMSPayload('SOS 30 78 FLOOD none test'), 'test', { idempotencyKey: duplicateKey, userId: people.citizen.id }));
  assert.equal(await prisma.sOSRequest.count(), sosCount);
  const applied = await request('POST', '/offline/sms-ingest', { payload: 'SHTR ' + shelter.id + ' F80 W0' }, tokens.volunteer);
  assert.equal(applied.status, 200, JSON.stringify(applied.data));
  assert.equal(applied.data.result.record.currentOccupancy, 80); assert.equal(applied.data.result.record.waterOk, false);
  assert.equal(JSON.parse(applied.data.result.log.parsedData).eventId, applied.data.result.event.id);
  assert.equal((await request('GET', '/assets/suggestions?lat=30junk&lng=78', undefined, tokens.volunteer)).status, 400);
});


test('absolute stock edits and offline pickup logs commit consistently', async () => {
  const stock = await prisma.supplyRequest.create({ data: { shelterId: shelter.id, itemName: 'Atomic stock', quantityNeeded: 20, quantityFulfilled: 0, unit: 'units' } });
  const updates = await Promise.all([1, 2].map(() => request('PATCH', '/supplies/' + stock.id, { quantityFulfilled: 10 }, tokens.admin)));
  updates.forEach(result => assert.equal(result.status, 200, JSON.stringify(result.data)));
  assert.equal((await prisma.supplyRequest.findUnique({ where: { id: stock.id } })).quantityFulfilled, 10);
  const key = 'pickup_log_failure';
  await prisma.offlineSyncLog.create({ data: { idempotencyKey: key, rawPayload: 'test', parsedData: '{}', sourceNode: 'test' } });
  const { recordSupplyDistributionInternal } = require('../src/controllers/supply.controller');
  await assert.rejects(() => recordSupplyDistributionInternal({ citizenId: people.other.id, scannedCode: 'SUPPLY:' + shelter.id + ':' + stock.id + ':atomic-stock', quantity: 1, idempotencyKey: key, syncLog: { idempotencyKey: key, rawPayload: 'test', parsedData: '{}', sourceNode: 'test' } }));
  assert.equal((await prisma.supplyRequest.findUnique({ where: { id: stock.id } })).quantityFulfilled, 10);
  assert.equal(await prisma.supplyDistribution.count({ where: { idempotencyKey: key } }), 0);
});


test('operator dispatch connects citizen, assigned volunteer and canonical statistics through closure', async () => {
  assert.equal((await request('GET', '/operations/summary')).status, 401);
  const before = (await request('GET', '/operations/summary', undefined, tokens.admin)).data.summary;
  assert.ok(before, 'summary endpoint should return a database snapshot');
  const sos = await newSOS();
  assert.equal((await request('PATCH', '/sos/' + sos.id + '/resolve', {}, tokens.admin)).status, 400);
  assert.equal((await request('PATCH', '/sos/' + sos.id + '/assign', { volunteerId: people.pending.id }, tokens.admin)).status, 400);
  assert.equal((await request('PATCH', '/sos/' + sos.id + '/assign', { volunteerId: people.volunteer.id }, tokens.volunteer2)).status, 403);
  assert.equal((await request('PATCH', '/sos/' + sos.id + '/verify', {}, tokens.admin)).status, 200);
  assert.equal((await request('PATCH', '/sos/' + sos.id + '/assign', { volunteerId: people.volunteer.id }, tokens.admin)).data.sos.assignedVolunteerId, people.volunteer.id);
  assert.equal((await request('PATCH', '/sos/' + sos.id + '/resolve', {}, tokens.volunteer)).status, 400);
  const dispatched = (await request('GET', '/operations/summary', undefined, tokens.volunteer)).data.summary;
  assert.equal(dispatched.sos.dispatched, before.sos.dispatched + 1);
  assert.equal(dispatched.sos.scope, 'RESPONSE_NETWORK');
  const own = (await request('GET', '/operations/summary', undefined, tokens.citizen)).data.summary;
  const unrelated = (await request('GET', '/operations/summary', undefined, tokens.other)).data.summary;
  assert.equal(own.sos.scope, 'MY_ACCOUNT'); assert.equal(unrelated.sos.dispatched, 0);
  assert.equal((await request('GET', '/sos/my', undefined, tokens.citizen)).data.requests.find(s => s.id === sos.id).status, 'EN_ROUTE');
  for (const status of ['ON_SCENE', 'EVACUATED', 'HANDED_OVER_TO_MEDICAL', 'RESOLVED']) {
    assert.equal((await request('PATCH', '/sos/' + sos.id + '/status', { status }, tokens.volunteer)).status, 200);
    const summary = (await request('GET', '/operations/summary', undefined, tokens.admin)).data.summary;
    assert.equal(summary.sos.dispatched, before.sos.dispatched + (status === 'RESOLVED' ? 0 : 1));
  }
  assert.equal((await request('PATCH', '/sos/' + sos.id + '/citizen-verify', { confirmed: true }, tokens.citizen)).status, 200);
  const closed = (await request('GET', '/operations/summary', undefined, tokens.admin)).data.summary;
  assert.equal(closed.sos.resolvedConfirmed, before.sos.resolvedConfirmed + 1);
  assert.equal(closed.shelters.freeBeds, (await prisma.shelter.findMany({ where: { active: true } })).reduce((n,s) => n + Math.max(0, s.capacity - s.currentOccupancy), 0));
});
test('citizen peer verification requires proximity and a trusted citizen cannot supply authority', async () => {
  const hazard = (await request('POST', '/hazards', { lat: 30, lng: 78, hazardNote: 'Peer radius audit', severityBenchmark: 'KNEE' }, tokens.citizen)).data.report;
  await prisma.user.update({ where: { id: people.other.id }, data: { trusted: true, lat: 31, lng: 79 } });
  assert.equal((await request('POST', '/hazards/' + hazard.id + '/confirm', {}, tokens.other)).status, 403);
  await prisma.user.update({ where: { id: people.other.id }, data: { lat: 30, lng: 78 } });
  assert.equal((await request('POST', '/hazards/' + hazard.id + '/confirm', {}, tokens.other)).data.report.confidenceTier, 'AMBER');
  await prisma.user.update({ where: { id: people.other.id }, data: { trusted: false } });
});
test('shelter creation validates capacity and emits a usable restock reference', async () => {
  for (const capacity of ['2oops', 1.5]) assert.equal((await request('POST', '/shelters', { name: 'Invalid', lat: 30, lng: 78, capacity }, tokens.admin)).status, 400);
  assert.equal((await request('POST', '/shelters', { name: 'Invalid occupancy', lat: 30, lng: 78, capacity: 5, currentOccupancy: 6 }, tokens.admin)).status, 400);
  const client = await socket(tokens.volunteer);
  try {
    const notified = new Promise(resolve => client.once('shelter:restock_needed', resolve));
    const res = await request('PATCH', '/shelters/' + shelter.id + '/audit', { waterLitersRemaining: 0 }, tokens.admin);
    assert.equal(res.status, 200);
    const payload = await Promise.race([notified, new Promise((_, reject) => setTimeout(() => reject(new Error('Missing restock event')), 2000))]);
    assert.equal(payload.shelterId, shelter.id); assert.ok(payload.message.includes(shelter.name));
  } finally { client.disconnect(); }
});

test('rescue timeline preserves actors, privacy, all stages and failed transition history', async () => {
  const sos = await newSOS();
  assert.equal((await request('GET', `/sos/${sos.id}/timeline`, undefined, tokens.other)).status, 403);
  assert.equal((await request('GET', `/sos/${sos.id}/timeline`, undefined, tokens.pending)).status, 403);
  assert.equal((await request('GET', `/sos/${sos.id}/timeline`)).status, 401);
  await request('PATCH', `/sos/${sos.id}/verify`, {}, tokens.admin);
  const claims = await Promise.all(['volunteer','volunteer2'].map(key => request('PATCH', `/sos/${sos.id}/assign`, {}, tokens[key])));
  assert.equal(claims.filter(r => r.status === 200).length, 1);
  const owner = claims[0].status === 200 ? 'volunteer' : 'volunteer2';
  assert.equal((await request('PATCH', `/sos/${sos.id}/status`, { status: 'RESOLVED' }, tokens[owner])).status, 400);
  for (const status of ['ON_SCENE','EVACUATED','HANDED_OVER_TO_MEDICAL','RESOLVED']) assert.equal((await request('PATCH', `/sos/${sos.id}/status`, { status }, tokens[owner])).status, 200);
  assert.equal((await request('PATCH', `/sos/${sos.id}/citizen-verify`, { confirmed: true }, tokens.citizen)).status, 200);
  const timeline = await request('GET', `/sos/${sos.id}/timeline`, undefined, tokens.citizen);
  assert.deepEqual(timeline.data.events.map(e => e.kind), ['CREATED','VERIFIED','ASSIGNED','STATUS','STATUS','STATUS','STATUS','CONFIRMED']);
  assert.equal(timeline.data.events[1].actorId, people.admin.id);
  assert.equal(timeline.data.events[2].actorId, people[owner].id);
  assert.equal(timeline.data.hasEarlierHistory, false);
  const original = await prisma.sOSRequest.create({ data: { userId: people.citizen.id, userName: 'Old report', lat: 30, lng: 78, message: 'Existing record', status: 'PENDING' } });
  assert.equal((await request('GET', `/sos/${original.id}/timeline`, undefined, tokens.citizen)).data.hasEarlierHistory, true);
});

test('timeline and inbox failures roll back the rescue transition', async () => {
  const sos = await newSOS();
  const notices = await prisma.notification.count({ where: { sosId: sos.id } });
  await prisma.$executeRawUnsafe("CREATE TRIGGER audit_reject_event BEFORE INSERT ON RescueEvent WHEN NEW.kind = 'VERIFIED' BEGIN SELECT RAISE(ABORT, 'test event failure'); END");
  try {
    assert.equal((await request('PATCH', `/sos/${sos.id}/verify`, {}, tokens.admin)).status, 400);
    assert.equal((await prisma.sOSRequest.findUnique({ where: { id: sos.id } })).status, 'PENDING');
    assert.equal(await prisma.rescueEvent.count({ where: { sosId: sos.id } }), 1);
    assert.equal(await prisma.notification.count({ where: { sosId: sos.id } }), notices);
  } finally { await prisma.$executeRawUnsafe('DROP TRIGGER audit_reject_event'); }
});

test('inbox insertion failure rolls back rescue and advisory source records', async () => {
  const sos = await newSOS();
  const alertsBefore = await prisma.alert.count();
  await prisma.$executeRawUnsafe("CREATE TRIGGER audit_reject_notice BEFORE INSERT ON Notification BEGIN SELECT RAISE(ABORT, 'test notice failure'); END");
  try {
    assert.equal((await request('PATCH', '/sos/' + sos.id + '/verify', {}, tokens.admin)).status, 400);
    assert.equal((await prisma.sOSRequest.findUnique({ where: { id: sos.id } })).status, 'PENDING');
    assert.equal(await prisma.rescueEvent.count({ where: { sosId: sos.id } }), 1);
    assert.equal((await request('POST', '/alerts', { message: 'Rollback test advisory', region: 'Test', lat: 30, lng: 78 }, tokens.admin)).status, 400);
    assert.equal(await prisma.alert.count(), alertsBefore);
  } finally { await prisma.$executeRawUnsafe('DROP TRIGGER audit_reject_notice'); }
  const created = await request('POST', '/alerts', { message: 'Durable test advisory', region: 'Test', lat: 30, lng: 78 }, tokens.admin);
  assert.equal(created.status, 201);
  for (const person of [people.admin, people.volunteer, people.citizen]) assert.equal(await prisma.notification.count({ where: { userId: person.id, kind: 'ALERT', title: 'Test: Durable test advisory' } }), 1);
});

test('volunteer duty and workload are current, private and enforced at dispatch', async () => {
  assert.equal((await request('GET', '/auth/responders', undefined, tokens.citizen)).status, 403);
  assert.equal((await request('PATCH', '/auth/availability', { onDuty: true }, tokens.citizen)).status, 403);
  assert.equal((await request('PATCH', '/auth/availability', { onDuty: true }, tokens.pending)).status, 403);
  assert.equal((await request('PATCH', '/auth/availability', { onDuty: 'false' }, tokens.volunteer)).status, 400);
  assert.equal((await request('PATCH', '/auth/availability', { onDuty: false }, tokens.volunteer)).status, 200);
  const sos = await newSOS(); await request('PATCH', `/sos/${sos.id}/verify`, {}, tokens.admin);
  assert.equal((await request('PATCH', `/sos/${sos.id}/assign`, { volunteerId: people.volunteer.id }, tokens.admin)).status, 409);
  assert.equal(await prisma.rescueEvent.count({ where: { sosId: sos.id } }), 2);
  await request('PATCH', '/auth/availability', { onDuty: true }, tokens.volunteer);
  await request('PATCH', '/auth/location', { lat: 30, lng: 78 }, tokens.volunteer);
  assert.equal((await request('PATCH', `/sos/${sos.id}/assign`, { volunteerId: people.volunteer.id }, tokens.admin)).status, 200);
  const roster = (await request('GET', '/auth/responders', undefined, tokens.admin)).data.responders;
  const volunteer = roster.find(u => u.id === people.volunteer.id);
  assert.equal(volunteer.onDuty, true); assert.equal(volunteer.locationFresh, true);
  assert.equal(volunteer.activeAssignments, await prisma.sOSRequest.count({ where: { assignedVolunteerId: volunteer.id, status: { in: ['EN_ROUTE','ON_SCENE','EVACUATED','HANDED_OVER_TO_MEDICAL'] } } }));
  assert.equal(volunteer.passwordHash, undefined); assert.equal(volunteer.phone, undefined);
  await prisma.user.update({ where: { id: volunteer.id }, data: { locationUpdatedAt: new Date(Date.now() - 3600000) } });
  assert.equal((await request('GET', '/auth/responders', undefined, tokens.admin)).data.responders.find(u => u.id === volunteer.id).locationFresh, false);
});

test('persistent inbox is account scoped, paginated and survives acknowledgment/revoked approval', async () => {
  const sos = await newSOS();
  const inbox = await request('GET', '/notifications', undefined, tokens.citizen);
  assert.equal(inbox.status, 200); assert.ok(inbox.data.unreadCount > 0);
  assert.ok(inbox.data.notifications.every(n => n.userId === people.citizen.id));
  const owned = inbox.data.notifications.find(n => n.sosId === sos.id);
  assert.equal((await request('PATCH', `/notifications/${owned.id}/read`, {}, tokens.other)).status, 404);
  assert.equal((await request('PATCH', `/notifications/${owned.id}/read`, {}, tokens.citizen)).status, 200);
  assert.ok((await prisma.notification.findUnique({ where: { id: owned.id } })).readAt);
  assert.equal((await request('GET', '/notifications?before=oops', undefined, tokens.citizen)).status, 400);
  await prisma.notification.createMany({ data: Array.from({ length: 35 }, (_, i) => ({ userId: people.citizen.id, kind: 'ALERT', title: 'Test advisory ' + i })) });
  const page = (await request('GET', '/notifications', undefined, tokens.citizen)).data;
  assert.equal(page.notifications.length, 30); assert.ok(page.nextCursor);
  const next = (await request('GET', '/notifications?before=' + page.nextCursor, undefined, tokens.citizen)).data;
  assert.ok(next.notifications.every(n => n.id < page.nextCursor));
  await request('PATCH', '/notifications/read-all', {}, tokens.citizen);
  assert.equal((await request('GET', '/notifications', undefined, tokens.citizen)).data.unreadCount, 0);
  await require('../src/services/activity.service').publishNotice('RESTOCK', 'Test shelter needs supplies', true);
  assert.ok((await request('GET', '/notifications', undefined, tokens.volunteer)).data.notifications.some(n => n.kind === 'RESTOCK'));
  await request('PATCH', `/auth/users/${people.volunteer.id}/trust`, { trusted: false }, tokens.admin);
  assert.ok(!(await request('GET', '/notifications', undefined, tokens.volunteer)).data.notifications.some(n => n.kind === 'RESTOCK'));
  await request('PATCH', `/auth/users/${people.volunteer.id}/trust`, { trusted: true }, tokens.admin);
});

test('offline replay records one creation event and one owner notification', async () => {
  const item = { type: 'SOS', idempotencyKey: 'timeline-replay-test', payload: { lat: 30, lng: 78, message: 'Offline timeline report' } };
  const first = await request('POST', '/offline/sync-batch', { items: [item] }, tokens.citizen);
  const sos = first.data.results[0].record;
  assert.equal(first.data.syncedCount, 1);
  assert.equal((await request('POST', '/offline/sync-batch', { items: [item] }, tokens.citizen)).data.dupeCount, 1);
  assert.equal(await prisma.rescueEvent.count({ where: { sosId: sos.id } }), 1);
  assert.equal(await prisma.notification.count({ where: { sosId: sos.id, userId: people.citizen.id } }), 1);
});


test('profile edits preserve identity, approval and ownership while updating future help requests', async () => {
  const before = (await request('GET', '/auth/me', undefined, tokens.citizen)).data.user;
  for (const body of [{ role: 'ADMIN' }, { trusted: true }, { email: 'hijack@test.invalid' }, { name: ' ' }, { phone: 'not a phone' }, { name: 'Changed', userId: people.other.id }]) assert.equal((await request('PATCH', '/auth/profile', body, tokens.citizen)).status, 400);
  assert.equal((await request('PATCH', '/auth/profile', { name: 'Updated contact', phone: '+91 98765 40321', region: 'Test district' }, tokens.citizen)).status, 200);
  const after = (await request('GET', '/auth/me', undefined, tokens.citizen)).data.user;
  assert.equal(after.phone, '+919876540321'); assert.equal(after.role, before.role); assert.equal(after.trusted, before.trusted); assert.equal(after.email, before.email);
  const sos = await newSOS(); assert.equal(sos.userName, 'Updated contact'); assert.equal(sos.userPhone, '+919876540321');
  await request('PATCH', '/auth/profile', { name: before.name, phone: before.phone, region: before.region }, tokens.citizen);
});

test('citizens can withdraw only their own undispatched request, with atomic dispatch races', async () => {
  const sos = await newSOS();
  assert.equal((await request('PATCH', '/sos/' + sos.id + '/withdraw', { reason: 'Duplicate' }, tokens.other)).status, 403);
  assert.equal((await request('PATCH', '/sos/' + sos.id + '/withdraw', { reason: ' ' }, tokens.citizen)).status, 400);
  assert.equal((await request('PATCH', '/sos/' + sos.id + '/withdraw', { reason: 'Duplicate report' }, tokens.citizen)).status, 200);
  assert.equal((await request('PATCH', '/sos/' + sos.id + '/withdraw', { reason: 'Duplicate report' }, tokens.citizen)).status, 409);
  const events = (await request('GET', '/sos/' + sos.id + '/timeline', undefined, tokens.citizen)).data.events;
  assert.equal(events.at(-1).kind, 'CANCELLED'); assert.equal(events.at(-1).actorId, people.citizen.id);
  const verified = await newSOS(); await request('PATCH', '/sos/' + verified.id + '/verify', {}, tokens.admin);
  assert.equal((await request('PATCH', '/sos/' + verified.id + '/withdraw', { reason: 'Help no longer needed' }, tokens.citizen)).status, 200);
  await request('PATCH', '/auth/availability', { onDuty: true }, tokens.volunteer2);
  const raced = await newSOS();
  const outcomes = await Promise.all([request('PATCH', '/sos/' + raced.id + '/assign', { volunteerId: people.volunteer2.id }, tokens.admin), request('PATCH', '/sos/' + raced.id + '/withdraw', { reason: 'Duplicate' }, tokens.citizen)]);
  assert.deepEqual(outcomes.map(r => r.status).sort(), [200,409]);
  assert.equal(await prisma.rescueEvent.count({ where: { sosId: raced.id } }), 2);
});

test('acknowledgment, replacement and reassignment preserve progress, recipient history and current ownership', async () => {
  await request('PATCH', '/auth/availability', { onDuty: true }, tokens.volunteer2);
  const sos = await newSOS(); await request('PATCH', '/sos/' + sos.id + '/verify', {}, tokens.admin);
  const assigned = await request('PATCH', '/sos/' + sos.id + '/assign', { volunteerId: people.volunteer2.id }, tokens.admin);
  assert.equal(assigned.status, 200); assert.ok(assigned.data.sos.acknowledgmentDueAt); assert.equal(assigned.data.sos.assignmentAcknowledgedAt, null);
  assert.equal(assigned.data.sos.assignedResponder.name, people.volunteer2.name);
  assert.equal((await request('PATCH', '/sos/' + sos.id + '/acknowledge', {}, tokens.citizen)).status, 403);
  assert.equal((await request('PATCH', '/sos/' + sos.id + '/acknowledge', {}, tokens.volunteer)).status, 403);
  assert.equal((await request('PATCH', '/sos/' + sos.id + '/acknowledge', {}, tokens.volunteer2)).status, 200);
  assert.equal((await request('PATCH', '/sos/' + sos.id + '/acknowledge', {}, tokens.volunteer2)).status, 200);
  assert.equal(await prisma.rescueEvent.count({ where: { sosId: sos.id, kind: 'ACKNOWLEDGED' } }), 1);
  assert.equal((await request('PATCH', '/sos/' + sos.id + '/handoff', { reason: 'Vehicle unavailable' }, tokens.volunteer)).status, 403);
  assert.equal((await request('PATCH', '/sos/' + sos.id + '/handoff', { reason: 'Vehicle unavailable' }, tokens.volunteer2)).status, 200);
  assert.equal((await request('PATCH', '/sos/' + sos.id + '/handoff', { reason: 'Vehicle unavailable' }, tokens.volunteer2)).status, 409);
  let current = await prisma.sOSRequest.findUnique({ where: { id: sos.id } });
  assert.equal(current.assignedVolunteerId, people.volunteer2.id); assert.equal(current.status, 'EN_ROUTE');
  assert.ok((await request('GET', '/operations/summary', undefined, tokens.admin)).data.summary.sos.replacementRequested >= 1);
  await request('PATCH', '/sos/' + sos.id + '/status', { status: 'ON_SCENE' }, tokens.volunteer2);
  const body = { volunteerId: people.volunteer.id, expectedVolunteerId: people.volunteer2.id, reason: 'Replacement vehicle available' };
  assert.equal((await request('PATCH', '/sos/' + sos.id + '/reassign', body, tokens.volunteer2)).status, 403);
  await request('PATCH', '/auth/availability', { onDuty: false }, tokens.volunteer);
  assert.equal((await request('PATCH', '/sos/' + sos.id + '/reassign', body, tokens.admin)).status, 409);
  await request('PATCH', '/auth/availability', { onDuty: true }, tokens.volunteer);
  assert.equal((await request('PATCH', '/sos/' + sos.id + '/reassign', body, tokens.admin)).status, 200);
  assert.equal((await request('PATCH', '/sos/' + sos.id + '/reassign', body, tokens.admin)).status, 409);
  current = await prisma.sOSRequest.findUnique({ where: { id: sos.id } });
  assert.equal(current.status, 'ON_SCENE'); assert.equal(current.assignedVolunteerId, people.volunteer.id); assert.equal(current.handoffRequestedAt, null); assert.equal(current.assignmentAcknowledgedAt, null);
  assert.equal((await request('PATCH', '/sos/' + sos.id + '/status', { status: 'EVACUATED' }, tokens.volunteer2)).status, 403);
  const event = await prisma.rescueEvent.findFirst({ where: { sosId: sos.id, kind: 'REASSIGNED' } }); assert.match(event.detail, /Replacement vehicle available/);
  for (const userId of [people.citizen.id, people.volunteer.id, people.volunteer2.id, people.admin.id]) assert.equal(await prisma.notification.count({ where: { userId, sosId: sos.id, title: { contains: 'Responder reassigned' } } }), 1);
  const mine = (await request('GET', '/sos/my', undefined, tokens.citizen)).data.requests.find(s => s.id === sos.id);
  assert.equal(mine.assignedResponder.name, people.volunteer.name); assert.equal(mine.assignedResponder.phone, undefined);
  await prisma.sOSRequest.update({ where: { id: sos.id }, data: { acknowledgmentDueAt: new Date('2000-01-01') } });
  assert.ok((await request('GET', '/operations/summary', undefined, tokens.admin)).data.summary.sos.acknowledgmentOverdue >= 1);
  await request('PATCH', '/sos/' + sos.id + '/acknowledge', {}, tokens.volunteer);
  const third = await prisma.user.create({ data: { name: 'Third responder', email: 'third@test.invalid', passwordHash: 'unused-test-hash', role: 'VOLUNTEER', trusted: true, onDuty: true } });
  const claims = await Promise.all([people.volunteer2.id, third.id].map(volunteerId => request('PATCH', '/sos/' + sos.id + '/reassign', { volunteerId, expectedVolunteerId: people.volunteer.id, reason: 'Shift handover' }, tokens.admin)));
  assert.deepEqual(claims.map(r => r.status).sort(), [200,409]);
  assert.equal(await prisma.rescueEvent.count({ where: { sosId: sos.id, kind: 'REASSIGNED' } }), 2);
  await request('PATCH', '/sos/' + sos.id + '/status', { status: 'EVACUATED' }, tokens.admin);
  assert.equal((await request('PATCH', '/sos/' + sos.id + '/withdraw', { reason: 'Duplicate' }, tokens.citizen)).status, 409);
  assert.equal((await request('PATCH', '/sos/' + sos.id + '/cancel', { cancelReason: 'False alarm' }, tokens.admin)).status, 409);
  await request('PATCH', '/sos/' + sos.id + '/status', { status: 'RESOLVED' }, tokens.admin);
  assert.equal((await request('PATCH', '/sos/' + sos.id + '/handoff', { reason: 'Closed' }, tokens.volunteer)).status, 403);
});

test('replacement requests roll back entirely when notification persistence fails', async () => {
  const sos = await newSOS(); await request('PATCH', '/sos/' + sos.id + '/verify', {}, tokens.admin); await request('PATCH', '/sos/' + sos.id + '/assign', {}, tokens.volunteer);
  const before = await prisma.rescueEvent.count({ where: { sosId: sos.id } });
  await prisma.$executeRawUnsafe("CREATE TRIGGER audit_reject_handoff_notice BEFORE INSERT ON Notification BEGIN SELECT RAISE(ABORT, 'handoff notification failure'); END");
  try {
    assert.equal((await request('PATCH', '/sos/' + sos.id + '/handoff', { reason: 'Cannot continue' }, tokens.volunteer)).status, 500);
    assert.equal((await prisma.sOSRequest.findUnique({ where: { id: sos.id } })).handoffRequestedAt, null);
    assert.equal(await prisma.rescueEvent.count({ where: { sosId: sos.id } }), before);
  } finally { await prisma.$executeRawUnsafe('DROP TRIGGER audit_reject_handoff_notice'); }
});


test('shared relay quotas use verified identities and separate reads from writes without disabling limits', async () => {
  const { rateLimitKey } = require('../src/config/rate-limit-key');
  const key = token => rateLimitKey({ headers: token ? {authorization:'Bearer ' + token} : {}, ip:'127.0.0.1' });
  assert.equal(key(tokens.citizen), 'account:' + people.citizen.id);
  const rotated = jwt.sign({id:people.citizen.id}, process.env.JWT_SECRET, {expiresIn:'1h'});
  assert.equal(key(rotated),key(tokens.citizen)); assert.notEqual(key(tokens.other),key(tokens.citizen));
  assert.equal(key(jwt.sign({id:999999}, 'wrong-secret')),key(null));
  assert.equal(key(jwt.sign({id:999999}, process.env.JWT_SECRET,{expiresIn:-1})),key(null));
  assert.equal(key(jwt.sign({id:'not-an-id'},process.env.JWT_SECRET)),key(null));
  process.env.DISABLE_RATE_LIMITS='false';
  try {
    for (let i=0;i<600;i++) assert.equal((await request('GET','/quota-test-missing',undefined,tokens.citizen)).status,404);
    assert.equal((await request('GET','/quota-test-missing',undefined,tokens.citizen)).status,429);
    for (let i=0;i<200;i++) assert.equal((await request('PATCH','/quota-test-missing',{},tokens.citizen)).status,404);
    assert.equal((await request('PATCH','/quota-test-missing',{},tokens.citizen)).status,429);
    assert.equal((await request('GET','/auth/me',undefined,tokens.other)).status,200);
    assert.equal((await request('GET','/health')).status,200);
  } finally { process.env.DISABLE_RATE_LIMITS='true'; }
});


test('SOS receipts prevent duplicates across live retries and offline replay without crossing account ownership',async()=>{
  const body={lat:30,lng:78,message:'Retry-safe SOS',capturedAt:null,idempotencyKey:'sos_receipt_test'};
  const results=await Promise.all([request('POST','/sos',body,tokens.citizen),request('POST','/sos',body,tokens.citizen)]);
  assert.deepEqual(results.map(result=>result.status).sort(),[200,201]);
  assert.equal(results[0].data.sos.id,results[1].data.sos.id);
  const id=results[0].data.sos.id;assert.equal(await prisma.rescueEvent.count({where:{sosId:id,kind:'CREATED'}}),1);
  assert.equal(results[0].data.sos.capturedAt,null);
  const batch={items:[{type:'SOS',idempotencyKey:body.idempotencyKey,payload:body}]};
  assert.equal((await request('POST','/offline/sync-batch',batch,tokens.citizen)).data.results[0].status,'DUPLICATE_IGNORED');
  assert.equal((await request('POST','/sos',{...body,message:'Different emergency'},tokens.citizen)).status,409);
  assert.equal((await request('POST','/offline/sync-batch',{items:[{...batch.items[0],payload:{...body,message:'Different emergency'}}]},tokens.citizen)).data.results[0].status,'FAILED');
  const other=await request('POST','/sos',body,tokens.other);assert.equal(other.status,201);assert.notEqual(other.data.sos.id,id);
  const offlineFirst={...body,idempotencyKey:'sos_offline_first',message:'Offline-first SOS'};
  const synced=await request('POST','/offline/sync-batch',{items:[{type:'SOS',idempotencyKey:offlineFirst.idempotencyKey,payload:offlineFirst}]},tokens.citizen);
  assert.equal(synced.data.results[0].status,'SYNCED');
  const retry=await request('POST','/sos',offlineFirst,tokens.citizen);assert.equal(retry.status,200);assert.equal(retry.data.sos.id,synced.data.results[0].record.id);
  assert.equal((await request('POST','/sos',body)).status,401);
  const owned=await request('POST','/sos',{...body,idempotencyKey:'volunteer_owned_receipt'},tokens.volunteer);assert.equal(owned.status,201);
  const ownLogs=(await request('GET','/offline/logs',undefined,tokens.volunteer)).data.logs;
  assert.ok(ownLogs.length>0);assert.ok(ownLogs.every(log=>log.idempotencyKey.startsWith(people.volunteer.id+':')));
  assert.ok((await request('GET','/offline/logs',undefined,tokens.admin)).data.logs.some(log=>log.idempotencyKey===people.citizen.id+':'+body.idempotencyKey));
});

test('resource reservations serialize competing holds, enforce owner decisions and release on incident closure',async()=>{
  const f=require('../src/services/field.service');const sos=await newSOS();await request('PATCH','/sos/'+sos.id+'/verify',{},tokens.admin);await request('PATCH','/sos/'+sos.id+'/assign',{},tokens.volunteer);
  const asset=await prisma.civilianAsset.create({data:{title:'Test rescue boat',type:'BOAT',ownerName:'citizen',contact:'1234567890',description:'Rescue boat',lat:30,lng:78,userId:people.citizen.id}});
  const holds=await Promise.all([tokens.volunteer,tokens.admin].map(t=>request('POST','/field/assets/'+asset.id+'/reservations',{sosId:sos.id,reason:'Transport assigned family'},t)));assert.deepEqual(holds.map(x=>x.status).sort(),[201,409]);const booking=holds.find(x=>x.status===201).data.reservation;
  assert.equal((await request('PATCH','/assets/'+asset.id+'/status',{available:true},tokens.citizen)).status,409);
  assert.equal((await request('PATCH','/field/reservations/'+booking.id,{decision:'ACCEPTED',reason:'Confirmed'},tokens.other)).status,403);
  assert.equal((await request('PATCH','/field/reservations/'+booking.id,{decision:'ACCEPTED',reason:'Owner accepts'},tokens.citizen)).status,200);
  assert.equal((await request('GET','/field/reservations',undefined,tokens.other)).data.reservations.length,0);
  await request('PATCH','/auth/availability',{onDuty:true},tokens.volunteer2);
  const handover=await request('PATCH','/sos/'+sos.id+'/reassign',{volunteerId:people.volunteer2.id,expectedVolunteerId:people.volunteer.id,reason:'Resource team shift handover'},tokens.admin);
  assert.equal(handover.status,200);
  assert.ok((await request('GET','/field/reservations',undefined,tokens.volunteer2)).data.reservations.some(item=>item.id===booking.id));
  await request('PATCH','/sos/'+sos.id+'/cancel',{cancelReason:'Incident no longer needs resource'},tokens.admin);
  assert.equal((await prisma.civilianAsset.findUnique({where:{id:asset.id}})).available,true);assert.equal((await prisma.assetReservation.findUnique({where:{id:booking.id}})).status,'RELEASED');
  const again=await newSOS();await request('PATCH','/sos/'+again.id+'/verify',{},tokens.admin);await request('PATCH','/sos/'+again.id+'/assign',{},tokens.volunteer);const expired=await f.reserve(people.volunteer,asset.id,{sosId:again.id,reason:'Transport needed'});await prisma.assetReservation.update({where:{id:expired.id},data:{expiresAt:new Date(Date.now()-1)}});await require('../src/services/maintenance.service').runMaintenance();assert.equal((await prisma.assetReservation.findUnique({where:{id:expired.id}})).status,'EXPIRED');
  const inherited=await f.reserve(people.volunteer,asset.id,{sosId:again.id,reason:'Transport for next shift'});
  assert.equal((await request('PATCH','/sos/'+again.id+'/reassign',{volunteerId:people.volunteer2.id,expectedVolunteerId:people.volunteer.id,reason:'Shift replacement'},tokens.admin)).status,200);
  assert.equal((await request('PATCH','/field/reservations/'+inherited.id,{decision:'RELEASED',reason:'New responder released unused resource'},tokens.volunteer2)).status,200);
  assert.equal((await prisma.civilianAsset.findUnique({where:{id:asset.id}})).available,true);
});

test('intake is idempotent, capacity-safe and private; matches need consent and support correction and departure',async()=>{
  const camp=await prisma.shelter.create({data:{name:'Intake camp',address:'District',contact:'112',lat:30,lng:78,capacity:1,region:'test'}});
  const body={shelterId:camp.id,fullName:'Asha Sharma',age:30,description:'Details volunteered by family',consentToMatching:true,idempotencyKey:'intake-once'};
  const admitted=await request('POST','/field/intakes',body,tokens.volunteer);assert.equal(admitted.status,201,JSON.stringify(admitted.data));const intake=admitted.data.intake;assert.equal(intake.payloadHash,undefined);
  assert.equal((await request('POST','/field/intakes',body,tokens.volunteer)).data.intake.id,intake.id);assert.equal((await request('POST','/field/intakes',{...body,idempotencyKey:'second-arrival'},tokens.volunteer)).status,409);assert.equal((await request('GET','/field/intakes',undefined,tokens.citizen)).status,403);
  const report=await prisma.missingPerson.create({data:{reportedByName:'Relative',contactPhone:'1234567890',fullName:'Asha Sharma',age:30,lastSeenLocation:'test',description:'Family report',region:'test',reportedByUserId:people.citizen.id}});
  const candidates=await request('GET','/field/missing/'+report.id+'/suggestions',undefined,tokens.volunteer);assert.equal(candidates.data.suggestions[0].intakeId,intake.id);
  await assert.rejects(require('../src/controllers/shelter.controller').logShelterEventInternal({shelterId:camp.id,deltaOccupancy:-1}),e=>e.status===409);
  const route='/field/missing/'+report.id+'/matches',review={intakeId:intake.id,decision:'CONFIRM',reason:'Family and shelter confirmed identity in person'};
  assert.equal((await request('POST',route,review,tokens.citizen)).status,403);assert.equal((await request('POST',route,review,tokens.volunteer)).status,200);
  assert.equal((await request('PATCH','/missing-persons/'+report.id+'/status',{status:'MISSING'},tokens.admin)).status,409);
  assert.equal((await request('POST',route,{...review,decision:'REVOKE',reason:'Staff discovered the matching relative was incorrect'},tokens.admin)).status,200);assert.equal((await prisma.missingPerson.findUnique({where:{id:report.id}})).matchedIntakeId,null);
  assert.equal((await request('POST',route,review,tokens.volunteer)).status,200);
  assert.equal((await request('PATCH','/field/intakes/'+intake.id+'/consent',{consentToMatching:false,reason:'Person withdrew consent'},tokens.volunteer)).status,200);assert.equal((await request('GET','/field/missing/'+report.id+'/suggestions',undefined,tokens.volunteer)).data.suggestions.length,0);assert.equal((await prisma.missingPerson.findUnique({where:{id:report.id}})).matchedIntakeId,null);await request('PATCH','/field/intakes/'+intake.id+'/consent',{consentToMatching:true,reason:'Person granted consent again'},tokens.volunteer);await request('POST',route,review,tokens.volunteer);
  const departures=await Promise.all([tokens.admin,tokens.volunteer].map(t=>request('PATCH','/field/intakes/'+intake.id+'/depart',{reason:'Family collected the person'},t)));assert.deepEqual(departures.map(x=>x.status).sort(),[200,409]);assert.equal((await prisma.shelter.findUnique({where:{id:camp.id}})).currentOccupancy,0);assert.equal((await prisma.missingPerson.findUnique({where:{id:report.id}})).status,'LOCATED');
  assert.equal((await request('POST',route,review,tokens.admin)).status,409);
});

test('recovery cases connect owner, assigned volunteer and operator with optimistic conflict protection',async()=>{
  const reported=await request('POST','/field/recovery',{kind:'DAMAGE',region:'test',description:'Roof damage requires review'},tokens.citizen);assert.equal(reported.status,201);let item=reported.data.case;
  assert.equal((await request('GET','/field/recovery',undefined,tokens.other)).data.cases.length,0);assert.equal((await request('PATCH','/field/recovery/'+item.id,{status:'IN_PROGRESS',reason:'Inspection scheduled',expectedUpdatedAt:item.updatedAt},tokens.volunteer)).status,403);
  const started=await request('PATCH','/field/recovery/'+item.id,{status:'IN_PROGRESS',assignedToId:people.volunteer.id,reason:'Assigning inspection',expectedUpdatedAt:item.updatedAt},tokens.admin);assert.equal(started.status,200);const transfer=await request('PATCH','/field/recovery/'+item.id,{status:'IN_PROGRESS',assignedToId:people.volunteer2.id,reason:'Responder handover',expectedUpdatedAt:started.data.case.updatedAt},tokens.admin);assert.equal(transfer.status,200);const returned=await request('PATCH','/field/recovery/'+item.id,{status:'IN_PROGRESS',assignedToId:people.volunteer.id,reason:'Responder returned to duty',expectedUpdatedAt:transfer.data.case.updatedAt},tokens.admin);assert.equal(returned.status,200);assert.equal((await request('PATCH','/field/recovery/'+item.id,{status:'COMPLETED',reason:'Stale closure',expectedUpdatedAt:item.updatedAt},tokens.volunteer)).status,409);item=returned.data.case;
  const closed=await request('PATCH','/field/recovery/'+item.id,{status:'COMPLETED',reason:'Assessment delivered to household',expectedUpdatedAt:item.updatedAt},tokens.volunteer);assert.equal(closed.status,200);assert.equal((await request('GET','/field/recovery',undefined,tokens.citizen)).data.cases[0].events.length,5);
});

test('preparedness stays account-private, validates checklist and records an explicitly completed drill',async()=>{
  const plan={checklist:{contacts:true,water:false},meetingPoint:'School gate',emergencyContact:'Local coordinator',language:'hi'};
  assert.equal((await request('PUT','/field/preparedness',plan,tokens.citizen)).status,200);assert.equal((await request('GET','/field/preparedness',undefined,tokens.other)).data.plan,null);assert.equal((await request('PUT','/field/preparedness',{...plan,checklist:{contacts:'yes'}},tokens.citizen)).status,400);assert.equal((await request('PUT','/field/preparedness',{...plan,drillCompleted:true},tokens.citizen)).data.plan.drillCompletedAt!==null,true);
});

test('district restrictions cover direct mutation, lists, offline SMS and private rescue sockets',async()=>{
  const district=await prisma.user.create({data:{name:'District coordinator',email:'district@test.invalid',passwordHash:people.admin.passwordHash,role:'ADMIN',trusted:true,serviceRegion:'district a'}}),t=jwt.sign({id:district.id},process.env.JWT_SECRET);
  const outside=await prisma.shelter.create({data:{name:'Outside shelter',address:'B',contact:'112',lat:30,lng:78,capacity:5,region:'district b'}});
  const active=await prisma.alert.create({data:{region:'district b',hazardType:'FLOOD',severity:'RED',lat:30,lng:78,radiusKm:3,message:'Outside district'}});
  assert.equal((await request('PATCH','/alerts/'+active.id+'/deactivate',{},t)).status,403);
  assert.equal((await request('POST','/field/intakes',{shelterId:outside.id,fullName:'Test Person',description:'Test details',consentToMatching:false,idempotencyKey:'outside-intake'},t)).status,403);
  const synced=await request('POST','/offline/sync-batch',{items:[{type:'SMS',idempotencyKey:'outside-sms',payload:{raw:'SHTR '+outside.id+' F20 W1 B4'}}]},t);assert.equal(synced.data.failedCount,1);
  const client=await socket(t);let received=0;client.on('sos:created',()=>received++);try{await newSOS();await new Promise(resolve=>setTimeout(resolve,80));assert.equal(received,0);assert.equal((await request('GET','/sos',undefined,t)).data.requests.length,0);}finally{client.disconnect();}
});

test('MFA enrollment, replay rejection, one-use recovery and logout invalidate old JWTs and sockets',async()=>{
  const security=require('../src/services/account-security.service'),hash=await bcrypt.hash('secure-testing-password',4);
  const u=await prisma.user.create({data:{name:'Secure user',email:'secure@test.invalid',passwordHash:hash}});const original=security.token(u),password='secure-testing-password';
  const setup=await request('POST','/security/mfa/setup',{password},original);assert.equal(setup.status,200);const code=security.totp(setup.data.secret,Math.floor(Date.now()/30000));const enabled=await request('POST','/security/mfa/enable',{code},original);assert.equal(enabled.status,200,JSON.stringify(enabled.data));assert.equal((await request('GET','/auth/me',undefined,original)).status,401);
  assert.equal((await request('POST','/auth/login',{email:u.email,password,code})).status,401);
  const recoveryCode=enabled.data.recoveryCodes[0];const signed=await request('POST','/auth/login',{email:u.email,password,code:recoveryCode});assert.equal(signed.status,200);assert.equal((await request('POST','/auth/login',{email:u.email,password,code:recoveryCode})).status,401);
  const client=await socket(signed.data.token);const disconnected=new Promise(resolve=>client.once('disconnect',resolve));assert.equal((await request('POST','/security/logout',{},signed.data.token)).status,200);await disconnected;assert.equal((await request('GET','/auth/me',undefined,signed.data.token)).status,401);client.disconnect();
});

test('email/reset challenges expire, are owner-bound and single use; phone failures exhaust attempts',async()=>{
  const security=require('../src/services/account-security.service');const u=await prisma.user.create({data:{name:'Contact user',email:'contact@test.invalid',phone:'+919999999901',passwordHash:people.citizen.passwordHash}}),t=security.token(u);
  const token='a'.repeat(64);await prisma.accountChallenge.create({data:{userId:u.id,kind:'EMAIL',tokenHash:security.hash(token),target:u.email,expiresAt:new Date(Date.now()+60000)}});
  assert.equal((await request('POST','/security/email/verify',{token},tokens.other)).status,400);assert.equal((await request('POST','/security/email/verify',{token},t)).status,200);assert.equal((await request('POST','/security/email/verify',{token},t)).status,400);
  const phone=await prisma.accountChallenge.create({data:{userId:u.id,kind:'PHONE',tokenHash:security.hash(u.id+':'+u.phone+':123456'),target:u.phone,expiresAt:new Date(Date.now()+60000)}});for(let i=0;i<5;i++)assert.equal((await request('POST','/security/phone/verify',{code:'000000'},t)).status,400);assert.equal((await prisma.accountChallenge.findUnique({where:{id:phone.id}})).attempts,5);assert.equal((await request('POST','/security/phone/verify',{code:'123456'},t)).status,400);
  const reset='b'.repeat(64);await prisma.accountChallenge.create({data:{userId:u.id,kind:'RESET',tokenHash:security.hash(reset),target:u.email,expiresAt:new Date(Date.now()+60000)}});assert.equal((await request('POST','/security/reset-password',{token:reset,newPassword:'new-secure-testing-password'})).status,200);assert.equal((await request('GET','/auth/me',undefined,t)).status,401);assert.equal((await request('POST','/security/reset-password',{token:reset,newPassword:'new-secure-testing-password'})).status,400);
  assert.equal((await request('POST','/security/forgot-password',{email:u.email})).status,503);
});

test('shared database rate buckets count across independent limiter instances',async()=>{
  const Store=require('../src/services/database-rate-store').DatabaseRateStore,a=new Store('test-shared'),b=new Store('test-shared');a.init({windowMs:60000});b.init({windowMs:60000});const results=await Promise.all(Array.from({length:10},(_,i)=>(i%2?a:b).increment('same-identity')));assert.equal(Math.max(...results.map(x=>x.totalHits)),10);await a.resetKey('same-identity');assert.equal((await b.increment('same-identity')).totalHits,1);
});

test('delivery queue deduplicates demo recipients; signed fast receipts never regress and stale leases are uncertain',async()=>{
  const delivery=require('../src/services/delivery.service'),security=require('../src/services/account-security.service');const alert=await prisma.alert.create({data:{region:'test',hazardType:'FLOOD',severity:'RED',lat:30,lng:78,radiusKm:5,message:'Demo delivery test',sourceKind:'DEMO'}});
  await prisma.$transaction(async tx=>{await delivery.enqueue(tx,alert,['+919999999902']);await delivery.enqueue(tx,alert,['+919999999902']);});const jobs=await prisma.deliveryJob.findMany({where:{alertId:alert.id}});assert.ok(jobs.length>0);assert.ok(jobs.every(x=>x.status==='SIMULATED'));assert.equal(jobs.filter(x=>security.decrypt(x.recipient)==='+919999999902').length,1);
  const item=await prisma.deliveryJob.create({data:{alertId:alert.id,key:'fast-receipt',channel:'SMS',recipient:security.encrypt('+919999999903'),payload:'{}',status:'SENDING',leaseUntil:new Date(Date.now()+60000)}});
  process.env.TWILIO_AUTH_TOKEN='test-signed-webhook-secret';process.env.TWILIO_WEBHOOK_BASE_URL=base;const body={MessageSid:'SM'+'a'.repeat(32),MessageStatus:'delivered'},route='/delivery/twilio/status?jobId='+item.id;
  assert.equal((await request('POST',route,body,undefined,{'X-Twilio-Signature':'forged'})).status,403);const signature=require('twilio').getExpectedTwilioSignature(process.env.TWILIO_AUTH_TOKEN,base+'/api'+route,body);assert.equal((await request('POST',route,body,undefined,{'X-Twilio-Signature':signature})).status,200);assert.equal((await prisma.deliveryJob.findUnique({where:{id:item.id}})).status,'DELIVERED');
  const late={...body,MessageStatus:'sent'},sig=require('twilio').getExpectedTwilioSignature(process.env.TWILIO_AUTH_TOKEN,base+'/api'+route,late);await request('POST',route,late,undefined,{'X-Twilio-Signature':sig});assert.equal((await prisma.deliveryJob.findUnique({where:{id:item.id}})).status,'DELIVERED');
  const abandoned=await prisma.deliveryJob.create({data:{alertId:alert.id,key:'abandoned-send',channel:'SMS',recipient:security.encrypt('+919999999904'),payload:'{}',status:'SENDING',leaseUntil:new Date(Date.now()-1)}});await delivery.processDeliveries();assert.equal((await prisma.deliveryJob.findUnique({where:{id:abandoned.id}})).status,'UNKNOWN');delete process.env.TWILIO_AUTH_TOKEN;delete process.env.TWILIO_WEBHOOK_BASE_URL;
});

test('overdue acknowledgment escalates exactly once and impact uses actual timeline samples',async()=>{
  const sos=await newSOS();await request('PATCH','/sos/'+sos.id+'/verify',{},tokens.admin);await request('PATCH','/sos/'+sos.id+'/assign',{volunteerId:people.volunteer.id},tokens.admin);await prisma.sOSRequest.update({where:{id:sos.id},data:{acknowledgmentDueAt:new Date(Date.now()-1000)}});const maintenance=require('../src/services/maintenance.service');await maintenance.runMaintenance();await maintenance.runMaintenance();assert.equal(await prisma.rescueEvent.count({where:{sosId:sos.id,kind:'ESCALATED'}}),1);
  const metrics=await request('GET','/field/metrics',undefined,tokens.admin);assert.equal(metrics.status,200);assert.ok(metrics.data.metrics.dispatch.samples>0);assert.match(metrics.data.metrics.baseline,/No baseline/);assert.equal((await request('GET','/field/metrics',undefined,tokens.citizen)).status,403);
  const review=await request('POST','/field/warning-reviews',{region:'test',telemetry:{rain1h:0},expectedHazard:'SAFE',sourceReference:'Recorded controlled test observation'},tokens.admin);assert.equal(review.status,201);assert.match(review.data.prediction.interpretation,/not a probability/);
});


test('public phone enrollment needs a bounded one-use challenge and cannot overwrite verified districts anonymously',async()=>{
  const s=require('../src/services/account-security.service');const phone='+919999999905';await prisma.phoneRegistration.create({data:{phoneNumber:phone,region:'district a',verifiedAt:new Date()}});
  await request('POST','/registry/phone',{phoneNumber:phone,region:'district b'});assert.equal((await prisma.phoneRegistration.findUnique({where:{phoneNumber:phone}})).region,'district a');
  const id='c'.repeat(32);await prisma.publicPhoneChallenge.create({data:{id,phoneNumber:phone,region:'district b',codeHash:s.hash(id+':123456'),expiresAt:new Date(Date.now()+60000)}});
  assert.equal((await request('POST','/registry/phone/verify',{challengeId:id,code:'000000'})).status,400);assert.equal((await request('POST','/registry/phone/verify',{challengeId:id,code:'123456'})).status,200);assert.equal((await request('POST','/registry/phone/verify',{challengeId:id,code:'123456'})).status,400);assert.equal((await prisma.phoneRegistration.findUnique({where:{phoneNumber:phone}})).region,'district b');
});

test('delivery workers claim each job once and retry only explicitly rejected throttled requests',async()=>{
  const d=require('../src/services/delivery.service'),s=require('../src/services/account-security.service'),original=d.sendJob;const old={sid:process.env.TWILIO_ACCOUNT_SID,token:process.env.TWILIO_AUTH_TOKEN,from:process.env.TWILIO_FROM_NUMBER,disabled:process.env.DISABLE_EXTERNAL_DELIVERY};Object.assign(process.env,{TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_AUTH_TOKEN:'test-key',TWILIO_FROM_NUMBER:'+919999999906',DISABLE_EXTERNAL_DELIVERY:'false'});let sends=0;
  try{const job=await prisma.deliveryJob.create({data:{key:'worker-once',nextAttemptAt:new Date(Date.now()-1000),channel:'SMS',recipient:s.encrypt('+919999999907'),payload:'{}'}});d.sendJob=async()=>{sends++;await new Promise(r=>setTimeout(r,20));return {status:'ACCEPTED',providerId:'SM'+'b'.repeat(32)};};await Promise.all([d.processDeliveries(),d.processDeliveries()]);assert.equal(sends,1);assert.equal((await prisma.deliveryJob.findUnique({where:{id:job.id}})).status,'ACCEPTED');
    const retry=await prisma.deliveryJob.create({data:{key:'worker-throttle',nextAttemptAt:new Date(Date.now()-1000),channel:'SMS',recipient:s.encrypt('+919999999908'),payload:'{}'}});d.sendJob=async()=>{throw Object.assign(Error('Rejected'),{status:429});};await d.processDeliveries();const queued=await prisma.deliveryJob.findUnique({where:{id:retry.id}});assert.equal(queued.status,'QUEUED');assert.equal(queued.attempts,1);assert.ok(queued.nextAttemptAt>new Date());
  }finally{d.sendJob=original;for(const [key,value] of Object.entries({TWILIO_ACCOUNT_SID:old.sid,TWILIO_AUTH_TOKEN:old.token,TWILIO_FROM_NUMBER:old.from,DISABLE_EXTERNAL_DELIVERY:old.disabled}))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});

test('controlled local concurrent reads complete without losing authorization or returning server failures',async()=>{
  const started=performance.now();const samples=await Promise.all(Array.from({length:60},async(_,i)=>{const time=performance.now(),r=await request('GET',i%2?'/field/preparedness':'/operations/summary',undefined,i%2?tokens.citizen:tokens.admin);assert.equal(r.status,200,JSON.stringify(r.data));return performance.now()-time;}));samples.sort((a,b)=>a-b);const elapsed=performance.now()-started;const report={environment:'Disposable SQLite database, local loopback, 60 simultaneous reads; not a field benchmark',requests:60,failures:0,elapsedMs:Math.round(elapsed),medianMs:Math.round(samples[30]),p90Ms:Math.round(samples[53]),requestsPerSecond:Math.round(60000/elapsed)};fs.writeFileSync(path.resolve(__dirname,'../../docs/local-load-check.json'),JSON.stringify(report,null,2));
});

test('evacuation guidance connects sourced warnings, reachable shelters and consented route staffing with role and district enforcement',async()=>{
  const passwordHash=await bcrypt.hash('evacuation-test',4),region='evacuation-test';
  const make=async(key,role,trusted,serviceRegion=null)=>{const user=await prisma.user.create({data:{name:key,email:key+'@test.invalid',passwordHash,role,trusted,onDuty:true,region,serviceRegion,lat:35,lng:80}});return {user,token:jwt.sign({id:user.id},process.env.JWT_SECRET,{expiresIn:'1h'})};};
  const admin=await make('evac-operator','ADMIN',true,region),volunteer=await make('evac-volunteer','VOLUNTEER',true,region),otherVolunteer=await make('evac-other','VOLUNTEER',true,region),citizen=await make('evac-citizen','CITIZEN',false),outside=await make('evac-outside','ADMIN',true,'other-district');
  const expiry=new Date(Date.now()+3600000).toISOString();
  const direct=await request('POST','/field/corridors',{name:'Direct road',region,mode:'BOTH',points:[[35,80],[35,80.01]],reason:'Disposable field review',expiresAt:expiry},admin.token);assert.equal(direct.status,201,JSON.stringify(direct.data));
  const detour=await request('POST','/field/corridors',{name:'Reviewed relief road',region,mode:'BOTH',points:[[35,80],[35.01,80],[35.01,80.01]],reason:'Disposable field review',expiresAt:expiry},admin.token);assert.equal(detour.status,201);
  const shelterData={address:'Public shelter',contact:'112',region,capacity:10,currentOccupancy:0};
  await prisma.shelter.create({data:{...shelterData,name:'Full nearby shelter',lat:35,lng:80.002,currentOccupancy:10}});
  await prisma.shelter.create({data:{...shelterData,name:'Blocked direct shelter',lat:35,lng:80.01}});
  const target=await prisma.shelter.create({data:{...shelterData,name:'Reachable shelter',lat:35.01,lng:80.01}});
  await prisma.hazardReport.create({data:{userName:'Test report',lat:35,lng:80.005,hazardNote:'road blocked by landslide',severityBenchmark:'ANKLE',confidenceTier:'AMBER',region}});
  const warning={region,hazardType:'LANDSLIDE',action:'PREPARE',lat:35,lng:80,radiusKm:5,probability:65,sourceName:'Synthetic source',sourceReference:'TEST ONLY bulletin',assessmentNote:'Synthetic estimate for the next hour; not a forecast',instructions:'Prepare and consult local staff',observedAt:new Date().toISOString(),expiresAt:expiry};
  assert.equal((await request('POST','/field/evacuation',warning,citizen.token)).status,403);
  assert.equal((await request('POST','/field/evacuation',warning,volunteer.token)).status,403);
  assert.equal((await request('POST','/field/evacuation',{...warning,sourceReference:''},admin.token)).status,400);
  assert.equal((await request('POST','/field/evacuation',{...warning,probability:101},admin.token)).status,400);
  assert.equal((await request('POST','/field/evacuation',warning,outside.token)).status,403);
  const published=await request('POST','/field/evacuation',warning,admin.token);assert.equal(published.status,201,JSON.stringify(published.data));const advisory=published.data.advisory;
  assert.equal((await prisma.alert.findUnique({where:{id:advisory.alertId}})).severity,'WATCH');
  assert.match((await prisma.alert.findUnique({where:{id:advisory.alertId}})).message,/not an app prediction/);
  assert.equal((await request('GET','/field/evacuation',undefined,citizen.token)).data.advisories.some(a=>a.id===advisory.id),true);
  const alertFeed=await request('GET','/alerts');assert.equal(alertFeed.data.alerts.find(a=>a.id===advisory.alertId).evacuation.active,true);
  const point={corridorId:detour.data.corridor.id,assignedVolunteerId:volunteer.user.id,name:'Public bridge help point',lat:35.005,lng:80,instructions:'Water and assistance at the marked bridge',publicContact:'112',expiresAt:new Date(Date.now()+1200000).toISOString()};
  assert.equal((await request('POST','/field/help-points',point,citizen.token)).status,403);
  assert.equal((await request('POST','/field/help-points',{...point,lat:36},admin.token)).status,400);
  assert.equal((await request('POST','/field/help-points',point,outside.token)).status,403);
  const created=await request('POST','/field/help-points',point,admin.token);assert.equal(created.status,201,JSON.stringify(created.data));const id=created.data.helpPoint.id;
  const planBody={start:[35,80],mode:'FOOT',advisoryId:advisory.id};
  let result=await request('POST','/field/evacuation/plan',planBody,citizen.token);assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.plan.shelter.id,target.id);assert.equal(result.data.plan.helpPoints[0].staffing,'AWAITING_CHECK_IN');assert.equal(result.data.plan.helpPoints[0].assignedVolunteerId,undefined);assert.equal(result.data.plan.helpPoints[0].volunteer,undefined);
  assert.equal((await request('PATCH',`/field/help-points/${id}/check-in`,{present:true},otherVolunteer.token)).status,403);
  assert.equal((await request('PATCH',`/field/help-points/${id}/check-in`,{present:true},admin.token)).status,403);
  assert.equal((await request('PATCH',`/field/help-points/${id}/check-in`,{present:true},volunteer.token)).status,200);
  result=await request('POST','/field/evacuation/plan',planBody,citizen.token);assert.equal(result.data.plan.helpPoints[0].staffing,'CONFIRMED');
  const another=await request('POST','/field/help-points',{...point,name:'Second public point',lat:35.006},admin.token);assert.equal(another.status,201);
  await request('PATCH',`/field/help-points/${another.data.helpPoint.id}/check-in`,{present:true},volunteer.token);assert.equal((await prisma.routeHelpPoint.findUnique({where:{id}})).confirmedAt,null);
  await request('PATCH',`/field/help-points/${id}/check-in`,{present:true},volunteer.token);assert.equal((await prisma.routeHelpPoint.findUnique({where:{id:another.data.helpPoint.id}})).confirmedAt,null);
  assert.equal((await request('PATCH','/auth/availability',{onDuty:false},volunteer.token)).status,200);assert.equal((await prisma.routeHelpPoint.findUnique({where:{id}})).confirmedAt,null);
  await request('PATCH','/auth/availability',{onDuty:true},volunteer.token);await request('PATCH',`/field/help-points/${id}/check-in`,{present:true},volunteer.token);
  const rescue=await request('POST','/sos',{lat:35,lng:80,region,message:'Synthetic rescue requires the route volunteer'},citizen.token);assert.equal(rescue.status,201);await request('PATCH',`/sos/${rescue.data.sos.id}/verify`,{},admin.token);assert.equal((await request('PATCH',`/sos/${rescue.data.sos.id}/assign`,{volunteerId:volunteer.user.id},admin.token)).status,200);assert.equal((await prisma.routeHelpPoint.findUnique({where:{id}})).confirmedAt,null);assert.equal((await request('PATCH',`/field/help-points/${id}/check-in`,{present:true},volunteer.token)).status,409);
  await request('PATCH',`/sos/${rescue.data.sos.id}/cancel`,{reason:'Disposable rescue ended'},admin.token);await request('PATCH',`/field/help-points/${id}/check-in`,{present:true},volunteer.token);
  await prisma.user.update({where:{id:volunteer.user.id},data:{onDuty:false}});result=await request('POST','/field/evacuation/plan',planBody,citizen.token);assert.equal(result.data.plan.helpPoints[0].staffing,'UNAVAILABLE');
  await prisma.user.update({where:{id:volunteer.user.id},data:{onDuty:true}});
  assert.equal((await request('GET','/field/help-points',undefined,otherVolunteer.token)).data.helpPoints.length,0);
  assert.equal((await request('PATCH',`/field/corridors/${detour.data.corridor.id}/close`,{},admin.token)).status,200);
  result=await request('POST','/field/evacuation/plan',planBody,citizen.token);assert.equal(result.data.plan.route.available,false);
  assert.equal((await request('PATCH',`/field/help-points/${id}/check-in`,{present:true},volunteer.token)).status,409);
  assert.equal((await request('GET','/field/help-points',undefined,citizen.token)).data.helpPoints.some(p=>p.id===id),false);
  assert.equal((await request('PATCH',`/field/evacuation/${advisory.id}/close`,{},outside.token)).status,403);
  await request('PATCH',`/field/evacuation/${advisory.id}/close`,{},admin.token);
  assert.equal((await request('POST','/field/evacuation/plan',planBody,citizen.token)).status,409);
  const expiring=await request('POST','/field/evacuation',{...warning,probability:null},admin.token);assert.equal(expiring.status,201);await prisma.evacuationAdvisory.update({where:{id:expiring.data.advisory.id},data:{expiresAt:new Date(Date.now()-1)}});await require('../src/services/maintenance.service').runMaintenance();assert.equal((await prisma.alert.findUnique({where:{id:expiring.data.advisory.alertId}})).active,false);
});
