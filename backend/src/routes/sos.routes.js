const express = require('express');
const router = express.Router();
const sosController = require('../controllers/sos.controller');
const { validateSOS } = require('../middleware/validate.middleware');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');

function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return next();

  const jwt = require('jsonwebtoken');
  const { JWT_SECRET } = require('../middleware/auth.middleware');
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (!err) req.user = user;
    next();
  });
}

router.post('/', optionalAuth, validateSOS, sosController.createSOS);
router.get('/', authenticateToken, sosController.getSOSList);
router.get('/my', authenticateToken, sosController.getMySOS);
router.patch('/:id/assign', authenticateToken, requireRole(['VOLUNTEER', 'ADMIN']), sosController.assignSOS);
router.patch('/:id/status', authenticateToken, requireRole(['VOLUNTEER', 'ADMIN']), sosController.updateStatus);
router.patch('/:id/resolve', authenticateToken, requireRole(['VOLUNTEER', 'ADMIN']), sosController.resolveSOS);
router.patch('/:id/citizen-verify', authenticateToken, sosController.citizenVerifySOS);

module.exports = router;
