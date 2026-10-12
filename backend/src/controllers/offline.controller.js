const prisma = require('../db');
const { transaction } = require('../services/transaction.service');
const { parseSMSPayload, applyParsedPayload } = require('../services/smsParser.service');
const { createSOS } = require('./sos.controller');
const { createHazardReport } = require('./hazard.controller');
const { validateSOS } = require('../middleware/validate.middleware');
const { validateRequest } = require('../middleware/request.middleware');
const { logShelterEventInternal } = require('./shelter.controller');
const { recordSupplyDistributionInternal } = require('./supply.controller');
const { broadcastSOSCreated, broadcastHazardCreated } = require('../sockets/socketHandler');

function canOperate(user) {
  return user.role === 'ADMIN' || user.role === 'RELAY_NODE' || (user.role === 'VOLUNTEER' && user.trusted);
}
function checkSMSPermission(parsed, user) {
  if (parsed.type === 'SHELTER_AUDIT' && !canOperate(user)) throw new Error('Shelter telemetry requires an approved responder');
}
async function ingestSMS(req, res) {
  const parsed = parseSMSPayload(req.body.payload);
  if (!parsed.success) return res.status(400).json({ error: parsed.error });
  try {
    checkSMSPermission(parsed, req.user);
    if(parsed.type==='SHELTER_AUDIT' && req.user.serviceRegion){const target=await prisma.shelter.findUnique({where:{id:parsed.data.shelterId}});require('../services/field.service').assertScope(req.user,target?.region);}
    const result = await applyParsedPayload(parsed, req.body.sourceNode || 'SMS Gateway Demo', { userId: req.user.id });
    return res.json({ message: 'SMS telemetry synchronized', result });
  } catch (error) {
    return res.status(error.message.includes('requires') ? 403 : 400).json({ error: error.code ? 'SMS could not be applied' : 'SMS could not be applied: ' + error.message });
  }
}
async function getSyncLogs(req, res) {
  // Raw packets can contain private emergency locations and contact details.
  // Only global operators may inspect every packet; other staff see their own.
  const where = req.user.role === 'ADMIN' && !req.user.serviceRegion ? {} : {idempotencyKey:{startsWith:`${req.user.id}:`}};
  const logs = await prisma.offlineSyncLog.findMany({ where, orderBy: { receivedAt: 'desc' }, take: 50 });
  res.json({ logs });
}

// Reuse online validation and controllers, with all record/log writes committed together.
async function createQueuedReport(type, payload, user, tx) {
  let response;
  let status = 200;
  const fakeRes = { status(code) { status = code; return this; }, json(data) { response = data; return this; } };
  const request = { path: '/api/' + (type === 'SOS' ? 'sos' : 'hazards'), method: 'POST', query: {}, body: { ...payload,...(user.serviceRegion?{region:user.serviceRegion}:{}) }, user: user.id ? user : null, database: tx, deferBroadcast: true };
  let valid = false;
  validateRequest(request, fakeRes, () => { valid = true; });
  if (valid && type === 'SOS') { valid = false; validateSOS(request, fakeRes, () => { valid = true; }); }
  if (valid) await (type === 'SOS' ? createSOS : createHazardReport)(request, fakeRes);
  if (status >= 400 || !valid) throw new Error(response?.error || 'Invalid queued report');
  return response.sos || response.report;
}

async function syncOfflineBatch(req, res) {
  const { items, sourceNode = 'Browser Offline Queue' } = req.body;
  if (!Array.isArray(items) || items.length > 50) return res.status(400).json({ error: 'items must be an array of at most 50 actions' });
  const user = req.user;
  const results = [];
  for (const item of items) {
    try {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid queued item');
      const rawKey = item.idempotencyKey;
      if (typeof rawKey !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(rawKey)) throw new Error('A valid idempotencyKey is required');
      const key = `${user.id || 'relay'}:${rawKey}`;
      const existing = await prisma.offlineSyncLog.findUnique({ where: { idempotencyKey: key } });
      if (existing) {
        if (item.type === 'SOS') {
          const { sosPayloadHash, receiptDetails } = require('../services/sos-receipt.service');
          const details = receiptDetails(existing);
          if (details.action !== 'SOS' || (details.payloadHash && details.payloadHash !== sosPayloadHash(item.payload || {}))) throw new Error('Receipt key conflicts with different emergency details');
        }
        results.push({ item, status: 'DUPLICATE_IGNORED' }); continue;
      }
      const payload = item.payload;
      const meta = { idempotencyKey: key, rawPayload: JSON.stringify(payload), parsedData: JSON.stringify({ action: item.type, queuedAt: item.queuedAt }), sourceNode: String(sourceNode).slice(0, 100), syncedAt: new Date() };
      let record;
      if (['SOS', 'HAZARD'].includes(item.type)) {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('A report object is required');
        record = await transaction(async tx => {
          const created = await createQueuedReport(item.type, payload, user, tx);
          if (item.type === 'SOS') meta.parsedData = JSON.stringify({ action: 'SOS', queuedAt: item.queuedAt, recordId: created.id, payloadHash: require('../services/sos-receipt.service').sosPayloadHash(payload) });
          await tx.offlineSyncLog.create({ data: meta });
          return created;
        });
        if (item.type === 'SOS') broadcastSOSCreated(record); else broadcastHazardCreated(record);
      } else if (['SHELTER_EVENT', 'SHELTER_DELTA'].includes(item.type)) {
        if (!canOperate(user)) throw new Error('Shelter changes require an approved responder');
        const request = { path: '/api/shelters', method: 'POST', body: { ...payload }, query: {} };
        let valid = false; let validationError;
        validateRequest(request, { status() { return this; }, json(data) { validationError = data.error; } }, () => { valid = true; });
        if (!valid) throw new Error(validationError);
        const { shelterId, deltaOccupancy, deltaWaterLiters, deltaRations, deltaMedicalKits, deltaBlankets, waterOk, rationsOk, reason, capturedAt } = request.body;
        if(user.serviceRegion){const target=await prisma.shelter.findUnique({where:{id:shelterId}});require('../services/field.service').assertScope(user,target?.region);}
        const result = await logShelterEventInternal({ shelterId, deltaOccupancy, deltaWaterLiters, deltaRations, deltaMedicalKits, deltaBlankets, waterOk, rationsOk, reason, capturedAt, idempotencyKey: key, operatorName: user.name || 'Provisioned relay', syncLog: meta });
        record = result.event;
      } else if (item.type === 'SAFETY_STATUS') {
        if (!user.id) throw new Error('Safety status requires the account owner to sign in');
        if (!['SAFE', 'NEEDS_HELP', 'UNKNOWN'].includes(payload?.safetyStatus)) throw new Error('Invalid safety status');
        record = await transaction(async tx => {
          const updated = await tx.user.update({ where: { id: user.id }, data: { safetyStatus: payload.safetyStatus, safetyUpdatedAt: new Date() }, select: { id: true, safetyStatus: true } });
          await tx.offlineSyncLog.create({ data: meta });
          return updated;
        });
      } else if (item.type === 'SUPPLY_DISTRIBUTION') {
        if (!user.id) throw new Error('Supply pickup requires the account owner to sign in');
        if(user.serviceRegion){const target=await prisma.shelter.findUnique({where:{id:Number(payload?.scannedCode?.split(':')[1])||0}});require('../services/field.service').assertScope(user,target?.region);}
        const result = await recordSupplyDistributionInternal({ citizenId: user.id, scannedCode: payload?.scannedCode, quantity: payload?.quantity ?? 1, idempotencyKey: key, syncLog: meta });
        record = result.distribution;
      } else if (item.type === 'SMS') {
        const parsed = parseSMSPayload(typeof payload === 'string' ? payload : payload?.raw);
        if (!parsed.success) throw new Error(parsed.error);
        checkSMSPermission(parsed, user);
        if(parsed.type==='SHELTER_AUDIT'&&user.serviceRegion){const target=await prisma.shelter.findUnique({where:{id:parsed.data.shelterId}});require('../services/field.service').assertScope(user,target?.region);}
        if (parsed.type === 'SOS_TRIGGER') {
          record = await transaction(async tx => {
            const created = await createQueuedReport('SOS', parsed.data, user, tx);
            await tx.offlineSyncLog.create({ data: meta });
            return created;
          });
          broadcastSOSCreated(record);
        } else {
          const result = await applyParsedPayload(parsed, String(sourceNode).slice(0, 100), { idempotencyKey: key, userId:user.id });
          record = result.record;
        }
      } else throw new Error('Unknown queued action type');
      results.push({ item, status: 'SYNCED', record });
    } catch (error) {
      if (error.code === 'P2002') results.push({ item, status: 'DUPLICATE_IGNORED' });
      else results.push({ item, status: 'FAILED', error: error.code ? 'Queued action could not be applied' : error.message });
    }
  }
  const syncedCount = results.filter(r => r.status === 'SYNCED').length;
  const dupeCount = results.filter(r => r.status === 'DUPLICATE_IGNORED').length;
  const failedCount = results.filter(r => r.status === 'FAILED').length;
  res.json({ message: `${syncedCount} synced, ${dupeCount} duplicates ignored, ${failedCount} failed`, syncedCount, dupeCount, failedCount, results });
}
module.exports = { ingestSMS, getSyncLogs, syncOfflineBatch };
