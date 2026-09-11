const { PrismaClient } = require('@prisma/client');

process.env.DATABASE_URL = 'file:./dev.db';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:./dev.db',
    },
  },
});

module.exports = prisma;
