const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const offlineController = require('../controllers/offline.controller');
const { authenticateToken, requireRole, JWT_SECRET } = require('../middleware/auth.middleware');

/**
 * offlineHubAuth — accepts either:
 *   (a) A valid Bearer JWT (authenticated PWA citizen/volunteer), OR
 *   (b) X-Hub-Secret header matching OFFLINE_HUB_SECRET env var
 *       (for pre-provisioned Raspberry Pi / LAN relay nodes).
 *
 * Anonymous callers (no token, no hub secret) are rejected.
 * If OFFLINE_HUB_SECRET is not set in .env, hub-secret path is disabled.
 */
function offlineHubAuth(req, res, next) {
  // Path A: valid Bearer JWT
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (!err) {
        req.user = user;
        return next();
      }
      return res.status(403).json({ error: 'Invalid or expired token' });
    });
    return;
  }

  // Path B: pre-shared LAN relay secret
  const HUB_SECRET = process.env.OFFLINE_HUB_SECRET;
  if (HUB_SECRET && req.headers['x-hub-secret'] === HUB_SECRET) {
    req.user = { role: 'RELAY_NODE', id: null }; // synthetic identity for relay devices
    return next();
  }

  return res.status(401).json({
    error: 'Offline sync requires authentication. Provide a Bearer token or X-Hub-Secret header.',
  });
}

// Tight limiter for batch sync: 10 flushes per 15 min per IP is generous for legitimate PWA
const syncBatchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Sync-batch rate limit exceeded. Wait before flushing again.' },
});

// SMS ingest is an internal/integration endpoint — restrict to operators only
router.post('/sms-ingest', authenticateToken, requireRole(['ADMIN', 'VOLUNTEER']), offlineController.ingestSMS);
router.get('/logs', authenticateToken, requireRole(['ADMIN', 'VOLUNTEER']), offlineController.getSyncLogs);
router.post('/sync-batch', syncBatchLimiter, offlineHubAuth, offlineController.syncOfflineBatch);

module.exports = router;
