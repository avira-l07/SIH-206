const prisma = require('../db');
const { parseSMSPayload, applyParsedPayload } = require('../services/smsParser.service');
const { broadcastSOSCreated, broadcastHazardCreated, broadcastShelterAudit } = require('../sockets/socketHandler');
const { formatSOS } = require('./sos.controller');
const { computeShelterStatus, logShelterEventInternal } = require('./shelter.controller');

/**
 * Ingests a simulated raw SMS telemetry packet
 */
async function ingestSMS(req, res) {
  try {
    const { payload, sourceNode = 'SMS Gateway Demo' } = req.body;

    if (!payload) {
      return res.status(400).json({ error: 'Payload string is required' });
    }

    const parsed = parseSMSPayload(payload);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error });
    }

    const result = await applyParsedPayload(parsed, sourceNode);
    res.status(200).json({
      message: 'Simulated SMS payload parsed and synchronized to platform',
      result,
    });
  } catch (error) {
    console.error('Error ingesting simulated SMS:', error);
    res.status(500).json({ error: error.message || 'Failed to process SMS payload' });
  }
}

/**
 * Fetch simulated mesh & offline sync logs
 */
async function getSyncLogs(req, res) {
  try {
    const logs = await prisma.offlineSyncLog.findMany({
      orderBy: { receivedAt: 'desc' },
      take: 50,
    });
    res.status(200).json({ logs });
  } catch (error) {
    console.error('Error fetching offline logs:', error);
    res.status(500).json({ error: 'Failed to fetch offline sync logs' });
  }
}

/**
 * Ingest a batch of offline-queued items when connection is restored
 * Handles SOS, HAZARD reports, and SMS telemetry with client-side idempotency checking
 */
async function syncOfflineBatch(req, res) {
  try {
    const { items = [], sourceNode = 'Browser Offline Queue' } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items must be an array' });
    }
    if (items.length > 50) {
      return res.status(400).json({ error: 'Batch size exceeds maximum limit of 50 items' });
    }

    const sanitizedSourceNode = String(sourceNode || 'Browser Offline Queue').slice(0, 100);
    const results = [];

    for (const item of items) {
      try {
        const idempotencyKey = item.idempotencyKey || item.id || null;
        // Validate idempotency key to prevent injection into JSON substring match
        const safeKey = idempotencyKey
          ? String(idempotencyKey).replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 128)
          : null;

        // Idempotency check: prevent duplicate replay if already processed
        if (safeKey) {
          const existingLog = await prisma.offlineSyncLog.findFirst({
            where: {
              parsedData: {
                contains: `"idempotencyKey":"${safeKey}"`,
              },
            },
          });
          if (existingLog) {
            results.push({
              item,
              status: 'DUPLICATE_IGNORED',
              message: 'Item already processed previously under idempotency key',
              idempotencyKey: safeKey,
            });
            continue;
          }
        }

        if (item.type === 'SOS') {
          const data = item.payload || {};
          const lat = typeof data.lat === 'number' ? data.lat : parseFloat(data.lat);
          const lng = typeof data.lng === 'number' ? data.lng : parseFloat(data.lng);

          if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            results.push({ item, status: 'FAILED', error: 'Invalid coordinates for SOS (−90 to 90, −180 to 180)' });
            continue;
          }

          const tagsStr = Array.isArray(data.vulnerabilityTags)
            ? data.vulnerabilityTags.join(',')
            : String(data.vulnerabilityTags || '').trim();

          const parsedBattery =
            typeof data.batteryLevel === 'number' && !isNaN(data.batteryLevel)
              ? Math.round(data.batteryLevel)
              : null;
          const isUrgent = tagsStr.length > 0 || (parsedBattery !== null && parsedBattery <= 15);
          const priority = data.priority || (isUrgent ? 'URGENT' : 'NORMAL');

          const parsedAccuracy =
            typeof data.coordsAccuracy === 'number' && !isNaN(data.coordsAccuracy)
              ? Math.round(data.coordsAccuracy)
              : null;
          const parsedCapturedAt = data.capturedAt
            ? new Date(data.capturedAt)
            : item.queuedAt
            ? new Date(item.queuedAt)
            : new Date();

          const sos = await prisma.sOSRequest.create({
            data: {
              userId: data.userId || null,
              userName: String(data.userName || 'Offline Citizen (Queued)').slice(0, 100),
              userPhone: String(data.userPhone || 'OFFLINE-QUEUED').slice(0, 25),
              lat,
              lng,
              coordsAccuracy: parsedAccuracy,
              capturedAt: parsedCapturedAt,
              hazardType: (data.hazardType || 'FLOOD').toUpperCase(),
              vulnerabilityTags: tagsStr.slice(0, 200),
              priority,
              status: 'PENDING',
              message: String(data.message || 'Emergency distress call queued while offline').slice(0, 2000),
              batteryLevel: parsedBattery,
              reportedByProxy: Boolean(data.reportedByProxy),
              subjectDescription: data.subjectDescription ? String(data.subjectDescription).slice(0, 500) : null,
            },
          });

          const formatted = formatSOS(sos);
          broadcastSOSCreated(formatted);

          const log = await prisma.offlineSyncLog.create({
            data: {
              rawPayload: JSON.stringify(item.payload),
              parsedData: JSON.stringify({
                action: 'SOS_TRIGGER',
                idempotencyKey,
                sosId: sos.id,
                coordsAccuracy: parsedAccuracy,
                relayedViaLocalHub: true,
                queuedAt: item.queuedAt || null,
              }),
              sourceNode: sanitizedSourceNode,
              syncedAt: new Date(),
            },
          });

          results.push({ item, status: 'SYNCED', record: formatted, logId: log.id });
        } else if (item.type === 'HAZARD') {
          const data = item.payload || {};
          const lat = typeof data.lat === 'number' ? data.lat : parseFloat(data.lat);
          const lng = typeof data.lng === 'number' ? data.lng : parseFloat(data.lng);

          if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180 || !data.hazardNote) {
            results.push({ item, status: 'FAILED', error: 'Valid coordinates and hazardNote are required' });
            continue;
          }

          let sanitizedPhotoUrl = null;
          if (data.photoUrl) {
            const urlStr = String(data.photoUrl).trim();
            if (urlStr.length <= 500 && /^https?:\/\//i.test(urlStr)) {
              sanitizedPhotoUrl = urlStr;
            }
          }

          const validBenchmarks = ['ANKLE', 'KNEE', 'WAIST', 'SUBMERGED'];
          const benchmark = (data.severityBenchmark || 'KNEE').toUpperCase();

          const report = await prisma.hazardReport.create({
            data: {
              userId: data.userId || null,
              userName: String(data.userName || 'Offline Citizen (Queued)').slice(0, 100),
              lat,
              lng,
              hazardNote: String(data.hazardNote).trim().slice(0, 1000),
              severityBenchmark: validBenchmarks.includes(benchmark) ? benchmark : 'KNEE',
              photoUrl: sanitizedPhotoUrl,
              confidenceTier: 'GREY',
              confirmationsCount: 0,
            },
            include: {
              confirmations: true,
            },
          });

          broadcastHazardCreated(report);

          const log = await prisma.offlineSyncLog.create({
            data: {
              rawPayload: JSON.stringify(item.payload),
              parsedData: JSON.stringify({
                action: 'HAZARD_REPORT',
                idempotencyKey,
                hazardReportId: report.id,
                relayedViaLocalHub: true,
                queuedAt: item.queuedAt || null,
              }),
              sourceNode: sanitizedSourceNode,
              syncedAt: new Date(),
            },
          });

          results.push({ item, status: 'SYNCED', record: report, logId: log.id });
        } else if (item.type === 'SHELTER_EVENT' || item.type === 'SHELTER_DELTA') {
          const data = item.payload || {};
          const shelterId = parseInt(data.shelterId);
          if (isNaN(shelterId)) {
            results.push({ item, status: 'FAILED', error: 'Invalid shelter ID for delta event' });
            continue;
          }

          try {
            const { event, shelter: updatedShelter, duplicateIgnored } = await logShelterEventInternal({
              shelterId,
              deltaOccupancy: data.deltaOccupancy,
              deltaWaterLiters: data.deltaWaterLiters,
              deltaRations: data.deltaRations,
              reason: data.reason || 'Offline field operator delta sync',
              operatorName: data.operatorName || 'Offline Operator',
              idempotencyKey: idempotencyKey || null,
              capturedAt: data.capturedAt || item.queuedAt || null,
            });

            if (duplicateIgnored) {
              results.push({ item, status: 'DUPLICATE', message: 'Event already recorded' });
              continue;
            }

            const log = await prisma.offlineSyncLog.create({
              data: {
                rawPayload: JSON.stringify(item.payload),
                parsedData: JSON.stringify({
                  action: 'SHELTER_DELTA_EVENT',
                  idempotencyKey,
                  shelterId,
                  eventId: event.id,
                  deltaOccupancy: parseInt(data.deltaOccupancy) || 0,
                  appliedStatus: updatedShelter.status,
                  relayedViaLocalHub: true,
                  queuedAt: item.queuedAt || null,
                }),
                sourceNode: sanitizedSourceNode,
                syncedAt: new Date(),
              },
            });

            results.push({ item, status: 'SYNCED', record: event, shelter: updatedShelter, logId: log.id });
          } catch (err) {
            results.push({ item, status: 'FAILED', error: err.message });
          }
        } else if (item.type === 'SAFETY_STATUS') {
          const data = item.payload || {};
          const safetyStatus = data.safetyStatus;
          const valid = ['SAFE', 'NEEDS_HELP', 'UNKNOWN'];

          if (!valid.includes(safetyStatus)) {
            results.push({ item, status: 'FAILED', error: 'Invalid safety status' });
            continue;
          }

          // Determine target userId — never allow email-based lookup (IDOR risk).
          // If caller has a JWT, a CITIZEN may only update their own record.
          let targetUserId = parseInt(data.userId);
          if (req.user && req.user.role === 'CITIZEN') {
            // Authenticated citizen: pin to their own id regardless of payload
            targetUserId = req.user.id;
          }

          if (!targetUserId || isNaN(targetUserId)) {
            results.push({ item, status: 'FAILED', error: 'Valid userId is required for safety status sync' });
            continue;
          }

          const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
          if (!targetUser) {
            results.push({ item, status: 'FAILED', error: 'No matching user found for safety status sync' });
            continue;
          }

          const user = await prisma.user.update({
            where: { id: targetUser.id },
            data: { safetyStatus, safetyUpdatedAt: new Date() },
          });

          const safetyLog = await prisma.offlineSyncLog.create({
            data: {
              rawPayload: JSON.stringify(item.payload),
              parsedData: JSON.stringify({
                action: 'SAFETY_STATUS_SYNC',
                idempotencyKey: safeKey,
                userId: targetUser.id,
                safetyStatus,
                relayedViaLocalHub: true,
                queuedAt: item.queuedAt || null,
              }),
              sourceNode: sanitizedSourceNode,
              syncedAt: new Date(),
            },
          });

          results.push({ item, status: 'SYNCED', record: { id: user.id, safetyStatus: user.safetyStatus }, logId: safetyLog.id });
        } else if (item.type === 'SMS') {
          const payloadStr = typeof item.payload === 'string' ? item.payload : item.payload?.raw || '';
          const parsed = parseSMSPayload(payloadStr);
          if (parsed.success) {
            const applied = await applyParsedPayload(parsed, sourceNode, {
              idempotencyKey,
              relayedViaLocalHub: true,
              queuedAt: item.queuedAt || null,
            });
            results.push({ item, status: 'SYNCED', applied });
          } else {
            results.push({ item, status: 'FAILED', error: parsed.error });
          }
        } else {
          results.push({ item, status: 'FAILED', error: `Unknown item type: ${item.type}` });
        }
      } catch (itemError) {
        console.error('Error processing individual offline item:', itemError);
        results.push({ item, status: 'FAILED', error: itemError.message });
      }
    }

    const syncedCount = results.filter((r) => r.status === 'SYNCED').length;
    const dupeCount = results.filter((r) => r.status === 'DUPLICATE_IGNORED').length;
    const failedCount = results.filter((r) => r.status === 'FAILED').length;

    res.status(200).json({
      message: `Processed ${results.length} offline queued items (${syncedCount} synced, ${dupeCount} duplicates ignored, ${failedCount} failed)`,
      syncedCount,
      dupeCount,
      failedCount,
      results,
    });
  } catch (error) {
    console.error('Error syncing offline batch:', error);
    res.status(500).json({ error: 'Failed to sync batch' });
  }
}

module.exports = {
  ingestSMS,
  getSyncLogs,
  syncOfflineBatch,
};
