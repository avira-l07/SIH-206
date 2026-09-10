const prisma = require('../db');
const {
  broadcastShelterOccupancy,
  broadcastShelterAudit,
  broadcastRestockNeeded,
} = require('../sockets/socketHandler');

/**
 * Combined Shelter Status Calculation (Decision 0.4):
 * RED    if occupancy >= 90% OR waterLitersRemaining < waterThreshold OR rationsUnitsRemaining < rationsThreshold
 *        OR (numerics unset AND (waterOk == false OR rationsOk == false))
 * YELLOW if occupancy >= 70% (and no RED condition applies)
 * GREEN  otherwise
 */
function computeShelterStatus(
  currentOccupancy,
  capacity,
  waterOk = true,
  rationsOk = true,
  waterLitersRemaining = null,
  waterThreshold = 200,
  rationsUnitsRemaining = null,
  rationsThreshold = 50
) {
  const cap = Math.max(1, capacity);
  const pct = currentOccupancy / cap;

  const hasNumericWater = typeof waterLitersRemaining === 'number' && !isNaN(waterLitersRemaining);
  const hasNumericRations = typeof rationsUnitsRemaining === 'number' && !isNaN(rationsUnitsRemaining);

  const isWaterBreached = waterOk === false || (hasNumericWater && waterLitersRemaining < waterThreshold);
  const isRationsBreached = rationsOk === false || (hasNumericRations && rationsUnitsRemaining < rationsThreshold);

  if (pct >= 0.9 || isWaterBreached || isRationsBreached) {
    return 'RED';
  }
  if (pct >= 0.7) {
    return 'YELLOW';
  }
  return 'GREEN';
}

async function getAllShelters(req, res) {
  try {
    const shelters = await prisma.shelter.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      include: {
        supplies: true,
        shipments: true,
      },
    });
    res.status(200).json({ shelters });
  } catch (error) {
    console.error('Error fetching shelters:', error);
    res.status(500).json({ error: 'Failed to fetch shelters' });
  }
}

async function createShelter(req, res) {
  try {
    const {
      name,
      address,
      lat,
      lng,
      capacity,
      currentOccupancy = 0,
      contact,
      waterOk = true,
      rationsOk = true,
      restroomsOk = true,
      powerOk = true,
      waterLitersRemaining = null,
      waterThreshold = 200,
      rationsUnitsRemaining = null,
      rationsThreshold = 50,
    } = req.body;

    if (!name || typeof lat !== 'number' || typeof lng !== 'number' || !capacity) {
      return res.status(400).json({ error: 'Missing required shelter fields: name, lat, lng, capacity' });
    }

    const parsedCapacity = parseInt(capacity);
    const parsedOccupancy = parseInt(currentOccupancy) || 0;
    const parsedWaterLiters = typeof waterLitersRemaining === 'number' ? waterLitersRemaining : null;
    const parsedWaterThreshold = parseInt(waterThreshold) || 200;
    const parsedRationsUnits = typeof rationsUnitsRemaining === 'number' ? rationsUnitsRemaining : null;
    const parsedRationsThreshold = parseInt(rationsThreshold) || 50;

    const status = computeShelterStatus(
      parsedOccupancy,
      parsedCapacity,
      waterOk,
      rationsOk,
      parsedWaterLiters,
      parsedWaterThreshold,
      parsedRationsUnits,
      parsedRationsThreshold
    );

    const shelter = await prisma.shelter.create({
      data: {
        name,
        address: address || '',
        lat,
        lng,
        capacity: parsedCapacity,
        currentOccupancy: parsedOccupancy,
        contact: contact || '',
        waterOk,
        rationsOk,
        restroomsOk,
        powerOk,
        waterLitersRemaining: parsedWaterLiters,
        waterThreshold: parsedWaterThreshold,
        rationsUnitsRemaining: parsedRationsUnits,
        rationsThreshold: parsedRationsThreshold,
        status,
        active: true,
      },
    });

    res.status(201).json({ message: 'Shelter created', shelter });
  } catch (error) {
    console.error('Error creating shelter:', error);
    res.status(500).json({ error: 'Failed to create shelter' });
  }
}

/**
 * Internal single-write-path for mutating shelter occupancy, water, and rations.
 * Clamps currentOccupancy to [0, capacity] and water/rations to >= 0 against the current database values (Fix 5).
 * Records a ShelterEvent and updates Shelter in a single atomic transaction.
 */
async function logShelterEventInternal({
  shelterId,
  deltaOccupancy = 0,
  deltaWaterLiters = 0,
  deltaRations = 0,
  waterOk = null,
  rationsOk = null,
  reason = 'Field logistics adjustment',
  operatorName = 'Field Operator',
  idempotencyKey = null,
  capturedAt = null,
}) {
  const parsedShelterId = parseInt(shelterId);
  if (isNaN(parsedShelterId)) {
    throw new Error('Invalid shelter ID');
  }

  // Idempotency check: if already processed under this idempotencyKey, return duplicate safe response
  if (idempotencyKey) {
    const existingEvent = await prisma.shelterEvent.findUnique({
      where: { idempotencyKey },
      include: { shelter: true },
    });
    if (existingEvent) {
      return {
        event: existingEvent,
        shelter: existingEvent.shelter,
        duplicateIgnored: true,
      };
    }
  }

  const existingShelter = await prisma.shelter.findUnique({ where: { id: parsedShelterId } });
  if (!existingShelter) {
    throw new Error(`Shelter #${parsedShelterId} not found`);
  }

  const dOcc = parseInt(deltaOccupancy) || 0;
  const dWater = parseInt(deltaWaterLiters) || 0;
  const dRat = parseInt(deltaRations) || 0;

  // Server-side bounds clamping against real-time database state (Fix 5)
  const newOccupancy = Math.max(0, Math.min(existingShelter.capacity, existingShelter.currentOccupancy + dOcc));
  const newWaterLiters =
    existingShelter.waterLitersRemaining !== null
      ? Math.max(0, existingShelter.waterLitersRemaining + dWater)
      : null;
  const newRations =
    existingShelter.rationsUnitsRemaining !== null
      ? Math.max(0, existingShelter.rationsUnitsRemaining + dRat)
      : null;

  const effectiveWaterOk = typeof waterOk === 'boolean' ? waterOk : existingShelter.waterOk;
  const effectiveRationsOk = typeof rationsOk === 'boolean' ? rationsOk : existingShelter.rationsOk;

  const newStatus = computeShelterStatus(
    newOccupancy,
    existingShelter.capacity,
    effectiveWaterOk,
    effectiveRationsOk,
    newWaterLiters,
    existingShelter.waterThreshold,
    newRations,
    existingShelter.rationsThreshold
  );

  // Detect genuine threshold-crossing event (previous >= threshold and now < threshold)
  const waterCrossed =
    typeof newWaterLiters === 'number' &&
    newWaterLiters < existingShelter.waterThreshold &&
    (existingShelter.waterLitersRemaining === null || existingShelter.waterLitersRemaining >= existingShelter.waterThreshold);

  const rationsCrossed =
    typeof newRations === 'number' &&
    newRations < existingShelter.rationsThreshold &&
    (existingShelter.rationsUnitsRemaining === null || existingShelter.rationsUnitsRemaining >= existingShelter.rationsThreshold);

  const shelterUpdateData = {
    currentOccupancy: newOccupancy,
    waterLitersRemaining: newWaterLiters,
    rationsUnitsRemaining: newRations,
    status: newStatus,
    lastAuditedAt: new Date(),
  };
  if (typeof waterOk === 'boolean') shelterUpdateData.waterOk = waterOk;
  if (typeof rationsOk === 'boolean') shelterUpdateData.rationsOk = rationsOk;

  const [event, updatedShelter] = await prisma.$transaction([
    prisma.shelterEvent.create({
      data: {
        shelterId: parsedShelterId,
        deltaOccupancy: dOcc,
        deltaWaterLiters: dWater,
        deltaRations: dRat,
        reason: String(reason).trim(),
        operatorName: String(operatorName).trim(),
        idempotencyKey: idempotencyKey || null,
        capturedAt: capturedAt ? new Date(capturedAt) : new Date(),
      },
    }),
    prisma.shelter.update({
      where: { id: parsedShelterId },
      data: shelterUpdateData,
    }),
  ]);

  broadcastShelterAudit(updatedShelter);

  if (waterCrossed || rationsCrossed) {
    broadcastRestockNeeded(updatedShelter, {
      resourceType: waterCrossed && rationsCrossed ? 'WATER & RATIONS' : waterCrossed ? 'WATER' : 'RATIONS',
      waterLitersRemaining: newWaterLiters,
      waterThreshold: existingShelter.waterThreshold,
      rationsUnitsRemaining: newRations,
      rationsThreshold: existingShelter.rationsThreshold,
    });
  }

  return {
    event,
    shelter: updatedShelter,
    duplicateIgnored: false,
  };
}

/**
 * Shelter Readiness Audit (Fix 3: converts accumulative fields to deltas via logShelterEventInternal)
 */
async function auditShelter(req, res) {
  try {
    const { id } = req.params;
    const shelterId = parseInt(id);
    if (isNaN(shelterId)) {
      return res.status(400).json({ error: 'Invalid shelter ID' });
    }

    const existing = await prisma.shelter.findUnique({ where: { id: shelterId } });
    if (!existing) {
      return res.status(404).json({ error: 'Shelter not found' });
    }

    const {
      currentOccupancy,
      capacity,
      waterOk,
      rationsOk,
      restroomsOk,
      powerOk,
      waterLitersRemaining,
      waterThreshold,
      rationsUnitsRemaining,
      rationsThreshold,
    } = req.body;

    // 1. Compute deltas for accumulative fields
    let deltaOccupancy = 0;
    if (typeof currentOccupancy === 'number') {
      deltaOccupancy = currentOccupancy - existing.currentOccupancy;
    }

    let deltaWaterLiters = 0;
    if (typeof waterLitersRemaining === 'number') {
      deltaWaterLiters = waterLitersRemaining - (existing.waterLitersRemaining ?? 0);
    }

    let deltaRations = 0;
    if (typeof rationsUnitsRemaining === 'number') {
      deltaRations = rationsUnitsRemaining - (existing.rationsUnitsRemaining ?? 0);
    }

    let currentShelterState = existing;

    // 2. If any delta is non-zero, route strictly through logShelterEventInternal
    if (deltaOccupancy !== 0 || deltaWaterLiters !== 0 || deltaRations !== 0) {
      const deltaResult = await logShelterEventInternal({
        shelterId,
        deltaOccupancy,
        deltaWaterLiters,
        deltaRations,
        reason: 'Ground readiness audit',
        operatorName: req.user ? req.user.name : 'Ground Auditor',
      });
      currentShelterState = deltaResult.shelter;
    }

    // 3. Keep as direct writes (Fix 3): booleans, thresholds, capacity
    const updatedCapacity = typeof capacity === 'number' ? capacity : currentShelterState.capacity;
    const updatedWaterOk = typeof waterOk === 'boolean' ? waterOk : currentShelterState.waterOk;
    const updatedRationsOk = typeof rationsOk === 'boolean' ? rationsOk : currentShelterState.rationsOk;
    const updatedRestrooms = typeof restroomsOk === 'boolean' ? restroomsOk : currentShelterState.restroomsOk;
    const updatedPower = typeof powerOk === 'boolean' ? powerOk : currentShelterState.powerOk;
    const updatedWaterThreshold =
      typeof waterThreshold === 'number' ? waterThreshold : currentShelterState.waterThreshold;
    const updatedRationsThreshold =
      typeof rationsThreshold === 'number' ? rationsThreshold : currentShelterState.rationsThreshold;

    const newStatus = computeShelterStatus(
      currentShelterState.currentOccupancy,
      updatedCapacity,
      updatedWaterOk,
      updatedRationsOk,
      currentShelterState.waterLitersRemaining,
      updatedWaterThreshold,
      currentShelterState.rationsUnitsRemaining,
      updatedRationsThreshold
    );

    // Direct write strictly for boolean & config fields (the only designated direct write outside logShelterEventInternal)
    const updated = await prisma.shelter.update({
      where: { id: shelterId },
      data: {
        capacity: updatedCapacity,
        waterOk: updatedWaterOk,
        rationsOk: updatedRationsOk,
        restroomsOk: updatedRestrooms,
        powerOk: updatedPower,
        waterThreshold: updatedWaterThreshold,
        rationsThreshold: updatedRationsThreshold,
        status: newStatus,
        lastAuditedAt: new Date(),
      },
    });

    broadcastShelterAudit(updated);

    res.status(200).json({
      message: `Shelter audit applied. Current readiness status: ${newStatus}`,
      shelter: updated,
    });
  } catch (error) {
    console.error('Error auditing shelter:', error);
    res.status(500).json({ error: 'Failed to audit shelter' });
  }
}

/**
 * Processes a delta event log update (+/- occupancy, water, rations)
 * Guarantees commutative, conflict-free multi-operator synchronization
 */
async function logShelterEvent(req, res) {
  try {
    const { id } = req.params;
    const {
      deltaOccupancy = 0,
      deltaWaterLiters = 0,
      deltaRations = 0,
      reason = 'Field logistics adjustment',
      operatorName = req.user ? req.user.name : 'Field Operator',
      idempotencyKey = null,
      capturedAt = null,
    } = req.body;

    const result = await logShelterEventInternal({
      shelterId: id,
      deltaOccupancy,
      deltaWaterLiters,
      deltaRations,
      reason,
      operatorName,
      idempotencyKey,
      capturedAt,
    });

    if (result.duplicateIgnored) {
      return res.status(200).json({
        message: 'Shelter event already processed previously (idempotent)',
        event: result.event,
        shelter: result.shelter,
        duplicateIgnored: true,
      });
    }

    const dOcc = parseInt(deltaOccupancy) || 0;
    return res.status(201).json({
      message: `Delta event applied (${dOcc >= 0 ? '+' : ''}${dOcc} occupancy). Status: ${result.shelter.status}`,
      event: result.event,
      shelter: result.shelter,
    });
  } catch (error) {
    if (error.message === 'Invalid shelter ID') {
      return res.status(400).json({ error: error.message });
    }
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    console.error('Error logging shelter event:', error);
    return res.status(500).json({ error: 'Failed to record shelter delta event' });
  }
}

async function getShelterEvents(req, res) {
  try {
    const { id } = req.params;
    const shelterId = parseInt(id);
    if (isNaN(shelterId)) {
      return res.status(400).json({ error: 'Invalid shelter ID' });
    }

    const events = await prisma.shelterEvent.findMany({
      where: { shelterId },
      orderBy: { capturedAt: 'desc' },
      take: 50,
    });

    res.status(200).json({ events });
  } catch (error) {
    console.error('Error fetching shelter events:', error);
    res.status(500).json({ error: 'Failed to fetch shelter events' });
  }
}

module.exports = {
  getAllShelters,
  createShelter,
  auditShelter,
  logShelterEvent,
  logShelterEventInternal,
  getShelterEvents,
  computeShelterStatus,
};
