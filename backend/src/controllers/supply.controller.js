const prisma = require('../db');

/**
 * List all shelter supplies with calculated supply-demand gap
 */
async function getSupplies(req, res) {
  try {
    const { shelterId } = req.query;
    const where = {};
    if (shelterId) where.shelterId = parseInt(shelterId);

    const supplies = await prisma.shelterSupply.findMany({
      where,
      include: {
        shelter: { select: { id: true, name: true, address: true, status: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Compute gap statistics
    const itemsWithGap = supplies.map((item) => {
      const deficit = Math.max(0, item.quantityNeeded - item.quantityOnHand);
      let gapLevel = 'NORMAL';
      if (item.quantityOnHand === 0 && item.quantityNeeded > 0) gapLevel = 'CRITICAL';
      else if (deficit > 0) gapLevel = 'DEFICIT';

      return {
        ...item,
        deficit,
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
 * Log or update a relief item needed/received at a shelter
 */
async function upsertSupplyItem(req, res) {
  try {
    const { shelterId, itemName, quantityNeeded, quantityOnHand, unit = 'units' } = req.body;

    if (!shelterId || !itemName) {
      return res.status(400).json({ error: 'shelterId and itemName are required' });
    }

    const needed = parseInt(quantityNeeded) || 0;
    const onHand = parseInt(quantityOnHand) || 0;
    const status = onHand === 0 && needed > 0 ? 'CRITICAL' : onHand < needed ? 'LOW' : 'OK';

    const supply = await prisma.shelterSupply.create({
      data: {
        shelterId: parseInt(shelterId),
        itemName: itemName.trim(),
        quantityNeeded: needed,
        quantityOnHand: onHand,
        unit: unit.trim(),
        status,
        updatedAt: new Date(),
      },
      include: {
        shelter: { select: { id: true, name: true } },
      },
    });

    res.status(201).json({ message: 'Supply inventory recorded', supply });
  } catch (error) {
    console.error('Error recording supply item:', error);
    res.status(500).json({ error: 'Failed to record supply item' });
  }
}

/**
 * Quick increment/adjustment of stock on hand
 */
async function updateSupplyStock(req, res) {
  try {
    const { id } = req.params;
    const { quantityOnHand, quantityNeeded } = req.body;

    const existing = await prisma.shelterSupply.findUnique({ where: { id: parseInt(id) } });
    if (!existing) {
      return res.status(404).json({ error: 'Supply item not found' });
    }

    const newOnHand = typeof quantityOnHand === 'number' ? quantityOnHand : existing.quantityOnHand;
    const newNeeded = typeof quantityNeeded === 'number' ? quantityNeeded : existing.quantityNeeded;
    const newStatus = newOnHand === 0 && newNeeded > 0 ? 'CRITICAL' : newOnHand < newNeeded ? 'LOW' : 'OK';

    const updated = await prisma.shelterSupply.update({
      where: { id: parseInt(id) },
      data: {
        quantityOnHand: newOnHand,
        quantityNeeded: newNeeded,
        status: newStatus,
        updatedAt: new Date(),
      },
    });

    res.status(200).json({ message: 'Stock updated', supply: updated });
  } catch (error) {
    console.error('Error updating stock:', error);
    res.status(500).json({ error: 'Failed to update stock' });
  }
}

module.exports = {
  getSupplies,
  upsertSupplyItem,
  updateSupplyStock,
};
