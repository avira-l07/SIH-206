const express = require('express');
const router = express.Router();
const missingController = require('../controllers/missing.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

router.get('/', missingController.getMissingPersons);
router.post('/', missingController.reportMissingPerson);
router.patch('/:id/status', authenticateToken, missingController.updateMissingStatus);

module.exports = router;
