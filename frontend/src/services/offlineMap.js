const PREFIX = 'sih_map_reference_v1:';
const fields = {
  alerts: ['id','lat','lng','active','hazardType','severity','radiusKm','message','sourceKind','observedAt','createdAt'],
  shelters: ['id','lat','lng','name','address','contact','capacity','currentOccupancy','status'],
  hazardReports: ['id','lat','lng','hazardType','confidenceTier','severityBenchmark','confirmationsCount','createdAt'],
};
export function mapScope(user, mode) { return mode === 'public' ? 'public' : user?.id ? `${user.id}:${user.role}:${user.trusted === true}:${user.serviceRegion || 'all'}` : null; }
export function validMapPoint(point) { return point && Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180; }
function pickRecords(records, keys) {
  return (Array.isArray(records) ? records : []).filter(validMapPoint).slice(0,500).map(record => Object.fromEntries(keys.filter(key => ['string','number','boolean'].includes(typeof record[key])).map(key => [key, typeof record[key] === 'string' ? record[key].slice(0,2000) : record[key]])));
}
export function saveMapReference(storage, scope, data, view, now = Date.now()) {
  if (!scope) throw new Error('Sign in to save an account-specific map reference');
  if (!validMapPoint(view?.center) || !Number.isFinite(view.zoom)) throw new Error('Map view is not ready');
  const snapshot = { savedAt: new Date(now).toISOString(), view: { center: view.center, zoom: Math.max(5, Math.min(19,view.zoom)) } };
  for (const [key,keys] of Object.entries(fields)) snapshot[key] = pickRecords(data[key],keys);
  storage.setItem(PREFIX + scope, JSON.stringify(snapshot)); return snapshot;
}
export function readMapReference(storage, scope, now = Date.now()) {
  if (!scope) return null;
  try {
    const snapshot = JSON.parse(storage.getItem(PREFIX + scope) || 'null');
    const age = now - Date.parse(snapshot?.savedAt);
    if (!Number.isFinite(age) || age < 0 || age > 7 * 24 * 60 * 60 * 1000 || !validMapPoint(snapshot.view?.center) || !Number.isFinite(snapshot.view?.zoom)) return null;
    for (const [key,keys] of Object.entries(fields)) snapshot[key] = pickRecords(snapshot[key],keys);
    snapshot.view.zoom = Math.max(5,Math.min(19,snapshot.view.zoom)); return snapshot;
  } catch { return null; }
}
export function clearMapReference(storage, scope) { if (scope) storage.removeItem(PREFIX + scope); }
export async function offlineReadiness() {
  if (!window.isSecureContext || !('serviceWorker' in navigator) || !('caches' in window)) return { shell:false, tiles:0, reason:'Requires HTTPS or localhost and a production build' };
  if (!navigator.serviceWorker.controller) return {shell:false,tiles:0,reason:'Open the production app online first, then reload to activate its offline cache'};
  return new Promise(resolve => {
    const channel = new MessageChannel(), timer = setTimeout(() => {channel.port1.close();resolve({shell:false,tiles:0,reason:'Offline worker did not confirm readiness; reload online to update it'});},3000);
    channel.port1.onmessage = event => {clearTimeout(timer);channel.port1.close();resolve({...event.data,controlled:true});};
    navigator.serviceWorker.controller.postMessage({type:'OFFLINE_STATUS'},[channel.port2]);
  });
}
