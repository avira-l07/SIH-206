const routing = require('./routing.service');
const HOURS = 3600000;
function validPoint(point) { return routing.validPoints([point], 1); }
function staffing(point, volunteer, now = Date.now()) {
  if (!point.active || Date.parse(point.expiresAt) <= now || point.corridor && (!point.corridor.active || Date.parse(point.corridor.expiresAt)<=now)) return 'CLOSED';
  if (!volunteer?.trusted || volunteer.role !== 'VOLUNTEER' || volunteer.onDuty !== true) return 'UNAVAILABLE';
  const confirmed = Date.parse(point.confirmedAt);
  return Number.isFinite(confirmed) && confirmed <= now && now - confirmed < HOURS ? 'CONFIRMED' : 'AWAITING_CHECK_IN';
}
function publicPoint(point, now = Date.now()) {
  return { id: point.id, corridorId: point.corridorId, name: point.name, region: point.region, lat: point.lat, lng: point.lng, instructions: point.instructions, publicContact: point.publicContact, confirmedAt: point.confirmedAt, expiresAt: point.expiresAt, staffing: staffing(point, point.volunteer, now) };
}
function pointsOnRoute(route, points) {
  if (!route.available) return [];
  const corridorIds = new Set(route.corridors.map(c => c.id));
  return points.filter(p => corridorIds.has(p.corridorId) && route.points.slice(1).some((end, i) => routing.pointSegmentDistance([p.lat,p.lng], route.points[i],end) <= 100));
}
function chooseShelter(start, shelters, corridors, hazards, mode, now = Date.now()) {
  const candidates = shelters.filter(s => s.active && s.status !== 'RED' && s.capacity > s.currentOccupancy && validPoint([s.lat,s.lng]) && routing.distance(start,[s.lat,s.lng]) <= 50000)
    .sort((a,b) => routing.distance(start,[a.lat,a.lng])-routing.distance(start,[b.lat,b.lng])).slice(0,50);
  const reachable = candidates.map(shelter => ({ shelter, route:routing.route(start,[shelter.lat,shelter.lng],corridors,hazards,mode,now) }))
    .filter(item => item.route.available).sort((a,b) => a.route.distanceMeters-b.route.distanceMeters || a.shelter.id-b.shelter.id);
  return reachable[0] || { shelter:null, route:{available:false,reason:candidates.length ? 'No current reviewed corridor reaches an eligible shelter with reported space. Contact the operator for guidance.' : 'No active shelter with reported space and without a critical readiness flag was found within 50 km. Contact the operator for guidance.'} };
}
module.exports = { validPoint, staffing, publicPoint, pointsOnRoute, chooseShelter };
