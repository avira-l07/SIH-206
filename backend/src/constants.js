// Central source of truth for validated string values
module.exports = {
  ROLES: ['CITIZEN', 'VOLUNTEER', 'ADMIN'],
  HAZARD_TYPES: ['FLOOD', 'EARTHQUAKE', 'FIRE'], // Capped at 3 per PRD
  SEVERITIES: ['WATCH', 'CRITICAL'],
  SOS_STATUSES: ['PENDING', 'VERIFIED', 'IN_PROGRESS', 'RESOLVED'],
  CONFIDENCE_TIERS: ['GREY', 'AMBER', 'RED'],
  SHELTER_STATUSES: ['GREEN', 'YELLOW', 'RED'],
};
