const express = require('express');
const router = express.Router();
router.param('id', require('../middleware/request.middleware').validateId);
const rateLimit = require('express-rate-limit');
const { timingSafeEqual } = require('crypto');
const offlineController = require('../controllers/offline.controller');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');

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
  if (req.headers.authorization) return authenticateToken(req, res, next);

  // Path B: pre-shared LAN relay secret
  const HUB_SECRET = process.env.OFFLINE_HUB_SECRET;
  const supplied = req.headers['x-hub-secret'];
  if (HUB_SECRET && typeof supplied === 'string' && Buffer.byteLength(supplied) === Buffer.byteLength(HUB_SECRET) && timingSafeEqual(Buffer.from(supplied), Buffer.from(HUB_SECRET))) {
    req.user = { role: 'RELAY_NODE', id: null }; // synthetic identity for relay devices
    return next();
  }

  return res.status(401).json({
    error: 'Offline sync requires authentication. Provide a Bearer token or X-Hub-Secret header.',
  });
}

// Tight limiter for batch sync: 10 flushes per 15 min per IP is generous for legitimate PWA
const syncBatchLimiter = rateLimit({
  store:new (require("../services/database-rate-store").DatabaseRateStore)("offlineBatch"),
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Sync-batch rate limit exceeded. Wait before flushing again.' },
});

// SMS ingest and offline sync logs endpoints — accessible to all authenticated roles for disaster telemetry & demonstration
router.post('/sms-ingest', authenticateToken, requireRole(['ADMIN', 'VOLUNTEER', 'CITIZEN']), offlineController.ingestSMS);
router.get('/logs', authenticateToken, requireRole(['ADMIN', 'VOLUNTEER']), offlineController.getSyncLogs);
router.post('/sync-batch', syncBatchLimiter, offlineHubAuth, offlineController.syncOfflineBatch);


module.exports = router;
