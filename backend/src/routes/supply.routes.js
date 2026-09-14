const express = require('express');
const router = express.Router();
const supplyController = require('../controllers/supply.controller');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');

router.get('/', supplyController.getSupplies);
router.post('/', authenticateToken, requireRole(['ADMIN', 'VOLUNTEER']), supplyController.upsertSupplyItem);
router.patch('/:id', authenticateToken, requireRole(['ADMIN', 'VOLUNTEER']), supplyController.updateSupplyStock);

// Shipments under /api/supplies/shipments - restricted to verified responders
router.post('/shipments', authenticateToken, requireRole(['ADMIN', 'VOLUNTEER']), supplyController.logSupplyShipment);
router.get('/shipments', supplyController.getSupplyShipments);

// QR Code Generation for shelter stations (Decision 0.1)
router.post('/:id/generate-code', authenticateToken, requireRole(['ADMIN', 'VOLUNTEER']), supplyController.generateSupplyCode);

// Citizen Supply Pickup & Oversight Logs (Section 3)
router.post('/distributions', authenticateToken, supplyController.recordSupplyDistribution);
router.get('/distributions/mine', authenticateToken, supplyController.getMyDistributions);
router.get('/distributions', authenticateToken, requireRole(['ADMIN', 'VOLUNTEER']), supplyController.getShelterDistributions);

module.exports = router;
