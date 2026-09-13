/**
 * ONE-TIME DEMO RESET SCRIPT: UTTARAKHAND DATASET
 *
 * PURPOSE:
 * Resets platform operational state to Uttarakhand (Chamoli & Dehradun) for demo.
 * Clears old test alerts, SOS requests, hazard reports, shelters, and relief assets.
 *
 * CRITICAL SAFETY RULES:
 * 1. NEVER deletes records from the User table (real accounts remain durable).
 * 2. Only updates coordinates/regions for the known demo accounts (upsert by email).
 * 3. This script is MANUAL and STANDALONE — NOT wired into build.js or deploy pipelines.
 *
 * RUN VIA:
 * node backend/scripts/seed-uttarakhand-demo.js
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function runUttarakhandMigration() {
  console.log('🏔️  Starting ONE-TIME Uttarakhand demo migration...');

  // SAFETY ASSERTION: Refuse to execute if code tries to delete users
  if (typeof prisma.user.deleteMany !== 'function') {
    throw new Error('Prisma Client User model corrupted');
  }

  // 1. Purge operational log tables in reverse-dependency order
  console.log('🧹 Purging operational demo data (alerts, sos, hazards, shelters, assets)...');
  await prisma.supplyShipment.deleteMany();
  await prisma.supplyRequest.deleteMany();
  await prisma.shelterEvent.deleteMany();
  await prisma.civilianAsset.deleteMany();
  await prisma.missingPerson.deleteMany();
  await prisma.hazardConfirmation.deleteMany();
  await prisma.hazardReport.deleteMany();
  await prisma.offlineSyncLog.deleteMany();
  await prisma.sOSRequest.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.shelter.deleteMany();

  console.log('✅ Operational demo data wiped. User table was NOT touched (preserving all registered citizens/volunteers).');

  // 2. Upsert known demo accounts to Uttarakhand regions without touching other accounts
  const salt = await bcrypt.genSalt(10);
  const defaultPasswordHash = await bcrypt.hash('password123', salt);

  const demoAccounts = [
    {
      name: 'Rohan Sharma',
      email: 'citizen@sih.gov.in',
      role: 'CITIZEN',
      phone: '+91 98201 12345',
      region: 'Dehradun - Doon Valley',
      lat: 30.3165,
      lng: 78.0322,
      trusted: false,
    },
    {
      name: 'Priya Patel (NDRF / SDRF Vol.)',
      email: 'volunteer@sih.gov.in',
      role: 'VOLUNTEER',
      phone: '+91 98202 54321',
      region: 'Rishikesh - Garhwal Hub',
      lat: 30.0869,
      lng: 78.2676,
      trusted: false,
    },
    {
      name: 'Uttarakhand State Disaster Management Authority (USDMA EOC)',
      email: 'admin@sih.gov.in',
      role: 'ADMIN',
      phone: '+91 135 2710334',
      region: 'Dehradun Secretariat',
      lat: 30.3255,
      lng: 78.0435,
      trusted: true,
    },
    {
      name: 'Insp. Vikram Rathore (SDRF Chamoli Sector Commander)',
      email: 'trusted_officer@sih.gov.in',
      role: 'ADMIN',
      phone: '+91 1372 252100',
      region: 'Chamoli - Gopeshwar',
      lat: 30.4074,
      lng: 79.3248,
      trusted: true,
    },
    {
      name: 'Neha Kulkarni (Local Volunteer)',
      email: 'confirmer1@sih.gov.in',
      role: 'CITIZEN',
      phone: '+91 98111 22334',
      region: 'Chamoli',
      lat: 30.4080,
      lng: 79.3255,
      trusted: false,
    },
    {
      name: 'Sanjay Verma (Doon Field Ward)',
      email: 'confirmer2@sih.gov.in',
      role: 'CITIZEN',
      phone: '+91 98222 33445',
      region: 'Dehradun',
      lat: 30.3180,
      lng: 78.0340,
      trusted: false,
    },
  ];

  for (const u of demoAccounts) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        passwordHash: defaultPasswordHash,
        role: u.role,
        phone: u.phone,
        region: u.region,
        lat: u.lat,
        lng: u.lng,
        trusted: u.trusted,
      },
      create: {
        name: u.name,
        email: u.email,
        passwordHash: defaultPasswordHash,
        role: u.role,
        phone: u.phone,
        region: u.region,
        lat: u.lat,
        lng: u.lng,
        trusted: u.trusted,
      },
    });
  }
  console.log('✅ Demo accounts safely updated to Uttarakhand regions without touching registered accounts');

  const citizen = await prisma.user.findUnique({ where: { email: 'citizen@sih.gov.in' } });
  const volunteer = await prisma.user.findUnique({ where: { email: 'volunteer@sih.gov.in' } });
  const trustedOfficer = await prisma.user.findUnique({ where: { email: 'trusted_officer@sih.gov.in' } });
  const confirmer1 = await prisma.user.findUnique({ where: { email: 'confirmer1@sih.gov.in' } });
  const confirmer2 = await prisma.user.findUnique({ where: { email: 'confirmer2@sih.gov.in' } });

  // 3. Seed 6 Uttarakhand Emergency Shelters
  const shelters = [
    {
      id: 201,
      name: 'Dehradun Central Relief Camp (ONGC Grounds)',
      address: 'Kaulagarh Rd, Near ONGC Community Centre, Dehradun',
      lat: 30.3398,
      lng: 78.0264,
      capacity: 600,
      currentOccupancy: 120, // 20% - Green
      waterLitersRemaining: 2500,
      waterThreshold: 300,
      rationsUnitsRemaining: 500,
      rationsThreshold: 60,
      medicalKitsRemaining: 50,
      medicalThreshold: 15,
      blanketsRemaining: 350,
      blanketsThreshold: 40,
      waterOk: true,
      rationsOk: true,
      restroomsOk: true,
      powerOk: true,
      status: 'GREEN',
      contact: '+91 135 275 4321',
    },
    {
      id: 202,
      name: 'Rishikesh High-Ground Refuge Hub',
      address: 'Triveni Ghat Public Grounds, Rishikesh',
      lat: 30.1030,
      lng: 78.2940,
      capacity: 500,
      currentOccupancy: 85, // 17% - Green
      waterLitersRemaining: 1800,
      waterThreshold: 200,
      rationsUnitsRemaining: 400,
      rationsThreshold: 50,
      medicalKitsRemaining: 40,
      medicalThreshold: 10,
      blanketsRemaining: 250,
      blanketsThreshold: 30,
      waterOk: true,
      rationsOk: true,
      restroomsOk: true,
      powerOk: true,
      status: 'GREEN',
      contact: '+91 135 243 0011',
    },
    {
      id: 203,
      name: 'Chamoli Disaster Relief Centre',
      address: 'Gopeshwar Sports Complex, Chamoli',
      lat: 30.4120,
      lng: 79.3280,
      capacity: 400,
      currentOccupancy: 388, // 97% - RED (Near landslide zone, overloaded)
      waterLitersRemaining: 120, // Breached threshold (< 200)
      waterThreshold: 200,
      rationsUnitsRemaining: 35, // Breached threshold (< 50)
      rationsThreshold: 50,
      medicalKitsRemaining: 5, // Breached threshold (< 10)
      medicalThreshold: 10,
      blanketsRemaining: 20, // Breached threshold (< 30)
      blanketsThreshold: 30,
      waterOk: false,
      rationsOk: true,
      restroomsOk: false,
      powerOk: false,
      status: 'RED',
      contact: '+91 1372 252 222',
    },
    {
      id: 204,
      name: 'Rudraprayag Transit Evacuation Camp',
      address: 'Alaknanda-Mandakini Confluence Base, Rudraprayag',
      lat: 30.2844,
      lng: 78.9811,
      capacity: 450,
      currentOccupancy: 340, // 75% - Yellow
      waterLitersRemaining: 380,
      waterThreshold: 200,
      rationsUnitsRemaining: 110,
      rationsThreshold: 50,
      medicalKitsRemaining: 12,
      medicalThreshold: 10,
      blanketsRemaining: 70,
      blanketsThreshold: 30,
      waterOk: true,
      rationsOk: true,
      restroomsOk: true,
      powerOk: false,
      status: 'YELLOW',
      contact: '+91 1364 233 100',
    },
    {
      id: 205,
      name: 'Joshimath Safe Refuge Hub',
      address: 'Upper Bazar Community Hall, Joshimath',
      lat: 30.5562,
      lng: 79.5676,
      capacity: 350,
      currentOccupancy: 60, // 17% - Green
      waterLitersRemaining: 1200,
      waterThreshold: 200,
      rationsUnitsRemaining: 300,
      rationsThreshold: 50,
      medicalKitsRemaining: 30,
      medicalThreshold: 10,
      blanketsRemaining: 200,
      blanketsThreshold: 30,
      waterOk: true,
      rationsOk: true,
      restroomsOk: true,
      powerOk: true,
      status: 'GREEN',
      contact: '+91 1389 222 345',
    },
    {
      id: 206,
      name: 'Haridwar Flood & Silt Evacuation Camp',
      address: 'BHEL Community Centre, Sector 1, Haridwar',
      lat: 29.9457,
      lng: 78.1642,
      capacity: 700,
      currentOccupancy: 190, // 27% - Green
      waterLitersRemaining: 3000,
      waterThreshold: 300,
      rationsUnitsRemaining: 700,
      rationsThreshold: 80,
      medicalKitsRemaining: 60,
      medicalThreshold: 15,
      blanketsRemaining: 400,
      blanketsThreshold: 50,
      waterOk: true,
      rationsOk: true,
      restroomsOk: true,
      powerOk: true,
      status: 'GREEN',
      contact: '+91 1334 281 900',
    },
  ];

  for (const s of shelters) {
    await prisma.shelter.create({ data: s });
  }
  console.log(`✅ Seeded ${shelters.length} Uttarakhand emergency shelters across GREEN, YELLOW, and RED readiness states`);

  // 4. Seed the TWO requested CRITICAL disaster alerts
  const landslideAlert = await prisma.alert.create({
    data: {
      hazardType: 'LANDSLIDE',
      severity: 'CRITICAL',
      region: 'Chamoli - Badrinath National Highway (NH-7)',
      lat: 30.4074,
      lng: 79.3248,
      radiusKm: 15.0,
      message: 'Major landslide blocking NH-7 near Chamoli following torrential cloudburst. Severe slope instability, active debris flow. Avoid mountain corridors, evacuate valley floor.',
      active: true,
    },
  });

  const rainfallAlert = await prisma.alert.create({
    data: {
      hazardType: 'FLOOD',
      severity: 'CRITICAL',
      region: 'Dehradun - Doon Valley Catchment',
      lat: 30.3165,
      lng: 78.0322,
      radiusKm: 20.0,
      message: 'Cloudburst and continuous torrential downpour (95mm/h). Rispana and Bindal riverbanks overflowing. Ground-floor residents must evacuate to designated shelters immediately.',
      active: true,
    },
  });

  console.log('✅ Seeded 2 CRITICAL alerts: Landslide (Chamoli NH-7) and Heavy Rainfall (Dehradun Doon Valley)');

  // 5. Seed Vulnerability-Tagged SOS Requests in Uttarakhand
  // Dialysis + Elderly stranded in landslide corridor
  await prisma.sOSRequest.create({
    data: {
      userId: citizen.id,
      userName: citizen.name,
      userPhone: citizen.phone,
      lat: 30.4095,
      lng: 79.3265,
      message: 'Elderly pilgrim on scheduled dialysis cut off on NH-7 near Gopeshwar bend due to boulder fall. Oxygen canister running low!',
      hazardType: 'LANDSLIDE',
      vulnerabilityTags: 'dialysis,elderly',
      priority: 'URGENT',
      status: 'PENDING',
      batteryLevel: 18,
      reportedByProxy: true,
      subjectDescription: 'Mr. B. K. Nautiyal (76yo, stranded in grey Scorpio SUV on NH-7)',
    },
  });

  // Infant + Pregnant trapped in waterlogging (Dehradun)
  await prisma.sOSRequest.create({
    data: {
      userId: citizen.id,
      userName: 'Sunita Rawat',
      userPhone: '+91 94120 88776',
      lat: 30.3140,
      lng: 78.0350,
      message: 'Mother with 3-week-old baby and pregnant family member trapped on ground floor as Bindal overflow enters home. Water at 3 feet.',
      hazardType: 'FLOOD',
      vulnerabilityTags: 'infant,pregnant',
      priority: 'URGENT',
      status: 'VERIFIED',
      batteryLevel: 42,
      reportedByProxy: false,
    },
  });

  // En Route SOS claimed by SDRF Volunteer
  await prisma.sOSRequest.create({
    data: {
      userId: citizen.id,
      userName: 'Harish Negi',
      userPhone: '+91 94125 11223',
      lat: 30.0910,
      lng: 78.2720,
      message: 'Tree fallen across tin residence near Rishikesh bypass, family trapped inside. Water ankle-deep.',
      hazardType: 'LANDSLIDE',
      vulnerabilityTags: 'trapped',
      priority: 'NORMAL',
      status: 'EN_ROUTE',
      assignedVolunteerId: volunteer.id,
      batteryLevel: 68,
    },
  });

  // On Scene SOS with Immediate triage tag
  await prisma.sOSRequest.create({
    data: {
      userId: null,
      userName: 'Deepak Joshi',
      userPhone: '+91 94122 33445',
      lat: 30.4110,
      lng: 79.3270,
      message: 'Rescue team on scene at rockfall zone. 3 persons extracted from damaged vehicle. Immediate splinting required.',
      hazardType: 'LANDSLIDE',
      vulnerabilityTags: 'elderly',
      priority: 'URGENT',
      status: 'ON_SCENE',
      assignedVolunteerId: volunteer.id,
      triageTag: 'IMMEDIATE',
      batteryLevel: 55,
    },
  });

  // Normal SOS in Dehradun
  await prisma.sOSRequest.create({
    data: {
      userId: null,
      userName: 'Virendra Singh',
      userPhone: '+91 94128 99887',
      lat: 30.3210,
      lng: 78.0290,
      message: 'Basement parking completely flooded near Clock Tower, need tow assistance.',
      hazardType: 'FLOOD',
      vulnerabilityTags: '',
      priority: 'NORMAL',
      status: 'PENDING',
      batteryLevel: 80,
    },
  });

  console.log('✅ Seeded Uttarakhand SOS requests across PENDING, VERIFIED, EN_ROUTE, and ON_SCENE');

  // 6. Seed Hazard Reports across Confidence Tiers (GREY, AMBER, RED, DISPUTED, RESOLVED)
  // RED (Verified - Landslide debris blocking highway)
  const redReport = await prisma.hazardReport.create({
    data: {
      userId: citizen.id,
      userName: citizen.name,
      lat: 30.4080,
      lng: 79.3250,
      hazardNote: 'Massive rockfall and active mudslide on NH-7 Chamoli. Complete vehicular passage blocked.',
      severityBenchmark: 'SUBMERGED',
      confidenceTier: 'RED',
      confirmationsCount: 3,
    },
  });
  await prisma.hazardConfirmation.create({
    data: {
      hazardReportId: redReport.id,
      confirmingUserId: trustedOfficer.id,
      voteType: 'CONFIRM',
    },
  });

  // AMBER (1 confirmation - Rispana riverbank breach)
  const amberReport = await prisma.hazardReport.create({
    data: {
      userId: confirmer1.id,
      userName: confirmer1.name,
      lat: 30.3200,
      lng: 78.0300,
      hazardNote: 'Rispana river water breached pedestrian footbridge near Dehradun bypass. Knee-deep fast flow.',
      severityBenchmark: 'KNEE',
      confidenceTier: 'AMBER',
      confirmationsCount: 1,
    },
  });
  await prisma.hazardConfirmation.create({
    data: {
      hazardReportId: amberReport.id,
      confirmingUserId: confirmer2.id,
      voteType: 'CONFIRM',
    },
  });

  // GREY (Newly reported - tree obstruction)
  await prisma.hazardReport.create({
    data: {
      userId: citizen.id,
      userName: citizen.name,
      lat: 30.1250,
      lng: 78.3200,
      hazardNote: 'Pine tree uprooted blocking one lane on Tapovan-Rishikesh highway.',
      severityBenchmark: 'ANKLE',
      confidenceTier: 'GREY',
      confirmationsCount: 0,
    },
  });

  // DISPUTED
  const disputed = await prisma.hazardReport.create({
    data: {
      userId: citizen.id,
      userName: 'Anonymous Pilgrim',
      lat: 30.2900,
      lng: 78.9900,
      hazardNote: 'RUMOR: Dam burst at upper catchment (DEBUNKED FALSE BY USDMA)',
      severityBenchmark: 'ANKLE',
      confidenceTier: 'DISPUTED',
      confirmationsCount: 0,
    },
  });
  await prisma.hazardConfirmation.create({
    data: {
      hazardReportId: disputed.id,
      confirmingUserId: confirmer1.id,
      voteType: 'FALSE',
    },
  });

  // RESOLVED
  const resolved = await prisma.hazardReport.create({
    data: {
      userId: citizen.id,
      userName: citizen.name,
      lat: 30.3300,
      lng: 78.0400,
      hazardNote: 'Debris cleared near Sahastradhara road junction. Traffic moving normally.',
      severityBenchmark: 'ANKLE',
      confidenceTier: 'RESOLVED',
      confirmationsCount: 0,
    },
  });
  await prisma.hazardConfirmation.create({
    data: {
      hazardReportId: resolved.id,
      confirmingUserId: trustedOfficer.id,
      voteType: 'RESOLVED',
    },
  });

  console.log('✅ Seeded hazard reports across all 5 confidence tiers');

  // 7. Seed Civilian Assets in Uttarakhand (Mountain rescue, 4x4, Generators)
  await prisma.civilianAsset.createMany({
    data: [
      {
        ownerName: 'Col. Virendra Rawat (Retd.)',
        contact: '+91 94120 77665',
        type: 'VEHICLE_4X4',
        assetType: 'FOUR_BY_FOUR',
        title: 'Mahindra Thar 4x4 with 10,000lb Warn Winch & Snorkel',
        description: 'Stationed at Gopeshwar, Chamoli. Ready for mountain debris clearance and stranded vehicle towing on NH-7.',
        lat: 30.4050,
        lng: 79.3220,
        available: true,
      },
      {
        ownerName: 'Doon Mountain Rescuers Club',
        contact: '+91 94129 44321',
        type: 'VEHICLE_4X4',
        assetType: 'FOUR_BY_FOUR',
        title: 'Isuzu D-Max V-Cross 4x4 Expedition Vehicle',
        description: 'Equipped with high-lift jack, recovery straps, and heavy all-terrain mud tires.',
        lat: 30.3180,
        lng: 78.0310,
        available: true,
      },
      {
        ownerName: 'Garhwal Power Works',
        contact: '+91 94122 12111',
        type: 'GENERATOR',
        assetType: 'GENERATOR',
        title: '25 kVA Silent Cold-Start Diesel Generator',
        description: 'Mounted on mobile trailer. Can provide backup power to Chamoli shelter hospital wing.',
        lat: 30.4100,
        lng: 79.3260,
        available: true,
      },
      {
        ownerName: 'Dr. Alok Semwal (High-Altitude Trauma Specialist)',
        contact: '+91 94123 88776',
        type: 'MEDICAL',
        assetType: 'MEDICAL',
        title: 'Emergency Mountain Trauma & High-Altitude Physician',
        description: 'Carrying portable oxygen concentrator, hypothermia blankets, and trauma stabilization kit.',
        lat: 30.1000,
        lng: 78.2900,
        available: true,
      },
      {
        ownerName: 'Uttarakhand Amateur Radio Club (VU2UKD)',
        contact: '+91 94125 33445',
        type: 'HAM_RADIO',
        assetType: 'HAM_RADIO',
        title: 'Disaster Emergency VHF/HF High-Gain Repeater Node',
        description: 'Solar-powered emergency radio link connecting Chamoli valley with Dehradun State EOC.',
        lat: 30.3250,
        lng: 78.0400,
        available: true,
      },
    ],
  });
  console.log('✅ Seeded Uttarakhand civilian volunteer assets (4x4, GENERATOR, MEDICAL, HAM_RADIO)');

  // 8. Seed Supply Requests for Chamoli Shelter (Reflecting RED state)
  const chamoliShelter = await prisma.shelter.findFirst({ where: { name: { contains: 'Chamoli' } } });
  if (chamoliShelter) {
    await prisma.supplyRequest.create({
      data: {
        shelterId: chamoliShelter.id,
        itemName: 'Emergency Drinking Water (20L Cans)',
        quantityNeeded: 200,
        quantityFulfilled: 20,
        unit: 'cans',
        status: 'CRITICAL',
      },
    });

    await prisma.supplyRequest.create({
      data: {
        shelterId: chamoliShelter.id,
        itemName: 'Thermal Heavy Blankets & Sleeping Mats',
        quantityNeeded: 150,
        quantityFulfilled: 25,
        unit: 'blankets',
        status: 'CRITICAL',
      },
    });

    await prisma.supplyRequest.create({
      data: {
        shelterId: chamoliShelter.id,
        itemName: 'Trauma First-Aid Kits & Tetanus Doses',
        quantityNeeded: 40,
        quantityFulfilled: 5,
        unit: 'kits',
        status: 'CRITICAL',
      },
    });
    console.log('✅ Seeded critical supply requests for Chamoli shelter');
  }

  console.log('🎉 ONE-TIME Uttarakhand migration finished successfully!');
}

runUttarakhandMigration()
  .catch((err) => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
