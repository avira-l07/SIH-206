const express = require('express');
const router = express.Router();
router.param('id', require('../middleware/request.middleware').validateId);
const authController = require('../controllers/auth.controller');
const { validateRole } = require('../middleware/validate.middleware');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');

router.post('/register', validateRole, authController.register);
router.post('/login', authController.login);
router.patch('/profile', authenticateToken, authController.updateProfile);
router.get('/me', authenticateToken, authController.getMe);
router.patch('/safety-status', authenticateToken, authController.updateSafetyStatus);
router.patch('/location', authenticateToken, authController.updateLocation);
router.patch('/availability', authenticateToken, requireRole(['VOLUNTEER']), authController.updateAvailability);
router.get('/responders', authenticateToken, requireRole(['ADMIN']), authController.getResponders);
router.get('/safety-lookup', authenticateToken, authController.lookupSafetyStatus);
router.get('/users', authenticateToken, requireRole(['ADMIN']), authController.getUsers);
router.patch('/users/:id/trust', authenticateToken, requireRole(['ADMIN']), authController.setUserTrust);

module.exports = router;
