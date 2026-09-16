const { PrismaClient } = require('@prisma/client');
const prepareSchema = require('../scripts/prepare-schema');

prepareSchema();
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./dev.db';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

module.exports = prisma;
