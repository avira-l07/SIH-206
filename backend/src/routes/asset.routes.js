const express = require('express');
const router = express.Router();
router.param('id', require('../middleware/request.middleware').validateId);
const assetController = require('../controllers/asset.controller');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');



router.get('/', authenticateToken, assetController.getAssets);
router.get('/suggestions', authenticateToken, requireRole(['ADMIN', 'VOLUNTEER']), assetController.getAssetSuggestions);
router.post('/', authenticateToken, assetController.registerAsset);
router.patch('/:id/status', authenticateToken, assetController.toggleAssetAvailability);

module.exports = router;
