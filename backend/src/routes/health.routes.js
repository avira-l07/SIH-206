const express = require('express');
const router = express.Router();
router.param('id', require('../middleware/request.middleware').validateId);
const prisma = require('../db');

router.get('/', async (req, res) => {
  let dbStatus = 'healthy';
  let userCount = 0;
  let dbError = null;

  try {
    userCount = await prisma.user.count();
  } catch (err) {
    dbStatus = 'unreachable';
    dbError = err.message;
  }

  res.status(dbStatus === 'healthy' ? 200 : 503).json({
    status: dbStatus === 'healthy' ? 'ok' : 'unavailable',
    timestamp: new Date().toISOString(),
    database: {
      status: dbStatus,
    },
    service: 'SIH26206 Disaster Management Backend API',
    version: '1.0.2',
  });
});

module.exports = router;
