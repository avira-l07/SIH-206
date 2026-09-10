// Automated verification test for Offline Batch Sync and Idempotency enforcement
const http = require('http');

function postJson(urlPath, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path: urlPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode, raw: body });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runTest() {
  console.log('🧪 [Test] Running Comprehensive Offline Batch Sync & Idempotency Test...');

  const uniqueSuffix = Date.now();
  const testItems = [
    {
      idempotencyKey: `idemp_sos_${uniqueSuffix}`,
      type: 'SOS',
      payload: {
        hazardType: 'FLOOD',
        message: 'Trapped on 2nd floor, elderly grandmother with oxygen tank',
        lat: 19.076,
        lng: 72.8777,
        coordsAccuracy: 8,
        capturedAt: new Date().toISOString(),
        vulnerabilityTags: 'elderly',
        batteryLevel: 12,
      },
      queuedAt: new Date().toISOString(),
    },
    {
      idempotencyKey: `idemp_hazard_${uniqueSuffix}`,
      type: 'HAZARD',
      payload: {
        lat: 19.081,
        lng: 72.882,
        hazardNote: 'Underpass completely submerged past waist level',
        severityBenchmark: 'WAIST',
      },
      queuedAt: new Date().toISOString(),
    },
    {
      idempotencyKey: `idemp_sms_${uniqueSuffix}`,
      type: 'SMS',
      payload: 'SHTR 104 F10 W1 B12',
      queuedAt: new Date().toISOString(),
    },
    {
      idempotencyKey: `idemp_shelter_${uniqueSuffix}`,
      type: 'SHELTER_EVENT',
      payload: {
        shelterId: 102,
        deltaOccupancy: 15,
        deltaWaterLiters: 100,
        deltaRations: 25,
        reason: 'Offline bus convoy drop-off',
        operatorName: 'Offline Test Operator',
      },
      queuedAt: new Date().toISOString(),
    },
    {
      idempotencyKey: `idemp_safety_${uniqueSuffix}`,
      type: 'SAFETY_STATUS',
      payload: {
        userId: 1,
        safetyStatus: 'SAFE',
      },
      queuedAt: new Date().toISOString(),
    },
  ];

  // 1. Initial Batch Submission
  console.log(`\nStep 1: Submitting initial batch of ${testItems.length} queued items...`);
  const firstRes = await postJson('/api/offline/sync-batch', {
    items: testItems,
    sourceNode: 'Test Runner PWA Client',
  });

  console.log('Status:', firstRes.status);
  console.log('Response Message:', firstRes.data.message);
  console.log('Synced Count:', firstRes.data.syncedCount);

  if (firstRes.data.syncedCount !== 5) {
    console.error('❌ Expected 5 items to be synced, got:', firstRes.data.syncedCount, firstRes.data);
    process.exit(1);
  }
  console.log('✅ Initial batch of 5 items (SOS with ±8m accuracy, Hazard, SMS, Shelter Delta, Safety Status) synced successfully.');

  // 2. Duplicate Submission (simulate network replay / double flush)
  console.log('\nStep 2: Resubmitting the EXACT same batch to test idempotency...');
  const secondRes = await postJson('/api/offline/sync-batch', {
    items: testItems,
    sourceNode: 'Test Runner PWA Client (Replay)',
  });

  console.log('Status:', secondRes.status);
  console.log('Response Message:', secondRes.data.message);
  console.log('Synced Count:', secondRes.data.syncedCount);
  console.log('Duplicate Count:', secondRes.data.dupeCount);

  if (secondRes.data.dupeCount !== 5 || secondRes.data.syncedCount !== 0) {
    console.error(
      '❌ Idempotency failed! Expected 5 duplicates ignored and 0 synced, got:',
      secondRes.data
    );
    process.exit(1);
  }

  console.log('✅ Idempotency test passed! Duplicate replayed items were safely ignored.');
  console.log('\n🎉 ALL OFFLINE SYNC VERIFICATION CHECKS PASSED!\n');
}

runTest().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
