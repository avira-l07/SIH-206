const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inventory, clientCalls, matching } = require('../scripts/route-inventory');
test('all literal frontend API actions map to a mounted backend route', () => {
  const routes = inventory(), calls = clientCalls();
  assert.ok(calls.length > 30);
  for (const call of calls) assert.ok(routes.some(route => matching(route, call)), `${call.file}: ${call.method} ${call.route} has no backend route`);
  assert.ok(routes.some(route => route.route === '/api/operations/summary'));
});
