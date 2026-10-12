const { createHash } = require('node:crypto');

// Hash the emergency details, excluding account/contact fields resolved by the server.
function sosPayloadHash(body) {
  const tags = Array.isArray(body.vulnerabilityTags) ? body.vulnerabilityTags : String(body.vulnerabilityTags || '').split(',');
  const values = [body.lat, body.lng, String(body.message || '').trim(), body.hazardType || 'FLOOD',
    tags.map(tag => tag.trim()).filter(Boolean).sort(), body.coordsAccuracy ?? null,
    body.capturedAt ? new Date(body.capturedAt).toISOString() : null, body.batteryLevel ?? null,
    Boolean(body.reportedByProxy), body.subjectDescription?.trim() || null];
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}
function receiptDetails(log) { try { return JSON.parse(log.parsedData || '{}'); } catch { return {}; } }
module.exports = { sosPayloadHash, receiptDetails };
