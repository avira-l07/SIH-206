const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { validateRole } = require('../middleware/validate.middleware');
const { authenticateToken } = require('../middleware/auth.middleware');

router.post('/register', validateRole, authController.register);
router.post('/login', authController.login);
router.get('/me', authenticateToken, authController.getMe);

module.exports = router;
