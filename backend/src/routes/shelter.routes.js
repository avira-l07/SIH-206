const express = require('express');
const router = express.Router();
const shelterController = require('../controllers/shelter.controller');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');

router.get('/', shelterController.getAllShelters);
router.post('/', authenticateToken, requireRole(['ADMIN']), shelterController.createShelter);
router.patch('/:id/audit', authenticateToken, requireRole(['ADMIN', 'VOLUNTEER']), shelterController.auditShelter);
router.post('/:id/events', authenticateToken, requireRole(['ADMIN', 'VOLUNTEER']), shelterController.logShelterEvent);
router.get('/:id/events', shelterController.getShelterEvents);

module.exports = router;
