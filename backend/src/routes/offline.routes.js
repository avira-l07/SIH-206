const express = require('express');
const router = express.Router();
const offlineController = require('../controllers/offline.controller');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');

router.post('/sms-ingest', offlineController.ingestSMS);
router.get('/logs', authenticateToken, requireRole(['ADMIN', 'VOLUNTEER']), offlineController.getSyncLogs);
router.post('/sync-batch', offlineController.syncOfflineBatch);

module.exports = router;
