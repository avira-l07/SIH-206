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

  console.log('2. Syncing schema to database (prisma db push)...');
  execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit', env: process.env });

  console.log('3. Seeding database with initial users, shelters, alerts...');
  execSync('node prisma/seed.js', { stdio: 'inherit', env: process.env });

  console.log('✅ Build & database initialization completed successfully!');
} catch (err) {
  console.error('❌ Build failed:', err.message);
  process.exit(1);
}
