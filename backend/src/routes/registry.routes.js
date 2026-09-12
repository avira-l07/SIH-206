/**
 * registry.routes.js
 * Routes for unauthenticated emergency alert registration & statistics
 */

const express = require('express');
const router = express.Router();
const registryController = require('../controllers/registry.controller');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');

// Public no-auth endpoints
router.post('/phone', registryController.registerPhone);
router.post('/push', registryController.registerPush);
router.get('/stats', registryController.getRegistryStats);
router.get('/vapid-public-key', registryController.getVapidKey);

// Protected Admin subscriber inspection
router.get('/subscribers', authenticateToken, requireRole(['ADMIN']), registryController.getRegisteredSubscribers);

module.exports = router;

