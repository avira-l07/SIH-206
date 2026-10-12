const prisma = require('../db');
const { broadcastAssetChanged } = require('../sockets/socketHandler');

function calculateHaversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

function isAssetMatchingHazard(assetType, hazardType) {
  const hazard = (hazardType || '').toUpperCase();
  const asset = (assetType || '').toUpperCase();

  if (hazard === 'FLOOD') {
    return asset === 'BOAT';
  }
  if (['LANDSLIDE', 'EARTHQUAKE', 'ROAD_BLOCK', 'DEBRIS'].includes(hazard)) {
    return ['FOUR_BY_FOUR', 'VEHICLE_4X4', 'TRUCK'].includes(asset);
  }
  if (['FIRE', 'EXPLOSION', 'MASS_CASUALTY'].includes(hazard)) {
    return asset === 'MEDICAL';
  }
  return false;
}

/**
 * List civilian volunteer assets & skills
 */
async function getAssets(req, res) {
  try {
    const { type, assetType, availableOnly } = req.query;
    const where = {};
    if (req.user.role !== 'ADMIN' && !(req.user.role === 'VOLUNTEER' && req.user.trusted)) where.userId = req.user.id;
    if (type) where.type = type.toUpperCase();
    if (assetType) where.assetType = assetType.toUpperCase();
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
    res.status(error.code === 'P2025' ? 404 : error.code === 'P2002' ? 409 : error.code === 'P2003' ? 400 : 500).json({ error: 'Failed to fetch civilian assets' });
  }
}

/**
 * Register a community resource / volunteer asset
 */
async function registerAsset(req, res) {
  try {
    const { ownerName, contact, type, assetType, title, description, lat, lng } = req.body;
    const userId = req.user ? req.user.id : null;

    if (!ownerName || !contact || (!type && !assetType) || !title || typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({
        error: 'Required: ownerName, contact, type/assetType, title, lat, lng',
      });
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({
        error: 'Valid coordinates (lat −90–90, lng −180–180) are required',
      });
    }

    const resolvedType = String(type || assetType).toUpperCase().slice(0, 50);
    const resolvedAssetType = String(assetType || type).toUpperCase().slice(0, 50);

    const asset = await prisma.civilianAsset.create({
      data: {
        userId,
        region: require('../services/field.service').regionKey(req.body.region || req.user.region),
        ownerName: String(ownerName).trim().slice(0, 100),
        contact: String(contact).trim().slice(0, 50),
        type: resolvedType,
        assetType: resolvedAssetType,
        title: String(title).trim().slice(0, 150),
        description: String(description || '').slice(0, 1000),
        lat,
        lng,
        available: true,
      },
    });

    broadcastAssetChanged(asset);
    res.status(201).json({ message: 'Civilian asset registered for emergency mobilization', asset });
  } catch (error) {
    console.error('Error registering asset:', error);
    res.status(error.code === 'P2025' ? 404 : error.code === 'P2002' ? 409 : error.code === 'P2003' ? 400 : 500).json({ error: 'Failed to register civilian asset' });
  }
}

/**
 * Toggle availability of an asset (protected against IDOR)
 */
async function toggleAssetAvailability(req, res) {
  try {
    const assetId = parseInt(req.params.id);
    if (isNaN(assetId)) {
      return res.status(400).json({ error: 'Invalid asset ID' });
    }
    const { available } = req.body;

    const asset = await prisma.civilianAsset.findUnique({ where: { id: assetId } });
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const isAdmin = req.user && req.user.role === 'ADMIN';
    const isOwner = Boolean(asset.userId && req.user && req.user.id === asset.userId);
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: 'You are not authorized to update this resource availability' });
    }

    if(asset.activeReservationId) return res.status(409).json({error:'Release the active booking before changing availability'});
    const changed = await prisma.civilianAsset.updateMany({where:{id:assetId,activeReservationId:null,available:asset.available},data:{available:Boolean(available)}});
    if(!changed.count)return res.status(409).json({error:"Resource changed; refresh before updating"});
    const updated=await prisma.civilianAsset.findUnique({where:{id:assetId}});

    broadcastAssetChanged(updated);
    res.status(200).json({ message: 'Asset status updated', asset: updated });
  } catch (error) {
    console.error('Error updating asset:', error);
    res.status(error.code === 'P2025' ? 404 : error.code === 'P2002' ? 409 : error.code === 'P2003' ? 400 : 500).json({ error: 'Failed to update asset availability' });
  }
}

/**
 * Surface nearest responders for an incident with matching assetType prioritized
 */
async function getAssetSuggestions(req, res) {
  try {
    const { lat, lng, hazardType } = req.query;
    const userLat = Number(lat);
    const userLng = Number(lng);
    if (!lat?.trim() || !lng?.trim() || !Number.isFinite(userLat) || !Number.isFinite(userLng) || Math.abs(userLat) > 90 || Math.abs(userLng) > 180) return res.status(400).json({ error: 'Valid incident coordinates are required' });

    const assets = await prisma.civilianAsset.findMany({
      where: { available: true },
      include: {
        user: { select: { id: true, name: true, phone: true } },
      },
    });

    const calculated = assets.map((asset) => {
      const distanceKm =
        !isNaN(userLat) && !isNaN(userLng)
          ? calculateHaversineKm(userLat, userLng, asset.lat, asset.lng)
          : null;
      const effectiveType = asset.assetType || asset.type;
      const isMatch = isAssetMatchingHazard(effectiveType, hazardType);

      return {
        ...asset,
        distanceKm,
        isMatch,
      };
    });

    // Sort: matching assetType ranked ahead of non-matching; then by distance
    calculated.sort((a, b) => {
      if (a.isMatch && !b.isMatch) return -1;
      if (!a.isMatch && b.isMatch) return 1;
      if (a.distanceKm !== null && b.distanceKm !== null) {
        return a.distanceKm - b.distanceKm;
      }
      return 0;
    });

    res.status(200).json({ suggestions: calculated.filter(asset => asset.distanceKm <= 2), radiusKm: 2 });
  } catch (error) {
    console.error('Error fetching asset suggestions:', error);
    res.status(error.code === 'P2025' ? 404 : error.code === 'P2002' ? 409 : error.code === 'P2003' ? 400 : 500).json({ error: 'Failed to fetch asset suggestions' });
  }
}

module.exports = {
  getAssets,
  registerAsset,
  toggleAssetAvailability,
  getAssetSuggestions,
  calculateHaversineKm,
  isAssetMatchingHazard,
};
