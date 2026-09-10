const express = require('express');
const router = express.Router();
const assetController = require('../controllers/asset.controller');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth.middleware');
const jwt = require('jsonwebtoken');

function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return next();

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (!err) req.user = user;
    next();
  });
}

router.get('/', assetController.getAssets);
router.get('/suggestions', assetController.getAssetSuggestions);
router.post('/', optionalAuth, assetController.registerAsset);
router.patch('/:id/status', authenticateToken, assetController.toggleAssetAvailability);

module.exports = router;
