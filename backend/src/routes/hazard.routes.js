const express = require('express');
const router = express.Router();
const hazardController = require('../controllers/hazard.controller');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth.middleware');
const jwt = require('jsonwebtoken');

function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return next();

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (!err) req.user = user;
    next();
  });
}

router.get('/', hazardController.getHazardReports);
router.post('/', optionalAuth, hazardController.createHazardReport);
router.post('/:id/confirm', authenticateToken, hazardController.confirmHazardReport);

module.exports = router;
