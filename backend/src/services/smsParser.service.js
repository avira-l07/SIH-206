const prisma = require('../db');
const { logShelterEventInternal } = require('../controllers/shelter.controller');
const { formatSOS } = require('../controllers/sos.controller');
const { broadcastSOSCreated } = require('../sockets/socketHandler');

/**
 * Parses fixed-syntax simulated SMS telemetry payloads:
 * Format 1: SHTR <id> F<occupancyPct> W<1|0> B<freeBeds>
 * Example: "SHTR 104 F0 W1 B15" -> Shelter 104, water OK, 15 beds free
 * Example: "SHTR 101 F95 W0 B2" -> Shelter 101, 95% full, water depleted, 2 beds free
 *
 * Format 2: SOS <lat> <lng> <hazardType> <tag1,tag2> [message...]
 * Example: "SOS 19.0726 72.8845 FLOOD dialysis Ground floor flooded"
 */
function parseSMSPayload(payload = '') {
  if (!payload || typeof payload !== 'string') {
    return { success: false, error: 'Empty or invalid SMS payload string' };
  }

  const trimmed = payload.trim();
  const tokens = trimmed.split(/\s+/);

  if (tokens.length === 0) {
    return { success: false, error: 'Empty payload' };
  }

  const command = tokens[0].toUpperCase();

  // 1. Shelter audit command (SHTR)
  if (command === 'SHTR') {
    if (tokens.length < 2) {
      return { success: false, error: 'Malformed SHTR syntax. Expected: SHTR <id> [F<pct>] [W<1|0>] [B<freeBeds>]' };
    }

    const shelterId = parseInt(tokens[1]);
    if (isNaN(shelterId)) {
      return { success: false, error: `Invalid shelter ID: "${tokens[1]}"` };
    }

    let occupancyPct = null;
    let waterOk = null;
    let bedsFree = null;

    for (let i = 2; i < tokens.length; i++) {
      const token = tokens[i].toUpperCase();
      if (token.startsWith('F')) {
        const val = parseInt(token.substring(1));
        if (!isNaN(val)) occupancyPct = Math.max(0, Math.min(100, val));
      } else if (token.startsWith('W')) {
        const val = token.substring(1);
        waterOk = val === '1' || val === 'TRUE';
      } else if (token.startsWith('B')) {
        const val = parseInt(token.substring(1));
        if (!isNaN(val)) bedsFree = Math.max(0, val);
      }
    }

    return {
      success: true,
      type: 'SHELTER_AUDIT',
      data: {
        shelterId,
        occupancyPct,
        waterOk,
        bedsFree,
      },
      raw: trimmed,
    };
  }

  // 2. Emergency SOS command (SOS)
  if (command === 'SOS') {
    if (tokens.length < 3) {
      return { success: false, error: 'Malformed SOS syntax. Expected: SOS <lat> <lng> [hazardType] [tags] [message]' };
    }

    const lat = parseFloat(tokens[1]);
    const lng = parseFloat(tokens[2]);

    if (isNaN(lat) || isNaN(lng)) {
      return { success: false, error: `Invalid GPS coordinates in SOS payload: "${tokens[1]}, ${tokens[2]}"` };
    }

    const hazardType = tokens[3] ? tokens[3].toUpperCase() : 'FLOOD';
    const tag = tokens[4] ? tokens[4].toLowerCase() : '';
    const message = tokens.slice(5).join(' ') || `Emergency distress beacon via SMS gateway (${hazardType})`;

    return {
      success: true,
      type: 'SOS_TRIGGER',
      data: {
        lat,
        lng,
        hazardType,
        vulnerabilityTags: tag,
        message,
      },
      raw: trimmed,
    };
  }

  return { success: false, error: `Unrecognized command "${command}". Supported: SHTR, SOS` };
}

/**
 * Applies the parsed SMS command directly through the platform services
 */
async function applyParsedPayload(parsedResult, sourceNode = 'SMS Gateway', extraMeta = {}) {
  if (!parsedResult.success) {
    throw new Error(parsedResult.error);
  }

  const { type, data, raw } = parsedResult;

  if (type === 'SHELTER_AUDIT') {
    const shelter = await prisma.shelter.findUnique({ where: { id: data.shelterId } });
    if (!shelter) {
      throw new Error(`Shelter ID #${data.shelterId} not found in municipal registry`);
    }

    let targetOccupancy = shelter.currentOccupancy;
    if (data.bedsFree != null) {
      targetOccupancy = Math.max(0, shelter.capacity - data.bedsFree);
    } else if (data.occupancyPct != null) {
      targetOccupancy = Math.round((data.occupancyPct / 100) * shelter.capacity);
    }

    const deltaOccupancy = targetOccupancy - shelter.currentOccupancy;

    // Apply delta and optional waterOk via single internal event-logging write path
    const { event, shelter: updated } = await logShelterEventInternal({
      shelterId: data.shelterId,
      deltaOccupancy,
      waterOk: typeof data.waterOk === 'boolean' ? data.waterOk : null,
      reason: `SMS Telemetry Ingestion: ${raw}`,
      operatorName: sourceNode || 'SMS Gateway',
    });

    // Log to offline sync log
    const log = await prisma.offlineSyncLog.create({
      data: {
        rawPayload: raw,
        parsedData: JSON.stringify({
          action: 'SHELTER_AUDIT',
          ...data,
          appliedStatus: updated.status,
          eventId: event.id,
          ...extraMeta,
        }),
        sourceNode,
        syncedAt: new Date(),
      },
    });

    return { type: 'SHELTER_AUDIT', record: updated, event, log };
  }

  if (type === 'SOS_TRIGGER') {
    const priority = data.vulnerabilityTags ? 'URGENT' : 'NORMAL';

    const sos = await prisma.sOSRequest.create({
      data: {
        userName: 'SMS Ingested Civilian Beacon',
        userPhone: '+91 SMS-GATEWAY',
        lat: data.lat,
        lng: data.lng,
        hazardType: data.hazardType,
        vulnerabilityTags: data.vulnerabilityTags,
        priority,
        message: data.message,
        status: 'PENDING',
      },
    });

    const formatted = formatSOS(sos);

    const log = await prisma.offlineSyncLog.create({
      data: {
        rawPayload: raw,
        parsedData: JSON.stringify({ action: 'SOS_TRIGGER', ...data, sosId: sos.id, ...extraMeta }),
        sourceNode,
        syncedAt: new Date(),
      },
    });

    broadcastSOSCreated(formatted);
    return { type: 'SOS_TRIGGER', record: formatted, log };
  }

  throw new Error(`Unsupported parsed type: ${type}`);
}

module.exports = {
  parseSMSPayload,
  applyParsedPayload,
};
