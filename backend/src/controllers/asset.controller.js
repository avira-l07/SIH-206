const prisma = require('../db');

/**
 * List civilian volunteer assets & skills (boats, 4x4s, generators, medical professionals, HAM radio)
 */
async function getAssets(req, res) {
  try {
    const { type, availableOnly } = req.query;
    const where = {};
    if (type) where.type = type.toUpperCase();
    if (availableOnly === 'true') where.available = true;

    const assets = await prisma.civilianAsset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, phone: true } },
      },
    });

    res.status(200).json({ assets });
  } catch (error) {
    console.error('Error fetching civilian assets:', error);
    res.status(500).json({ error: 'Failed to fetch civilian assets' });
  }
}

/**
 * Register a community resource / volunteer asset
 */
async function registerAsset(req, res) {
  try {
    const { ownerName, contact, type, title, description, lat, lng } = req.body;
    const userId = req.user ? req.user.id : null;

    if (!ownerName || !contact || !type || !title || typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({
        error: 'Required: ownerName, contact, type (BOAT, VEHICLE_4X4, GENERATOR, MEDICAL, HAM_RADIO), title, lat, lng',
      });
    }

    const asset = await prisma.civilianAsset.create({
      data: {
        userId,
        ownerName: ownerName.trim(),
        contact: contact.trim(),
        type: type.toUpperCase(),
        title: title.trim(),
        description: description || '',
        lat,
        lng,
        available: true,
      },
    });

    res.status(201).json({ message: 'Civilian asset registered for emergency mobilization', asset });
  } catch (error) {
    console.error('Error registering asset:', error);
    res.status(500).json({ error: 'Failed to register civilian asset' });
  }
}

/**
 * Toggle availability of an asset
 */
async function toggleAssetAvailability(req, res) {
  try {
    const { id } = req.params;
    const { available } = req.body;

    const updated = await prisma.civilianAsset.update({
      where: { id: parseInt(id) },
      data: { available: Boolean(available) },
    });

    res.status(200).json({ message: 'Asset status updated', asset: updated });
  } catch (error) {
    console.error('Error updating asset:', error);
    res.status(500).json({ error: 'Failed to update asset availability' });
  }
}

module.exports = {
  getAssets,
  registerAsset,
  toggleAssetAvailability,
};
