const { execSync } = require('child_process');
const path = require('path');
const prepareSchema = require('./prepare-schema');

// Automatically configure provider (postgresql vs sqlite) and fix DATABASE_URL
prepareSchema();

const isPostgres = (process.env.DATABASE_URL || '').startsWith('postgres');
console.log(`📦 Running SIH26206 backend cloud build with ${isPostgres ? 'PostgreSQL' : 'SQLite'} datasource...`);

try {
  console.log('1. Generating Prisma client...');
  execSync('npx prisma generate', { stdio: 'inherit', env: process.env });

  console.log('Build completed. Apply reviewed schema changes and seed explicitly as separate operations.');
} catch (err) {
  console.error('❌ Build failed:', err.message);
  process.exit(1);
}
