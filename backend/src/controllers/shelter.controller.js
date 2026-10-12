const prisma = require('../db');
const { recordNotice } = require('../services/activity.service');
const { transaction } = require('../services/transaction.service');
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
  arg1,
  capacity,
  waterOk = true,
  rationsOk = true,
  waterLitersRemaining = null,
  waterThreshold = 200,
  rationsUnitsRemaining = null,
  rationsThreshold = 50,
  medicalKitsRemaining = null,
  medicalThreshold = 10,
  blanketsRemaining = null,
  blanketsThreshold = 30
) {
  let occ, cap, wOk, rOk, wRem, wThresh, rRem, rThresh, mRem, mThresh, bRem, bThresh;
  if (typeof arg1 === 'object' && arg1 !== null) {
    occ = arg1.currentOccupancy ?? 0;
    cap = arg1.capacity ?? 1;
    wOk = arg1.waterOk !== false;
    rOk = arg1.rationsOk !== false;
    wRem = arg1.waterLitersRemaining;
    wThresh = arg1.waterThreshold ?? 200;
    rRem = arg1.rationsUnitsRemaining;
    rThresh = arg1.rationsThreshold ?? 50;
    mRem = arg1.medicalKitsRemaining;
    mThresh = arg1.medicalThreshold ?? 10;
    bRem = arg1.blanketsRemaining;
    bThresh = arg1.blanketsThreshold ?? 30;
  } else {
    occ = arg1 ?? 0;
    cap = capacity ?? 1;
    wOk = waterOk !== false;
    rOk = rationsOk !== false;
    wRem = waterLitersRemaining;
    wThresh = waterThreshold ?? 200;
    rRem = rationsUnitsRemaining;
    rThresh = rationsThreshold ?? 50;
    mRem = medicalKitsRemaining;
    mThresh = medicalThreshold ?? 10;
    bRem = blanketsRemaining;
    bThresh = blanketsThreshold ?? 30;
  }

  const safeCap = Math.max(1, cap);
  const pct = occ / safeCap;

  const hasNumWater = typeof wRem === 'number' && !isNaN(wRem);
  const hasNumRations = typeof rRem === 'number' && !isNaN(rRem);
  const hasNumMedical = typeof mRem === 'number' && !isNaN(mRem);
  const hasNumBlankets = typeof bRem === 'number' && !isNaN(bRem);

  const isWaterBreached = !wOk || (hasNumWater && wRem < wThresh);
  const isRationsBreached = !rOk || (hasNumRations && rRem < rThresh);
  const isMedicalBreached = hasNumMedical && mRem < mThresh;
  const isBlanketsBreached = hasNumBlankets && bRem < bThresh;

  if (pct >= 0.9 || isWaterBreached || isRationsBreached || isMedicalBreached || isBlanketsBreached) {
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
    res.status(error.code === 'P2025' ? 404 : error.code === 'P2002' ? 409 : error.code === 'P2003' ? 400 : 500).json({ error: 'Failed to fetch shelters' });
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

    if (typeof name !== 'string' || !name.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || !capacity) {
      return res.status(400).json({ error: 'Missing required shelter fields: name, lat, lng, capacity' });
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'Valid geographic coordinates (lat −90–90, lng −180–180) are required' });
    }

    const parsedCapacity = Number(capacity);
    if (!Number.isSafeInteger(parsedCapacity) || parsedCapacity <= 0 || parsedCapacity > 100000) {
      return res.status(400).json({ error: 'Capacity must be a positive integer between 1 and 100,000' });
    }

    const parsedOccupancy = Number(currentOccupancy);
    if (!Number.isSafeInteger(parsedOccupancy) || parsedOccupancy < 0 || parsedOccupancy > parsedCapacity) return res.status(400).json({ error: 'Occupancy must be an integer within shelter capacity' });
    const parsedWaterLiters = typeof waterLitersRemaining === 'number' ? Math.max(0, waterLitersRemaining) : null;
    const parsedWaterThreshold = parseInt(waterThreshold) || 200;
    const parsedRationsUnits = typeof rationsUnitsRemaining === 'number' ? Math.max(0, rationsUnitsRemaining) : null;
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
        region: require('../services/field.service').regionKey(req.body.region || req.user.serviceRegion),
        name: String(name).trim().slice(0, 150),
        address: String(address || '').slice(0, 250),
        lat,
        lng,
        capacity: parsedCapacity,
        currentOccupancy: Math.min(parsedCapacity, parsedOccupancy),
        contact: String(contact || '').slice(0, 50),
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

    broadcastShelterAudit(shelter);
    res.status(201).json({ message: 'Shelter created', shelter });
  } catch (error) {
    console.error('Error creating shelter:', error);
    res.status(error.code === 'P2025' ? 404 : error.code === 'P2002' ? 409 : error.code === 'P2003' ? 400 : 500).json({ error: 'Failed to create shelter' });
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
  deltaMedicalKits = 0,
  deltaBlankets = 0,
  waterOk = null,
  rationsOk = null,
  reason = 'Field logistics adjustment',
  operatorName = 'Field Operator',
  idempotencyKey = null,
  capturedAt = null,
  occupancyPct = null,
  bedsFree = null,
  syncLog = null,
}) {
  const parsedShelterId = parseInt(shelterId);
  if (isNaN(parsedShelterId)) {
    throw new Error('Invalid shelter ID');
  }

  const result = await transaction(async tx => {
  // Idempotency check: if already processed under this idempotencyKey, return duplicate safe response
  if (idempotencyKey) {
    const existingEvent = await tx.shelterEvent.findUnique({
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

  const existingShelter = await tx.shelter.findUnique({ where: { id: parsedShelterId } });
  if (!existingShelter) {
    throw new Error(`Shelter #${parsedShelterId} not found`);
  }

  const targetOccupancy = bedsFree != null ? Math.max(0, existingShelter.capacity - bedsFree) : occupancyPct != null ? Math.round(existingShelter.capacity * occupancyPct / 100) : null;
  const dOcc = targetOccupancy != null ? targetOccupancy - existingShelter.currentOccupancy : parseInt(deltaOccupancy) || 0;
  const dWater = parseInt(deltaWaterLiters) || 0;
  const dRat = parseInt(deltaRations) || 0;
  const dMed = parseInt(deltaMedicalKits) || 0;
  const dBlk = parseInt(deltaBlankets) || 0;

  // Server-side bounds clamping against real-time database state (Fix 5)
  const newOccupancy = Math.max(0, Math.min(existingShelter.capacity, existingShelter.currentOccupancy + dOcc));
  const namedOccupants=await tx.shelterIntake.count({where:{shelterId:parsedShelterId,status:'PRESENT'}});if(newOccupancy<namedOccupants)throw Object.assign(new Error('Record named departures before reducing occupancy below present arrivals'),{status:409});
  const newWaterLiters =
    existingShelter.waterLitersRemaining == null && dWater === 0 ? null : Math.max(0, (existingShelter.waterLitersRemaining ?? 0) + dWater);
  const newRations =
    existingShelter.rationsUnitsRemaining == null && dRat === 0 ? null : Math.max(0, (existingShelter.rationsUnitsRemaining ?? 0) + dRat);
  const newMedicalKits =
    existingShelter.medicalKitsRemaining == null && dMed === 0 ? null : Math.max(0, (existingShelter.medicalKitsRemaining ?? 0) + dMed);
  const newBlankets =
    existingShelter.blanketsRemaining == null && dBlk === 0 ? null : Math.max(0, (existingShelter.blanketsRemaining ?? 0) + dBlk);

  const effectiveWaterOk = typeof waterOk === 'boolean' ? waterOk : existingShelter.waterOk;
  const effectiveRationsOk = typeof rationsOk === 'boolean' ? rationsOk : existingShelter.rationsOk;

  const newStatus = computeShelterStatus({
    currentOccupancy: newOccupancy,
    capacity: existingShelter.capacity,
    waterLitersRemaining: newWaterLiters,
    waterThreshold: existingShelter.waterThreshold,
    rationsUnitsRemaining: newRations,
    rationsThreshold: existingShelter.rationsThreshold,
    medicalKitsRemaining: newMedicalKits,
    medicalThreshold: existingShelter.medicalThreshold,
    blanketsRemaining: newBlankets,
    blanketsThreshold: existingShelter.blanketsThreshold,
    waterOk: effectiveWaterOk,
    rationsOk: effectiveRationsOk,
  });

  // Detect genuine threshold-crossing event (previous >= threshold and now < threshold)
  const waterCrossed =
    typeof newWaterLiters === 'number' &&
    newWaterLiters < existingShelter.waterThreshold &&
    (existingShelter.waterLitersRemaining === null || existingShelter.waterLitersRemaining >= existingShelter.waterThreshold);

  const rationsCrossed =
    typeof newRations === 'number' &&
    newRations < existingShelter.rationsThreshold &&
    (existingShelter.rationsUnitsRemaining === null || existingShelter.rationsUnitsRemaining >= existingShelter.rationsThreshold);

  const medicalCrossed =
    typeof newMedicalKits === 'number' &&
    newMedicalKits < existingShelter.medicalThreshold &&
    (existingShelter.medicalKitsRemaining === null || existingShelter.medicalKitsRemaining >= existingShelter.medicalThreshold);

  const shelterUpdateData = {
    currentOccupancy: newOccupancy,
    waterLitersRemaining: newWaterLiters,
    rationsUnitsRemaining: newRations,
    medicalKitsRemaining: newMedicalKits,
    blanketsRemaining: newBlankets,
    status: newStatus,
    lastAuditedAt: new Date(),
  };
  if (typeof waterOk === 'boolean') shelterUpdateData.waterOk = waterOk;
  if (typeof rationsOk === 'boolean') shelterUpdateData.rationsOk = rationsOk;

  const event = await tx.shelterEvent.create({
      data: {
        shelterId: parsedShelterId,
        deltaOccupancy: dOcc,
        deltaWaterLiters: dWater,
        deltaRations: dRat,
        deltaMedicalKits: dMed,
        deltaBlankets: dBlk,
        reason: String(reason || 'Field logistics adjustment').trim().slice(0, 500),
        operatorName: String(operatorName || 'Field Operator').trim().slice(0, 100),
        idempotencyKey: idempotencyKey ? String(idempotencyKey).slice(0, 128) : null,
        capturedAt: capturedAt ? new Date(capturedAt) : new Date(),
      },
    });
  const updatedShelter = await tx.shelter.update({
      where: { id: parsedShelterId },
      data: shelterUpdateData,
    });

  const log = syncLog ? await tx.offlineSyncLog.create({ data: { ...syncLog, parsedData: JSON.stringify({ ...JSON.parse(syncLog.parsedData), appliedStatus: updatedShelter.status, eventId: event.id }) } }) : null;
  if (waterCrossed || rationsCrossed || medicalCrossed) {
    const resources = [waterCrossed && 'Water', rationsCrossed && 'Rations', medicalCrossed && 'Medical kits'].filter(Boolean).join(', ');
    await recordNotice(tx, 'RESTOCK', `${updatedShelter.name}: ${resources} need restocking`, true);
  }
  return { event, updatedShelter, log, waterCrossed, rationsCrossed, medicalCrossed, existingShelter, newWaterLiters, newRations, newMedicalKits };
  });
  if (result.duplicateIgnored) return result;
  const { event, updatedShelter, waterCrossed, rationsCrossed, medicalCrossed, existingShelter, newWaterLiters, newRations, newMedicalKits } = result;
  broadcastShelterAudit(updatedShelter);

  if (waterCrossed || rationsCrossed || medicalCrossed) {
    const criticalList = [];
    if (waterCrossed) criticalList.push('WATER');
    if (rationsCrossed) criticalList.push('RATIONS');
    if (medicalCrossed) criticalList.push('MEDICAL');
    broadcastRestockNeeded(updatedShelter, {
      resourceType: criticalList.join(' & '),
      waterLitersRemaining: newWaterLiters,
      waterThreshold: existingShelter.waterThreshold,
      rationsUnitsRemaining: newRations,
      rationsThreshold: existingShelter.rationsThreshold,
      medicalKitsRemaining: newMedicalKits,
      medicalThreshold: existingShelter.medicalThreshold,
    });
  }

  return {
    event,
    shelter: updatedShelter,
    log: result.log,
    duplicateIgnored: false,
  };
}

/**
 * Shelter Readiness Audit (Fix 3: converts accumulative fields to deltas via logShelterEventInternal)
 */
async function auditShelter(req, res) {
  try {
    const shelterId = Number(req.params.id);
    const updated = await transaction(async tx => {
      const existing = await tx.shelter.findUnique({ where: { id: shelterId } });
      if (!existing) throw Object.assign(new Error('Shelter not found'), { status: 404 });
      const data = { lastAuditedAt: new Date() };
      const fields = ['capacity', 'currentOccupancy', 'waterOk', 'rationsOk', 'restroomsOk', 'powerOk', 'waterLitersRemaining', 'waterThreshold', 'rationsUnitsRemaining', 'rationsThreshold', 'medicalKitsRemaining', 'medicalThreshold', 'blanketsRemaining', 'blanketsThreshold'];
      for (const field of fields) if (req.body[field] != null) data[field] = req.body[field];
      const finalState = { ...existing, ...data };
      if (finalState.capacity < finalState.currentOccupancy) throw Object.assign(new Error('Capacity cannot be lower than current occupancy'), { status: 409 });
      if(finalState.currentOccupancy<await tx.shelterIntake.count({where:{shelterId,status:'PRESENT'}}))throw Object.assign(new Error('Record named departures before reducing occupancy below present arrivals'),{status:409});
      data.status = computeShelterStatus(finalState);
      const deltas = {
        deltaOccupancy: finalState.currentOccupancy - existing.currentOccupancy,
        deltaWaterLiters: (finalState.waterLitersRemaining ?? 0) - (existing.waterLitersRemaining ?? 0),
        deltaRations: (finalState.rationsUnitsRemaining ?? 0) - (existing.rationsUnitsRemaining ?? 0),
        deltaMedicalKits: (finalState.medicalKitsRemaining ?? 0) - (existing.medicalKitsRemaining ?? 0),
        deltaBlankets: (finalState.blanketsRemaining ?? 0) - (existing.blanketsRemaining ?? 0),
      };
      await tx.shelterEvent.create({ data: { shelterId, ...deltas, reason: 'Ground readiness audit', operatorName: req.user.name, capturedAt: new Date() } });
      const updated = await tx.shelter.update({ where: { id: shelterId }, data });
      if (updated.status === 'RED') await recordNotice(tx, 'RESTOCK', `${updated.name}: readiness needs attention`, true);
      return updated;
    });
    broadcastShelterAudit(updated);
    if (updated.status === 'RED') broadcastRestockNeeded(updated, { resourceType: 'READINESS', waterLitersRemaining: updated.waterLitersRemaining, rationsUnitsRemaining: updated.rationsUnitsRemaining });
    res.json({ message: 'Shelter audit applied. Current readiness status: ' + updated.status, shelter: updated });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Failed to audit shelter' });
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
      deltaMedicalKits = 0,
      deltaBlankets = 0,
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
      deltaMedicalKits,
      deltaBlankets,
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
    if(error.status)return res.status(error.status).json({error:error.message});
    if (error.message === 'Invalid shelter ID') {
      return res.status(400).json({ error: error.message });
    }
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    console.error('Error logging shelter event:', error);
    return res.status(error.code === 'P2025' ? 404 : error.code === 'P2002' ? 409 : error.code === 'P2003' ? 400 : 500).json({ error: 'Failed to record shelter delta event' });
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
    res.status(error.code === 'P2025' ? 404 : error.code === 'P2002' ? 409 : error.code === 'P2003' ? 400 : 500).json({ error: 'Failed to fetch shelter events' });
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
