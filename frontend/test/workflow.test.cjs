const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

test('every dispatched stage remains visible and progression respects ownership', async () => {
  const { DISPATCHED_STATUSES, NEXT_STATUS, STATUS_LABELS, canAdvanceSOS } = await import('../src/services/sosWorkflow.js');
  let status = 'EN_ROUTE';
  for (const expected of ['EN_ROUTE', 'ON_SCENE', 'EVACUATED', 'HANDED_OVER_TO_MEDICAL']) {
    assert.equal(status, expected); assert.ok(DISPATCHED_STATUSES.includes(status)); assert.ok(STATUS_LABELS[status]);
    assert.equal(canAdvanceSOS({ status, assignedVolunteerId: 2 }, { id: 2, role: 'VOLUNTEER' }), true);
    assert.equal(canAdvanceSOS({ status, assignedVolunteerId: 2 }, { id: 3, role: 'VOLUNTEER' }), false);
    status = NEXT_STATUS[status];
  }
  assert.equal(status, 'RESOLVED');
  assert.equal(canAdvanceSOS({ status, assignedVolunteerId: 2 }, { id: 2, role: 'VOLUNTEER' }), false);
});
test('unmounting one socket consumer preserves another consumer on the same event', async () => {
  const { subscribeSocketEvents } = await import('../src/services/socketEvents.js');
  const socket = new EventEmitter(); let first = 0, second = 0;
  const closeFirst = subscribeSocketEvents(socket, { 'sos:created': () => first++ });
  const closeSecond = subscribeSocketEvents(socket, { 'sos:created': () => second++ });
  socket.emit('sos:created'); closeFirst(); socket.emit('sos:created');
  assert.equal(first, 1); assert.equal(second, 2); closeSecond(); assert.equal(socket.listenerCount('sos:created'), 0);
});

test('direct routes and legacy hashes resolve with explicit role requirements and unknown routes', async () => {
  const { resolveRoute } = await import('../src/services/navigation.js');
  assert.equal(resolveRoute('/login').view, 'login'); assert.equal(resolveRoute('/register/').view, 'register');
  assert.equal(resolveRoute('/alerts').view, 'public-alerts'); assert.equal(resolveRoute('/operator').requiredRole, 'ADMIN');
  assert.equal(resolveRoute('/volunteer').requiredRole, 'VOLUNTEER'); assert.equal(resolveRoute('/citizen').requiredRole, 'CITIZEN');
  assert.equal(resolveRoute('/anything').view, 'not-found'); assert.equal(resolveRoute('/', '#console').view, 'dashboard');
});

test('simple request views keep assignments scoped and put urgent calls first', async () => {
  const { responseTabs, responsesForView } = await import('../src/services/responseViews.js');
  const tickets = [
    { id: 1, status: 'EN_ROUTE', assignedVolunteerId: 2, createdAt: '2026-01-01', priority: 'NORMAL' },
    { id: 2, status: 'ON_SCENE', assignedVolunteerId: 3, createdAt: '2026-01-02', priority: 'URGENT' },
    { id: 3, status: 'VERIFIED', assignedVolunteerId: null, createdAt: '2026-01-03', priority: 'NORMAL' },
    { id: 4, status: 'PENDING', assignedVolunteerId: null, createdAt: '2026-01-04', priority: 'URGENT' },
    { id: 5, status: 'RESOLVED', assignedVolunteerId: 2, createdAt: '2026-01-05', priority: 'NORMAL' },
  ];
  const volunteer = { id: 2, role: 'VOLUNTEER' }, operator = { id: 9, role: 'ADMIN' };
  assert.equal(responseTabs(volunteer)[0].id, 'MINE'); assert.equal(responseTabs(operator)[0].id, 'WAITING');
  assert.deepEqual(responsesForView(tickets, 'MINE', volunteer).map(t => t.id), [1]);
  assert.deepEqual(responsesForView(tickets, 'AVAILABLE', volunteer).map(t => t.id), [3]);
  assert.deepEqual(responsesForView(tickets, 'WAITING', operator).map(t => t.id), [4, 3]);
  assert.deepEqual(responsesForView(tickets, 'CLOSED', volunteer).map(t => t.id), [5]);
});


test('operator attention includes overdue acknowledgments and replacement requests without exposing other volunteers assignments', async () => {
  const { responsesForView } = await import('../src/services/responseViews.js');
  const tickets = [
    { id: 1, status: 'EN_ROUTE', assignedVolunteerId: 2, acknowledgmentDueAt: '2026-01-01T00:00:00Z', assignmentAcknowledgedAt: null, createdAt: '2026-01-01' },
    { id: 2, status: 'ON_SCENE', assignedVolunteerId: 3, handoffRequestedAt: '2026-01-02', createdAt: '2026-01-02' },
    { id: 3, status: 'EN_ROUTE', assignedVolunteerId: 2, acknowledgmentDueAt: '2026-01-01T00:00:00Z', assignmentAcknowledgedAt: '2026-01-01', createdAt: '2026-01-03' },
    { id: 4, status: 'RESOLVED', handoffRequestedAt: '2026-01-01', createdAt: '2026-01-04' },
  ];
  assert.deepEqual(responsesForView(tickets, 'WAITING', {role:'ADMIN'}, Date.parse('2026-01-10')).map(s=>s.id), [1,2]);
  assert.deepEqual(responsesForView(tickets, 'MINE', {id:2,role:'VOLUNTEER'}).map(s=>s.id), [1,3]);
});

test('dashboard refresh preserves successful sections and refuses responses superseded by newer state', async () => {
  const { refreshSections } = await import('../src/services/dashboardRefresh.js');
  let alerts = 'old', shelters = 'old';
  const sections = [{label:'Alerts',load:async()=> 'fresh',apply:value=>alerts=value},{label:'Shelters',load:async()=>{throw Error('offline');},apply:value=>shelters=value}];
  const result = await refreshSections(sections);
  assert.equal(alerts,'fresh');assert.equal(shelters,'old');assert.deepEqual(result.failed,['Shelters']);
  alerts='newer socket data'; const stale=await refreshSections(sections,()=>false);
  assert.equal(stale.applied,false); assert.equal(alerts,'newer socket data');
});
