// Isolated UI verification server; never reads or changes the application's database.
const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');
const { execFileSync } = require('child_process');
const bcrypt = require('bcryptjs');
const directory = fs.mkdtempSync(path.resolve(__dirname, '../test/.sih-ui-'));
const database = path.join(directory, 'preview.db');
fs.writeFileSync(database, '');
Object.assign(process.env, { NODE_ENV: 'development', DATABASE_URL: 'file:' + database.replaceAll('\\', '/'), JWT_SECRET: randomBytes(48).toString('hex'), PORT: '5067', HOST: '127.0.0.1', DISABLE_RATE_LIMITS: 'true', DISABLE_EXTERNAL_DELIVERY: 'true', OPENWEATHER_API_KEY: 'mock_mode_active' });

async function main() {
  execFileSync(process.execPath, [path.resolve(__dirname, '../node_modules/prisma/build/index.js'), 'db', 'push', '--skip-generate'], { cwd: path.resolve(__dirname, '..'), env: process.env, stdio: 'inherit' });
  const prisma = require('../src/db');
  const passwordHash = await bcrypt.hash('password123', 10);
  for (const role of ['CITIZEN', 'VOLUNTEER', 'ADMIN']) await prisma.user.create({ data: { name: 'Preview ' + role, email: role.toLowerCase() + '@sih.gov.in', passwordHash, role, trusted: role !== 'CITIZEN', onDuty:role==='VOLUNTEER'?true:null, lat: 30.3165, lng: 78.0322,region:"dehradun" } });
  await prisma.user.create({ data: { name: 'Preview Backup Volunteer', email: 'backup-volunteer@sih.gov.in', passwordHash, role: 'VOLUNTEER', trusted: true, onDuty: true, lat: 30.3165, lng: 78.0322 } });
  const shelter = await prisma.shelter.create({ data: { region:'dehradun',name: 'Preview Relief Shelter', address: 'Dehradun', contact: '112', lat: 30.3265, lng: 78.0422, capacity: 100, currentOccupancy: 20, waterLitersRemaining: 500, rationsUnitsRemaining: 200 } });
  await prisma.evacuationCorridor.create({data:{name:'Preview reviewed shelter road',region:'dehradun',mode:'BOTH',points:JSON.stringify([[30.3165,78.0322],[30.3215,78.0372],[30.3265,78.0422]]),reviewNote:'Synthetic preview corridor; not a real field survey',reviewedById:3,expiresAt:new Date(Date.now()+3*3600000)}});
  await prisma.supplyRequest.create({ data: { shelterId: shelter.id, itemName: 'Water', quantityNeeded: 100, quantityFulfilled: 50, unit: 'bottles', status: 'LOW' } });
  await prisma.alert.create({ data: { hazardType: 'FLOOD', severity: 'WATCH', region: 'Dehradun', lat: 30.3165, lng: 78.0322, radiusKm: 5, message: 'Preview test advisory: avoid flooded roads' } });
  await prisma.civilianAsset.create({data:{userId:1,ownerName:'Preview CITIZEN',contact:'1120000000',title:'Preview rescue boat',description:'Disposable test resource',type:'BOAT',region:'dehradun',lat:30.3165,lng:78.0322}});
  await prisma.missingPerson.create({data:{reportedByUserId:1,reportedByName:'Preview Relative',contactPhone:'1120000000',fullName:'Asha Sharma',description:'Disposable matching test',age:30,lastSeenLocation:'Dehradun',region:'dehradun'}});
  const { start, io } = require('../src/server'); await start();
  async function close() { await new Promise(resolve => io.close(resolve)); await prisma.$disconnect(); if (path.dirname(directory) === path.resolve(__dirname, '../test') && path.basename(directory).startsWith('.sih-ui-')) fs.rmSync(directory, { recursive: true, force: true }); process.exit(0); }
  process.on('SIGINT', close); process.on('SIGTERM', close);
}
main().catch(error => { console.error(error); process.exit(1); });
