const express = require('express');
const router = express.Router();
const supplyController = require('../controllers/supply.controller');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');

router.get('/', supplyController.getSupplies);
router.post('/', authenticateToken, requireRole(['ADMIN', 'VOLUNTEER']), supplyController.upsertSupplyItem);
router.patch('/:id', authenticateToken, requireRole(['ADMIN', 'VOLUNTEER']), supplyController.updateSupplyStock);

module.exports = router;
