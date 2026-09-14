const prisma = require('../db');
const { broadcastSupplyUpdated, broadcastSupplyDistributed } = require('../sockets/socketHandler');

/**
 * Commutative Single-Write-Path helper for Supply stock adjustments (Decision 0.3)
 * Enforces atomic clamping and real-time socket propagation.
 */
async function logSupplyDeltaInternal({
  supplyRequestId,
  deltaFulfilled = 0,
  deltaNeeded = 0,
  idempotencyKey = null,
}) {
  const parsedId = parseInt(supplyRequestId);
  if (isNaN(parsedId)) {
    throw new Error('Valid supplyRequestId is required');
  }

  const existing = await prisma.supplyRequest.findUnique({
    where: { id: parsedId },
    include: { shelter: true },
  });

  if (!existing) {
    throw new Error(`SupplyRequest #${parsedId} not found`);
  }

  const currentFulfilled = existing.quantityFulfilled || 0;
  const currentNeeded = existing.quantityNeeded || 0;

  // Server-side bounds clamping against non-negative lower bound
  const newFulfilled = Math.max(0, currentFulfilled + deltaFulfilled);
  const newNeeded = Math.max(0, currentNeeded + deltaNeeded);

  const newStatus =
    newFulfilled === 0 && newNeeded > 0
      ? 'CRITICAL'
      : newFulfilled < newNeeded
      ? 'LOW'
      : 'OK';

  const updated = await prisma.supplyRequest.update({
    where: { id: parsedId },
    data: {
      quantityFulfilled: newFulfilled,
      quantityNeeded: newNeeded,
      status: newStatus,
      updatedAt: new Date(),
    },
    include: {
      shelter: { select: { id: true, name: true, address: true } },
    },
  });

  const remainingDeficit = Math.max(0, updated.quantityNeeded - updated.quantityFulfilled);

  // Broadcast real-time stock change
  broadcastSupplyUpdated({ supply: updated, remainingDeficit });

  return { supply: updated, remainingDeficit };
}

/**
 * List all shelter supply requests with calculated supply-demand gap
 */
async function getSupplies(req, res) {
  try {
    const { shelterId } = req.query;
    const where = {};
    if (shelterId) where.shelterId = parseInt(shelterId);

    const supplies = await prisma.supplyRequest.findMany({
      where,
      include: {
        shelter: { select: { id: true, name: true, address: true, status: true } },
        shipments: { orderBy: { receivedAt: 'desc' } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const itemsWithGap = supplies.map((item) => {
      const deficit = Math.max(0, item.quantityNeeded - item.quantityFulfilled);
      let gapLevel = 'NORMAL';
      if (item.quantityFulfilled === 0 && item.quantityNeeded > 0) gapLevel = 'CRITICAL';
      else if (deficit > 0) gapLevel = 'DEFICIT';

      return {
        ...item,
        deficit,
        remainingDeficit: deficit,
        gapLevel,
      };
    });

    res.status(200).json({ supplies: itemsWithGap });
  } catch (error) {
    console.error('Error fetching supplies:', error);
    res.status(500).json({ error: 'Failed to fetch supplies' });
  }
}

/**
 * Log or update a relief item needed at a shelter
 */
async function upsertSupplyItem(req, res) {
  try {
    const { shelterId, itemName, quantityNeeded, quantityFulfilled, unit = 'units' } = req.body;

    if (!shelterId || !itemName) {
      return res.status(400).json({ error: 'shelterId and itemName are required' });
    }

    const needed = parseInt(quantityNeeded) || 0;
    const fulfilled = parseInt(quantityFulfilled) || 0;
    const status = fulfilled === 0 && needed > 0 ? 'CRITICAL' : fulfilled < needed ? 'LOW' : 'OK';

    const supply = await prisma.supplyRequest.create({
      data: {
        shelterId: parseInt(shelterId),
        itemName: itemName.trim(),
        quantityNeeded: needed,
        quantityFulfilled: fulfilled,
        unit: unit.trim(),
        status,
        updatedAt: new Date(),
      },
      include: {
        shelter: { select: { id: true, name: true } },
      },
    });

    res.status(201).json({ message: 'Supply request recorded', supply });
  } catch (error) {
    console.error('Error recording supply item:', error);
    res.status(500).json({ error: 'Failed to record supply item' });
  }
}

/**
 * Update stock / fulfillment level of a supply request via single-write-path
 */
async function updateSupplyStock(req, res) {
  try {
    const { id } = req.params;
    const { quantityFulfilled, quantityNeeded } = req.body;

    const existing = await prisma.supplyRequest.findUnique({ where: { id: parseInt(id) } });
    if (!existing) {
      return res.status(404).json({ error: 'Supply item not found' });
    }

    const targetFulfilled = typeof quantityFulfilled === 'number' ? quantityFulfilled : existing.quantityFulfilled;
    const targetNeeded = typeof quantityNeeded === 'number' ? quantityNeeded : existing.quantityNeeded;

    const deltaFulfilled = targetFulfilled - existing.quantityFulfilled;
    const deltaNeeded = targetNeeded - existing.quantityNeeded;

    const { supply: updated, remainingDeficit } = await logSupplyDeltaInternal({
      supplyRequestId: existing.id,
      deltaFulfilled,
      deltaNeeded,
    });

    res.status(200).json({ message: 'Stock updated', supply: updated, remainingDeficit });
  } catch (error) {
    console.error('Error updating stock:', error);
    res.status(500).json({ error: 'Failed to update stock' });
  }
}

/**
 * Log a Supply Shipment against a shelter's supply request (Decision 0.5)
 * Routes quantity through logSupplyDeltaInternal.
 */
async function logSupplyShipment(req, res) {
  try {
    const { shelterId, supplyRequestId, itemName, quantityClaimed, quantityVerified } = req.body;

    const parsedShelterId = parseInt(shelterId);
    if (isNaN(parsedShelterId) || !itemName || typeof itemName !== 'string') {
      return res.status(400).json({ error: 'Valid shelterId and itemName string are required' });
    }

    const trimmedItemName = itemName.trim().slice(0, 100);
    if (trimmedItemName.length === 0) {
      return res.status(400).json({ error: 'itemName cannot be empty' });
    }

    const qClaimed = Math.max(0, Math.min(1000000, parseInt(quantityClaimed) || 0));
    const qVerified = Math.max(0, Math.min(1000000, parseInt(quantityVerified) || 0));

    let targetRequestId = supplyRequestId ? parseInt(supplyRequestId) : null;

    if (!targetRequestId) {
      const match = await prisma.supplyRequest.findFirst({
        where: {
          shelterId: parsedShelterId,
          itemName: { equals: trimmedItemName },
        },
      });
      if (match) targetRequestId = match.id;
    }

    const shipment = await prisma.supplyShipment.create({
      data: {
        shelterId: parsedShelterId,
        supplyRequestId: targetRequestId,
        itemName: trimmedItemName,
        quantityClaimed: qClaimed,
        quantityVerified: qVerified,
        loggedByUserId: req.user ? req.user.id : null,
      },
    });

    let updatedSupplyRequest = null;
    let remainingDeficit = 0;

    if (targetRequestId) {
      const result = await logSupplyDeltaInternal({
        supplyRequestId: targetRequestId,
        deltaFulfilled: qVerified,
      });
      updatedSupplyRequest = result.supply;
      remainingDeficit = result.remainingDeficit;
    }

    res.status(201).json({
      message: 'Supply shipment verified and logged',
      shipment,
      updatedSupplyRequest,
      remainingDeficit,
    });
  } catch (error) {
    console.error('Error logging supply shipment:', error);
    res.status(500).json({ error: 'Failed to log supply shipment' });
  }
}

/**
 * Get verified shipments list for a shelter
 */
async function getSupplyShipments(req, res) {
  try {
    const { shelterId } = req.query;
    const where = {};
    if (shelterId) where.shelterId = parseInt(shelterId);

    const shipments = await prisma.supplyShipment.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      include: {
        shelter: { select: { id: true, name: true } },
        supplyRequest: true,
      },
    });

    res.status(200).json({ shipments });
  } catch (error) {
    console.error('Error fetching supply shipments:', error);
    res.status(500).json({ error: 'Failed to fetch supply shipments' });
  }
}

/**
 * Generate a compact QR code string for a supply item at a shelter (Decision 0.1)
 * Format: SUPPLY:<shelterId>:<supplyRequestId>:<itemSlug>
 */
async function generateSupplyCode(req, res) {
  try {
    const { id } = req.params;
    const supply = await prisma.supplyRequest.findUnique({
      where: { id: parseInt(id) },
      include: { shelter: { select: { id: true, name: true, address: true } } },
    });

    if (!supply) {
      return res.status(404).json({ error: 'Supply request not found' });
    }

    const itemSlug = supply.itemName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const code = `SUPPLY:${supply.shelterId}:${supply.id}:${itemSlug}`;

    res.status(200).json({
      code,
      supplyRequest: supply,
      shelter: supply.shelter,
    });
  } catch (error) {
    console.error('Error generating supply code:', error);
    res.status(500).json({ error: 'Failed to generate supply code' });
  }
}

/**
 * Core internal logic for recording a citizen supply pickup.
 * Can be invoked by HTTP controller or offline batch sync.
 */
async function recordSupplyDistributionInternal({
  citizenId,
  scannedCode,
  quantity = 1,
  idempotencyKey = null,
  queuedAt = null,
}) {
  if (!citizenId) {
    const err = new Error('Authentication required to claim relief supplies');
    err.status = 401;
    throw err;
  }

  const citizen = await prisma.user.findUnique({ where: { id: citizenId } });
  if (!citizen) {
    const err = new Error('Citizen user record not found. Please log in again.');
    err.status = 401;
    throw err;
  }

  if (!scannedCode || typeof scannedCode !== 'string') {
    const err = new Error('scannedCode is required');
    err.status = 400;
    throw err;
  }

  const trimmedCode = scannedCode.trim();
  const parts = trimmedCode.split(':');

  if (parts.length < 3 || parts[0].toUpperCase() !== 'SUPPLY') {
    const err = new Error('Invalid supply QR code format. Expected format: SUPPLY:<shelterId>:<supplyRequestId>:<itemSlug>');
    err.status = 400;
    throw err;
  }

  const shelterId = parseInt(parts[1]);
  const supplyRequestId = parseInt(parts[2]);

  if (isNaN(shelterId) || isNaN(supplyRequestId)) {
    const err = new Error('Malformed shelter ID or supply ID in QR code');
    err.status = 400;
    throw err;
  }

  if (idempotencyKey) {
    const existingDist = await prisma.supplyDistribution.findUnique({
      where: { idempotencyKey },
      include: {
        shelter: { select: { id: true, name: true, address: true } },
        supplyRequest: true,
      },
    });
    if (existingDist) {
      return {
        distribution: existingDist,
        duplicateIgnored: true,
      };
    }
  }

  const supplyRequest = await prisma.supplyRequest.findFirst({
    where: {
      id: supplyRequestId,
      shelterId: shelterId,
    },
    include: { shelter: { select: { id: true, name: true } } },
  });

  if (!supplyRequest) {
    const err = new Error(`Supply item #${supplyRequestId} was not found at Shelter #${shelterId}`);
    err.status = 404;
    throw err;
  }

  const COOLDOWN_HOURS = 12;
  const cooldownThreshold = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000);

  const recentPickup = await prisma.supplyDistribution.findFirst({
    where: {
      citizenId,
      supplyRequestId,
      distributedAt: { gte: cooldownThreshold },
    },
    orderBy: { distributedAt: 'desc' },
  });

  if (recentPickup) {
    const nextEligibleAt = new Date(
      recentPickup.distributedAt.getTime() + COOLDOWN_HOURS * 60 * 60 * 1000
    );
    const timeRemainingMinutes = Math.max(1, Math.round((nextEligibleAt.getTime() - Date.now()) / 60000));
    const hours = Math.floor(timeRemainingMinutes / 60);
    const mins = timeRemainingMinutes % 60;
    const timeLeftStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    const err = new Error(`Anti-Hoarding Protection: You have already claimed ${supplyRequest.itemName} at this shelter today. Next eligible pickup in ${timeLeftStr} (${nextEligibleAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}).`);
    err.status = 429;
    err.nextEligibleAt = nextEligibleAt;
    throw err;
  }

  const pickupQty = Math.max(1, Math.min(10, parseInt(quantity) || 1));

  const { supply: updatedSupply, remainingDeficit } = await logSupplyDeltaInternal({
    supplyRequestId,
    deltaFulfilled: -pickupQty,
    idempotencyKey,
  });

  const finalIdempotencyKey =
    idempotencyKey || `dist_${citizenId}_${supplyRequestId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const distribution = await prisma.supplyDistribution.create({
    data: {
      citizenId,
      shelterId,
      supplyRequestId,
      itemName: supplyRequest.itemName,
      quantity: pickupQty,
      scannedCode: trimmedCode,
      idempotencyKey: finalIdempotencyKey,
      distributedAt: queuedAt ? new Date(queuedAt) : new Date(),
    },
    include: {
      citizen: { select: { id: true, name: true, phone: true } },
      shelter: { select: { id: true, name: true, address: true } },
      supplyRequest: true,
    },
  });

  broadcastSupplyDistributed({
    distribution,
    supply: updatedSupply,
    remainingDeficit,
  });

  return {
    distribution,
    supplyRequest,
    updatedSupply,
    remainingDeficit,
    duplicateIgnored: false,
  };
}

/**
 * Record a citizen supply pickup via QR scan or manual code entry (Decision 0.2 & 0.3)
 * Enforces 12-hour anti-hoarding cooldown per citizen per item, and decrements stock.
 */
async function recordSupplyDistribution(req, res) {
  try {
    const citizenId = req.user?.id;
    if (!citizenId) {
      return res.status(401).json({ error: 'Authentication required to claim relief supplies' });
    }

    const { scannedCode, quantity = 1, idempotencyKey } = req.body;

    const result = await recordSupplyDistributionInternal({
      citizenId,
      scannedCode,
      quantity,
      idempotencyKey,
    });

    if (result.duplicateIgnored) {
      return res.status(200).json({
        message: 'Supply pickup already registered (idempotent)',
        distribution: result.distribution,
        duplicateIgnored: true,
      });
    }

    res.status(201).json({
      message: `Successfully registered pickup of ${result.distribution.quantity} ${result.supplyRequest?.unit || 'units'} of ${result.distribution.itemName} from ${result.distribution.shelter?.name || 'shelter'}`,
      distribution: result.distribution,
      remainingDeficit: result.remainingDeficit,
      stockOnHand: result.updatedSupply.quantityFulfilled,
    });
  } catch (error) {
    if (error.status === 429) {
      return res.status(429).json({
        error: error.message,
        nextEligibleAt: error.nextEligibleAt,
      });
    }
    if (error.status === 400 || error.status === 404 || error.status === 401) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error recording supply distribution:', error);
    res.status(500).json({ error: error.message || 'Failed to record supply distribution' });
  }
}

/**
 * Get personal pickup history for the authenticated citizen (Section 3)
 */
async function getMyDistributions(req, res) {
  try {
    const citizenId = req.user?.id;
    if (!citizenId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const distributions = await prisma.supplyDistribution.findMany({
      where: { citizenId },
      orderBy: { distributedAt: 'desc' },
      include: {
        shelter: { select: { id: true, name: true, address: true } },
        supplyRequest: { select: { id: true, unit: true, status: true } },
      },
    });

    res.status(200).json({ distributions });
  } catch (error) {
    console.error('Error fetching my distributions:', error);
    res.status(500).json({ error: 'Failed to fetch distribution history' });
  }
}

/**
 * Get oversight distribution log for volunteers and admins (Decision 0.6)
 */
async function getShelterDistributions(req, res) {
  try {
    const { shelterId } = req.query;
    const where = {};
    if (shelterId) where.shelterId = parseInt(shelterId);

    const distributions = await prisma.supplyDistribution.findMany({
      where,
      orderBy: { distributedAt: 'desc' },
      include: {
        citizen: { select: { id: true, name: true, phone: true, email: true } },
        shelter: { select: { id: true, name: true, address: true } },
        supplyRequest: { select: { id: true, unit: true } },
      },
    });

    res.status(200).json({ distributions });
  } catch (error) {
    console.error('Error fetching shelter distributions:', error);
    res.status(500).json({ error: 'Failed to fetch shelter distributions' });
  }
}

module.exports = {
  getSupplies,
  upsertSupplyItem,
  updateSupplyStock,
  logSupplyShipment,
  getSupplyShipments,
  logSupplyDeltaInternal,
  generateSupplyCode,
  recordSupplyDistribution,
  recordSupplyDistributionInternal,
  getMyDistributions,
  getShelterDistributions,
};
