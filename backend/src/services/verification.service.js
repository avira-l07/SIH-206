/**
 * Verification & Trust Service
 * Computes confidence tiers (GREY, AMBER, RED) for crowdsourced hazard reports
 * and provides proximity helpers for peer confirmations.
 */

// Haversine distance in meters
function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Checks if user coordinate is within specified radius (default 500 meters) of report
 */
function isWithinRadius(lat1, lon1, lat2, lon2, radiusMeters = 500) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return false;
  const dist = getDistanceMeters(lat1, lon1, lat2, lon2);
  return dist <= radiusMeters;
}

/**
 * Determines confidence tier based on multi-vote distribution (CONFIRM, FALSE, RESOLVED)
 * and municipal trusted authority status.
 *
 * Sprint 2 evaluation order:
 * 1. resolvedVotes (trusted OR >= 2) -> RESOLVED
 * 2. falseVotes    (trusted OR >= 2) -> DISPUTED (quarantined / pulled from active dispatch)
 * 3. confirmVotes  (trusted OR >= 3) -> RED
 * 4. confirmVotes  (>= 1)            -> AMBER
 * 5. else                            -> GREY
 */
function calculateConfidenceTier(arg1, arg2 = false) {
  let confirmVotes = 0;
  let falseVotes = 0;
  let resolvedVotes = 0;
  let hasTrustedConfirm = false;
  let hasTrustedFalse = false;
  let hasTrustedResolved = false;

  if (typeof arg1 === 'object' && arg1 !== null) {
    confirmVotes = arg1.confirmVotes || 0;
    falseVotes = arg1.falseVotes || 0;
    resolvedVotes = arg1.resolvedVotes || 0;
    hasTrustedConfirm = Boolean(arg1.hasTrustedConfirm);
    hasTrustedFalse = Boolean(arg1.hasTrustedFalse);
    hasTrustedResolved = Boolean(arg1.hasTrustedResolved);
  } else {
    // Backwards compatible signature: (confirmationsCount, hasTrustedConfirmation)
    confirmVotes = typeof arg1 === 'number' ? arg1 : 0;
    hasTrustedConfirm = Boolean(arg2);
  }

  // 1. Resolved
  if (hasTrustedResolved || resolvedVotes >= 2) {
    return 'RESOLVED';
  }
  // 2. Disputed (quarantined from active dispatch)
  if (hasTrustedFalse || falseVotes >= 2) {
    return 'DISPUTED';
  }
  // 3. Fully verified (RED)
  if (hasTrustedConfirm || confirmVotes >= 3) {
    return 'RED';
  }
  // 4. Preliminary verification (AMBER)
  if (confirmVotes >= 1) {
    return 'AMBER';
  }
  // 5. Unconfirmed (GREY)
  return 'GREY';
}

module.exports = {
  getDistanceMeters,
  isWithinRadius,
  calculateConfidenceTier,
};
