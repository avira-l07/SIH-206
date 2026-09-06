const prisma = require('../db');
const { broadcastSOSCreated, broadcastSOSStatus } = require('../sockets/socketHandler');

/**
 * Format SOS record for API output: converts comma-separated vulnerabilityTags into an array
 */
function formatSOS(sos) {
  if (!sos) return null;
  const rawTags = sos.vulnerabilityTags || '';
  const tagsArray = rawTags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  return {
    ...sos,
    vulnerabilityTags: tagsArray,
  };
}

async function createSOS(req, res) {
  try {
    const {
      userName,
      userPhone,
      lat,
      lng,
      message,
      hazardType = 'FLOOD',
      vulnerabilityTags = '',
      batteryLevel = null,
      reportedByProxy = false,
      subjectDescription = null,
    } = req.body;
    const userId = req.user ? req.user.id : null;

    if (typeof lat !== 'number' || typeof lng !== 'number' || !message) {
      return res.status(400).json({ error: 'Coordinates (lat, lng) and message are required' });
    }

    const tagsStr = Array.isArray(vulnerabilityTags)
      ? vulnerabilityTags.join(',')
      : String(vulnerabilityTags || '').trim();

    const parsedBattery = typeof batteryLevel === 'number' && !isNaN(batteryLevel) ? Math.round(batteryLevel) : null;

    // Decision 0.1: Explicit null check — batteryLevel !== null && batteryLevel <= 15
    const isUrgent = tagsStr.length > 0 || (parsedBattery !== null && parsedBattery <= 15);
    const priority = isUrgent ? 'URGENT' : 'NORMAL';

    const sos = await prisma.sOSRequest.create({
      data: {
        userId,
        userName: userName || (req.user ? req.user.name : 'Anonymous Citizen'),
        userPhone: userPhone || (req.user ? req.user.phone : null),
        lat,
        lng,
        message,
        hazardType,
        vulnerabilityTags: tagsStr,
        priority,
        status: 'PENDING',
        batteryLevel: parsedBattery,
        reportedByProxy: Boolean(reportedByProxy),
        subjectDescription: subjectDescription ? String(subjectDescription).trim() : null,
      },
      include: {
        user: { select: { id: true, name: true, phone: true } },
      },
    });

    const formatted = formatSOS(sos);
    broadcastSOSCreated(formatted);
    res.status(201).json({ message: 'SOS signal transmitted successfully', sos: formatted });
  } catch (error) {
    console.error('Error creating SOS:', error);
    res.status(500).json({ error: 'Failed to dispatch SOS signal' });
  }
}

async function getSOSList(req, res) {
  try {
    const { status, priority } = req.query;
    const where = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const requests = await prisma.sOSRequest.findMany({
      where,
      orderBy: [
        { priority: 'desc' }, // URGENT before NORMAL
        { createdAt: 'desc' },
      ],
      include: {
        user: {
          select: { id: true, name: true, phone: true, email: true },
        },
      },
    });

    res.status(200).json({ requests: requests.map(formatSOS) });
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

    res.status(200).json({ requests: requests.map(formatSOS) });
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

    // Assignment lock check
    if (existing.status === 'IN_PROGRESS' && existing.assignedVolunteerId && existing.assignedVolunteerId !== volunteerId) {
      return res.status(409).json({ error: 'This SOS request is already assigned to another field responder' });
    }

    if (existing.status === 'RESOLVED') {
      return res.status(400).json({ error: 'This SOS request has already been marked as resolved' });
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

    const formatted = formatSOS(updated);
    broadcastSOSStatus(formatted);
    res.status(200).json({ message: 'SOS request assigned to you', sos: formatted });
  } catch (error) {
    console.error('Error assigning SOS:', error);
    res.status(500).json({ error: 'Failed to assign SOS request' });
  }
}

async function updateStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body; // PENDING, VERIFIED, IN_PROGRESS, RESOLVED

    const validStatuses = ['PENDING', 'VERIFIED', 'IN_PROGRESS', 'RESOLVED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const existing = await prisma.sOSRequest.findUnique({ where: { id: parseInt(id) } });
    if (!existing) {
      return res.status(404).json({ error: 'SOS request not found' });
    }

    const data = { status };
    if (status === 'IN_PROGRESS' && !existing.assignedVolunteerId) {
      data.assignedVolunteerId = req.user.id;
    }

    const updated = await prisma.sOSRequest.update({
      where: { id: parseInt(id) },
      data,
      include: {
        user: { select: { id: true, name: true, phone: true } },
      },
    });

    const formatted = formatSOS(updated);
    broadcastSOSStatus(formatted);
    res.status(200).json({ message: `SOS status updated to ${status}`, sos: formatted });
  } catch (error) {
    console.error('Error updating SOS status:', error);
    res.status(500).json({ error: 'Failed to update SOS status' });
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

    const formatted = formatSOS(updated);
    broadcastSOSStatus(formatted);
    res.status(200).json({ message: 'SOS request marked as RESOLVED', sos: formatted });
  } catch (error) {
    console.error('Error resolving SOS:', error);
    res.status(500).json({ error: 'Failed to resolve SOS request' });
  }
}

/**
 * Citizen-side rescue verification & closure confirmation (Item 1.3 / Sprint 2)
 */
async function citizenVerifySOS(req, res) {
  try {
    const { id } = req.params;
    const { confirmed } = req.body;

    const sos = await prisma.sOSRequest.findUnique({ where: { id: parseInt(id) } });
    if (!sos) {
      return res.status(404).json({ error: 'SOS request not found' });
    }

    // Security guard: only the original reporting citizen (or ADMIN) can verify rescue closure
    if (sos.userId && req.user.role !== 'ADMIN' && req.user.id !== sos.userId) {
      return res.status(403).json({ error: 'Only the citizen who filed this distress signal can confirm rescue closure' });
    }

    if (confirmed === true) {
      const updated = await prisma.sOSRequest.update({
        where: { id: parseInt(id) },
        data: {
          citizenConfirmedResolved: true,
          status: 'RESOLVED',
        },
        include: {
          user: { select: { id: true, name: true, phone: true } },
        },
      });

      const formatted = formatSOS(updated);
      broadcastSOSStatus(formatted);
      return res.status(200).json({ message: 'Rescue verified and successfully closed by citizen', sos: formatted });
    } else {
      // Reopen ticket with URGENT priority per Item 1.3
      const prefix = '[REOPENED BY CITIZEN: RESCUE INCOMPLETE] ';
      const newMessage = sos.message.startsWith(prefix) ? sos.message : prefix + sos.message;

      const updated = await prisma.sOSRequest.update({
        where: { id: parseInt(id) },
        data: {
          citizenConfirmedResolved: false,
          status: 'PENDING',
          priority: 'URGENT',
          assignedVolunteerId: null,
          message: newMessage,
        },
        include: {
          user: { select: { id: true, name: true, phone: true } },
        },
      });

      const formatted = formatSOS(updated);
      broadcastSOSStatus(formatted);
      return res.status(200).json({
        message: 'Distress signal reopened with URGENT priority. Responders alerted.',
        sos: formatted,
      });
    }
  } catch (error) {
    console.error('Error verifying rescue closure:', error);
    res.status(500).json({ error: 'Failed to process citizen rescue verification' });
  }
}

module.exports = {
  createSOS,
  getSOSList,
  getMySOS,
  assignSOS,
  updateStatus,
  resolveSOS,
  citizenVerifySOS,
  formatSOS,
};
