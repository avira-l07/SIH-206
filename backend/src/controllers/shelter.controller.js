const prisma = require('../db');
const { broadcastShelterOccupancy, broadcastShelterAudit } = require('../sockets/socketHandler');

/**
 * Calculate shelter status per architecture specification:
 * - occupancy >= 90% OR !waterOk OR !rationsOk -> RED
 * - occupancy >= 70% -> YELLOW
 * - otherwise -> GREEN
 */
function computeShelterStatus(currentOccupancy, capacity, waterOk, rationsOk) {
  const cap = Math.max(1, capacity);
  const pct = currentOccupancy / cap;
  if (pct >= 0.9 || !waterOk || !rationsOk) {
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
    } = req.body;

    if (!name || typeof lat !== 'number' || typeof lng !== 'number' || !capacity) {
      return res.status(400).json({ error: 'Missing required shelter fields: name, lat, lng, capacity' });
    }

    const status = computeShelterStatus(
      parseInt(currentOccupancy) || 0,
      parseInt(capacity),
      waterOk,
      rationsOk
    );

    const shelter = await prisma.shelter.create({
      data: {
        name,
        address: address || '',
        lat,
        lng,
        capacity: parseInt(capacity),
        currentOccupancy: parseInt(currentOccupancy) || 0,
        contact: contact || '',
        waterOk,
        rationsOk,
        restroomsOk,
        powerOk,
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

async function updateOccupancy(req, res) {
  try {
    const { id } = req.params;
    const { currentOccupancy, capacity } = req.body;

    const existing = await prisma.shelter.findUnique({ where: { id: parseInt(id) } });
    if (!existing) {
      return res.status(404).json({ error: 'Shelter not found' });
    }

    const newOccupancy = typeof currentOccupancy === 'number' ? currentOccupancy : existing.currentOccupancy;
    const newCapacity = typeof capacity === 'number' ? capacity : existing.capacity;

    const status = computeShelterStatus(
      newOccupancy,
      newCapacity,
      existing.waterOk,
      existing.rationsOk
    );

    const updated = await prisma.shelter.update({
      where: { id: parseInt(id) },
      data: {
        currentOccupancy: newOccupancy,
        capacity: newCapacity,
        status,
      },
    });

    broadcastShelterOccupancy(updated);
    res.status(200).json({ message: 'Shelter occupancy updated', shelter: updated });
  } catch (error) {
    console.error('Error updating shelter occupancy:', error);
    res.status(500).json({ error: 'Failed to update shelter' });
  }
}

/**
 * Shelter Readiness Audit (5-resource status toggle & auto status recalculation)
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
    } = req.body;

    const updatedOccupancy = typeof currentOccupancy === 'number' ? currentOccupancy : existing.currentOccupancy;
    const updatedCapacity = typeof capacity === 'number' ? capacity : existing.capacity;
    const updatedWater = typeof waterOk === 'boolean' ? waterOk : existing.waterOk;
    const updatedRations = typeof rationsOk === 'boolean' ? rationsOk : existing.rationsOk;
    const updatedRestrooms = typeof restroomsOk === 'boolean' ? restroomsOk : existing.restroomsOk;
    const updatedPower = typeof powerOk === 'boolean' ? powerOk : existing.powerOk;

    const newStatus = computeShelterStatus(
      updatedOccupancy,
      updatedCapacity,
      updatedWater,
      updatedRations
    );

    const updated = await prisma.shelter.update({
      where: { id: shelterId },
      data: {
        currentOccupancy: updatedOccupancy,
        capacity: updatedCapacity,
        waterOk: updatedWater,
        rationsOk: updatedRations,
        restroomsOk: updatedRestrooms,
        powerOk: updatedPower,
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

module.exports = {
  getAllShelters,
  createShelter,
  updateOccupancy,
  auditShelter,
  computeShelterStatus,
};
