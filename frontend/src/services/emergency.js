export function validEmergencyCoords(coords) {
  return coords && coords.lat !== '' && coords.lng !== '' && coords.lat != null && coords.lng != null &&
    Number.isFinite(Number(coords.lat)) && Number.isFinite(Number(coords.lng)) && Math.abs(Number(coords.lat)) <= 90 && Math.abs(Number(coords.lng)) <= 180;
}
export function emergencySMS(payload) {
  if (!validEmergencyCoords(payload)) return '';
  const tags = Array.isArray(payload.vulnerabilityTags) ? payload.vulnerabilityTags.join(',') : payload.vulnerabilityTags;
  const detail = `${payload.reportedByProxy ? 'On behalf of: ' + payload.subjectDescription + '. ' : ''}${payload.message || 'Emergency help needed'}`;
  return `SOS ${Number(payload.lat).toFixed(5)} ${Number(payload.lng).toFixed(5)} ${payload.hazardType || 'FLOOD'} ${tags || 'none'} ${detail.replace(/\s+/g, ' ').trim()}`.slice(0,2000);
}
export function smsURI(text, gateway = '', ios = false) {
  const number = /^\+?\d{6,15}$/.test(gateway) ? gateway : '';
  return `sms:${number}${ios ? '&' : '?'}body=${encodeURIComponent(text)}`;
}
