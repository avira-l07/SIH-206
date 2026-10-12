// Explicit development setup. Online SQLite backup first; never accepts data loss or seeds.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Use reviewed production migrations, not development database setup');
  const root = path.resolve(__dirname, '..');
  const url = process.env.DATABASE_URL || 'file:./dev.db';
  if (!url.startsWith('file:')) throw new Error('This development setup supports SQLite only');
  const databasePath = path.resolve(root, 'prisma', url.slice(5));
  if (!databasePath.toLowerCase().startsWith((root + path.sep).toLowerCase())) throw new Error('Development database must be within the backend directory');
  if (fs.existsSync(databasePath)) {
    const { DatabaseSync, backup } = require('node:sqlite');
    const database = new DatabaseSync(databasePath, { readOnly: true });
    const backupDir = path.join(root, 'backups'); fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, 'before-schema-' + Date.now() + '.db');
    try { await backup(database, backupPath); } finally { database.close(); }
    // Pre-create this nullable column/index only after checking uniqueness. Prisma
    // otherwise warns about every new unique index even when all old rows are NULL.
    const writable = new DatabaseSync(databasePath);
    try {
      if (writable.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='OfflineSyncLog'").get()) {
        const columns = writable.prepare('PRAGMA table_info("OfflineSyncLog")').all();
        if (!columns.some(column => column.name === 'idempotencyKey')) writable.exec('ALTER TABLE "OfflineSyncLog" ADD COLUMN "idempotencyKey" TEXT');
        const duplicate = writable.prepare('SELECT COUNT(*) AS count FROM (SELECT idempotencyKey FROM "OfflineSyncLog" WHERE idempotencyKey IS NOT NULL GROUP BY idempotencyKey HAVING COUNT(*) > 1)').get();
        if (duplicate.count) throw new Error('Existing offline idempotency keys contain duplicates; preserve records and resolve them before migration');
        writable.exec('CREATE UNIQUE INDEX IF NOT EXISTS "OfflineSyncLog_idempotencyKey_key" ON "OfflineSyncLog" ("idempotencyKey")');
      }
    if(writable.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='CivilianAsset'").get()){if(!writable.prepare('PRAGMA table_info("CivilianAsset")').all().some(c=>c.name==='activeReservationId'))writable.exec('ALTER TABLE "CivilianAsset" ADD COLUMN "activeReservationId" INTEGER');const duplicate=writable.prepare('SELECT COUNT(*) AS count FROM (SELECT activeReservationId FROM "CivilianAsset" WHERE activeReservationId IS NOT NULL GROUP BY activeReservationId HAVING COUNT(*)>1)').get();if(duplicate.count)throw new Error('Duplicate active resource bookings must be reviewed');writable.exec('CREATE UNIQUE INDEX IF NOT EXISTS "CivilianAsset_activeReservationId_key" ON "CivilianAsset" ("activeReservationId")');}
    } finally { writable.close(); }
    console.log('Existing data backed up to: ' + backupPath);
  } else { fs.mkdirSync(path.dirname(databasePath), { recursive: true }); fs.writeFileSync(databasePath, ''); }
  process.env.DATABASE_URL = url;
  require('./prepare-schema')();
  execFileSync(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), 'db', 'push', '--skip-generate'], { cwd: root, env: process.env, stdio: 'inherit' });
  console.log('Development schema is ready. Existing records are preserved.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
