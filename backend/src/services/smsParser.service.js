const { transaction } = require('./transaction.service');
const { HAZARD_TYPES } = require('../constants');
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
  if (!payload || typeof payload !== 'string' || payload.length > 2000) {
    return { success: false, error: 'Empty or invalid SMS payload string' };
  }

  const trimmed = payload.trim();
  if (!trimmed) return { success: false, error: 'Empty SMS payload' };
  const tokens = trimmed.split(/\s+/);

  if (tokens.length === 0) {
    return { success: false, error: 'Empty payload' };
  }

  const command = tokens[0].toUpperCase();

  // 1. Shelter audit command (SHTR)
  if (command === 'SHTR') {
    if (tokens.length < 3) {
      return { success: false, error: 'Malformed SHTR syntax. Expected: SHTR <id> [F<pct>] [W<1|0>] [B<freeBeds>]' };
    }

    const shelterId = Number(tokens[1]);
    if (!Number.isSafeInteger(shelterId) || shelterId <= 0) {
      return { success: false, error: `Invalid shelter ID: "${tokens[1]}"` };
    }

    let occupancyPct = null;
    let waterOk = null;
    let bedsFree = null;

    for (let i = 2; i < tokens.length; i++) {
      const token = tokens[i].toUpperCase();
      if (/^F\d+$/.test(token) && Number(token.slice(1)) <= 100) {
        occupancyPct = Number(token.slice(1));
      } else if (/^W[01]$/.test(token)) {
        waterOk = token === 'W1';
      } else if (/^B\d+$/.test(token) && Number(token.slice(1)) <= 100000) {
        bedsFree = Number(token.slice(1));
      } else return { success: false, error: 'Invalid shelter telemetry field: ' + token };
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

    const lat = Number(tokens[1]);
    const lng = Number(tokens[2]);

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return { success: false, error: `Invalid GPS coordinates in SOS payload: "${tokens[1]}, ${tokens[2]}" (must be within lat −90..90, lng −180..180)` };
    }

    const hazardType = tokens[3] ? tokens[3].toUpperCase() : 'FLOOD';
    if (!HAZARD_TYPES.includes(hazardType)) return { success: false, error: 'Invalid SOS hazard type' };
    const tag = tokens[4] ? tokens[4].toLowerCase() : '';
    const message = tokens.slice(5).join(' ') || `Emergency distress beacon via SMS gateway (${hazardType})`;

    return {
      success: true,
      type: 'SOS_TRIGGER',
      data: {
        lat,
        lng,
        hazardType,
        vulnerabilityTags: tag === 'none' ? '' : tag,
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
    const result = await logShelterEventInternal({
      shelterId: data.shelterId,
      occupancyPct: data.occupancyPct,
      bedsFree: data.bedsFree,
      waterOk: data.waterOk,
      reason: 'SMS Telemetry Ingestion: ' + raw,
      operatorName: sourceNode || 'SMS Gateway',
      idempotencyKey: extraMeta.idempotencyKey || null,
      syncLog: {
        idempotencyKey: extraMeta.idempotencyKey || null,
        rawPayload: raw,
        parsedData: JSON.stringify({ action: 'SHELTER_AUDIT', ...data, ...extraMeta }),
        sourceNode,
        syncedAt: new Date(),
      },
    });
    return { type: 'SHELTER_AUDIT', record: result.shelter, event: result.event, log: result.log };
  }

  if (type === 'SOS_TRIGGER') {
    const priority = data.vulnerabilityTags ? 'URGENT' : 'NORMAL';

    const { sos, log } = await transaction(async tx => {
    const sender=extraMeta.userId ? await tx.user.findUnique({where:{id:extraMeta.userId}}) : null;
    const sos = await tx.sOSRequest.create({
      data: {
        userId: extraMeta.userId || null,
        userName: sender?.name || 'SMS civilian report',
        region:require('./field.service').regionKey(sender?.region),
        userPhone:sender?.phone || null,
        lat: data.lat,
        lng: data.lng,
        hazardType: data.hazardType,
        vulnerabilityTags: data.vulnerabilityTags,
        priority,
        message: data.message,
        status: 'PENDING',
      },
    });

    await require('./activity.service').recordRescueEvent(tx, sos, null, 'CREATED');
    const log = await tx.offlineSyncLog.create({
      data: {
        idempotencyKey: extraMeta.idempotencyKey || null,
        rawPayload: raw,
        parsedData: JSON.stringify({ action: 'SOS_TRIGGER', ...data, sosId: sos.id, ...extraMeta }),
        sourceNode,
        syncedAt: new Date(),
      },
    });

    return { sos, log };
    });
    const formatted = formatSOS(sos);
    broadcastSOSCreated(formatted);
    return { type: 'SOS_TRIGGER', record: formatted, log };
  }

  throw new Error(`Unsupported parsed type: ${type}`);
}

module.exports = {
  parseSMSPayload,
  applyParsedPayload,
};
