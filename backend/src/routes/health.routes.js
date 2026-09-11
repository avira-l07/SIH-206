const express = require('express');
const router = express.Router();
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

  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: {
      status: dbStatus,
      userCount,
      ...(dbError ? { error: dbError } : {}),
    },
    service: 'SIH26206 Disaster Management Backend API',
    version: '1.0.2',
  });
});

module.exports = router;
