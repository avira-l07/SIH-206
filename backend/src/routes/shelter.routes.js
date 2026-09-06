const express = require('express');
const router = express.Router();
const shelterController = require('../controllers/shelter.controller');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');

router.get('/', shelterController.getAllShelters);
router.post('/', authenticateToken, requireRole(['ADMIN']), shelterController.createShelter);
router.patch('/:id/occupancy', authenticateToken, requireRole(['ADMIN', 'VOLUNTEER']), shelterController.updateOccupancy);
router.patch('/:id/audit', authenticateToken, shelterController.auditShelter);

module.exports = router;
