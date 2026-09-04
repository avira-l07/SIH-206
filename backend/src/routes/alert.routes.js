const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alert.controller');
const { validateAlert } = require('../middleware/validate.middleware');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');

router.get('/', alertController.getAlerts);
router.post('/', authenticateToken, requireRole(['ADMIN']), validateAlert, alertController.createAlert);
router.post('/simulate', authenticateToken, requireRole(['ADMIN']), alertController.simulateWeatherAlert);
router.patch('/:id/deactivate', authenticateToken, requireRole(['ADMIN']), alertController.deactivateAlert);

module.exports = router;
