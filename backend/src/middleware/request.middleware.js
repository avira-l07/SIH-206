const { HAZARD_TYPES } = require('../constants');

function validPhoto(value) {
  if (value == null || value === '') return true;
  if (typeof value !== 'string') return false;
  if (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return value.length <= 700000;
  try { const url = new URL(value); return value.length <= 500 && ['https:', 'http:'].includes(url.protocol); }
  catch { return false; }
}

function validateRequest(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();
  const fail = error => res.status(400).json({ error });
  const segments = req.path.split('/');
  for (const segment of segments) {
    if (/^[+-]?\d/.test(segment) && (!/^\d+$/.test(segment) || !Number.isSafeInteger(Number(segment)) || Number(segment) <= 0)) return fail('Invalid resource ID');
  }
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value !== 'string' || value.length > 300) return fail(`Invalid query parameter: ${key}`);
    if (['shelterId'].includes(key) && (!/^\d+$/.test(value) || Number(value) <= 0)) return fail(`Invalid ${key}`);
  }
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next();
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return fail('A JSON object is required');
  const body = req.body;
  const textLimits = { name: 100, userName: 100, ownerName: 100, reportedByName: 100, operatorName: 100, email: 254, password: 72, phone: 25, userPhone: 25, phoneNumber: 25, contactPhone: 25, region: 200, message: 2000, hazardNote: 1000, description: 2000, title: 150, fullName: 200, lastSeenLocation: 300, shelterName: 150, address: 250, contact: 50, itemName: 100, unit: 50, cancelReason: 500, reason: 500, sourceNode: 100, subjectDescription: 500, scannedCode: 300, idempotencyKey: 128, payload: 2000 };
  for (const [key, max] of Object.entries(textLimits)) {
    if (body[key] != null && (typeof body[key] !== 'string' || body[key].length > max)) return fail(`${key} must be a string of at most ${max} characters`);
  }
  for (const key of ['trusted', 'available', 'confirmed', 'reportedByProxy', 'waterOk', 'rationsOk', 'restroomsOk', 'powerOk']) {
    if (body[key] != null && typeof body[key] !== 'boolean') return fail(`${key} must be a boolean`);
  }
  for (const [key, min, max] of [['lat', -90, 90], ['lng', -180, 180], ['radiusKm', 0.1, 500], ['batteryLevel', 0, 100], ['coordsAccuracy', 0, 100000]]) {
    if (body[key] != null && (typeof body[key] !== 'number' || !Number.isFinite(body[key]) || body[key] < min || body[key] > max)) return fail(`Invalid ${key}`);
  }
  for (const key of ['capacity', 'currentOccupancy', 'waterLitersRemaining', 'waterThreshold', 'rationsUnitsRemaining', 'rationsThreshold', 'medicalKitsRemaining', 'medicalThreshold', 'blanketsRemaining', 'blanketsThreshold', 'quantityNeeded', 'quantityFulfilled', 'quantityClaimed', 'quantityVerified', 'quantity', 'age', 'shelterId', 'supplyRequestId']) {
    if (body[key] != null && (!['number', 'string'].includes(typeof body[key]) || (typeof body[key] === 'string' && !/^\d+$/.test(body[key])) || !Number.isSafeInteger(Number(body[key])) || Number(body[key]) < (['capacity', 'shelterId', 'supplyRequestId', 'quantity'].includes(key) ? 1 : 0) || Number(body[key]) > (key === 'age' ? 130 : 1000000))) return fail(`Invalid ${key}`);
    if (body[key] != null) body[key] = Number(body[key]);
  }
  for (const key of ['deltaOccupancy', 'deltaWaterLiters', 'deltaRations', 'deltaMedicalKits', 'deltaBlankets']) {
    if (body[key] != null && (!Number.isSafeInteger(body[key]) || Math.abs(body[key]) > 1000000)) return fail(`Invalid ${key}`);
  }
  for (const key of ['capturedAt', 'queuedAt']) {
    if (body[key] != null && (typeof body[key] !== 'string' || !Number.isFinite(Date.parse(body[key])))) return fail(`Invalid ${key}`);
  }
  for (const key of ['hazardType', 'severityBenchmark', 'voteType', 'type', 'assetType', 'status', 'severity', 'safetyStatus', 'gender']) {
    if (body[key] != null && (typeof body[key] !== 'string' || body[key].length > 50)) return fail(`Invalid ${key}`);
  }
  if (body.hazardType && !HAZARD_TYPES.includes(body.hazardType)) return fail('Invalid hazardType');
  if (!validPhoto(body.photoUrl)) return fail('photoUrl must be an HTTP image URL or a JPEG, PNG or WebP image up to 700 KB');
  if (body.vulnerabilityTags != null && !(typeof body.vulnerabilityTags === 'string' && body.vulnerabilityTags.length <= 200) && !(Array.isArray(body.vulnerabilityTags) && body.vulnerabilityTags.length <= 10 && body.vulnerabilityTags.every(tag => typeof tag === 'string' && tag.length <= 30))) return fail('Invalid vulnerabilityTags');
  next();
}
function validateId(req, res, next, id) {
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) return res.status(400).json({ error: 'Invalid resource ID' });
  next();
}
module.exports = { validateRequest, validPhoto, validateId };
