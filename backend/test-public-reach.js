/**
 * test-public-reach.js
 * End-to-end verification script for Public Alert Reach
 * (Phone Registry, Web Push, Rate Limiting, PII Protection, Fan-out)
 */

const prisma = require('./src/db');
const { registerPhone, registerPush, getRegistryStats, getVapidKey } = require('./src/controllers/registry.controller');
const { fanOutPublicAlerts } = require('./src/controllers/alert.controller');
const { getVapidPublicKey } = require('./src/services/push.service');

// Helper mock response
function createMockRes() {
  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
  };
  return res;
}

async function runTests() {
  console.log('🧪 Starting Public Alert Reach Test Suite...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Clean test phone registrations & push subscriptions
    await prisma.phoneRegistration.deleteMany({
      where: { phoneNumber: { in: ['+919876543210', '+919123456780', '+919999999999'] } },
    });
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: { startsWith: 'https://test-push.example.com' } },
    });

    // 2. Test Phone Registration without Auth
    console.log('[Test 1] Phone Registration without Auth (Upsert & Normalization)...');
    const req1 = {
      headers: {},
      socket: { remoteAddress: '192.168.1.101' },
      body: { phoneNumber: '9876543210', region: 'Mumbai' },
    };
    const res1 = createMockRes();
    await registerPhone(req1, res1);

    assert(res1.statusCode === 200, 'Returns HTTP 200 on phone registration');
    assert(res1.data?.success === true, 'Returns success: true');
    assert(!res1.data?.phoneNumber, 'Zero PII: Does NOT echo back phone number in response');

    const dbPhone = await prisma.phoneRegistration.findUnique({
      where: { phoneNumber: '+919876543210' },
    });
    assert(dbPhone && dbPhone.region === 'Mumbai', 'Phone stored in database with +91 E.164 and region');

    // Test upsert (updating region)
    const req1b = {
      headers: {},
      socket: { remoteAddress: '192.168.1.101' },
      body: { phoneNumber: '+919876543210', region: 'Pune' },
    };
    const res1b = createMockRes();
    await registerPhone(req1b, res1b);
    const dbPhoneUpdated = await prisma.phoneRegistration.findUnique({
      where: { phoneNumber: '+919876543210' },
    });
    assert(dbPhoneUpdated.region === 'Pune', 'Upsert updates region without duplicate record');

    // 3. Test Push Subscription Registration
    console.log('\n[Test 2] Web Push Subscription Registration...');
    const req2 = {
      headers: {},
      socket: { remoteAddress: '192.168.1.102' },
      body: {
        endpoint: 'https://test-push.example.com/client-device-1',
        keys: { p256dh: 'BNcR...', auth: 'tBH...' },
        region: 'Pune',
      },
    };
    const res2 = createMockRes();
    await registerPush(req2, res2);

    assert(res2.statusCode === 200, 'Returns HTTP 200 on push subscription');
    assert(res2.data?.success === true, 'Returns success: true');

    const dbPush = await prisma.pushSubscription.findUnique({
      where: { endpoint: 'https://test-push.example.com/client-device-1' },
    });
    assert(dbPush && dbPush.region === 'Pune', 'Push subscription stored in DB');

    // 4. Test Registry Stats & PII Safety
    console.log('\n[Test 3] Registry Stats Telemetry & Zero PII Leakage...');
    const req3 = {};
    const res3 = createMockRes();
    await getRegistryStats(req3, res3);

    assert(res3.statusCode === 200, 'Returns HTTP 200 for registry stats');
    assert(typeof res3.data?.totalPhones === 'number', 'Returns numeric totalPhones count');
    assert(typeof res3.data?.totalPushSubs === 'number', 'Returns numeric totalPushSubs count');
    assert(!res3.data?.phones && !res3.data?.subscriptions, 'No raw arrays or PII exposed');

    // 5. Test VAPID Key Retrieval
    console.log('\n[Test 4] VAPID Public Key Delivery...');
    const req4 = {};
    const res4 = createMockRes();
    await getVapidKey(req4, res4);
    assert(res4.statusCode === 200, 'Returns HTTP 200 for VAPID key');
    assert(res4.data?.publicKey && typeof res4.data.publicKey === 'string', 'Returns string public key');

    // 6. Test Rate Limiting
    console.log('\n[Test 5] Anti-Spam Rate Limiter...');
    const spamIp = '10.0.0.99';
    let hitRateLimit = false;
    for (let i = 0; i < 15; i++) {
      const spamReq = {
        headers: {},
        socket: { remoteAddress: spamIp },
        body: { phoneNumber: `987654321${i % 10}`, region: 'Mumbai' },
      };
      const spamRes = createMockRes();
      await registerPhone(spamReq, spamRes);
      if (spamRes.statusCode === 429) {
        hitRateLimit = true;
        break;
      }
    }
    assert(hitRateLimit, 'Rate limiter triggers HTTP 429 after exceeding request burst limit');

    // 7. Test Region-Scoped Alert Fan-out
    console.log('\n[Test 6] Region-Scoped Alert Fan-Out...');
    // Seed a phone in Pune and another in Chennai
    await prisma.phoneRegistration.create({
      data: { phoneNumber: '+919999999999', region: 'Pune' },
    });
    await prisma.phoneRegistration.create({
      data: { phoneNumber: '+919123456780', region: 'Chennai' },
    });

    const mockAlertPune = {
      id: 9999,
      hazardType: 'FLOOD',
      severity: 'CRITICAL',
      region: 'Pune',
      lat: 18.5204,
      lng: 73.8567,
      message: 'Flash flood warning in riverside sectors. Immediate evacuation advised.',
    };

    const fanoutResult = await fanOutPublicAlerts(mockAlertPune);
    assert(fanoutResult.phoneCount >= 1, 'Targets in-region phone recipients (Pune)');
    assert(fanoutResult.pushCount >= 1, 'Targets in-region push subscribers (Pune)');

    // Cleanup
    await prisma.phoneRegistration.deleteMany({
      where: { phoneNumber: { in: ['+919876543210', '+919123456780', '+919999999999'] } },
    });
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: { startsWith: 'https://test-push.example.com' } },
    });

    console.log(`\n=========================================`);
    console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
    console.log(`=========================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
