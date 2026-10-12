const express = require('express');
const router = express.Router();
router.param('id', require('../middleware/request.middleware').validateId);
const supplyController = require('../controllers/supply.controller');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');

router.post('/', authenticateToken, requireRole(['ADMIN', 'VOLUNTEER']), supplyController.logSupplyShipment);
router.get('/', supplyController.getSupplyShipments);

module.exports = router;
