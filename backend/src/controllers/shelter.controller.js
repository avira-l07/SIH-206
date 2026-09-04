const prisma = require('../db');
const { broadcastShelterOccupancy } = require('../sockets/socketHandler');

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
    const { name, address, lat, lng, capacity, currentOccupancy = 0, contact } = req.body;

    if (!name || typeof lat !== 'number' || typeof lng !== 'number' || !capacity) {
      return res.status(400).json({ error: 'Missing required shelter fields: name, lat, lng, capacity' });
    }

    const shelter = await prisma.shelter.create({
      data: {
        name,
        address: address || '',
        lat,
        lng,
        capacity: parseInt(capacity),
        currentOccupancy: parseInt(currentOccupancy) || 0,
        contact: contact || '',
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

    const data = {};
    if (typeof currentOccupancy === 'number') data.currentOccupancy = currentOccupancy;
    if (typeof capacity === 'number') data.capacity = capacity;

    const updated = await prisma.shelter.update({
      where: { id: parseInt(id) },
      data,
    });

    broadcastShelterOccupancy(updated);
    res.status(200).json({ message: 'Shelter occupancy updated', shelter: updated });
  } catch (error) {
    console.error('Error updating shelter occupancy:', error);
    res.status(500).json({ error: 'Failed to update shelter' });
  }
}

module.exports = {
  getAllShelters,
  createShelter,
  updateOccupancy,
};
