const express = require('express');
const router = express.Router();
router.param('id', require('../middleware/request.middleware').validateId);
const hazardController = require('../controllers/hazard.controller');
const { authenticateToken, optionalAuth } = require('../middleware/auth.middleware');



router.get('/', hazardController.getHazardReports);
router.post('/', optionalAuth, hazardController.createHazardReport);
router.post('/:id/confirm', authenticateToken, hazardController.confirmHazardReport);

module.exports = router;
