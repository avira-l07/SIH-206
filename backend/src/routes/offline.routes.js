const express = require('express');
const router = express.Router();
const offlineController = require('../controllers/offline.controller');

router.post('/sms-ingest', offlineController.ingestSMS);
router.get('/logs', offlineController.getSyncLogs);
router.post('/sync-batch', offlineController.syncOfflineBatch);

module.exports = router;
