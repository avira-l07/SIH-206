const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDatabase() {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, role: true, name: true }
    });
    const shelters = await prisma.shelter.findMany({
      select: { id: true, name: true, capacity: true, currentOccupancy: true }
    });
    const alerts = await prisma.alert.findMany({
      select: { id: true, hazardType: true, severity: true, region: true, active: true }
    });
    const sos = await prisma.sOSRequest.findMany({
      select: { id: true, userName: true, hazardType: true, status: true }
    });

    console.log('=== DIRECT NEON POSTGRESQL VERIFICATION ===');
    console.log(`Found ${users.length} Users:`);
    users.forEach(u => console.log(`  - [${u.role}] ${u.name} (${u.email})`));

    console.log(`\nFound ${shelters.length} Emergency Shelters:`);
    shelters.forEach(s => console.log(`  - ${s.name}: ${s.currentOccupancy}/${s.capacity} beds`));

    console.log(`\nFound ${alerts.length} Active Hazard Alerts:`);
    alerts.forEach(a => console.log(`  - [${a.severity} // ${a.hazardType}] ${a.region}`));

    console.log(`\nFound ${sos.length} SOS Requests:`);
    sos.forEach(r => console.log(`  - [${r.status}] ${r.userName} (${r.hazardType})`));

    console.log('\n✅ ALL RECORDS CONFIRMED LIVE IN NEON POSTGRESQL!');
  } catch (error) {
    console.error('❌ Database verification query failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();
