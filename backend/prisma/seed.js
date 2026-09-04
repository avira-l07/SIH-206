const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Clear existing data in reverse relation order
  await prisma.sOSRequest.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.shelter.deleteMany();
  await prisma.user.deleteMany();

  const salt = await bcrypt.genSalt(10);
  const defaultPasswordHash = await bcrypt.hash('password123', salt);

  // 1. Seed Demo Users
  const citizen = await prisma.user.create({
    data: {
      name: 'Rohan Sharma',
      email: 'citizen@sih.gov.in',
      passwordHash: defaultPasswordHash,
      role: 'CITIZEN',
      phone: '+91 98201 12345',
      lat: 19.0760,
      lng: 72.8777,
    },
  });

  const volunteer = await prisma.user.create({
    data: {
      name: 'Priya Patel (NDRF Vol.)',
      email: 'volunteer@sih.gov.in',
      passwordHash: defaultPasswordHash,
      role: 'VOLUNTEER',
      phone: '+91 98202 54321',
      lat: 19.0596,
      lng: 72.8295,
    },
  });

  const admin = await prisma.user.create({
    data: {
      name: 'NDMA Emergency Operations Center',
      email: 'admin@sih.gov.in',
      passwordHash: defaultPasswordHash,
      role: 'ADMIN',
      phone: '+91 22 2202 7990',
      lat: 19.0178,
      lng: 72.8478,
    },
  });

  console.log('✅ Users seeded (citizen@sih.gov.in, volunteer@sih.gov.in, admin@sih.gov.in)');

  // 2. Seed Shelters
  const shelters = [
    {
      name: 'Dadar Central Relief Center',
      address: 'Dr. Babasaheb Ambedkar Rd, Dadar East, Mumbai',
      lat: 19.0178,
      lng: 72.8478,
      capacity: 500,
      currentOccupancy: 120,
      contact: '+91 22 2414 1234',
    },
    {
      name: 'Bandra West Municipal Safe Camp',
      address: 'Hill Road, Near Bandra Station, Mumbai',
      lat: 19.0596,
      lng: 72.8295,
      capacity: 350,
      currentOccupancy: 45,
      contact: '+91 22 2640 4321',
    },
    {
      name: 'Andheri West Emergency Shelter Hall',
      address: 'SV Road, Andheri West, Mumbai',
      lat: 19.1197,
      lng: 72.8464,
      capacity: 600,
      currentOccupancy: 210,
      contact: '+91 22 2628 9876',
    },
    {
      name: 'Kurla High-Ground Evacuation Hub',
      address: 'LBS Marg, Kurla West, Mumbai',
      lat: 19.0726,
      lng: 72.8845,
      capacity: 400,
      currentOccupancy: 385, // almost full to demonstrate shelter full status
      contact: '+91 22 2503 1122',
    },
    {
      name: 'Chembur Sports Complex Refuge Center',
      address: 'Sion-Trombay Road, Chembur, Mumbai',
      lat: 19.0622,
      lng: 72.8970,
      capacity: 750,
      currentOccupancy: 180,
      contact: '+91 22 2522 3344',
    },
    {
      name: 'Colaba Coastal Defense Shelter',
      address: 'SBS Road, Colaba, Mumbai',
      lat: 18.9067,
      lng: 72.8147,
      capacity: 300,
      currentOccupancy: 60,
      contact: '+91 22 2218 5566',
    },
    {
      name: 'Thane Central Disaster Relief Camp',
      address: 'Eastern Express Highway, Thane West',
      lat: 19.2183,
      lng: 72.9781,
      capacity: 800,
      currentOccupancy: 310,
      contact: '+91 22 2533 7788',
    },
  ];

  for (const shelter of shelters) {
    await prisma.shelter.create({ data: shelter });
  }
  console.log(`✅ Seeded ${shelters.length} emergency shelters`);

  // 3. Seed Alerts
  await prisma.alert.create({
    data: {
      hazardType: 'FLOOD',
      severity: 'CRITICAL',
      region: 'Kurla - Mithi River Catchment',
      lat: 19.0726,
      lng: 72.8845,
      message: 'Water levels exceeded safety threshold (145mm rainfall in 3h). Evacuate ground floor areas immediately.',
      active: true,
    },
  });

  await prisma.alert.create({
    data: {
      hazardType: 'FIRE',
      severity: 'WATCH',
      region: 'Deonar Sector 4',
      lat: 19.0550,
      lng: 72.9150,
      message: 'Industrial area smoke report. Fire tenders on site, avoid perimeter road.',
      active: true,
    },
  });
  console.log('✅ Seeded 2 disaster alerts');

  // 4. Seed sample SOS
  await prisma.sOSRequest.create({
    data: {
      userId: citizen.id,
      userName: citizen.name,
      userPhone: citizen.phone,
      lat: 19.0765,
      lng: 72.8850,
      message: 'Ground floor flooded with 3 feet water, 2 elderly persons need boat evacuation assistance.',
      hazardType: 'FLOOD',
      status: 'PENDING',
    },
  });

  await prisma.sOSRequest.create({
    data: {
      userName: 'Aarav Mehta',
      userPhone: '+91 99300 44556',
      lat: 19.0605,
      lng: 72.8310,
      message: 'Tree fallen over exit road, minor power line short circuit nearby.',
      hazardType: 'FIRE',
      status: 'IN_PROGRESS',
      assignedVolunteerId: volunteer.id,
    },
  });
  console.log('✅ Seeded initial SOS requests');

  console.log('🎉 Database seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
