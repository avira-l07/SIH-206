const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth.middleware');
const controller = require('../controllers/activity.controller');
router.use(authenticateToken);
router.param('id', require('../middleware/request.middleware').validateId);
router.get('/', controller.list);
router.patch('/read-all', controller.markAllRead);
router.patch('/:id/read', controller.markRead);
module.exports = router;
