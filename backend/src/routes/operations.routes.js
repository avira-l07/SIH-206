const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth.middleware');
router.get('/summary', authenticateToken, require('../controllers/operations.controller').getSummary);
module.exports = router;
