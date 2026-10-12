/**
 * registry.routes.js
 * Routes for unauthenticated emergency alert registration & statistics
 */

const express = require('express');
const router = express.Router();
router.param('id', require('../middleware/request.middleware').validateId);
const registryController = require('../controllers/registry.controller');
// Public no-auth endpoints
router.post('/phone', require('../controllers/public-phone.controller').request);
router.post('/phone/verify',require('../controllers/public-phone.controller').verify);
router.post('/push', registryController.registerPush);
router.get('/stats', registryController.getRegistryStats);
router.get('/vapid-public-key', registryController.getVapidKey);

// NOTE: No route exposes raw phone numbers or push tokens. Only aggregate telemetry (/stats) is accessible.

module.exports = router;

