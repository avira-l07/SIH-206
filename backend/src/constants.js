// Central source of truth for validated string values
module.exports = {
  ROLES: ['CITIZEN', 'VOLUNTEER', 'ADMIN'],
  HAZARD_TYPES: ['FLOOD', 'EARTHQUAKE', 'FIRE'], // Capped at 3 per PRD
  SEVERITIES: ['WATCH', 'CRITICAL'],
  SOS_STATUSES: ['PENDING', 'IN_PROGRESS', 'RESOLVED'],
};
