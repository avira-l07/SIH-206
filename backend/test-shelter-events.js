const http = require('http');
const assert = require('assert');

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let resData = '';
        res.on('data', (chunk) => (resData += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(resData) });
          } catch {
            resolve({ status: res.statusCode, raw: resData });
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function run() {
  console.log('🧪 Running Comprehensive Shelter Delta & Commutative Event Migration Test Suite...\n');

  // 1. Authenticate volunteer
  const login = await request('POST', '/api/auth/login', {
    email: 'volunteer@sih.gov.in',
    password: 'password123',
  });
  const token = login.data.token;
  assert.ok(token, 'Failed to acquire auth token for volunteer');
  console.log('✅ 1. Authenticated volunteer session successfully.');

  // Fetch initial shelters
  const sheltersRes = await request('GET', '/api/shelters');
  assert.strictEqual(sheltersRes.status, 200, 'Failed to fetch shelters list');
  const shelters = sheltersRes.data.shelters;

  // 2. Test Basic Commutative Delta Event on Shelter 101
  const s101 = shelters.find((s) => s.id === 101);
  assert.ok(s101, 'Shelter 101 not found');
  const base101Occ = s101.currentOccupancy;
  const key1 = `test_delta_${Date.now()}_1`;

  const deltaRes1 = await request(
    'POST',
    '/api/shelters/101/events',
    {
      deltaOccupancy: 15,
      deltaWaterLiters: 100,
      deltaRations: 25,
      reason: 'Relief bus intake',
      operatorName: 'Unit-A Lead',
      idempotencyKey: key1,
    },
    token
  );

  assert.strictEqual(deltaRes1.status, 201, `Expected 201 for event creation, got ${deltaRes1.status}`);
  assert.strictEqual(deltaRes1.data.shelter.currentOccupancy, base101Occ + 15, 'Shelter occupancy did not increment correctly');
  assert.strictEqual(deltaRes1.data.event.deltaOccupancy, 15, 'Event record deltaOccupancy mismatch');
  assert.strictEqual(deltaRes1.data.event.deltaWaterLiters, 100, 'Event record deltaWaterLiters mismatch');
  assert.strictEqual(deltaRes1.data.event.deltaRations, 25, 'Event record deltaRations mismatch');
  console.log(`✅ 2. Basic commutative delta applied: ${base101Occ} -> ${deltaRes1.data.shelter.currentOccupancy}`);

  // 3. Test Idempotent Deduplication
  const dupeRes = await request(
    'POST',
    '/api/shelters/101/events',
    {
      deltaOccupancy: 15,
      deltaWaterLiters: 100,
      deltaRations: 25,
      idempotencyKey: key1,
    },
    token
  );

  assert.strictEqual(dupeRes.status, 200, `Expected 200 for duplicate, got ${dupeRes.status}`);
  assert.strictEqual(dupeRes.data.duplicateIgnored, true, 'Duplicate was not flagged as duplicateIgnored');
  assert.strictEqual(
    dupeRes.data.shelter.currentOccupancy,
    base101Occ + 15,
    'Duplicate event mutated shelter state!'
  );
  console.log('✅ 3. Idempotency verified: re-submitting key ignored cleanly without mutating state.');

  // 4. Test Commutative Order-Independence (A then B vs B then A)
  // We use Shelter 103 and Shelter 106 as comparative baselines
  // First baseline both shelters to known occupancy 100 via audit
  const baselineAudit1 = await request('PATCH', '/api/shelters/103/audit', { currentOccupancy: 100 }, token);
  const baselineAudit2 = await request('PATCH', '/api/shelters/106/audit', { currentOccupancy: 100 }, token);
  assert.strictEqual(baselineAudit1.status, 200);
  assert.strictEqual(baselineAudit2.status, 200);
  assert.strictEqual(baselineAudit1.data.shelter.currentOccupancy, 100);
  assert.strictEqual(baselineAudit2.data.shelter.currentOccupancy, 100);

  const deltaA = +35;
  const deltaB = -15;

  // Stream 1 on Shelter 103: Order A then B
  const res103_A = await request('POST', '/api/shelters/103/events', { deltaOccupancy: deltaA, reason: 'Batch A' }, token);
  assert.strictEqual(res103_A.data.shelter.currentOccupancy, 135);
  const res103_B = await request('POST', '/api/shelters/103/events', { deltaOccupancy: deltaB, reason: 'Batch B' }, token);
  assert.strictEqual(res103_B.data.shelter.currentOccupancy, 120);

  // Stream 2 on Shelter 106: Order B then A (inverted arrival order)
  const res106_B = await request('POST', '/api/shelters/106/events', { deltaOccupancy: deltaB, reason: 'Batch B' }, token);
  assert.strictEqual(res106_B.data.shelter.currentOccupancy, 85);
  const res106_A = await request('POST', '/api/shelters/106/events', { deltaOccupancy: deltaA, reason: 'Batch A' }, token);
  assert.strictEqual(res106_A.data.shelter.currentOccupancy, 120);

  // Assert order independence: final states are strictly identical
  assert.strictEqual(
    res103_B.data.shelter.currentOccupancy,
    res106_A.data.shelter.currentOccupancy,
    'Order independence failure: A+B != B+A'
  );
  console.log(
    `✅ 4. Order-independence confirmed: (100 + 35 - 15 = ${res103_B.data.shelter.currentOccupancy}) == (100 - 15 + 35 = ${res106_A.data.shelter.currentOccupancy})`
  );

  // 5. Test Bounds Clamping (Negative Clamping & Upper Clamping)
  // Negative clamping test on Shelter 106 (current occupancy is 120)
  const clampNegativeRes = await request(
    'POST',
    '/api/shelters/106/events',
    {
      deltaOccupancy: -500, // Excessive drop
      deltaWaterLiters: -99999, // Excessive water consumption
      deltaRations: -99999,
      reason: 'Massive evacuation test clamp',
      operatorName: 'Stress Test Bot',
    },
    token
  );
  assert.strictEqual(clampNegativeRes.status, 201);
  assert.strictEqual(clampNegativeRes.data.shelter.currentOccupancy, 0, 'Negative occupancy was not clamped to 0');
  if (clampNegativeRes.data.shelter.waterLitersRemaining !== null) {
    assert.strictEqual(clampNegativeRes.data.shelter.waterLitersRemaining, 0, 'Negative water was not clamped to 0');
  }
  if (clampNegativeRes.data.shelter.rationsUnitsRemaining !== null) {
    assert.strictEqual(clampNegativeRes.data.shelter.rationsUnitsRemaining, 0, 'Negative rations was not clamped to 0');
  }
  assert.strictEqual(clampNegativeRes.data.event.deltaOccupancy, -500, 'ShelterEvent should preserve raw delta for auditing');
  console.log('✅ 5a. Negative bounds clamping confirmed: delta -500 clamped occupancy to 0 (raw delta preserved in event log).');

  // Upper bounds clamping test on Shelter 106 (capacity is 300)
  const clampUpperRes = await request(
    'POST',
    '/api/shelters/106/events',
    {
      deltaOccupancy: 9999, // Excessive influx
      reason: 'Overflow influx test',
    },
    token
  );
  assert.strictEqual(clampUpperRes.status, 201);
  assert.strictEqual(clampUpperRes.data.shelter.currentOccupancy, 300, 'Upper occupancy was not clamped to capacity');
  console.log('✅ 5b. Upper bounds clamping confirmed: delta +9999 clamped occupancy to capacity 300.');

  // 6. Verify Event History Audit Trail
  const getEventsRes = await request('GET', '/api/shelters/101/events');
  assert.strictEqual(getEventsRes.status, 200, 'Failed to fetch shelter events');
  assert.ok(Array.isArray(getEventsRes.data.events), 'Events property is not an array');
  assert.ok(getEventsRes.data.events.some((e) => e.idempotencyKey === key1), 'Logged test event missing from history');
  console.log(`✅ 6. Event history audit trail verified (${getEventsRes.data.events.length} records on Shelter 101).`);

  console.log('\n🎉 ALL SHELTER DELTA & COMMUTATIVE SYNCHRONIZATION TESTS PASSED!\n');
}

run().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
