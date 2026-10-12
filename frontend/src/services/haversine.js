/**
 * Plain JS Haversine distance formula (~10 lines).
 * Calculates great-circle distance between two coordinates in kilometers.
 */
export function calculateDistanceKm(lat1, lon1, lat2, lon2, round = true) {
  if (![lat1,lon1,lat2,lon2].every(Number.isFinite) || Math.abs(lat1)>90 || Math.abs(lat2)>90 || Math.abs(lon1)>180 || Math.abs(lon2)>180) return Infinity;
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return round ? Math.round(R * c * 10) / 10 : R * c; // Round to 1 decimal place
}

export function sortSheltersByDistance(shelters, userLat, userLng) {
  if (!Array.isArray(shelters)) return [];
  return [...shelters]
    .map((shelter) => ({
      ...shelter,
      distanceKm: calculateDistanceKm(userLat, userLng, shelter.lat, shelter.lng),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}
