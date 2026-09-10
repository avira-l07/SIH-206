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
  if (role === 'ADMIN') {
    return res.status(403).json({
      error: 'Self-assignment of ADMIN role is forbidden. Administrators must be provisioned by existing authorities.'
    });
  }
  const ALLOWED_REGISTRATION_ROLES = ['CITIZEN', 'VOLUNTEER'];
  if (!ALLOWED_REGISTRATION_ROLES.includes(role)) {
    return res.status(400).json({
      error: `Invalid role '${role}'. Allowed roles: ${ALLOWED_REGISTRATION_ROLES.join(', ')}`
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
      error: 'Missing or invalid required fields: region, lat (−90 to 90), lng (−180 to 180), message'
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
  const { lat, lng, message, hazardType, userName, userPhone, subjectDescription } = req.body;
  const resolvedUserName = userName || (req.user ? req.user.name : 'Anonymous Citizen');
  req.body.userName = String(resolvedUserName).slice(0, 100);

  if (!isValidCoords(lat, lng) || !message) {
    return res.status(400).json({
      error: 'Missing or invalid required SOS fields: lat (−90 to 90), lng (−180 to 180), message'
    });
  }
  if (typeof message === 'string' && message.length > 2000) {
    return res.status(400).json({ error: 'message must be 2000 characters or fewer' });
  }
  if (userPhone && String(userPhone).length > 25) {
    return res.status(400).json({ error: 'userPhone must be 25 characters or fewer' });
  }
  if (subjectDescription && String(subjectDescription).length > 500) {
    return res.status(400).json({ error: 'subjectDescription must be 500 characters or fewer' });
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
  isValidCoords,
  validateRole,
  validateAlert,
  validateSOS,
  validateSOSStatus
};
