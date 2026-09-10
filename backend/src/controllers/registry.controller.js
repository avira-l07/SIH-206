/**
 * registry.controller.js
 * Public Unauthenticated Emergency Alert Registry
 * 
 * Design & Security Guarantees:
 * - Publicly accessible: Citizens do NOT need an account to subscribe.
 * - Rate-limited: Per-IP sliding window limits spamming.
 * - Zero PII Exposure: Absolutely NO route exposes raw phone numbers or push keys (Section 0.2).
 * - Safe aggregate telemetry: GET /stats returns only numerical counts.
 */

const prisma = require('../db');
const { normalizePhoneNumber } = require('../services/sms.service');
const { getVapidPublicKey } = require('../services/push.service');

// In-memory sliding window rate limiter per client IP
const registryRateLimits = new Map();

function checkRegistryRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window
  const maxRequests = 10; // Max 10 registrations per IP per minute

  const timestamps = registryRateLimits.get(ip) || [];
  const recent = timestamps.filter((t) => now - t < windowMs);

  if (recent.length >= maxRequests) {
    return false;
  }

  recent.push(now);
  registryRateLimits.set(ip, recent);
  return true;
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || 'unknown-client';
}

/**
 * Register phone number for emergency SMS alerts (No-Login)
 * POST /api/registry/phone
 */
async function registerPhone(req, res) {
  const clientIp = getClientIp(req);
  if (!checkRegistryRateLimit(clientIp)) {
    return res.status(429).json({
      error: 'Too many registration requests. Please wait a moment before trying again.',
    });
  }

  try {
    const { phoneNumber, region } = req.body;

    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return res.status(400).json({ error: 'Valid phoneNumber is required' });
    }

    const cleaned = phoneNumber.replace(/[^\d+]/g, '');
    if (cleaned.length < 7 || cleaned.length > 16) {
      return res.status(400).json({ error: 'Please enter a valid phone number (minimum 7 digits)' });
    }

    const normalized = normalizePhoneNumber(cleaned);
    const assignedRegion = region && typeof region === 'string' ? region.trim() : null;

    // Upsert on phoneNumber to prevent duplicates and allow region update
    await prisma.phoneRegistration.upsert({
      where: { phoneNumber: normalized },
      update: { region: assignedRegion },
      create: {
        phoneNumber: normalized,
        region: assignedRegion,
      },
    });

    // Explicitly return success message with ZERO phone number echo
    return res.status(200).json({
      success: true,
      message: 'Phone registered successfully for emergency SMS broadcasts.',
      region: assignedRegion || 'All Regions',
    });
  } catch (error) {
    console.error('Error registering phone number:', error);
    return res.status(500).json({ error: 'Failed to complete registration' });
  }
}

/**
 * Register Web Push Subscription for browser alerts (No-Login)
 * POST /api/registry/push
 */
async function registerPush(req, res) {
  const clientIp = getClientIp(req);
  if (!checkRegistryRateLimit(clientIp)) {
    return res.status(429).json({
      error: 'Too many registration requests. Please wait a moment before trying again.',
    });
  }

  try {
    const { endpoint, keys, region } = req.body;

    if (!endpoint || typeof endpoint !== 'string' || !endpoint.startsWith('http')) {
      return res.status(400).json({ error: 'Valid push subscription endpoint is required' });
    }

    if (!keys || typeof keys !== 'object') {
      return res.status(400).json({ error: 'Valid subscription cryptographic keys are required' });
    }

    const assignedRegion = region && typeof region === 'string' ? region.trim() : null;
    const serializedKeys = JSON.stringify(keys);

    // Upsert on endpoint
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
        keys: serializedKeys,
        region: assignedRegion,
      },
      create: {
        endpoint,
        keys: serializedKeys,
        region: assignedRegion,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Browser registered successfully for Web Push emergency alerts.',
      region: assignedRegion || 'All Regions',
    });
  } catch (error) {
    console.error('Error registering push subscription:', error);
    return res.status(500).json({ error: 'Failed to save push subscription' });
  }
}

/**
 * Get Public Alert Reach Statistics (Zero PII - Aggregates Only)
 * GET /api/registry/stats
 */
async function getRegistryStats(req, res) {
  try {
    const [totalPhones, totalPushSubs] = await Promise.all([
      prisma.phoneRegistration.count(),
      prisma.pushSubscription.count(),
    ]);

    // Only aggregated counts returned — NO raw phone numbers or endpoints
    return res.status(200).json({
      totalPhones,
      totalPushSubs,
      channelsActive: ['SMS_BROADCAST', 'WEB_PUSH_NOTIFICATION', 'IN_APP_MAX_PRIORITY'],
    });
  } catch (error) {
    console.error('Error fetching registry stats:', error);
    return res.status(500).json({ error: 'Failed to fetch registry stats' });
  }
}

/**
 * Get VAPID Public Key for client browser subscription
 * GET /api/registry/vapid-public-key
 */
async function getVapidKey(req, res) {
  try {
    const publicKey = getVapidPublicKey();
    if (!publicKey) {
      return res.status(503).json({ error: 'Web Push service initializing. Please retry in a moment.' });
    }
    return res.status(200).json({ publicKey });
  } catch (error) {
    console.error('Error retrieving VAPID public key:', error);
    return res.status(500).json({ error: 'Failed to retrieve VAPID key' });
  }
}

module.exports = {
  registerPhone,
  registerPush,
  getRegistryStats,
  getVapidKey,
  checkRegistryRateLimit, // exported for unit testing
};
