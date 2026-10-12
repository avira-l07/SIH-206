const { randomBytes } = require('crypto');
const production = process.env.NODE_ENV === 'production';
const candidateSecret = process.env.JWT_SECRET;
const configuredSecret = candidateSecret && !['0f62d848616b64ca89624e004c7266f6f152f2940eaa280842fddc6b8220c221', 'sih26206-disaster-response-jwt-secret-key-2026'].includes(candidateSecret) ? candidateSecret : null;
if (production && (!configuredSecret || Buffer.byteLength(configuredSecret) < 32)) {
  throw new Error('Production requires JWT_SECRET with at least 32 bytes of random secret material');
}
const JWT_SECRET = configuredSecret || randomBytes(48).toString('hex');
if (!configuredSecret) console.warn('[Auth] Using an ephemeral development signing key; sessions expire on restart.');
function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (origin === 'null') return false;
  const configured = (process.env.CORS_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean);
  if (configured.includes(origin)) return true;
  if (production) return false;
  try {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) return false;
    return /^(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/.test(url.hostname);
  } catch { return false; }
}
function isAllowedPushEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || endpoint.length > 2048) return false;
    const host = url.hostname.toLowerCase();
    return host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' ||
      host === 'web.push.apple.com' || host.endsWith('.notify.windows.com');
  } catch { return false; }
}
module.exports = { JWT_SECRET, isAllowedOrigin, isAllowedPushEndpoint };
