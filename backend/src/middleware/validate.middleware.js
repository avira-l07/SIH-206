const { ROLES, HAZARD_TYPES, SEVERITIES, SOS_STATUSES } = require('../constants');

// Shared helper: validate geographic coordinates are within valid ranges
function isValidCoords(lat, lng) {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180
  );
}

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
  if (!region || !isValidCoords(lat, lng) || !message) {
    return res.status(400).json({
      error: 'Missing or invalid required fields: region, lat (\u221290 to 90), lng (\u2212180 to 180), message'
    });
  }
  if (typeof region === 'string' && region.length > 200) {
    return res.status(400).json({ error: 'region must be 200 characters or fewer' });
  }
  if (typeof message === 'string' && message.length > 2000) {
    return res.status(400).json({ error: 'message must be 2000 characters or fewer' });
  }
  next();
}

// Middleware to validate SOS creation
function validateSOS(req, res, next) {
  const { lat, lng, message, hazardType } = req.body;
  const userName = req.body.userName || (req.user ? req.user.name : 'Anonymous Citizen');
  req.body.userName = userName;

  if (!isValidCoords(lat, lng) || !message) {
    return res.status(400).json({
      error: 'Missing or invalid required SOS fields: lat (\u221290 to 90), lng (\u2212180 to 180), message'
    });
  }
  if (typeof message === 'string' && message.length > 2000) {
    return res.status(400).json({ error: 'message must be 2000 characters or fewer' });
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
