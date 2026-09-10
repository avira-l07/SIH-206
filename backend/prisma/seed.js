const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Clear existing data in reverse relation order
  await prisma.supplyShipment.deleteMany();
  await prisma.supplyRequest.deleteMany();
  await prisma.civilianAsset.deleteMany();
  await prisma.missingPerson.deleteMany();
  await prisma.hazardConfirmation.deleteMany();
  await prisma.hazardReport.deleteMany();
  await prisma.offlineSyncLog.deleteMany();
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
      trusted: false,
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
      trusted: false,
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
      trusted: true,
    },
  });

  // Trusted Authority User (for instant RED verification demo)
  const trustedOfficer = await prisma.user.create({
    data: {
      name: 'Insp. Vikram Rathore (MCGM Chief)',
      email: 'trusted_officer@sih.gov.in',
      passwordHash: defaultPasswordHash,
      role: 'ADMIN',
      phone: '+91 22 2269 1100',
      lat: 19.0726,
      lng: 72.8845,
      trusted: true,
    },
  });

  // Seeded Nearby Confirmer accounts (for live Grey -> Amber -> Red peer verification demo)
  const confirmer1 = await prisma.user.create({
    data: {
      name: 'Neha Kulkarni (Local Citizen)',
      email: 'confirmer1@sih.gov.in',
      passwordHash: defaultPasswordHash,
      role: 'CITIZEN',
      phone: '+91 98111 22334',
      lat: 19.0735,
      lng: 72.8840,
      trusted: false,
    },
  });

  const confirmer2 = await prisma.user.create({
    data: {
      name: 'Sanjay Verma (Ward Volunteer)',
      email: 'confirmer2@sih.gov.in',
      passwordHash: defaultPasswordHash,
      role: 'CITIZEN',
      phone: '+91 98222 33445',
      lat: 19.0740,
      lng: 72.8855,
      trusted: false,
    },
  });

  console.log('✅ Seeded users: citizen, volunteer, admin, trusted_officer, confirmer1, confirmer2');

  // 2. Seed Shelters with Full Audit Status (Green, Yellow, Red)
  const shelters = [
    {
      id: 101,
      name: 'Bandra West Municipal Safe Camp',
      address: 'Hill Road, Near Bandra Station, Mumbai',
      lat: 19.0596,
      lng: 72.8295,
      capacity: 350,
      currentOccupancy: 45, // 12% - Green
      waterLitersRemaining: 1500,
      waterThreshold: 200,
      rationsUnitsRemaining: 250,
      rationsThreshold: 50,
      waterOk: true,
      rationsOk: true,
      restroomsOk: true,
      powerOk: true,
      status: 'GREEN',
      contact: '+91 22 2640 4321',
    },
    {
      id: 102,
      name: 'Dadar Central Relief Center',
      address: 'Dr. Babasaheb Ambedkar Rd, Dadar East, Mumbai',
      lat: 19.0178,
      lng: 72.8478,
      capacity: 500,
      currentOccupancy: 140, // 28% - Green
      waterLitersRemaining: 1200,
      waterThreshold: 200,
      rationsUnitsRemaining: 400,
      rationsThreshold: 50,
      waterOk: true,
      rationsOk: true,
      restroomsOk: true,
      powerOk: true,
      status: 'GREEN',
      contact: '+91 22 2414 1234',
    },
    {
      id: 103,
      name: 'Andheri West Emergency Shelter Hall',
      address: 'SV Road, Andheri West, Mumbai',
      lat: 19.1197,
      lng: 72.8464,
      capacity: 600,
      currentOccupancy: 210, // 35% - Green
      waterLitersRemaining: 800,
      waterThreshold: 200,
      rationsUnitsRemaining: 300,
      rationsThreshold: 50,
      waterOk: true,
      rationsOk: true,
      restroomsOk: true,
      powerOk: true,
      status: 'GREEN',
      contact: '+91 22 2628 9876',
    },
    {
      id: 104,
      name: 'Chembur Sports Complex Refuge Center',
      address: 'Sion-Trombay Road, Chembur, Mumbai',
      lat: 19.0622,
      lng: 72.8970,
      capacity: 500,
      currentOccupancy: 380, // 76% - Yellow (Near capacity)
      waterLitersRemaining: 350,
      waterThreshold: 200,
      rationsUnitsRemaining: 120,
      rationsThreshold: 50,
      waterOk: true,
      rationsOk: true,
      restroomsOk: true,
      powerOk: false, // Power issue
      status: 'YELLOW',
      contact: '+91 22 2522 3344',
    },
    {
      id: 105,
      name: 'Kurla High-Ground Evacuation Hub',
      address: 'LBS Marg, Kurla West, Mumbai',
      lat: 19.0726,
      lng: 72.8845,
      capacity: 400,
      currentOccupancy: 388, // 97% - RED (>90% full, critical trigger)
      waterLitersRemaining: 140, // Critical threshold breach (140L < 200L)
      waterThreshold: 200,
      rationsUnitsRemaining: 30, // Critical threshold breach (30 units < 50 units)
      rationsThreshold: 50,
      waterOk: false, // Critical resource depleted
      rationsOk: true,
      restroomsOk: false,
      powerOk: false,
      status: 'RED',
      contact: '+91 22 2503 1122',
    },
    {
      id: 106,
      name: 'Colaba Coastal Defense Shelter',
      address: 'SBS Road, Colaba, Mumbai',
      lat: 18.9067,
      lng: 72.8147,
      capacity: 300,
      currentOccupancy: 60,
      waterLitersRemaining: 600,
      waterThreshold: 200,
      rationsUnitsRemaining: 150,
      rationsThreshold: 50,
      waterOk: true,
      rationsOk: true,
      restroomsOk: true,
      powerOk: true,
      status: 'GREEN',
      contact: '+91 22 2218 5566',
    },
  ];

  for (const shelter of shelters) {
    await prisma.shelter.create({ data: shelter });
  }
  console.log(`✅ Seeded ${shelters.length} emergency shelters across GREEN, YELLOW, and RED readiness states`);

  // 3. Seed Disaster Alerts
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

  // 4. Seed Vulnerability-Tagged SOS Requests
  // Urgent: Dialysis + Elderly + Critical Battery + Proxy
  const urgentSos1 = await prisma.sOSRequest.create({
    data: {
      userId: citizen.id,
      userName: citizen.name,
      userPhone: citizen.phone,
      lat: 19.0745,
      lng: 72.8830,
      message: 'Elderly resident on regular dialysis trapped on ground floor as floodwater reaches 3.5 feet. Immediate boat rescue needed!',
      hazardType: 'FLOOD',
      vulnerabilityTags: 'dialysis,elderly',
      priority: 'URGENT',
      status: 'PENDING',
      batteryLevel: 12, // Critical battery
      reportedByProxy: true,
      subjectDescription: 'Elderly neighbor Mr. Joshi (82yo, wheelchair user, 2nd floor balcony)',
    },
  });

  // Urgent: Infant + Pregnant (VERIFIED stage)
  const urgentSos2 = await prisma.sOSRequest.create({
    data: {
      userId: citizen.id,
      userName: 'Kavita Verma',
      userPhone: '+91 98203 99887',
      lat: 19.0680,
      lng: 72.8790,
      message: 'Mother with 4-month-old infant and pregnant woman trapped in residential building stairwell.',
      hazardType: 'FLOOD',
      vulnerabilityTags: 'infant,pregnant',
      priority: 'URGENT',
      status: 'VERIFIED',
      batteryLevel: 45,
      reportedByProxy: false,
    },
  });

  // En Route SOS (claimed by Volunteer)
  const enRouteSos = await prisma.sOSRequest.create({
    data: {
      userId: citizen.id,
      userName: 'Anil Jadhav',
      userPhone: '+91 98205 11223',
      lat: 19.0650,
      lng: 72.8800,
      message: 'Tree fallen on tin shed, family trapped inside. Water at ankle depth.',
      hazardType: 'FLOOD',
      vulnerabilityTags: 'trapped',
      priority: 'NORMAL',
      status: 'EN_ROUTE',
      assignedVolunteerId: volunteer.id,
      batteryLevel: 65,
    },
  });

  // On Scene SOS with Casualty Triage Tag
  const onSceneSos = await prisma.sOSRequest.create({
    data: {
      userId: null,
      userName: 'Ramesh Sawant',
      userPhone: '+91 98206 33445',
      lat: 19.0690,
      lng: 72.8810,
      message: 'Boat arrived on scene. Rescuing 3 people from submerged shop roof. Severe laceration on one resident.',
      hazardType: 'FLOOD',
      vulnerabilityTags: 'elderly',
      priority: 'URGENT',
      status: 'ON_SCENE',
      assignedVolunteerId: volunteer.id,
      triageTag: 'IMMEDIATE',
      batteryLevel: 50,
    },
  });

  // Normal SOS
  const normalSos = await prisma.sOSRequest.create({
    data: {
      userId: null,
      userName: 'Vikas Deshmukh',
      userPhone: '+91 98204 44556',
      lat: 19.0810,
      lng: 72.8750,
      message: 'Basement parking water level 1.5ft, light vehicles stranded, need towing.',
      hazardType: 'FLOOD',
      vulnerabilityTags: '',
      priority: 'NORMAL',
      status: 'PENDING',
      batteryLevel: 85,
    },
  });
  console.log('✅ Seeded SOS requests across PENDING, VERIFIED, EN_ROUTE, and ON_SCENE lifecycle stages');

  // 5. Seed Hazard Reports across Confidence Tiers (GREY, AMBER, RED, DISPUTED, RESOLVED)
  // Tier 1: GREY (0 confirmations, newly reported, WAIST-deep obstruction)
  const greyReport = await prisma.hazardReport.create({
    data: {
      userId: citizen.id,
      userName: citizen.name,
      lat: 19.0715,
      lng: 72.8810,
      hazardNote: 'Waist-deep waterlogging near Kurla West railway subway. Road impassable for light vehicles.',
      severityBenchmark: 'WAIST',
      confidenceTier: 'GREY',
      confirmationsCount: 0,
    },
  });

  // Tier 2: AMBER (1-2 confirmations, KNEE-deep)
  const amberReport = await prisma.hazardReport.create({
    data: {
      userId: confirmer1.id,
      userName: confirmer1.name,
      lat: 19.0750,
      lng: 72.8870,
      hazardNote: 'Downed electric wire submerged across LBS Marg near junction. Severe electrocution hazard.',
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

  // Tier 3: RED (Verified - SUBMERGED ceiling-level life threat)
  const redReport = await prisma.hazardReport.create({
    data: {
      userId: citizen.id,
      userName: citizen.name,
      lat: 19.0730,
      lng: 72.8850,
      hazardNote: 'Mithi River retaining wall overflowed. 5+ feet fast water flowing across main arterial bridge. Boat rescue only.',
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

  // Tier 4: DISPUTED (Rumor debunked by 2 false votes - Decision 0.2)
  const disputedReport = await prisma.hazardReport.create({
    data: {
      userId: citizen.id,
      userName: 'Anonymous Citizen',
      lat: 19.0620,
      lng: 72.8710,
      hazardNote: 'RUMOR: Purported chemical tank explosion near residential school (DEBUNKED FALSE)',
      severityBenchmark: 'ANKLE',
      confidenceTier: 'DISPUTED',
      confirmationsCount: 0,
    },
  });
  await prisma.hazardConfirmation.create({
    data: {
      hazardReportId: disputedReport.id,
      confirmingUserId: confirmer1.id,
      voteType: 'FALSE',
    },
  });
  await prisma.hazardConfirmation.create({
    data: {
      hazardReportId: disputedReport.id,
      confirmingUserId: confirmer2.id,
      voteType: 'FALSE',
    },
  });

  // Tier 5: RESOLVED (Receded water verified clear - Decision 0.2)
  const resolvedHazardReport = await prisma.hazardReport.create({
    data: {
      userId: citizen.id,
      userName: citizen.name,
      lat: 19.0830,
      lng: 72.8910,
      hazardNote: 'Water receded near Tilak Nagar station. Stormwater pumps operational, traffic restored.',
      severityBenchmark: 'ANKLE',
      confidenceTier: 'RESOLVED',
      confirmationsCount: 0,
    },
  });
  await prisma.hazardConfirmation.create({
    data: {
      hazardReportId: resolvedHazardReport.id,
      confirmingUserId: confirmer1.id,
      voteType: 'RESOLVED',
    },
  });
  await prisma.hazardConfirmation.create({
    data: {
      hazardReportId: resolvedHazardReport.id,
      confirmingUserId: trustedOfficer.id,
      voteType: 'RESOLVED',
    },
  });

  console.log('✅ Seeded hazard reports across all 5 confidence tiers (GREY, AMBER, RED, DISPUTED, RESOLVED)');

  // 6. Seed Sample Offline Sync Log
  await prisma.offlineSyncLog.create({
    data: {
      rawPayload: 'SHTR 104 F0 W1 B15',
      parsedData: JSON.stringify({ shelterId: 104, capacityFullPct: 0, waterAvailable: true, bedsFree: 15 }),
      sourceNode: 'Field Radio Node #2 (Mesh/SMS)',
      syncedAt: new Date(Date.now() - 3600 * 1000), // 1 hour ago
    },
  });
  console.log('✅ Seeded simulated offline sync log');

  // 7. Seed Civilian Assets & Skills ("I Have / I Can" Mobilization)
  await prisma.civilianAsset.createMany({
    data: [
      {
        ownerName: 'Capt. Rajesh Mehra',
        contact: '+91 98205 99881',
        type: 'BOAT',
        assetType: 'BOAT',
        title: '8-Person Inflatable Zodiac Rescue Boat with Outboard Motor',
        description: 'Stationed near Kurla Mithi canal. Available immediately for water rescue and evacuation.',
        lat: 19.0728,
        lng: 72.8830,
        available: true,
      },
      {
        ownerName: 'Devendra Sawant',
        contact: '+91 98210 44321',
        type: 'VEHICLE_4X4',
        assetType: 'FOUR_BY_FOUR',
        title: 'Mahindra Thar 4x4 with 9500lb Snorkel Winch',
        description: 'Equipped to tow stranded ambulances and navigate through 3-foot flood water.',
        lat: 19.0610,
        lng: 72.8310,
        available: true,
      },
      {
        ownerName: 'Sunita Rao',
        contact: '+91 98330 12111',
        type: 'GENERATOR',
        assetType: 'GENERATOR',
        title: '15 kVA Heavy-Duty Silent Diesel Generator',
        description: 'Can power oxygen concentrators and shelter lighting during grid blackout.',
        lat: 19.0190,
        lng: 72.8460,
        available: true,
      },
      {
        ownerName: 'Dr. Ananya Sen (MD Trauma)',
        contact: '+91 98700 88776',
        type: 'MEDICAL',
        assetType: 'MEDICAL',
        title: 'Off-Duty Emergency Trauma Physician',
        description: 'Triage specialist carrying field suture kit, emergency insulin, and anti-venom.',
        lat: 19.0400,
        lng: 72.8600,
        available: true,
      },
      {
        ownerName: 'K. Ramakrishnan (VU2XYZ)',
        contact: '+91 98190 33445',
        type: 'HAM_RADIO',
        assetType: 'HAM_RADIO',
        title: 'Licensed Amateur Radio Operator (VHF/UHF Repeater Station)',
        description: 'Independent solar battery backup for zero-grid municipal emergency comms.',
        lat: 19.0550,
        lng: 72.8350,
        available: true,
      },
    ],
  });
  console.log('✅ Seeded civilian volunteer assets with explicit assetTypes (BOAT, FOUR_BY_FOUR, GENERATOR, MEDICAL, HAM_RADIO)');

  // 8. Seed Missing Persons Registry (text-based matching)
  await prisma.missingPerson.createMany({
    data: [
      {
        reportedByName: 'Suresh Deshmukh (Father)',
        contactPhone: '+91 98200 11998',
        fullName: 'Aakash Deshmukh',
        age: 14,
        gender: 'Male',
        lastSeenLocation: 'Kurla East station railway footbridge',
        description: 'Height 5ft 2in, wearing navy blue school uniform and bright yellow raincoat.',
        lat: 19.0726,
        lng: 72.8845,
        status: 'MISSING',
      },
      {
        reportedByName: 'Kavita Devi (Daughter)',
        contactPhone: '+91 98209 88123',
        fullName: 'Meena Devi',
        age: 68,
        gender: 'Female',
        lastSeenLocation: 'Transit Camp Road, Sion Koliwada',
        description: 'Elderly Alzheimer patient, grey hair, green saree. In need of hypertension medication.',
        lat: 19.0420,
        lng: 72.8640,
        status: 'SAFE_AT_SHELTER',
        shelterName: 'Kurla Relief Camp #1 (Buntara Bhavan)',
      },
    ],
  });
  console.log('✅ Seeded missing persons registry with intake match');

  // 9. Seed Shelter Supply Requests & Supply Shipments (SupplyRequest & SupplyShipment)
  const seededShelters = await prisma.shelter.findMany({ take: 2 });
  if (seededShelters.length >= 2) {
    const sr1 = await prisma.supplyRequest.create({
      data: {
        shelterId: seededShelters[0].id,
        itemName: 'Baby Formula & Infant Cereal',
        quantityNeeded: 60,
        quantityFulfilled: 10,
        unit: 'tins',
        status: 'LOW',
      },
    });

    await prisma.supplyRequest.create({
      data: {
        shelterId: seededShelters[0].id,
        itemName: 'Refrigerated Insulin Vials (100 IU)',
        quantityNeeded: 25,
        quantityFulfilled: 0,
        unit: 'vials',
        status: 'CRITICAL',
      },
    });

    await prisma.supplyRequest.create({
      data: {
        shelterId: seededShelters[0].id,
        itemName: 'Packaged Mineral Water (20L Cans)',
        quantityNeeded: 150,
        quantityFulfilled: 30,
        unit: 'cans',
        status: 'LOW',
      },
    });

    await prisma.supplyRequest.create({
      data: {
        shelterId: seededShelters[1].id,
        itemName: 'Clean Drinking Water Bottles',
        quantityNeeded: 100,
        quantityFulfilled: 100,
        unit: 'crates',
        status: 'OK',
      },
    });

    await prisma.supplyRequest.create({
      data: {
        shelterId: seededShelters[1].id,
        itemName: 'Thermal Emergency Blankets',
        quantityNeeded: 80,
        quantityFulfilled: 75,
        unit: 'blankets',
        status: 'OK',
      },
    });

    // Seed sample SupplyShipment
    await prisma.supplyShipment.create({
      data: {
        shelterId: seededShelters[0].id,
        supplyRequestId: sr1.id,
        itemName: 'Baby Formula & Infant Cereal',
        quantityClaimed: 10,
        quantityVerified: 10,
        loggedByUserId: volunteer.id,
      },
    });

    console.log('✅ Seeded shelter supply requests & sample verified supply shipment');
  }

  console.log('🎉 Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
