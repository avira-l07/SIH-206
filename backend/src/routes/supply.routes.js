const express = require('express');
const router = express.Router();
const supplyController = require('../controllers/supply.controller');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth.middleware');

function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return next();

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (!err) req.user = user;
    next();
  });
}

router.get('/', supplyController.getSupplies);
router.post('/', authenticateToken, requireRole(['ADMIN', 'VOLUNTEER']), supplyController.upsertSupplyItem);
router.patch('/:id', authenticateToken, requireRole(['ADMIN', 'VOLUNTEER']), supplyController.updateSupplyStock);

// Shipments under /api/supplies/shipments - restricted to verified responders
router.post('/shipments', authenticateToken, requireRole(['ADMIN', 'VOLUNTEER']), supplyController.logSupplyShipment);
router.get('/shipments', supplyController.getSupplyShipments);

module.exports = router;
