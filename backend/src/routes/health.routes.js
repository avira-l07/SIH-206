const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'SIH26206 Disaster Management Backend API',
    version: '1.0.0'
  });
});

module.exports = router;
