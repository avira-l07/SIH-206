const jwt = require('jsonwebtoken');

const prisma = require('../db');
const { JWT_SECRET } = require('../config/security');

async function verifyIdentity(token) {
  const claims = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  if (!Number.isSafeInteger(claims.id) || claims.id <= 0) throw new Error('Invalid identity');
  const user = await prisma.user.findUnique({
    where: { id: claims.id },
    select: { id: true, name: true, role: true, trusted: true, phone: true, lat: true, lng: true, tokenVersion:true, serviceRegion:true, region:true, mfaEnabledAt:true },
  });
  if (!user) throw new Error('Account no longer exists');
  if ((claims.ver ?? 0) !== user.tokenVersion) throw new Error('Session revoked');
  if (user.mfaEnabledAt && claims.mfa !== true) throw new Error('Second factor required');
  return { ...user, expiresAt: claims.exp, securitySetupRequired: user.role==='ADMIN' && process.env.NODE_ENV==='production' && process.env.REQUIRE_OPERATOR_MFA!=='false' && !user.mfaEnabledAt };
}

async function authenticateToken(req, res, next) {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
  if (!match) return res.status(401).json({ error: 'Access token required' });
  try {
    req.user = await verifyIdentity(match[1]);
    if(req.user.securitySetupRequired && !['/api/security','/api/auth'].includes(req.baseUrl)) return res.status(403).json({error:'Set up an authenticator before using the operator console',securitySetupRequired:true});
    await require('./jurisdiction.middleware').authorizeJurisdiction(req,res);
    next();
  } catch (err) {
    if(err.status) return res.status(err.status).json({error:err.message});
    if (err.code?.startsWith('P')) return next(err);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function optionalAuth(req, res, next) {
  return req.headers.authorization ? authenticateToken(req, res, next) : next();
}

function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${allowedRoles.join(' or ')}`
      });
    }
    if(req.user.securitySetupRequired) return res.status(403).json({error:'Operator authenticator setup is required',securitySetupRequired:true});
    if (req.user.role === 'VOLUNTEER' && !req.user.trusted) {
      return res.status(403).json({ error: 'Your volunteer account awaits administrator approval for field operations' });
    }
    next();
  };
}

module.exports = {
  authenticateToken,
  requireRole,
  JWT_SECRET,
  verifyIdentity,
  optionalAuth
};
