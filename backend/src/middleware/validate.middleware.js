const { ROLES, HAZARD_TYPES, SEVERITIES, SOS_STATUSES } = require('../constants');

// Middleware to validate user registration & profile updates
function validateRole(req, res, next) {
  const role = req.body.role || 'CITIZEN';
  if (!ROLES.includes(role)) {
    return res.status(400).json({
      error: `Invalid role '${role}'. Allowed roles: ${ROLES.join(', ')}`
    });
  }
  req.body.role = role;
  next();
}

// Middleware to validate alert creation
function validateAlert(req, res, next) {
  const { hazardType, severity, region, lat, lng, message } = req.body;
  if (!hazardType || !HAZARD_TYPES.includes(hazardType)) {
    return res.status(400).json({
      error: `Invalid hazardType '${hazardType}'. Allowed: ${HAZARD_TYPES.join(', ')}`
    });
  }
  if (!severity || !SEVERITIES.includes(severity)) {
    return res.status(400).json({
      error: `Invalid severity '${severity}'. Allowed: ${SEVERITIES.join(', ')}`
    });
  }
  if (!region || typeof lat !== 'number' || typeof lng !== 'number' || !message) {
    return res.status(400).json({
      error: 'Missing required fields: region, lat (number), lng (number), message'
    });
  }
  next();
}

// Middleware to validate SOS creation
function validateSOS(req, res, next) {
  const { userName, lat, lng, message, hazardType } = req.body;
  if (!userName || typeof lat !== 'number' || typeof lng !== 'number' || !message) {
    return res.status(400).json({
      error: 'Missing required SOS fields: userName, lat (number), lng (number), message'
    });
  }
  if (hazardType && !HAZARD_TYPES.includes(hazardType)) {
    return res.status(400).json({
      error: `Invalid hazardType '${hazardType}'. Allowed: ${HAZARD_TYPES.join(', ')}`
    });
  }
  next();
}

// Middleware to validate SOS status updates
function validateSOSStatus(req, res, next) {
  const { status } = req.body;
  if (!status || !SOS_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `Invalid status '${status}'. Allowed: ${SOS_STATUSES.join(', ')}`
    });
  }
  next();
}

module.exports = {
  validateRole,
  validateAlert,
  validateSOS,
  validateSOSStatus
};
