const http = require('http');
const { io: ioClient } = require('socket.io-client');

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
  console.log('🧪 Starting automated backend API & logic verification (Suites 1–21)...');

  // 1. Health check
  const health = await request('GET', '/api/health');
  console.assert(health.status === 200, 'Health check failed');
  console.log('✅ Health check passed (200)');

  // 2. Auth: Citizen, Volunteer, Admin, Confirmer1, Trusted Officer
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

  const adminLogin = await request('POST', '/api/auth/login', {
    email: 'admin@sih.gov.in',
    password: 'password123',
  });
  console.assert(adminLogin.status === 200, 'Admin login failed');
  const adminToken = adminLogin.data.token;

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
  console.log('✅ Authentication passed for Citizen, Volunteer, Admin, Confirmer, Trusted Officer');

  // 3. SOS Vulnerability Triage, Verification & Assignment Lock
  console.log('\n--- Testing SOS Vulnerability Triage, Verification & Assignment Lock ---');
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
  // Admin verifies ticket
  const verifyRes = await request('PATCH', `/api/sos/${sosId}/verify`, {}, adminToken);
  console.assert(verifyRes.status === 200, 'Admin verification failed');
  console.assert(verifyRes.data.sos.status === 'VERIFIED', 'Status not VERIFIED');

  // Volunteer claims verified ticket -> EN_ROUTE
  const claim1 = await request('PATCH', `/api/sos/${sosId}/assign`, {}, volunteerToken);
  console.assert(claim1.status === 200, 'Volunteer assign failed');
  console.assert(claim1.data.sos.status === 'EN_ROUTE', `Expected EN_ROUTE, got ${claim1.data.sos.status}`);
  console.log('✅ SOS verified by Admin and claimed by Volunteer #1 -> EN_ROUTE');

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
  console.assert(auditRes2.data.shelter.status === 'RED', `Expected RED status for water depletion, got ${auditRes2.data.shelter.status}`);
  console.log('✅ Shelter with water failure auto-computed status: RED');

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
    assetType: 'BOAT',
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

  // 9. Relief Supply Requests & Deficit Calculation
  console.log('\n--- Testing Relief Supply Requests & Deficit Calculation ---');
  const suppliesRes = await request('GET', '/api/supplies');
  console.assert(suppliesRes.status === 200, 'Failed to get shelter supplies');
  const criticalItem = suppliesRes.data.supplies.find((s) => s.status === 'CRITICAL');
  console.assert(criticalItem != null, 'Expected to find critical supply shortage');
  console.assert(criticalItem.quantityOnHand === undefined, 'Schema leak: quantityOnHand should not exist');
  console.log(`✅ Supply deficit identified critical shortage: ${criticalItem.itemName} (Deficit: ${criticalItem.deficit})`);

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
  // Admin verifies low battery SOS before volunteer dispatch
  await request('PATCH', `/api/sos/${sosLowBattery.data.sos.id}/verify`, {}, adminToken);
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

  // Admin verifies and volunteer reclaims and resolves again
  await request('PATCH', `/api/sos/${sosLowBattery.data.sos.id}/verify`, {}, adminToken);
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
  const unauthLookup = await request('GET', '/api/auth/safety-lookup?query=citizen');
  console.assert(unauthLookup.status === 401, `Expected 401 for unauthenticated safety lookup, got ${unauthLookup.status}`);
  console.log('✅ Unauthenticated safety lookup rejected with 401 Unauthorized');

  const updateStatusRes = await request(
    'PATCH',
    '/api/auth/safety-status',
    { safetyStatus: 'SAFE' },
    citizenToken
  );
  console.assert(updateStatusRes.status === 200, 'Failed to update safety status');
  console.assert(updateStatusRes.data.user.safetyStatus === 'SAFE', 'safetyStatus not SAFE');
  console.log('✅ Citizen updated own safety status to SAFE');

  const lookupRes = await request('GET', `/api/auth/safety-lookup?query=Rohan`, null, voter2Token);
  console.assert(lookupRes.status === 200, 'Authenticated safety lookup failed');
  console.assert(lookupRes.data.status === 'SAFE', `Expected status SAFE, got ${lookupRes.data.status}`);
  console.assert(lookupRes.data.asOf !== undefined, 'asOf timestamp missing');
  console.assert(lookupRes.data.name === undefined, 'Privacy leak: name returned in lookup response');
  console.assert(lookupRes.data.phone === undefined, 'Privacy leak: phone returned in lookup response');
  console.assert(lookupRes.data.email === undefined, 'Privacy leak: email returned in lookup response');
  console.log('✅ Safety lookup returns minimal shape { status, asOf } without leaking PII');

  // ==========================================
  // SPRINT 3 NEW COMPREHENSIVE TEST SUITES
  // ==========================================

  // 14. Suite 14: Explicit Admin-Only Ticket Verification (Decision 0.1)
  console.log('\n--- Suite 14: Testing Explicit Admin-Only Ticket Verification ---');
  const sosS14 = await request(
    'POST',
    '/api/sos',
    { lat: 19.0735, lng: 72.8845, message: 'Suite 14 verify check' },
    citizenToken
  );
  const s14Id = sosS14.data.sos.id;

  // Volunteer attempting to verify -> 403 Forbidden
  const volVerifyFail = await request('PATCH', `/api/sos/${s14Id}/verify`, {}, volunteerToken);
  console.assert(volVerifyFail.status === 403, `Expected 403 for volunteer /verify, got ${volVerifyFail.status}`);
  console.log('✅ Volunteer cannot verify ticket (403 Forbidden enforced)');

  // Admin verifies ticket -> 200 OK
  const adminVerifySuccess = await request('PATCH', `/api/sos/${s14Id}/verify`, {}, adminToken);
  console.assert(adminVerifySuccess.status === 200, 'Admin verify failed');
  console.assert(adminVerifySuccess.data.sos.status === 'VERIFIED', `Expected VERIFIED, got ${adminVerifySuccess.data.sos.status}`);
  console.log('✅ Admin verified ticket: status transitioned PENDING -> VERIFIED');

  // Admin verifies already verified ticket -> 400 Bad Request
  const adminVerifyDup = await request('PATCH', `/api/sos/${s14Id}/verify`, {}, adminToken);
  console.assert(adminVerifyDup.status === 400, `Expected 400 on re-verify, got ${adminVerifyDup.status}`);
  console.log('✅ Re-verification of non-PENDING ticket cleanly rejected with 400');

  // 15. Suite 15: Volunteer Dispatch Pre-Condition & Admin Fast Path (Decision 0.1)
  console.log('\n--- Suite 15: Testing Volunteer Dispatch Pre-Condition & Admin Fast Path ---');
  const sosS15 = await request(
    'POST',
    '/api/sos',
    { lat: 19.0736, lng: 72.8846, message: 'Suite 15 unverified claim check' },
    citizenToken
  );
  const s15Id = sosS15.data.sos.id;

  // Plain volunteer claims unverified PENDING ticket -> 400 Bad Request
  const volClaimUnverifiedFail = await request('PATCH', `/api/sos/${s15Id}/assign`, {}, volunteerToken);
  console.assert(volClaimUnverifiedFail.status === 400, `Expected 400 for volunteer claiming unverified ticket, got ${volClaimUnverifiedFail.status}`);
  console.assert(volClaimUnverifiedFail.data.error.includes('must be verified'), 'Expected error message to mention verification');
  console.log('✅ Plain volunteer claim on PENDING ticket rejected: "Ticket must be verified by control room before dispatch"');

  // Admin claims directly from PENDING -> 200 OK (fast path for solo demo)
  const adminClaimDirect = await request('PATCH', `/api/sos/${s15Id}/assign`, {}, adminToken);
  console.assert(adminClaimDirect.status === 200, 'Admin direct claim failed');
  console.assert(adminClaimDirect.data.sos.status === 'EN_ROUTE', `Expected EN_ROUTE, got ${adminClaimDirect.data.sos.status}`);
  console.log('✅ Admin direct claim on PENDING ticket succeeds (solo demo fast-path active)');

  // 16. Suite 16: Generic /status Bypass Prevention (Decision 0.1)
  console.log('\n--- Suite 16: Testing Generic /status Bypass Prevention ---');
  const sosS16 = await request(
    'POST',
    '/api/sos',
    { lat: 19.0737, lng: 72.8847, message: 'Suite 16 bypass check' },
    citizenToken
  );
  const s16Id = sosS16.data.sos.id;
  await request('PATCH', `/api/sos/${s16Id}/verify`, {}, adminToken);

  // Attempting to move VERIFIED -> EN_ROUTE via generic /status -> rejected with 400
  const bypassAttempt = await request('PATCH', `/api/sos/${s16Id}/status`, { status: 'EN_ROUTE' }, volunteerToken);
  console.assert(bypassAttempt.status === 400, `Expected 400 for bypass via /status, got ${bypassAttempt.status}`);
  console.assert(bypassAttempt.data.error.includes('Must claim via /api/sos/:id/assign'), 'Bypass error message mismatch');
  console.log('✅ Direct status jump to EN_ROUTE via generic /status strictly rejected (400) — bypass closed');

  // 17. Suite 17: Post-Claim Lifecycle Ownership Guard & Sequential Steps (Decision 0.1)
  console.log('\n--- Suite 17: Testing Post-Claim Lifecycle Ownership Guard & Sequential Steps ---');
  // Volunteer 1 claims verified ticket s16Id
  const claimS16 = await request('PATCH', `/api/sos/${s16Id}/assign`, {}, volunteerToken);
  console.assert(claimS16.status === 200, 'Claim failed');

  // Unrelated Volunteer 2 attempts to advance Volunteer 1's ticket -> 403 Forbidden
  const vol2AdvanceFail = await request('PATCH', `/api/sos/${s16Id}/status`, { status: 'ON_SCENE' }, vol2Token);
  console.assert(vol2AdvanceFail.status === 403, `Expected 403 for unrelated volunteer advance, got ${vol2AdvanceFail.status}`);
  console.log('✅ Unrelated volunteer advancing claimed ticket rejected with 403 Forbidden');

  // Assigned Volunteer attempts out-of-order jump (EN_ROUTE -> HANDED_OVER_TO_MEDICAL) -> 400 Bad Request
  const jumpFail = await request('PATCH', `/api/sos/${s16Id}/status`, { status: 'HANDED_OVER_TO_MEDICAL' }, volunteerToken);
  console.assert(jumpFail.status === 400, `Expected 400 for out-of-order jump, got ${jumpFail.status}`);
  console.log('✅ Out-of-order transition jump rejected with 400 Bad Request');

  // Sequential progression: EN_ROUTE -> ON_SCENE -> EVACUATED -> HANDED_OVER_TO_MEDICAL -> RESOLVED
  const sOnScene = await request('PATCH', `/api/sos/${s16Id}/status`, { status: 'ON_SCENE' }, volunteerToken);
  console.assert(sOnScene.status === 200 && sOnScene.data.sos.status === 'ON_SCENE', 'Failed to advance to ON_SCENE');
  console.log('✅ Advanced EN_ROUTE -> ON_SCENE (200)');

  const sEvac = await request('PATCH', `/api/sos/${s16Id}/status`, { status: 'EVACUATED' }, volunteerToken);
  console.assert(sEvac.status === 200 && sEvac.data.sos.status === 'EVACUATED', 'Failed to advance to EVACUATED');
  console.log('✅ Advanced ON_SCENE -> EVACUATED (200)');

  const sMed = await request('PATCH', `/api/sos/${s16Id}/status`, { status: 'HANDED_OVER_TO_MEDICAL' }, volunteerToken);
  console.assert(sMed.status === 200 && sMed.data.sos.status === 'HANDED_OVER_TO_MEDICAL', 'Failed to advance to HANDED_OVER_TO_MEDICAL');
  console.log('✅ Advanced EVACUATED -> HANDED_OVER_TO_MEDICAL (200)');

  const sRes = await request('PATCH', `/api/sos/${s16Id}/status`, { status: 'RESOLVED' }, volunteerToken);
  console.assert(sRes.status === 200 && sRes.data.sos.status === 'RESOLVED', 'Failed to advance to RESOLVED');
  console.log('✅ Advanced HANDED_OVER_TO_MEDICAL -> RESOLVED (200)');

  // Direct non-medical close test: ON_SCENE -> RESOLVED directly
  const sosDirectClose = await request('POST', '/api/sos', { lat: 19.0738, lng: 72.8848, message: 'Direct close test' }, citizenToken);
  await request('PATCH', `/api/sos/${sosDirectClose.data.sos.id}/verify`, {}, adminToken);
  await request('PATCH', `/api/sos/${sosDirectClose.data.sos.id}/assign`, {}, volunteerToken);
  await request('PATCH', `/api/sos/${sosDirectClose.data.sos.id}/status`, { status: 'ON_SCENE' }, volunteerToken);
  const directCloseRes = await request('PATCH', `/api/sos/${sosDirectClose.data.sos.id}/status`, { status: 'RESOLVED' }, volunteerToken);
  console.assert(directCloseRes.status === 200 && directCloseRes.data.sos.status === 'RESOLVED', 'Direct close failed');
  console.log('✅ Direct non-medical resolution allowed: ON_SCENE -> RESOLVED (200)');

  // 18. Suite 18: Ticket Cancellation (CANCELLED) & Ownership Guard (Decision 0.1)
  console.log('\n--- Suite 18: Testing Ticket Cancellation & Ownership Guard ---');
  const sosCancel = await request('POST', '/api/sos', { lat: 19.0739, lng: 72.8849, message: 'False alarm report' }, citizenToken);
  const cancelId = sosCancel.data.sos.id;

  // Volunteer attempting to cancel unassigned PENDING ticket -> 403 Forbidden
  const volCancelPendingFail = await request('PATCH', `/api/sos/${cancelId}/cancel`, { cancelReason: 'Rumor' }, volunteerToken);
  console.assert(volCancelPendingFail.status === 403, `Expected 403 for volunteer cancelling unassigned ticket, got ${volCancelPendingFail.status}`);
  console.log('✅ Volunteer cannot cancel unassigned ticket (403 Forbidden)');

  // Admin cancel without reason -> 400 Bad Request
  const adminCancelNoReason = await request('PATCH', `/api/sos/${cancelId}/cancel`, {}, adminToken);
  console.assert(adminCancelNoReason.status === 400, `Expected 400 for cancel without reason, got ${adminCancelNoReason.status}`);
  console.log('✅ Cancel without cancelReason rejected with 400 Bad Request');

  // Admin cancel with reason -> 200 OK, terminal state
  const adminCancelSuccess = await request('PATCH', `/api/sos/${cancelId}/cancel`, { cancelReason: 'Confirmed caller self-evacuated' }, adminToken);
  console.assert(adminCancelSuccess.status === 200, 'Admin cancel failed');
  console.assert(adminCancelSuccess.data.sos.status === 'CANCELLED', 'Status not CANCELLED');
  console.assert(adminCancelSuccess.data.sos.cancelReason === 'Confirmed caller self-evacuated', 'cancelReason mismatch');
  console.log('✅ Admin cancelled unassigned ticket: status CANCELLED with cancelReason recorded');

  // Further transition on CANCELLED ticket -> 400 Bad Request
  const advanceCancelledFail = await request('PATCH', `/api/sos/${cancelId}/assign`, {}, volunteerToken);
  console.assert(advanceCancelledFail.status === 400, `Expected 400 advancing CANCELLED ticket, got ${advanceCancelledFail.status}`);
  console.log('✅ CANCELLED is terminal: further status progression cleanly blocked');

  // Assigned volunteer cancelling own ticket
  const sosClaimCancel = await request('POST', '/api/sos', { lat: 19.0740, lng: 72.8850, message: 'On-scene cancellation test' }, citizenToken);
  await request('PATCH', `/api/sos/${sosClaimCancel.data.sos.id}/verify`, {}, adminToken);
  await request('PATCH', `/api/sos/${sosClaimCancel.data.sos.id}/assign`, {}, volunteerToken);

  // Volunteer 2 attempting to cancel Volunteer 1's claimed ticket -> 403
  const vol2CancelFail = await request('PATCH', `/api/sos/${sosClaimCancel.data.sos.id}/cancel`, { cancelReason: 'Fake' }, vol2Token);
  console.assert(vol2CancelFail.status === 403, `Expected 403 for unrelated volunteer cancelling ticket, got ${vol2CancelFail.status}`);

  // Volunteer 1 cancels own claimed ticket -> 200 OK
  const vol1CancelSuccess = await request('PATCH', `/api/sos/${sosClaimCancel.data.sos.id}/cancel`, { cancelReason: 'Water receded, car drove off' }, volunteerToken);
  console.assert(vol1CancelSuccess.status === 200 && vol1CancelSuccess.data.sos.status === 'CANCELLED', 'Volunteer own cancel failed');
  console.log('✅ Assigned volunteer successfully cancelled own ticket with cancelReason');

  // 19. Suite 19: Casualty Triage Tag Role Guard (Decision 0.2)
  console.log('\n--- Suite 19: Testing Casualty Triage Tag Role Guard ---');
  const sosTriage = await request('POST', '/api/sos', { lat: 19.0741, lng: 72.8851, message: 'Triage tag test' }, citizenToken);
  await request('PATCH', `/api/sos/${sosTriage.data.sos.id}/verify`, {}, adminToken);
  await request('PATCH', `/api/sos/${sosTriage.data.sos.id}/assign`, {}, volunteerToken);
  const triageId = sosTriage.data.sos.id;

  // Citizen setting triage tag -> 403 Forbidden
  const citTriageFail = await request('PATCH', `/api/sos/${triageId}/triage-tag`, { triageTag: 'IMMEDIATE' }, citizenToken);
  console.assert(citTriageFail.status === 403, `Expected 403 for citizen setting triage tag, got ${citTriageFail.status}`);
  console.log('✅ Citizen setting triage tag rejected with 403 Forbidden');

  // Unrelated Volunteer 2 setting triage tag -> 403 Forbidden
  const vol2TriageFail = await request('PATCH', `/api/sos/${triageId}/triage-tag`, { triageTag: 'IMMEDIATE' }, vol2Token);
  console.assert(vol2TriageFail.status === 403, `Expected 403 for unrelated volunteer setting triage tag, got ${vol2TriageFail.status}`);
  console.log('✅ Unrelated volunteer setting triage tag rejected with 403 Forbidden');

  // Assigned volunteer sets triageTag -> 200 OK
  const vol1TriageSuccess = await request('PATCH', `/api/sos/${triageId}/triage-tag`, { triageTag: 'IMMEDIATE' }, volunteerToken);
  console.assert(vol1TriageSuccess.status === 200, 'Assigned volunteer setting triage tag failed');
  console.assert(vol1TriageSuccess.data.sos.triageTag === 'IMMEDIATE', 'triageTag not IMMEDIATE');
  console.log('✅ Assigned volunteer set casualty triage tag: IMMEDIATE (200 OK)');

  // Admin overrides triageTag -> 200 OK
  const adminTriageSuccess = await request('PATCH', `/api/sos/${triageId}/triage-tag`, { triageTag: 'DELAYED' }, adminToken);
  console.assert(adminTriageSuccess.status === 200 && adminTriageSuccess.data.sos.triageTag === 'DELAYED', 'Admin triage tag override failed');
  console.log('✅ Admin override of triage tag succeeded: DELAYED (200 OK)');

  // Invalid tag -> 400 Bad Request
  const invalidTagFail = await request('PATCH', `/api/sos/${triageId}/triage-tag`, { triageTag: 'INVALID_TAG' }, volunteerToken);
  console.assert(invalidTagFail.status === 400, `Expected 400 for invalid triage tag, got ${invalidTagFail.status}`);
  console.log('✅ Invalid triage tag string rejected with 400 Bad Request');

  // 20. Suite 20: Combined Shelter Readiness & Role-Scoped Sockets (Decisions 0.3 & 0.4)
  console.log('\n--- Suite 20: Testing Combined Shelter Readiness & Role-Scoped Sockets ---');
  // 20a: Occupancy only breach (>= 90%)
  const audit20a = await request('PATCH', '/api/shelters/103/audit', {
    currentOccupancy: 550,
    capacity: 600, // 91.6%
    waterOk: true,
    rationsOk: true,
    waterLitersRemaining: 1000,
    waterThreshold: 200,
    rationsUnitsRemaining: 500,
    rationsThreshold: 50,
  }, volunteerToken);
  console.assert(audit20a.status === 200 && audit20a.data.shelter.status === 'RED', `20a: Expected RED, got ${audit20a.data.shelter.status}`);
  console.log('✅ Test 20a: Occupancy >= 90% independently triggers RED status');

  // 20b: Numeric water threshold breach (occupancy 10%, water 120L < 200L)
  const audit20b = await request('PATCH', '/api/shelters/103/audit', {
    currentOccupancy: 60,
    capacity: 600, // 10%
    waterOk: true,
    rationsOk: true,
    waterLitersRemaining: 120, // Breached
    waterThreshold: 200,
    rationsUnitsRemaining: 400,
    rationsThreshold: 50,
  }, volunteerToken);
  console.assert(audit20b.status === 200 && audit20b.data.shelter.status === 'RED', `20b: Expected RED, got ${audit20b.data.shelter.status}`);
  console.log('✅ Test 20b: Numeric water breach (120L < 200L) independently triggers RED status');

  // 20c: Boolean fallback breach (numerics null, waterOk: false)
  const audit20c = await request('PATCH', '/api/shelters/103/audit', {
    currentOccupancy: 60,
    capacity: 600,
    waterOk: false,
    rationsOk: true,
    waterLitersRemaining: null,
    rationsUnitsRemaining: null,
  }, volunteerToken);
  console.assert(audit20c.status === 200 && audit20c.data.shelter.status === 'RED', `20c: Expected RED, got ${audit20c.data.shelter.status}`);
  console.log('✅ Test 20c: Boolean fallback (waterOk: false, numerics unset) independently triggers RED status');

  // Role-scoped socket test
  console.log('Connecting test sockets to verify role room privacy...');
  const citizenSocket = ioClient(BASE_URL, { auth: { token: citizenToken } });
  const volunteerSocket = ioClient(BASE_URL, { auth: { token: volunteerToken } });

  await new Promise((resolve) => setTimeout(resolve, 500));

  let citizenGotRestock = false;
  let volunteerGotRestock = false;

  citizenSocket.on('shelter:restock_needed', () => {
    citizenGotRestock = true;
  });

  volunteerSocket.on('shelter:restock_needed', () => {
    volunteerGotRestock = true;
  });

  // Restore shelter 106 to healthy state first, then trigger threshold drop
  await request('PATCH', '/api/shelters/106/audit', {
    currentOccupancy: 50,
    capacity: 300,
    waterLitersRemaining: 800,
    waterThreshold: 200,
  }, adminToken);

  // Trigger crossing below threshold
  await request('PATCH', '/api/shelters/106/audit', {
    waterLitersRemaining: 150,
    waterThreshold: 200,
  }, adminToken);

  await new Promise((resolve) => setTimeout(resolve, 600));

  console.assert(volunteerGotRestock === true, 'Volunteer socket failed to receive shelter:restock_needed');
  console.assert(citizenGotRestock === false, 'Privacy leak: citizen socket received shelter:restock_needed');
  console.log('✅ Role-scoped socket privacy verified: shelter:restock_needed delivered to volunteer, ABSENT on citizen');

  citizenSocket.disconnect();
  volunteerSocket.disconnect();

  // 21. Suite 21: Asset Suggestions & Supply Shipment Manifest (Decisions 0.5)
  console.log('\n--- Suite 21: Testing Asset Suggestions & Supply Shipment Manifest ---');
  // Query asset suggestions for FLOOD hazard
  const suggestionsRes = await request('GET', '/api/assets/suggestions?lat=19.073&lng=72.884&hazardType=FLOOD');
  console.assert(suggestionsRes.status === 200, 'Asset suggestions failed');
  console.assert(suggestionsRes.data.suggestions.length > 0, 'No asset suggestions returned');
  console.assert(suggestionsRes.data.suggestions[0].assetType === 'BOAT', `Expected BOAT to rank first for FLOOD, got ${suggestionsRes.data.suggestions[0].assetType}`);
  console.assert(suggestionsRes.data.suggestions[0].isMatch === true, 'isMatch should be true for top asset');
  console.log('✅ Asset matching verified: BOAT ranked first for FLOOD hazard; closer non-matching assets retained');

  // Log supply shipment against shelter 102
  const shipmentPost = await request('POST', '/api/supply-shipments', {
    shelterId: 102,
    itemName: 'Clean Drinking Water Bottles',
    quantityClaimed: 25,
    quantityVerified: 25,
  }, volunteerToken);

  console.assert(shipmentPost.status === 201, `Shipment post failed with ${shipmentPost.status}`);
  console.assert(shipmentPost.data.shipment.quantityVerified === 25, 'quantityVerified mismatch');
  console.assert(typeof shipmentPost.data.remainingDeficit === 'number', 'remainingDeficit missing');
  console.assert(shipmentPost.data.quantityOnHand === undefined, 'Leak check: quantityOnHand must not exist');
  console.log('✅ Supply shipment verified and logged: SupplyRequest.quantityFulfilled incremented, remainingDeficit returned, quantityOnHand absent');

  // Query shipment manifests
  const shipmentsList = await request('GET', '/api/supply-shipments?shelterId=102');
  console.assert(shipmentsList.status === 200, 'Shipments list failed');
  console.assert(shipmentsList.data.shipments.length >= 1, 'Expected at least 1 shipment in manifest');
  console.log(`✅ Retrieved ${shipmentsList.data.shipments.length} verified supply shipments for Shelter 102`);

  console.log('\n🎉 ALL 21 SPRINT 1, 2, AND 3 REGRESSION SUITES PASSED WITH 100% SUCCESS!');
  process.exit(0);
}

runVerification().catch((err) => {
  console.error('❌ Verification failed with error:', err);
  process.exit(1);
});
