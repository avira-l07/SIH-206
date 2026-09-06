const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { validateRole } = require('../middleware/validate.middleware');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');

router.post('/register', validateRole, authController.register);
router.post('/login', authController.login);
router.get('/me', authenticateToken, authController.getMe);
router.patch('/safety-status', authenticateToken, authController.updateSafetyStatus);
router.get('/safety-lookup', authenticateToken, authController.lookupSafetyStatus);
router.get('/users', authenticateToken, requireRole(['ADMIN']), authController.getUsers);
router.patch('/users/:id/trust', authenticateToken, requireRole(['ADMIN']), authController.setUserTrust);

module.exports = router;
