/**
 * registry.routes.js
 * Routes for unauthenticated emergency alert registration & statistics
 */

const express = require('express');
const router = express.Router();
const registryController = require('../controllers/registry.controller');

// Public no-auth endpoints
router.post('/phone', registryController.registerPhone);
router.post('/push', registryController.registerPush);
router.get('/stats', registryController.getRegistryStats);
router.get('/vapid-public-key', registryController.getVapidKey);

module.exports = router;
