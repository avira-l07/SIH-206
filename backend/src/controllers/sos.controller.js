const prisma = require('../db');
const { broadcastSOSCreated, broadcastSOSStatus } = require('../sockets/socketHandler');

async function createSOS(req, res) {
  try {
    const { userName, userPhone, lat, lng, message, hazardType = 'FLOOD' } = req.body;
    const userId = req.user ? req.user.id : null;

    const sos = await prisma.sOSRequest.create({
      data: {
        userId,
        userName: userName || (req.user ? req.user.name : 'Anonymous Citizen'),
        userPhone: userPhone || (req.user ? req.user.phone : null),
        lat,
        lng,
        message,
        hazardType,
        status: 'PENDING',
      },
    });

    broadcastSOSCreated(sos);
    res.status(201).json({ message: 'SOS signal transmitted successfully', sos });
  } catch (error) {
    console.error('Error creating SOS:', error);
    res.status(500).json({ error: 'Failed to dispatch SOS signal' });
  }
}

async function getSOSList(req, res) {
  try {
    const { status } = req.query;
    const where = status ? { status } : {};

    const requests = await prisma.sOSRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, name: true, phone: true, email: true },
        },
      },
    });

    res.status(200).json({ requests });
  } catch (error) {
    console.error('Error fetching SOS list:', error);
    res.status(500).json({ error: 'Failed to fetch SOS list' });
  }
}

async function getMySOS(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const requests = await prisma.sOSRequest.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({ requests });
  } catch (error) {
    console.error('Error fetching user SOS:', error);
    res.status(500).json({ error: 'Failed to fetch your SOS requests' });
  }
}

async function assignSOS(req, res) {
  try {
    const { id } = req.params;
    const volunteerId = req.user.id;

    const existing = await prisma.sOSRequest.findUnique({ where: { id: parseInt(id) } });
    if (!existing) {
      return res.status(404).json({ error: 'SOS request not found' });
    }

    const updated = await prisma.sOSRequest.update({
      where: { id: parseInt(id) },
      data: {
        status: 'IN_PROGRESS',
        assignedVolunteerId: volunteerId,
      },
      include: {
        user: { select: { id: true, name: true, phone: true } },
      },
    });

    broadcastSOSStatus(updated);
    res.status(200).json({ message: 'SOS request assigned to you', sos: updated });
  } catch (error) {
    console.error('Error assigning SOS:', error);
    res.status(500).json({ error: 'Failed to assign SOS request' });
  }
}

async function resolveSOS(req, res) {
  try {
    const { id } = req.params;

    const existing = await prisma.sOSRequest.findUnique({ where: { id: parseInt(id) } });
    if (!existing) {
      return res.status(404).json({ error: 'SOS request not found' });
    }

    const updated = await prisma.sOSRequest.update({
      where: { id: parseInt(id) },
      data: {
        status: 'RESOLVED',
      },
      include: {
        user: { select: { id: true, name: true, phone: true } },
      },
    });

    broadcastSOSStatus(updated);
    res.status(200).json({ message: 'SOS request marked as RESOLVED', sos: updated });
  } catch (error) {
    console.error('Error resolving SOS:', error);
    res.status(500).json({ error: 'Failed to resolve SOS request' });
  }
}

module.exports = {
  createSOS,
  getSOSList,
  getMySOS,
  assignSOS,
  resolveSOS,
};
