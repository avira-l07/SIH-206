const express = require('express');
const router = express.Router();
router.param('id', require('../middleware/request.middleware').validateId);
const missingController = require('../controllers/missing.controller');
const { authenticateToken, requireRole, optionalAuth } = require('../middleware/auth.middleware');

router.get('/', authenticateToken, missingController.getMissingPersons);
router.post('/', optionalAuth, missingController.reportMissingPerson);
router.patch('/:id/status', authenticateToken, requireRole(['ADMIN', 'VOLUNTEER']), missingController.updateMissingStatus);

module.exports = router;
