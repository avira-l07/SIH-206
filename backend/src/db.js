const { PrismaClient } = require('@prisma/client');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./dev.db';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

module.exports = prisma;
