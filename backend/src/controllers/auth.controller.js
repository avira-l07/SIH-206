const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../db');
const { JWT_SECRET } = require('../middleware/auth.middleware');

async function register(req, res) {
  try {
    const { name, email, password, role = 'CITIZEN', phone, lat, lng } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        passwordHash,
        role,
        phone: phone || null,
        lat: typeof lat === 'number' ? lat : null,
        lng: typeof lng === 'number' ? lng : null,
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

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
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
        lat: user.lat,
        lng: user.lng,
        trusted: user.trusted,
        safetyStatus: user.safetyStatus || 'UNKNOWN',
        safetyUpdatedAt: user.safetyUpdatedAt,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
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
const safetyLookupRateLimits = new Map();
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

    const cleanQuery = String(query).trim();
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
  updateSafetyStatus,
  lookupSafetyStatus,
  setUserTrust,
  getUsers,
};

