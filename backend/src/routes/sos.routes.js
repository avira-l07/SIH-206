const express = require('express');
const router = express.Router();
router.param('id', require('../middleware/request.middleware').validateId);
const sosController = require('../controllers/sos.controller');
const { validateSOS } = require('../middleware/validate.middleware');
const { authenticateToken, requireRole, optionalAuth } = require('../middleware/auth.middleware');



router.post('/', optionalAuth, validateSOS, sosController.createSOS);
router.get('/', authenticateToken, requireRole(['ADMIN', 'VOLUNTEER']), sosController.getSOSList);
router.get('/my', authenticateToken, sosController.getMySOS);
router.get('/:id/timeline', authenticateToken, sosController.getTimeline);

// Admin-only verification (Decision 0.1)
router.patch('/:id/verify', authenticateToken, requireRole(['ADMIN']), sosController.verifySOS);

// Exclusive path to EN_ROUTE
router.patch('/:id/assign', authenticateToken, requireRole(['VOLUNTEER', 'ADMIN']), sosController.assignSOS);

// Sequential status transitions (starts at EN_ROUTE -> ON_SCENE)
router.patch('/:id/status', authenticateToken, requireRole(['VOLUNTEER', 'ADMIN']), sosController.updateStatus);

// Direct resolution
router.patch('/:id/resolve', authenticateToken, requireRole(['VOLUNTEER', 'ADMIN']), sosController.resolveSOS);

// Cancellation (False alarms / duplicate)
router.patch('/:id/cancel', authenticateToken, requireRole(['VOLUNTEER', 'ADMIN']), sosController.cancelSOS);

// Casualty triage tag (Decision 0.2)
router.patch('/:id/triage-tag', authenticateToken, requireRole(['VOLUNTEER', 'ADMIN']), sosController.setTriageTag);

// Citizen verification loop (Sprint 2)
router.patch('/:id/citizen-verify', authenticateToken, sosController.citizenVerifySOS);

router.patch('/:id/withdraw', authenticateToken, sosController.withdrawSOS);
router.patch('/:id/acknowledge', authenticateToken, requireRole(['VOLUNTEER', 'ADMIN']), sosController.acknowledgeSOS);
router.patch('/:id/handoff', authenticateToken, requireRole(['VOLUNTEER', 'ADMIN']), sosController.requestHandoff);
router.patch('/:id/reassign', authenticateToken, requireRole(['ADMIN']), sosController.reassignSOS);
module.exports = router;
