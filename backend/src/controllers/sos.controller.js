const prisma = require('../db');
const { transaction } = require('../services/transaction.service');
const { recordRescueEvent } = require('../services/activity.service');
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

async function updateSnapshot(snapshot, data, actor, kind, reason) {
  try {
    return await transaction(async tx => {
      if (actor?.role === 'VOLUNTEER') {
        const current = await tx.user.findUnique({ where: { id: actor.id }, select: { role: true, trusted: true } });
        if (!current || current.role !== 'VOLUNTEER' || !current.trusted) throw Object.assign(new Error('Responder approval is required'), { status: 403 });
      }
      if (['RESOLVED', 'CANCELLED'].includes(data.status)) data = { ...data, handoffRequestedAt: null, handoffReason: null };
      if (kind === 'STATUS' && actor?.id === snapshot.assignedVolunteerId && !snapshot.assignmentAcknowledgedAt) data = { ...data, assignmentAcknowledgedAt: new Date() };
      if (['ASSIGNED', 'REASSIGNED'].includes(kind)) {
        const responder = await tx.user.findUnique({ where: { id: data.assignedVolunteerId } });
        if (!responder || (responder.role !== 'ADMIN' && (responder.role !== 'VOLUNTEER' || !responder.trusted)) || responder.onDuty === false || (responder.serviceRegion && responder.serviceRegion !== snapshot.region)) {
          const error = new Error('Select an approved responder who is not off duty'); error.code = 'RESPONDER_UNAVAILABLE'; throw error;
        }
      }
      const updated = await tx.sOSRequest.update({
        where: { id: snapshot.id, updatedAt: snapshot.updatedAt, status: snapshot.status, assignedVolunteerId: snapshot.assignedVolunteerId, citizenConfirmedResolved: snapshot.citizenConfirmedResolved, assignmentAcknowledgedAt: snapshot.assignmentAcknowledgedAt, handoffRequestedAt: snapshot.handoffRequestedAt },
        data, include: { user: { select: { id: true, name: true, phone: true } } },
      });
      if (['RESOLVED','CANCELLED'].includes(updated.status)) await require('../services/field.service').releaseIncidentReservations(tx, updated.id);
      if (['ASSIGNED','REASSIGNED'].includes(kind)) await tx.routeHelpPoint.updateMany({where:{assignedVolunteerId:updated.assignedVolunteerId,confirmedAt:{not:null}},data:{confirmedAt:null}});
      const responder = updated.assignedVolunteerId ? await tx.user.findUnique({ where: { id: updated.assignedVolunteerId }, select: { id: true, name: true } }) : null;
      await recordRescueEvent(tx, updated, actor, kind, snapshot.status, snapshot.assignedVolunteerId, ['ASSIGNED', 'REASSIGNED'].includes(kind) ? `Assigned to ${responder?.name || 'responder'}${reason ? '. Reason: ' + reason : ''}` : undefined);
      return { ...updated, assignedResponder: responder };
    });
  } catch (error) {
    if (error.code === 'P2025') error.code = 'STATE_CONFLICT';
    throw error;
  }
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
    const rawKey = req.body.idempotencyKey;
    if (rawKey != null && (typeof rawKey !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(rawKey))) return res.status(400).json({ error: 'Invalid SOS receipt key' });
    if (rawKey && !userId && !req.database) return res.status(401).json({ error: 'Sign in to send a retry-safe help request' });
    const receiptKey = rawKey && userId && !req.database ? `${userId}:${rawKey}` : null;
    const { sosPayloadHash, receiptDetails } = require('../services/sos-receipt.service');
    const payloadHash = sosPayloadHash(req.body);

    if (typeof lat !== 'number' || typeof lng !== 'number' || !message) {
      return res.status(400).json({ error: 'Coordinates (lat, lng) and message are required' });
    }

    const tagsStr = Array.isArray(vulnerabilityTags)
      ? vulnerabilityTags.join(',')
      : String(vulnerabilityTags || '').trim();

    const parsedBattery = typeof batteryLevel === 'number' && !isNaN(batteryLevel) ? Math.round(batteryLevel) : null;
    const parsedAccuracy = typeof coordsAccuracy === 'number' && !isNaN(coordsAccuracy) ? Math.round(coordsAccuracy) : null;
    const parsedCapturedAt = capturedAt ? new Date(capturedAt) : null;

    // Explicit null check — batteryLevel !== null && batteryLevel <= 15
    const isUrgent = tagsStr.length > 0 || (parsedBattery !== null && parsedBattery <= 15);
    const priority = isUrgent ? 'URGENT' : 'NORMAL';

    const persist = async tx => {
    if (receiptKey) {
      const receipt = await tx.offlineSyncLog.findUnique({ where: { idempotencyKey: receiptKey } });
      if (receipt) {
        const details = receiptDetails(receipt);
        if (details.action !== 'SOS' || details.payloadHash !== payloadHash) throw Object.assign(new Error('This receipt key belongs to different emergency details'), { status: 409 });
        const existing = await tx.sOSRequest.findUnique({ where: { id: details.recordId } });
        if (!existing || existing.userId !== userId) throw Object.assign(new Error('The saved receipt cannot be replayed; check My requests'), { status: 409 });
        return { record: existing, replayed: true };
      }
    }
    const sos = await tx.sOSRequest.create({
      data: {
        userId,
        region: require('../services/field.service').regionKey(req.body.region || req.user?.region),
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

    await recordRescueEvent(tx, sos, req.user, 'CREATED');
    if (receiptKey) await tx.offlineSyncLog.create({ data: { idempotencyKey: receiptKey, sourceNode: 'Browser SOS', rawPayload: JSON.stringify(req.body), parsedData: JSON.stringify({ action: 'SOS', recordId: sos.id, payloadHash }), syncedAt: new Date() } });
    return { record: sos, replayed: false };
    };
    const result = await (req.database ? persist(req.database) : transaction(persist).catch(error => {
      if (receiptKey && error.code === 'P2002') return transaction(persist);
      throw error;
    }));
    const formatted = formatSOS(result.record);
    if (!req.deferBroadcast && !result.replayed) broadcastSOSCreated(formatted);
    res.status(result.replayed ? 200 : 201).json({ message: result.replayed ? 'Previously received help request' : 'Help request received by the server', sos: formatted, replayed: result.replayed });
  } catch (error) {
    console.error('Error creating SOS:', error);
    res.status(error.status || (error.code === 'RESPONDER_UNAVAILABLE' ? 409 : error.code === 'STATE_CONFLICT' ? 409 : error.code === 'P2025' ? 404 : error.code === 'P2002' ? 409 : error.code === 'P2003' ? 400 : 500)).json({ error: error.status === 409 ? error.message : 'Failed to dispatch SOS signal' });
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

    res.status(200).json({ requests: await enrichResponders(requests) });
  } catch (error) {
    console.error('Error fetching SOS list:', error);
    res.status(error.status || (error.code === 'RESPONDER_UNAVAILABLE' ? 409 : error.code === 'STATE_CONFLICT' ? 409 : error.code === 'P2025' ? 404 : error.code === 'P2002' ? 409 : error.code === 'P2003' ? 400 : 500)).json({ error: 'Failed to fetch SOS list' });
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

    res.status(200).json({ requests: await enrichResponders(requests) });
  } catch (error) {
    console.error('Error fetching user SOS:', error);
    res.status(error.status || (error.code === 'RESPONDER_UNAVAILABLE' ? 409 : error.code === 'STATE_CONFLICT' ? 409 : error.code === 'P2025' ? 404 : error.code === 'P2002' ? 409 : error.code === 'P2003' ? 400 : 500)).json({ error: 'Failed to fetch your SOS requests' });
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

    const updated = await updateSnapshot(existing, { status: 'VERIFIED' }, req.user, 'VERIFIED');

    const formatted = formatSOS(updated);
    broadcastSOSVerified(formatted);
    res.status(200).json({ message: 'SOS request verified by control room', sos: formatted });
  } catch (error) {
    console.error('Error verifying SOS:', error);
    res.status(error.status || (error.code === 'RESPONDER_UNAVAILABLE' ? 409 : error.code === 'STATE_CONFLICT' ? 409 : error.code === 'P2025' ? 404 : error.code === 'P2002' ? 409 : error.code === 'P2003' ? 400 : 500)).json({ error: 'Failed to verify SOS request' });
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
    const isAdmin = req.user.role === 'ADMIN';
    if (req.body && Object.hasOwn(req.body, 'volunteerId') && (!Number.isSafeInteger(req.body.volunteerId) || req.body.volunteerId < 1)) return res.status(400).json({ error: 'A valid responder ID is required' });
    const volunteerId = req.body?.volunteerId ?? req.user.id;
    if (!Number.isSafeInteger(volunteerId) || volunteerId < 1) return res.status(400).json({ error: 'A valid responder ID is required' });
    if (!isAdmin && volunteerId !== req.user.id) return res.status(403).json({ error: 'Only operators can assign another responder' });
    if (volunteerId !== req.user.id) {
      const target = await prisma.user.findUnique({ where: { id: volunteerId } });
      if (!target || target.role !== 'VOLUNTEER' || !target.trusted) return res.status(400).json({ error: 'Select an approved volunteer' });
    }

    const existing = await prisma.sOSRequest.findUnique({ where: { id: parseInt(id) } });
    if (!existing) {
      return res.status(404).json({ error: 'SOS request not found' });
    }

    if (existing.status === 'RESOLVED' || existing.status === 'CANCELLED') {
      return res.status(409).json({ error: `Cannot dispatch a ticket that is already ${existing.status}. Refresh the request list.` });
    }

    // Assignment lock check: if already claimed by someone else
    if (existing.assignedVolunteerId && existing.assignedVolunteerId !== volunteerId) {
      return res.status(409).json({ error: 'This SOS request is already assigned to another field responder' });
    }

    // Volunteer role requires ticket to be VERIFIED first
    if (!isAdmin && existing.status === 'PENDING') {
      return res.status(400).json({ error: 'Ticket must be verified by control room before dispatch' });
    }

    if (!['PENDING', 'VERIFIED'].includes(existing.status)) {
      return res.status(409).json({ error: 'Ticket is already dispatched; assignment cannot reset progress' });
    }
    const updated = await updateSnapshot(existing, { status: 'EN_ROUTE', assignedVolunteerId: volunteerId, assignedAt: new Date(), escalatedAt:null, acknowledgmentDueAt: isAdmin && volunteerId !== req.user.id ? new Date(Date.now() + 10 * 60000) : null, assignmentAcknowledgedAt: isAdmin && volunteerId !== req.user.id ? null : new Date(), handoffRequestedAt: null, handoffReason: null }, req.user, 'ASSIGNED');

    const formatted = formatSOS(updated);
    broadcastSOSStatus(formatted);
    res.status(200).json({ message: 'Responder assigned to SOS request', sos: formatted });
  } catch (error) {
    console.error('Error assigning SOS:', error);
    res.status(error.status || (error.code === 'RESPONDER_UNAVAILABLE' ? 409 : error.code === 'STATE_CONFLICT' ? 409 : error.code === 'P2025' ? 404 : error.code === 'P2002' ? 409 : error.code === 'P2003' ? 400 : 500)).json({ error: error.code === 'RESPONDER_UNAVAILABLE' ? error.message : 'Failed to assign SOS request' });
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

    const updated = await updateSnapshot(existing, { status }, req.user, 'STATUS');

    const formatted = formatSOS(updated);
    broadcastSOSStatus(formatted);
    res.status(200).json({ message: `SOS status updated to ${status}`, sos: formatted });
  } catch (error) {
    console.error('Error updating SOS status:', error);
    res.status(error.status || (error.code === 'RESPONDER_UNAVAILABLE' ? 409 : error.code === 'STATE_CONFLICT' ? 409 : error.code === 'P2025' ? 404 : error.code === 'P2002' ? 409 : error.code === 'P2003' ? 400 : 500)).json({ error: 'Failed to update SOS status' });
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

    if (!['ON_SCENE', 'EVACUATED', 'HANDED_OVER_TO_MEDICAL'].includes(existing.status)) {
      return res.status(400).json({ error: 'Resolution requires arrival on scene or a completed evacuation/handover' });
    }

    const updated = await updateSnapshot(existing, { status: 'RESOLVED' }, req.user, 'STATUS');

    const formatted = formatSOS(updated);
    broadcastSOSStatus(formatted);
    res.status(200).json({ message: 'SOS request marked as RESOLVED', sos: formatted });
  } catch (error) {
    console.error('Error resolving SOS:', error);
    res.status(error.status || (error.code === 'RESPONDER_UNAVAILABLE' ? 409 : error.code === 'STATE_CONFLICT' ? 409 : error.code === 'P2025' ? 404 : error.code === 'P2002' ? 409 : error.code === 'P2003' ? 400 : 500)).json({ error: 'Failed to resolve SOS request' });
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

    if (!['PENDING', 'VERIFIED', 'EN_ROUTE', 'ON_SCENE'].includes(existing.status)) return res.status(409).json({ error: 'An evacuated or medically handed-over rescue must be completed, not cancelled' });

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

    const updated = await updateSnapshot(existing, {
        status: 'CANCELLED',
        cancelReason: String(cancelReason).trim(),
      }, req.user, 'CANCELLED');

    const formatted = formatSOS(updated);
    broadcastSOSCancelled(formatted);
    res.status(200).json({ message: 'SOS request cancelled', sos: formatted });
  } catch (error) {
    console.error('Error cancelling SOS:', error);
    res.status(error.status || (error.code === 'RESPONDER_UNAVAILABLE' ? 409 : error.code === 'STATE_CONFLICT' ? 409 : error.code === 'P2025' ? 404 : error.code === 'P2002' ? 409 : error.code === 'P2003' ? 400 : 500)).json({ error: 'Failed to cancel SOS request' });
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

    const updated = await updateSnapshot(existing, { triageTag }, req.user, 'TRIAGE');

    const formatted = formatSOS(updated);
    broadcastSOSTriageTagged(formatted);
    res.status(200).json({ message: `Casualty triage tag applied: ${triageTag}`, sos: formatted });
  } catch (error) {
    console.error('Error setting triage tag:', error);
    res.status(error.status || (error.code === 'RESPONDER_UNAVAILABLE' ? 409 : error.code === 'STATE_CONFLICT' ? 409 : error.code === 'P2025' ? 404 : error.code === 'P2002' ? 409 : error.code === 'P2003' ? 400 : 500)).json({ error: 'Failed to set casualty triage tag' });
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

    if (typeof confirmed !== 'boolean') return res.status(400).json({ error: 'confirmed must be a boolean' });
    if (sos.status !== 'RESOLVED' || sos.citizenConfirmedResolved === true) return res.status(409).json({ error: 'Only a resolved ticket awaiting citizen confirmation can be confirmed or reopened' });

    if (confirmed === true) {
      const updated = await updateSnapshot(sos, {
          citizenConfirmedResolved: true,
          status: 'RESOLVED',
        }, req.user, 'CONFIRMED');

      const formatted = formatSOS(updated);
      broadcastSOSStatus(formatted);
      return res.status(200).json({ message: 'Rescue verified and successfully closed by citizen', sos: formatted });
    } else {
      // Reopen ticket with URGENT priority per Item 1.3
      const prefix = '[REOPENED BY CITIZEN: RESCUE INCOMPLETE] ';
      const newMessage = sos.message.startsWith(prefix) ? sos.message : prefix + sos.message;

      const updated = await updateSnapshot(sos, {
          citizenConfirmedResolved: false,
          status: 'PENDING',
          priority: 'URGENT',
          assignedVolunteerId: null, assignedAt: null, acknowledgmentDueAt: null, assignmentAcknowledgedAt: null, escalatedAt:null, handoffRequestedAt: null, handoffReason: null,
          message: newMessage,
        }, req.user, 'REOPENED');

      const formatted = formatSOS(updated);
      broadcastSOSStatus(formatted);
      return res.status(200).json({
        message: 'Distress signal reopened with URGENT priority. Responders alerted.',
        sos: formatted,
      });
    }
  } catch (error) {
    console.error('Error verifying rescue closure:', error);
    res.status(error.status || (error.code === 'RESPONDER_UNAVAILABLE' ? 409 : error.code === 'STATE_CONFLICT' ? 409 : error.code === 'P2025' ? 404 : error.code === 'P2002' ? 409 : error.code === 'P2003' ? 400 : 500)).json({ error: 'Failed to process citizen rescue verification' });
  }
}

async function getTimeline(req, res, next) {
  try {
    const sos = await prisma.sOSRequest.findUnique({ where: { id: Number(req.params.id) } });
    if (!sos) return res.status(404).json({ error: 'Request not found' });
    const responder = req.user.role === 'ADMIN' || (req.user.role === 'VOLUNTEER' && req.user.trusted);
    if (!responder && sos.userId !== req.user.id) return res.status(403).json({ error: 'This timeline belongs to another account' });
    const events = await prisma.rescueEvent.findMany({ where: { sosId: sos.id }, orderBy: { id: 'asc' } });
    res.json({ events, hasEarlierHistory: !events.some(event => event.kind === 'CREATED') });
  } catch (error) { next(error); }
}

async function enrichResponders(requests) {
  const ids = [...new Set(requests.map(s => s.assignedVolunteerId).filter(Boolean))];
  const responders = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  return requests.map(s => formatSOS({ ...s, assignedResponder: responders.find(r => r.id === s.assignedVolunteerId) || null }));
}

async function assignmentAction(req, res, action) {
  try {
    const existing = await prisma.sOSRequest.findUnique({ where: { id: Number(req.params.id) } });
    if (!existing) return res.status(404).json({ error: 'Request not found' });
    const active = ['EN_ROUTE', 'ON_SCENE', 'EVACUATED', 'HANDED_OVER_TO_MEDICAL'].includes(existing.status);
    if (action === 'withdraw') {
      if (existing.userId !== req.user.id) return res.status(403).json({ error: 'You can only withdraw your own request' });
      if (!['PENDING', 'VERIFIED'].includes(existing.status) || existing.assignedVolunteerId) return res.status(409).json({ error: 'A responder has already been dispatched. Contact the response team instead of withdrawing this request.' });
    } else {
      if (action !== 'reassign' && existing.assignedVolunteerId !== req.user.id) return res.status(403).json({ error: 'Only the assigned responder can perform this action' });
      if (!active) return res.status(409).json({ error: 'This action requires an active rescue' });
    }
    const reason = req.body.reason;
    if (action !== 'acknowledge' && (typeof reason !== 'string' || !reason.trim() || reason.length > 500)) return res.status(400).json({ error: 'Provide a reason of up to 500 characters' });
    let data, kind;
    if (action === 'withdraw') { data = { status: 'CANCELLED', cancelReason: reason.trim() }; kind = 'CANCELLED'; }
    if (action === 'acknowledge') {
      if (existing.assignmentAcknowledgedAt) return res.json({ sos: (await enrichResponders([existing]))[0], message: 'Already acknowledged' });
      data = { assignmentAcknowledgedAt: new Date() }; kind = 'ACKNOWLEDGED';
    }
    if (action === 'handoff') {
      if (existing.handoffRequestedAt) return res.status(409).json({ error: 'A replacement request is already pending' });
      data = { handoffRequestedAt: new Date(), handoffReason: reason.trim() }; kind = 'HANDOFF_REQUESTED';
    }
    if (action === 'reassign') {
      const volunteerId = req.body.volunteerId;
      if (!Number.isSafeInteger(req.body.expectedVolunteerId)) return res.status(400).json({ error: 'The current responder is required for reassignment' });
      if (req.body.expectedVolunteerId !== existing.assignedVolunteerId) return res.status(409).json({ error: 'Another operator changed this assignment. Refresh before reassigning.' });
      if (!Number.isSafeInteger(volunteerId) || volunteerId < 1 || volunteerId === existing.assignedVolunteerId) return res.status(400).json({ error: 'Select a different approved responder' });
      data = { assignedVolunteerId: volunteerId, assignedAt: new Date(), escalatedAt:null, acknowledgmentDueAt: new Date(Date.now() + 10 * 60000), assignmentAcknowledgedAt: null, handoffRequestedAt: null, handoffReason: null }; kind = 'REASSIGNED';
    }
    const updated = await updateSnapshot(existing, data, req.user, kind, action === 'reassign' ? reason.trim() : undefined);
    // Reassignment preserves the rescue stage and notifies both responders through the shared event transaction.
    const formatted = formatSOS(updated); broadcastSOSStatus(formatted);
    res.json({ sos: formatted, message: 'Request updated' });
  } catch (error) {
    const status = error.status || (['STATE_CONFLICT', 'RESPONDER_UNAVAILABLE'].includes(error.code) ? 409 : 500);
    res.status(status).json({ error: status === 409 ? 'The request or responder changed. Refresh and retry.' : 'Could not update this request' });
  }
}
const withdrawSOS = (req, res) => assignmentAction(req, res, 'withdraw');
const acknowledgeSOS = (req, res) => assignmentAction(req, res, 'acknowledge');
const requestHandoff = (req, res) => assignmentAction(req, res, 'handoff');
const reassignSOS = (req, res) => assignmentAction(req, res, 'reassign');

module.exports = {
  withdrawSOS, acknowledgeSOS, requestHandoff, reassignSOS,
  getTimeline,
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
