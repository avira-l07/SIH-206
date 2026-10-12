const jwt = require('jsonwebtoken');
const { ipKeyGenerator } = require('express-rate-limit');
const { JWT_SECRET } = require('./security');
// Signature-verified account IDs are used only for quotas, never for authorization.
// Invalid/expired tokens stay in the IP bucket; token rotation cannot reset an account's quota.
function rateLimitKey(req) {
  if (req.sihQuotaKey) return req.sihQuotaKey;
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '')?.[1];
  if (token) {
    try {
      const claims = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
      if (Number.isSafeInteger(claims.id) && claims.id > 0) return req.sihQuotaKey = 'account:' + claims.id;
    } catch { /* Fall back to the network bucket. Route authentication still runs. */ }
  }
  return req.sihQuotaKey = 'network:' + ipKeyGenerator(req.ip || req.socket?.remoteAddress || 'unknown');
}
module.exports = { rateLimitKey };
