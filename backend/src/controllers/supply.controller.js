const prisma = require('../db');

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

    // Compute gap statistics without any reference to quantityOnHand
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
 * Update stock / fulfillment level of a supply request
 */
async function updateSupplyStock(req, res) {
  try {
    const { id } = req.params;
    const { quantityFulfilled, quantityNeeded } = req.body;

    const existing = await prisma.supplyRequest.findUnique({ where: { id: parseInt(id) } });
    if (!existing) {
      return res.status(404).json({ error: 'Supply item not found' });
    }

    const newFulfilled = typeof quantityFulfilled === 'number' ? quantityFulfilled : existing.quantityFulfilled;
    const newNeeded = typeof quantityNeeded === 'number' ? quantityNeeded : existing.quantityNeeded;
    const newStatus = newFulfilled === 0 && newNeeded > 0 ? 'CRITICAL' : newFulfilled < newNeeded ? 'LOW' : 'OK';

    const updated = await prisma.supplyRequest.update({
      where: { id: parseInt(id) },
      data: {
        quantityFulfilled: newFulfilled,
        quantityNeeded: newNeeded,
        status: newStatus,
        updatedAt: new Date(),
      },
    });

    const remainingDeficit = Math.max(0, updated.quantityNeeded - updated.quantityFulfilled);
    res.status(200).json({ message: 'Stock updated', supply: updated, remainingDeficit });
  } catch (error) {
    console.error('Error updating stock:', error);
    res.status(500).json({ error: 'Failed to update stock' });
  }
}

/**
 * Log a Supply Shipment against a shelter's supply request (Decision 0.5)
 * Increments SupplyRequest.quantityFulfilled directly.
 */
async function logSupplyShipment(req, res) {
  try {
    const { shelterId, supplyRequestId, itemName, quantityClaimed, quantityVerified } = req.body;

    if (!shelterId || !itemName) {
      return res.status(400).json({ error: 'shelterId and itemName are required' });
    }

    const qClaimed = parseInt(quantityClaimed) || 0;
    const qVerified = parseInt(quantityVerified) || 0;

    let targetRequestId = supplyRequestId ? parseInt(supplyRequestId) : null;

    // If supplyRequestId not provided explicitly, try finding matching supply request for this shelter
    if (!targetRequestId) {
      const match = await prisma.supplyRequest.findFirst({
        where: {
          shelterId: parseInt(shelterId),
          itemName: { equals: itemName.trim() },
        },
      });
      if (match) targetRequestId = match.id;
    }

    const shipment = await prisma.supplyShipment.create({
      data: {
        shelterId: parseInt(shelterId),
        supplyRequestId: targetRequestId,
        itemName: itemName.trim(),
        quantityClaimed: qClaimed,
        quantityVerified: qVerified,
        loggedByUserId: req.user ? req.user.id : null,
      },
    });

    let updatedSupplyRequest = null;
    let remainingDeficit = 0;

    if (targetRequestId) {
      const existingReq = await prisma.supplyRequest.findUnique({ where: { id: targetRequestId } });
      if (existingReq) {
        const newFulfilled = existingReq.quantityFulfilled + qVerified;
        const newStatus = newFulfilled >= existingReq.quantityNeeded ? 'OK' : newFulfilled === 0 ? 'CRITICAL' : 'LOW';

        updatedSupplyRequest = await prisma.supplyRequest.update({
          where: { id: targetRequestId },
          data: {
            quantityFulfilled: newFulfilled,
            status: newStatus,
            updatedAt: new Date(),
          },
        });
        remainingDeficit = Math.max(0, updatedSupplyRequest.quantityNeeded - updatedSupplyRequest.quantityFulfilled);
      }
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

module.exports = {
  getSupplies,
  upsertSupplyItem,
  updateSupplyStock,
  logSupplyShipment,
  getSupplyShipments,
};
