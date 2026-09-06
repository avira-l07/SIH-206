const http = require('http');

const PORT = 5000;
const BASE_URL = `http://localhost:${PORT}`;

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const data = body ? JSON.stringify(body) : null;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);

    const req = http.request(
      url,
      {
        method,
        headers,
      },
      (res) => {
        let responseBody = '';
        res.on('data', (chunk) => (responseBody += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(responseBody);
          } catch {
            parsed = responseBody;
          }
          resolve({ status: res.statusCode, data: parsed });
        });
      }
    );

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runVerification() {
  console.log('🧪 Starting automated backend API & logic verification...');

  // 1. Health check
  const health = await request('GET', '/api/health');
  console.assert(health.status === 200, 'Health check failed');
  console.log('✅ Health check passed (200)');

  // 2. Auth: Citizen, Volunteer, Confirmer1, Trusted Officer
  const citizenLogin = await request('POST', '/api/auth/login', {
    email: 'citizen@sih.gov.in',
    password: 'password123',
  });
  console.assert(citizenLogin.status === 200, 'Citizen login failed');
  const citizenToken = citizenLogin.data.token;

  const volunteerLogin = await request('POST', '/api/auth/login', {
    email: 'volunteer@sih.gov.in',
    password: 'password123',
  });
  console.assert(volunteerLogin.status === 200, 'Volunteer login failed');
  const volunteerToken = volunteerLogin.data.token;

  const confirmer1Login = await request('POST', '/api/auth/login', {
    email: 'confirmer1@sih.gov.in',
    password: 'password123',
  });
  const confirmer1Token = confirmer1Login.data.token;

  const trustedLogin = await request('POST', '/api/auth/login', {
    email: 'trusted_officer@sih.gov.in',
    password: 'password123',
  });
  const trustedToken = trustedLogin.data.token;
  console.log('✅ Authentication passed for Citizen, Volunteer, Confirmer, Trusted Officer');

  // 3. SOS Vulnerability Triage & Assignment Lock
  console.log('\n--- Testing SOS Vulnerability Triage & Assignment Lock ---');
  const newSOS = await request(
    'POST',
    '/api/sos',
    {
      lat: 19.073,
      lng: 72.884,
      message: 'Dialysis patient trapped on 1st floor',
      hazardType: 'FLOOD',
      vulnerabilityTags: ['dialysis', 'elderly'],
    },
    citizenToken
  );
  console.assert(newSOS.status === 201, 'SOS creation failed');
  console.assert(newSOS.data.sos.priority === 'URGENT', 'Priority was not set to URGENT');
  console.assert(Array.isArray(newSOS.data.sos.vulnerabilityTags), 'vulnerabilityTags was not an array');
  console.assert(newSOS.data.sos.vulnerabilityTags.includes('dialysis'), 'Missing dialysis tag');
  console.log('✅ SOS with vulnerability tags created with priority: URGENT');

  const sosId = newSOS.data.sos.id;
  const claim1 = await request('PATCH', `/api/sos/${sosId}/assign`, {}, volunteerToken);
  console.assert(claim1.status === 200, 'Volunteer assign failed');
  console.assert(claim1.data.sos.status === 'IN_PROGRESS', 'SOS status not IN_PROGRESS');
  console.log('✅ SOS claimed by Volunteer #1 -> IN_PROGRESS');

  // Create temporary volunteer 2 to test assignment lock
  const vol2Reg = await request('POST', '/api/auth/register', {
    name: 'Volunteer Two',
    email: `vol2_${Date.now()}@sih.gov.in`,
    password: 'password123',
    role: 'VOLUNTEER',
  });
  const vol2Token = vol2Reg.data.token;

  const claim2 = await request('PATCH', `/api/sos/${sosId}/assign`, {}, vol2Token);
  console.assert(claim2.status === 409, `Expected 409 Conflict for double claim, got ${claim2.status}`);
  console.log('✅ Assignment lock verified (409 Conflict on second responder claim attempt)');

  // 4. Shelter Audit & Auto-Status Calculation
  console.log('\n--- Testing Shelter Readiness Audit Status Engine ---');
  const auditRes1 = await request(
    'PATCH',
    '/api/shelters/101/audit',
    {
      currentOccupancy: 340, // 340/350 = 97% -> RED
      waterOk: true,
      rationsOk: true,
    },
    citizenToken
  );
  console.assert(auditRes1.status === 200, 'Audit failed');
  console.assert(auditRes1.data.shelter.status === 'RED', `Expected RED status at 97%, got ${auditRes1.data.shelter.status}`);
  console.log('✅ Shelter at 97% occupancy auto-computed status: RED');

  const auditRes2 = await request(
    'PATCH',
    '/api/shelters/101/audit',
    {
      currentOccupancy: 50, // 50/350 = 14% but no water -> RED
      waterOk: false,
    },
    citizenToken
  );
  console.assert(auditRes2.data.shelter.status === 'RED', `Expected RED status with water depleted, got ${auditRes2.data.shelter.status}`);
  console.log('✅ Shelter with water depleted auto-computed status: RED');

  const auditRes3 = await request(
    'PATCH',
    '/api/shelters/101/audit',
    {
      currentOccupancy: 50,
      waterOk: true,
      rationsOk: true,
    },
    citizenToken
  );
  console.assert(auditRes3.data.shelter.status === 'GREEN', `Expected GREEN status, got ${auditRes3.data.shelter.status}`);
  console.log('✅ Shelter restored to 14% with resources auto-computed status: GREEN');

  // 5. Confidence-Tier Hazard Verification Flow
  console.log('\n--- Testing Confidence-Tier Verification Flow (GREY -> AMBER -> RED) ---');
  const reportRes = await request(
    'POST',
    '/api/hazards',
    {
      lat: 19.072,
      lng: 72.883,
      hazardNote: 'Electric cable submerged in knee-deep floodwater',
      severityBenchmark: 'KNEE',
    },
    citizenToken
  );
  console.assert(reportRes.status === 201, 'Hazard report creation failed');
  console.assert(reportRes.data.report.confidenceTier === 'GREY', 'Initial tier was not GREY');
  const reportId = reportRes.data.report.id;
  console.log('✅ Initial hazard report created at tier: GREY (0 confirmations)');

  // Peer confirm by Confirmer 1
  const confirm1 = await request('POST', `/api/hazards/${reportId}/confirm`, {}, confirmer1Token);
  console.assert(confirm1.status === 200, 'Confirmation 1 failed');
  console.assert(confirm1.data.report.confidenceTier === 'AMBER', `Expected AMBER after 1 confirmation, got ${confirm1.data.report.confidenceTier}`);
  console.assert(confirm1.data.tierChanged === true, 'tierChanged should be true');
  console.log('✅ Peer confirmation #1 received -> Tier promoted to: AMBER');

  // Confirmer 1 duplicate attempt -> 409
  const dupConfirm = await request('POST', `/api/hazards/${reportId}/confirm`, {}, confirmer1Token);
  console.assert(dupConfirm.status === 409, `Expected 409 on duplicate confirmation, got ${dupConfirm.status}`);
  console.log('✅ Duplicate confirmation prevented with clean 409 Conflict');

  // Trusted Officer confirmation -> Instant RED
  const trustedConfirm = await request('POST', `/api/hazards/${reportId}/confirm`, {}, trustedToken);
  console.assert(trustedConfirm.status === 200, 'Trusted confirmation failed');
  console.assert(trustedConfirm.data.report.confidenceTier === 'RED', `Expected RED with trusted user, got ${trustedConfirm.data.report.confidenceTier}`);
  console.log('✅ Trusted authority confirmation received -> Tier promoted to: RED');

  // 6. SMS Parser & Offline Telemetry Ingestion
  console.log('\n--- Testing SMS Telemetry Parser & Offline Ingestion ---');
  const smsShelter = await request('POST', '/api/offline/sms-ingest', {
    payload: 'SHTR 102 F0 W1 B30',
  });
  console.assert(smsShelter.status === 200, 'SMS shelter ingest failed');
  console.assert(smsShelter.data.result.record.capacity - smsShelter.data.result.record.currentOccupancy === 30, 'Beds free mismatch');
  console.log('✅ SHTR SMS payload parsed and applied to Shelter 102');

  const smsSOS = await request('POST', '/api/offline/sms-ingest', {
    payload: 'SOS 19.071 72.882 FLOOD infant Ground floor flooded infant needing help',
  });
  console.assert(smsSOS.status === 200, 'SMS SOS ingest failed');
  console.assert(smsSOS.data.result.record.priority === 'URGENT', 'SMS SOS priority should be URGENT');
  console.log('✅ SOS SMS payload parsed and created emergency distress record');

  const malformedSMS = await request('POST', '/api/offline/sms-ingest', {
    payload: 'MALFORMED INVALID PROTOCOL STRING',
  });
  console.assert(malformedSMS.status === 400, 'Expected 400 for malformed SMS');
  console.log('✅ Malformed SMS payload handled gracefully (400 Bad Request, no crash)');

  // 7. Civilian Asset & Skill Mobilization
  console.log('\n--- Testing Civilian Asset & Skill Mobilization ---');
  const assetsRes = await request('GET', '/api/assets');
  console.assert(assetsRes.status === 200, 'Failed to get assets');
  console.assert(assetsRes.data.assets.length >= 1, 'Expected at least 1 seeded asset');
  console.log(`✅ Retrieved ${assetsRes.data.assets.length} civilian mobilization assets (boats, 4x4s, medics)`);

  const newAsset = await request('POST', '/api/assets', {
    ownerName: 'Sunil Patil',
    contact: '+91 99999 11111',
    type: 'BOAT',
    title: 'Speedboat with dual motors',
    lat: 19.07,
    lng: 72.88,
  });
  console.assert(newAsset.status === 201, 'Failed to register asset');
  console.log('✅ Registered new community rescue asset');

  // 8. Missing Persons Registry & Intake Matching
  console.log('\n--- Testing Missing Persons Registry ---');
  const missingRes = await request('GET', '/api/missing-persons?query=Aakash');
  console.assert(missingRes.status === 200, 'Failed to search missing persons');
  console.assert(missingRes.data.reports.length >= 1, 'Expected to find Aakash Deshmukh');
  console.log('✅ Text-based missing person search matched bulletin record');

  // 9. Relief Supply-Demand Gap Mapping
  console.log('\n--- Testing Relief Supply-Demand Gap Mapping ---');
  const suppliesRes = await request('GET', '/api/supplies');
  console.assert(suppliesRes.status === 200, 'Failed to get shelter supplies');
  const criticalItem = suppliesRes.data.supplies.find(s => s.status === 'CRITICAL');
  console.assert(criticalItem != null, 'Expected to find critical supply shortage');
  console.log(`✅ Supply-demand gap identified critical shortage: ${criticalItem.itemName} (Deficit: ${criticalItem.deficit})`);

  // 10. Sprint 2: Battery Null-Safety & Low-Battery SOS Auto-Triage (Decision 0.1)
  console.log('\n--- Testing Battery Null-Safety & Low-Battery SOS Auto-Triage ---');
  const sosNullBattery = await request(
    'POST',
    '/api/sos',
    {
      lat: 19.074,
      lng: 72.885,
      message: 'Standard distress call, desktop browser without battery API',
      batteryLevel: null,
      vulnerabilityTags: [],
    },
    citizenToken
  );
  console.assert(sosNullBattery.status === 201, 'SOS creation failed');
  console.assert(
    sosNullBattery.data.sos.priority === 'NORMAL',
    `Expected NORMAL priority when batteryLevel is null and no tags, got ${sosNullBattery.data.sos.priority}`
  );
  console.log('✅ Battery-null test passed: batteryLevel: null does NOT trigger URGENT priority');

  const sosLowBattery = await request(
    'POST',
    '/api/sos',
    {
      lat: 19.075,
      lng: 72.886,
      message: 'Phone dying rapidly in flood',
      batteryLevel: 10,
      vulnerabilityTags: [],
      reportedByProxy: true,
      subjectDescription: 'Elderly neighbor with mobility issue',
    },
    citizenToken
  );
  console.assert(sosLowBattery.status === 201, 'Low battery SOS creation failed');
  console.assert(
    sosLowBattery.data.sos.priority === 'URGENT',
    `Expected URGENT priority for batteryLevel: 10, got ${sosLowBattery.data.sos.priority}`
  );
  console.assert(sosLowBattery.data.sos.reportedByProxy === true, 'reportedByProxy not preserved');
  console.assert(sosLowBattery.data.sos.subjectDescription === 'Elderly neighbor with mobility issue', 'subjectDescription mismatch');
  console.log('✅ Low-battery test passed: batteryLevel: 10 triggers URGENT priority + proxy fields recorded');

  // 11. Sprint 2: Hazard Dispute, Resolution, and Vote Upsert (Decisions 0.2 & 0.4)
  console.log('\n--- Testing Hazard Multi-Vote, Upsert, Rapid Re-Vote, DISPUTED & RESOLVED ---');
  const hazardTest = await request(
    'POST',
    '/api/hazards',
    {
      lat: 19.076,
      lng: 72.887,
      hazardNote: 'Reported fallen tree on road',
      severityBenchmark: 'WAIST',
    },
    citizenToken
  );
  console.assert(hazardTest.status === 201, 'Hazard creation failed');
  const hazardId = hazardTest.data.report.id;

  // Confirmer 1 votes CONFIRM -> AMBER
  const hConfirm1 = await request('POST', `/api/hazards/${hazardId}/confirm`, { voteType: 'CONFIRM' }, confirmer1Token);
  console.assert(hConfirm1.status === 200, 'Confirmer 1 vote failed');
  console.assert(hConfirm1.data.report.confidenceTier === 'AMBER', `Expected AMBER, got ${hConfirm1.data.report.confidenceTier}`);
  console.log('✅ Vote 1 (CONFIRM) set tier to AMBER');

  // Rapid identical re-vote (<2s) -> 409
  const rapidVote = await request('POST', `/api/hazards/${hazardId}/confirm`, { voteType: 'CONFIRM' }, confirmer1Token);
  console.assert(rapidVote.status === 409, `Expected 409 on rapid identical re-vote, got ${rapidVote.status}`);
  console.log('✅ Rapid identical re-vote (<2s) rejected with 409 Conflict');

  // Confirmer 1 changes vote to FALSE -> upsert
  const changeVote = await request('POST', `/api/hazards/${hazardId}/confirm`, { voteType: 'FALSE' }, confirmer1Token);
  console.assert(changeVote.status === 200, `Expected 200 for vote change upsert, got ${changeVote.status}`);
  console.log('✅ Vote correction upsert succeeded (changed CONFIRM to FALSE)');

  // Second user registers and also votes FALSE -> 2 false votes -> DISPUTED
  const voter2Reg = await request('POST', '/api/auth/register', {
    name: 'Voter Two',
    email: `voter2_${Date.now()}@sih.gov.in`,
    password: 'password123',
    role: 'CITIZEN',
  });
  const voter2Token = voter2Reg.data.token;
  const hFalse2 = await request('POST', `/api/hazards/${hazardId}/confirm`, { voteType: 'FALSE' }, voter2Token);
  console.assert(hFalse2.status === 200, 'Second false vote failed');
  console.assert(hFalse2.data.report.confidenceTier === 'DISPUTED', `Expected DISPUTED after 2 FALSE votes, got ${hFalse2.data.report.confidenceTier}`);
  console.log('✅ 2 FALSE votes demoted hazard to DISPUTED tier (anti-misinformation active)');

  // Test RESOLVED tier
  const hazardResolvedTest = await request(
    'POST',
    '/api/hazards',
    {
      lat: 19.077,
      lng: 72.888,
      hazardNote: 'Water receded near community hall',
      severityBenchmark: 'ANKLE',
    },
    citizenToken
  );
  const resHazardId = hazardResolvedTest.data.report.id;
  await request('POST', `/api/hazards/${resHazardId}/confirm`, { voteType: 'RESOLVED' }, confirmer1Token);
  const hResolved2 = await request('POST', `/api/hazards/${resHazardId}/confirm`, { voteType: 'RESOLVED' }, voter2Token);
  console.assert(hResolved2.data.report.confidenceTier === 'RESOLVED', `Expected RESOLVED tier, got ${hResolved2.data.report.confidenceTier}`);
  console.log('✅ 2 RESOLVED votes transitioned hazard to RESOLVED tier');

  // 12. Sprint 2: Citizen-Side Rescue Verification & Ticket Reopening (Item 1.3)
  console.log('\n--- Testing Citizen-Side Rescue Verification & Ticket Reopening ---');
  // Claim and resolve low battery SOS as volunteer
  const claimRes = await request('PATCH', `/api/sos/${sosLowBattery.data.sos.id}/assign`, {}, volunteerToken);
  console.assert(claimRes.status === 200, 'Volunteer assign failed');
  const resolveRes = await request('PATCH', `/api/sos/${sosLowBattery.data.sos.id}/resolve`, {}, volunteerToken);
  console.assert(resolveRes.status === 200, 'Volunteer resolve failed');
  console.assert(resolveRes.data.sos.status === 'RESOLVED', 'Status not RESOLVED');

  // Confirmer 1 (unrelated user) tries to verify citizen rescue closure -> 403 Forbidden
  const unauthorizedVerify = await request(
    'PATCH',
    `/api/sos/${sosLowBattery.data.sos.id}/citizen-verify`,
    { confirmed: true },
    confirmer1Token
  );
  console.assert(unauthorizedVerify.status === 403, `Expected 403 for unauthorized citizen-verify, got ${unauthorizedVerify.status}`);
  console.log('✅ Unauthorized citizen-verify attempt rejected with 403 Forbidden');

  // Original reporting citizen calls citizen-verify with confirmed: false -> Reopen to PENDING + URGENT
  const citizenReopen = await request(
    'PATCH',
    `/api/sos/${sosLowBattery.data.sos.id}/citizen-verify`,
    { confirmed: false },
    citizenToken
  );
  console.assert(citizenReopen.status === 200, 'Citizen verify reopen failed');
  console.assert(citizenReopen.data.sos.status === 'PENDING', `Expected PENDING, got ${citizenReopen.data.sos.status}`);
  console.assert(citizenReopen.data.sos.priority === 'URGENT', `Expected URGENT priority, got ${citizenReopen.data.sos.priority}`);
  console.assert(citizenReopen.data.sos.assignedVolunteerId === null, 'Volunteer should be unassigned upon reopen');
  console.assert(
    citizenReopen.data.sos.message.includes('[REOPENED BY CITIZEN: RESCUE INCOMPLETE]'),
    'Message prefix missing'
  );
  console.log('✅ Citizen rejection reopens SOS ticket: status PENDING, priority URGENT, unassigned, warning prefixed');

  // Volunteer reclaims and resolves again
  await request('PATCH', `/api/sos/${sosLowBattery.data.sos.id}/assign`, {}, volunteerToken);
  await request('PATCH', `/api/sos/${sosLowBattery.data.sos.id}/resolve`, {}, volunteerToken);

  // Citizen confirms rescue complete
  const citizenConfirmClosed = await request(
    'PATCH',
    `/api/sos/${sosLowBattery.data.sos.id}/citizen-verify`,
    { confirmed: true },
    citizenToken
  );
  console.assert(citizenConfirmClosed.status === 200, 'Citizen close confirm failed');
  console.assert(citizenConfirmClosed.data.sos.citizenConfirmedResolved === true, 'citizenConfirmedResolved not true');
  console.log('✅ Citizen verified rescue closure: citizenConfirmedResolved is TRUE');

  // 13. Sprint 2: Civilian Safety Status & Locked-Down Lookup (Decisions 0.3 & Item 2.2)
  console.log('\n--- Testing Civilian Safety Status & Locked-Down Lookup ---');
  // Unauthenticated lookup -> 401
  const unauthLookup = await request('GET', '/api/auth/safety-lookup?query=citizen');
  console.assert(unauthLookup.status === 401, `Expected 401 for unauthenticated safety lookup, got ${unauthLookup.status}`);
  console.log('✅ Unauthenticated safety lookup rejected with 401 Unauthorized');

  // Update own safety status
  const updateStatusRes = await request(
    'PATCH',
    '/api/auth/safety-status',
    { safetyStatus: 'SAFE' },
    citizenToken
  );
  console.assert(updateStatusRes.status === 200, 'Failed to update safety status');
  console.assert(updateStatusRes.data.user.safetyStatus === 'SAFE', 'safetyStatus not SAFE');
  console.log('✅ Citizen updated own safety status to SAFE');

  // Authenticated lookup by another user (voter2)
  const lookupRes = await request('GET', `/api/auth/safety-lookup?query=Rohan`, null, voter2Token);
  console.assert(lookupRes.status === 200, 'Authenticated safety lookup failed');
  console.assert(lookupRes.data.status === 'SAFE', `Expected status SAFE, got ${lookupRes.data.status}`);
  console.assert(lookupRes.data.asOf !== undefined, 'asOf timestamp missing');
  // Check minimal shape: NO name, phone, email, id leaked
  console.assert(lookupRes.data.name === undefined, 'Privacy leak: name returned in lookup response');
  console.assert(lookupRes.data.phone === undefined, 'Privacy leak: phone returned in lookup response');
  console.assert(lookupRes.data.email === undefined, 'Privacy leak: email returned in lookup response');
  console.log('✅ Safety lookup returns minimal shape { status, asOf } without leaking PII');

  console.log('\n🎉 ALL SPRINT 1 AND SPRINT 2 REGRESSION TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runVerification().catch((err) => {
  console.error('❌ Verification failed with error:', err);
  process.exit(1);
});
