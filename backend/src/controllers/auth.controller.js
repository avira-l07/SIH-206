const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../db');
const { JWT_SECRET } = require('../middleware/auth.middleware');

async function register(req, res) {
  try {
    const { name, email, password, role = 'CITIZEN', phone, region, lat, lng } = req.body;

    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanPassword = typeof password === 'string' ? password : '';

    if (!name || !cleanEmail || !cleanPassword) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    if (role === 'ADMIN') {
      return res.status(403).json({
        error: 'Self-assignment of ADMIN role is forbidden. Administrators must be provisioned by existing authorities.'
      });
    }

    const resolvedRole = ['CITIZEN', 'VOLUNTEER'].includes(role) ? role : 'CITIZEN';

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail) || cleanEmail.length > 254) {
      return res.status(400).json({ error: 'A valid email address is required (max 254 characters)' });
    }

    if (cleanPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }
    if (cleanPassword.length > 72) {
      return res.status(400).json({ error: 'Password must be 72 characters or fewer' });
    }

    const trimmedName = String(name).trim().slice(0, 100);
    const cleanPhone = phone ? String(phone).replace(/[^\d+\-\s]/g, '').slice(0, 20) : null;
    const cleanRegion = region ? String(region).trim().slice(0, 100) : null;
    const validLat = typeof lat === 'number' && lat >= -90 && lat <= 90 ? lat : null;
    const validLng = typeof lng === 'number' && lng >= -180 && lng <= 180 ? lng : null;

    const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existing) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(cleanPassword, salt);

    const user = await prisma.user.create({
      data: {
        name: trimmedName,
        email: cleanEmail,
        passwordHash,
        role: resolvedRole,
        phone: cleanPhone,
        region: cleanRegion,
        lat: validLat,
        lng: validLng,
        trusted: false,
      },
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name, trusted: user.trusted },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        region: user.region,
        lat: user.lat,
        lng: user.lng,
        trusted: user.trusted,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;

    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanPassword = typeof password === 'string' ? password : '';

    if (!cleanEmail || !cleanPassword) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const validPassword = await bcrypt.compare(cleanPassword, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name, trusted: user.trusted },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        region: user.region,
        lat: user.lat,
        lng: user.lng,
        trusted: user.trusted,
        safetyStatus: user.safetyStatus || 'UNKNOWN',
        safetyUpdatedAt: user.safetyUpdatedAt,
      },
    });
  } catch (error) {
    console.error('[Login 500] Error authenticating user:', {
      message: error.message,
      code: error.code,
      meta: error.meta,
      stack: error.stack?.split('\n').slice(0, 4).join(' | '),
      emailProvided: !!req.body?.email,
      passwordProvided: !!req.body?.password,
    });
    res.status(500).json({ error: 'Failed to authenticate user' });
  }
}

async function getMe(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        region: true,
        lat: true,
        lng: true,
        trusted: true,
        safetyStatus: true,
        safetyUpdatedAt: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({ user });
  } catch (error) {
    console.error('GetMe error:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
}

// In-memory rate limiting map for safety lookup (Decision 0.3)
// Cleanup interval prevents unbounded memory growth in long-running processes
const safetyLookupRateLimits = new Map();
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 1000; // 2-minute TTL
  for (const [key, timestamps] of safetyLookupRateLimits.entries()) {
    const recent = timestamps.filter((t) => t > cutoff);
    if (recent.length === 0) safetyLookupRateLimits.delete(key);
    else safetyLookupRateLimits.set(key, recent);
  }
}, 5 * 60 * 1000).unref(); // unref so it doesn't keep the process alive
function checkLookupRateLimit(userId) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 20;

  const timestamps = safetyLookupRateLimits.get(userId) || [];
  const recent = timestamps.filter((t) => now - t < windowMs);

  if (recent.length >= maxRequests) {
    return false;
  }

  recent.push(now);
  safetyLookupRateLimits.set(userId, recent);
  return true;
}

/**
 * Update authenticated citizen's own safety status (Item 2.2)
 */
async function updateSafetyStatus(req, res) {
  try {
    const { safetyStatus } = req.body;
    const valid = ['SAFE', 'NEEDS_HELP', 'UNKNOWN'];
    if (!valid.includes(safetyStatus)) {
      return res.status(400).json({ error: `Invalid safetyStatus. Allowed: ${valid.join(', ')}` });
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        safetyStatus,
        safetyUpdatedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        safetyStatus: true,
        safetyUpdatedAt: true,
      },
    });

    res.status(200).json({
      message: `Safety status updated to ${safetyStatus}`,
      user: updated,
    });
  } catch (error) {
    console.error('Error updating safety status:', error);
    res.status(500).json({ error: 'Failed to update safety status' });
  }
}

/**
 * Privacy-preserving relative safety status lookup (Decision 0.3)
 * Requires auth, rate-limited, returns minimal status shape without echoing PII
 */
async function lookupSafetyStatus(req, res) {
  try {
    if (!checkLookupRateLimit(req.user.id)) {
      return res.status(429).json({ error: 'Too many safety status queries. Please wait a minute.' });
    }

    const { query } = req.query;
    if (!query || String(query).trim().length < 3) {
      return res.status(400).json({ error: 'Please provide at least 3 characters to search' });
    }

    // Cap query length and strip characters that could abuse Prisma LIKE or trigger regex patterns
    const cleanQuery = String(query).trim().slice(0, 64).replace(/[^a-zA-Z0-9 +\-_.@]/g, '');
    if (cleanQuery.length < 3) {
      return res.status(400).json({ error: 'Query contains too few valid characters (min 3 alphanumeric)' });
    }
    const foundUser = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: cleanQuery },
          { name: { contains: cleanQuery } },
        ],
      },
      select: {
        safetyStatus: true,
        safetyUpdatedAt: true,
      },
    });

    if (!foundUser) {
      return res.status(404).json({ error: 'No civilian record found matching query' });
    }

    // Minimal response shape per Decision 0.3
    res.status(200).json({
      status: foundUser.safetyStatus || 'UNKNOWN',
      asOf: foundUser.safetyUpdatedAt,
    });
  } catch (error) {
    console.error('Error looking up safety status:', error);
    res.status(500).json({ error: 'Failed to lookup safety status' });
  }
}

/**
 * Admin action: mark a user as trusted/untrusted (Decision 0.4)
 */
async function setUserTrust(req, res) {
  try {
    const userId = parseInt(req.params.id);
    const { trusted = true } = req.body;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { trusted: Boolean(trusted) },
      select: { id: true, name: true, email: true, role: true, trusted: true },
    });

    res.status(200).json({ message: `User trust updated to ${updated.trusted}`, user: updated });
  } catch (error) {
    console.error('Error updating user trust:', error);
    res.status(500).json({ error: 'Failed to update user trust' });
  }
}

async function updateLocation(req, res) {
  try {
    const { lat, lng, region } = req.body;
    const validLat = typeof lat === 'number' && lat >= -90 && lat <= 90 ? lat : null;
    const validLng = typeof lng === 'number' && lng >= -180 && lng <= 180 ? lng : null;
    const cleanRegion = region ? String(region).trim().slice(0, 100) : undefined;

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        ...(validLat !== null ? { lat: validLat } : {}),
        ...(validLng !== null ? { lng: validLng } : {}),
        ...(cleanRegion !== undefined ? { region: cleanRegion } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        region: true,
        lat: true,
        lng: true,
      },
    });

    res.status(200).json({ message: 'Location updated successfully', user: updated });
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({ error: 'Failed to update user location' });
  }
}

async function getUsers(req, res) {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, phone: true, trusted: true },
      orderBy: { id: 'asc' },
    });
    res.status(200).json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
}

module.exports = {
  register,
  login,
  getMe,
  updateLocation,
  updateSafetyStatus,
  lookupSafetyStatus,
  setUserTrust,
  getUsers,
};

