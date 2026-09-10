const express = require('express');
const router = express.Router();
const supplyController = require('../controllers/supply.controller');
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

router.post('/', optionalAuth, supplyController.logSupplyShipment);
router.get('/', supplyController.getSupplyShipments);

module.exports = router;
