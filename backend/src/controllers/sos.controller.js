const prisma = require('../db');
const {
  broadcastSOSCreated,
  broadcastSOSStatus,
  broadcastSOSVerified,
  broadcastSOSCancelled,
  broadcastSOSTriageTagged,
} = require('../sockets/socketHandler');

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
      coordsAccuracy = null,
      capturedAt = null,
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
    const parsedAccuracy = typeof coordsAccuracy === 'number' && !isNaN(coordsAccuracy) ? Math.round(coordsAccuracy) : null;
    const parsedCapturedAt = capturedAt ? new Date(capturedAt) : new Date();

    // Explicit null check — batteryLevel !== null && batteryLevel <= 15
    const isUrgent = tagsStr.length > 0 || (parsedBattery !== null && parsedBattery <= 15);
    const priority = isUrgent ? 'URGENT' : 'NORMAL';

    const sos = await prisma.sOSRequest.create({
      data: {
        userId,
        userName: userName || (req.user ? req.user.name : 'Anonymous Citizen'),
        userPhone: userPhone || (req.user ? req.user.phone : null),
        lat,
        lng,
        coordsAccuracy: parsedAccuracy,
        capturedAt: parsedCapturedAt,
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

/**
 * Control Room / Admin-only verification trigger (Decision 0.1)
 * Moves PENDING -> VERIFIED
 */
async function verifySOS(req, res) {
  try {
    const { id } = req.params;
    const existing = await prisma.sOSRequest.findUnique({ where: { id: parseInt(id) } });
    if (!existing) {
      return res.status(404).json({ error: 'SOS request not found' });
    }

    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only control room administrators can verify emergency tickets' });
    }

    if (existing.status !== 'PENDING') {
      return res.status(400).json({ error: `Only PENDING tickets can be verified. Current status: ${existing.status}` });
    }

    const updated = await prisma.sOSRequest.update({
      where: { id: parseInt(id) },
      data: { status: 'VERIFIED' },
      include: {
        user: { select: { id: true, name: true, phone: true } },
      },
    });

    const formatted = formatSOS(updated);
    broadcastSOSVerified(formatted);
    res.status(200).json({ message: 'SOS request verified by control room', sos: formatted });
  } catch (error) {
    console.error('Error verifying SOS:', error);
    res.status(500).json({ error: 'Failed to verify SOS request' });
  }
}

/**
 * Assign SOS — the EXCLUSIVE entrypoint to EN_ROUTE (Decision 0.1)
 * Plain volunteer requires ticket to be in VERIFIED state.
 * Admin may claim from PENDING or VERIFIED (auto-progresses to EN_ROUTE).
 */
async function assignSOS(req, res) {
  try {
    const { id } = req.params;
    const volunteerId = req.user.id;
    const isAdmin = req.user.role === 'ADMIN';

    const existing = await prisma.sOSRequest.findUnique({ where: { id: parseInt(id) } });
    if (!existing) {
      return res.status(404).json({ error: 'SOS request not found' });
    }

    if (existing.status === 'RESOLVED' || existing.status === 'CANCELLED') {
      return res.status(400).json({ error: `Cannot dispatch a ticket that is already ${existing.status}` });
    }

    // Assignment lock check: if already claimed by someone else
    if (existing.assignedVolunteerId && existing.assignedVolunteerId !== volunteerId) {
      return res.status(409).json({ error: 'This SOS request is already assigned to another field responder' });
    }

    // Volunteer role requires ticket to be VERIFIED first
    if (!isAdmin && existing.status === 'PENDING') {
      return res.status(400).json({ error: 'Ticket must be verified by control room before dispatch' });
    }

    const updated = await prisma.sOSRequest.update({
      where: { id: parseInt(id) },
      data: {
        status: 'EN_ROUTE',
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

/**
 * Generic status transition engine (Decision 0.1)
 * - Excludes VERIFIED -> EN_ROUTE (that belongs exclusively to assignSOS).
 * - Enforces ownership guard: assigned volunteer or admin only.
 * - Permitted forward progression:
 *   EN_ROUTE -> ON_SCENE
 *   ON_SCENE -> EVACUATED | RESOLVED
 *   EVACUATED -> HANDED_OVER_TO_MEDICAL | RESOLVED
 *   HANDED_OVER_TO_MEDICAL -> RESOLVED
 */
async function updateStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const existing = await prisma.sOSRequest.findUnique({ where: { id: parseInt(id) } });
    if (!existing) {
      return res.status(404).json({ error: 'SOS request not found' });
    }

    // Bypass check: VERIFIED -> EN_ROUTE is forbidden via generic /status
    if (status === 'EN_ROUTE') {
      return res.status(400).json({ error: 'Invalid transition. Must claim via /api/sos/:id/assign' });
    }

    // Ownership guard: only assigned volunteer or admin can advance post-claim statuses
    const isAssigned = existing.assignedVolunteerId === req.user.id;
    const isAdmin = req.user.role === 'ADMIN';
    if (!isAssigned && !isAdmin) {
      return res.status(403).json({ error: "Only the assigned volunteer or an administrator can advance this ticket's status" });
    }

    // Define allowed sequential forward transitions
    const ALLOWED_TRANSITIONS = {
      EN_ROUTE: ['ON_SCENE'],
      ON_SCENE: ['EVACUATED', 'RESOLVED'],
      EVACUATED: ['HANDED_OVER_TO_MEDICAL', 'RESOLVED'],
      HANDED_OVER_TO_MEDICAL: ['RESOLVED'],
    };

    const allowedNext = ALLOWED_TRANSITIONS[existing.status] || [];
    if (!allowedNext.includes(status)) {
      return res.status(400).json({
        error: `Invalid state transition from ${existing.status} to ${status}. Allowed: ${allowedNext.join(', ') || 'none'}`,
      });
    }

    const updated = await prisma.sOSRequest.update({
      where: { id: parseInt(id) },
      data: { status },
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

/**
 * Resolve SOS directly
 */
async function resolveSOS(req, res) {
  try {
    const { id } = req.params;
    const existing = await prisma.sOSRequest.findUnique({ where: { id: parseInt(id) } });
    if (!existing) {
      return res.status(404).json({ error: 'SOS request not found' });
    }

    // Ownership guard: assigned volunteer or admin only
    const isAssigned = existing.assignedVolunteerId === req.user.id;
    const isAdmin = req.user.role === 'ADMIN';
    if (!isAssigned && !isAdmin) {
      return res.status(403).json({ error: 'Only the assigned volunteer or an administrator can resolve this ticket' });
    }

    if (existing.status === 'RESOLVED') {
      return res.status(400).json({ error: 'This ticket is already resolved' });
    }

    const updated = await prisma.sOSRequest.update({
      where: { id: parseInt(id) },
      data: { status: 'RESOLVED' },
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
 * Cancel SOS (False alarm / terminal state)
 * Guard: Admin from PENDING/VERIFIED; assigned volunteer or admin from EN_ROUTE/ON_SCENE.
 * Requires cancelReason.
 */
async function cancelSOS(req, res) {
  try {
    const { id } = req.params;
    const { cancelReason } = req.body;

    if (!cancelReason || !String(cancelReason).trim()) {
      return res.status(400).json({ error: 'Cancellation reason is required' });
    }

    const existing = await prisma.sOSRequest.findUnique({ where: { id: parseInt(id) } });
    if (!existing) {
      return res.status(404).json({ error: 'SOS request not found' });
    }

    if (existing.status === 'RESOLVED' || existing.status === 'CANCELLED') {
      return res.status(400).json({ error: `Cannot cancel a ticket that is already ${existing.status}` });
    }

    const isAdmin = req.user.role === 'ADMIN';
    const isAssigned = existing.assignedVolunteerId === req.user.id;

    // Unassigned pre-claim stages require admin
    if (['PENDING', 'VERIFIED'].includes(existing.status)) {
      if (!isAdmin) {
        return res.status(403).json({ error: 'Only an administrator can cancel unassigned tickets' });
      }
    } else {
      // Claimed stages require assigned volunteer or admin
      if (!isAssigned && !isAdmin) {
        return res.status(403).json({ error: 'Only the assigned volunteer or an administrator can cancel this ticket' });
      }
    }

    const updated = await prisma.sOSRequest.update({
      where: { id: parseInt(id) },
      data: {
        status: 'CANCELLED',
        cancelReason: String(cancelReason).trim(),
      },
      include: {
        user: { select: { id: true, name: true, phone: true } },
      },
    });

    const formatted = formatSOS(updated);
    broadcastSOSCancelled(formatted);
    res.status(200).json({ message: 'SOS request cancelled', sos: formatted });
  } catch (error) {
    console.error('Error cancelling SOS:', error);
    res.status(500).json({ error: 'Failed to cancel SOS request' });
  }
}

/**
 * Casualty Triage Tagging (Decision 0.2)
 * Guard: assigned volunteer or admin only.
 */
async function setTriageTag(req, res) {
  try {
    const { id } = req.params;
    const { triageTag } = req.body;

    const validTags = ['IMMEDIATE', 'DELAYED', 'MINOR', 'DECEASED'];
    if (!validTags.includes(triageTag)) {
      return res.status(400).json({ error: `Invalid triage tag. Allowed: ${validTags.join(', ')}` });
    }

    const existing = await prisma.sOSRequest.findUnique({ where: { id: parseInt(id) } });
    if (!existing) {
      return res.status(404).json({ error: 'SOS request not found' });
    }

    const isAdmin = req.user.role === 'ADMIN';
    const isAssigned = existing.assignedVolunteerId === req.user.id;
    if (!isAssigned && !isAdmin) {
      return res.status(403).json({ error: 'Only the assigned volunteer or an administrator can set casualty triage tags' });
    }

    const updated = await prisma.sOSRequest.update({
      where: { id: parseInt(id) },
      data: { triageTag },
      include: {
        user: { select: { id: true, name: true, phone: true } },
      },
    });

    const formatted = formatSOS(updated);
    broadcastSOSTriageTagged(formatted);
    res.status(200).json({ message: `Casualty triage tag applied: ${triageTag}`, sos: formatted });
  } catch (error) {
    console.error('Error setting triage tag:', error);
    res.status(500).json({ error: 'Failed to set casualty triage tag' });
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
    const isAdmin = req.user && req.user.role === 'ADMIN';
    const isOwner = Boolean(sos.userId && req.user && req.user.id === sos.userId);
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: 'Only the citizen who filed this distress signal (or an administrator) can confirm rescue closure' });
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
  verifySOS,
  assignSOS,
  updateStatus,
  resolveSOS,
  cancelSOS,
  setTriageTag,
  citizenVerifySOS,
  formatSOS,
};
