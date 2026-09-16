const { execSync } = require('child_process');
const prepareSchema = require('./prepare-schema');

// Run schema adaptation first
prepareSchema();

// Run prisma generate with current process.env
try {
  console.log('⚡ Running prisma generate...');
  execSync('npx prisma generate', { stdio: 'inherit', env: process.env });
} catch (err) {
  console.error('❌ prisma generate failed:', err.message);
  process.exit(1);
}
