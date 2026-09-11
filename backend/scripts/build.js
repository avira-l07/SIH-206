const { execSync } = require('child_process');
const path = require('path');

process.env.DATABASE_URL = 'file:./dev.db';

console.log('?? Running SIH26206 backend cloud build with SQLite datasource...');
console.log('Using DATABASE_URL:', process.env.DATABASE_URL);

try {
  console.log('1. Generating Prisma client...');
  execSync('npx prisma generate', { stdio: 'inherit', env: process.env });

  console.log('2. Syncing schema to database (prisma db push)...');
  execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit', env: process.env });

  console.log('3. Seeding database with initial users, shelters, alerts...');
  execSync('node prisma/seed.js', { stdio: 'inherit', env: process.env });

  console.log('? Build & database initialization completed successfully!');
} catch (err) {
  console.error('? Build failed:', err.message);
  process.exit(1);
}
