require('dotenv').config();
if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) throw new Error('Production requires an explicit DATABASE_URL');
const prepareSchema = require('../scripts/prepare-schema');
prepareSchema();
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./dev.db';
const http = require('http');
const os = require('os');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { rateLimitKey } = require('./config/rate-limit-key');
const { Server } = require('socket.io');

const { isAllowedOrigin } = require('./config/security');
const { validateRequest } = require('./middleware/request.middleware');
const { setupSockets } = require('./sockets/socketHandler');
const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const alertRoutes = require('./routes/alert.routes');
const sosRoutes = require('./routes/sos.routes');
const shelterRoutes = require('./routes/shelter.routes');
const hazardRoutes = require('./routes/hazard.routes');
const offlineRoutes = require('./routes/offline.routes');
const assetRoutes = require('./routes/asset.routes');
const missingRoutes = require('./routes/missing.routes');
const supplyRoutes = require('./routes/supply.routes');
const shipmentRoutes = require('./routes/shipment.routes');
const registryRoutes = require('./routes/registry.routes');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

// Trust reverse proxies (Render, Railway, Cloudflare, Vercel)
app.set('trust proxy', process.env.TRUST_PROXY ? process.env.TRUST_PROXY.split(',').map(v => v.trim()) : false);

// Robust CORS for local dev and deployed cloud origins (Vercel, Render, Railway)
const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true);
    const error = new Error('Origin not allowed');
    error.status = 403;
    callback(error);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// Security headers (CSP, X-Frame-Options, HSTS, etc.)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow PWA to fetch assets
}));

app.use(cors(corsOptions));
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

// Bounded JSON payloads include compressed field photos.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
app.use(validateRequest);

// Local test/demo bypass requires an explicit flag and is never enabled in production.
function isLocalhost(req) {
  return process.env.NODE_ENV !== 'production' && process.env.DISABLE_RATE_LIMITS === 'true' && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
}

// Separate read and mutation quotas; authenticated accounts sharing a relay IP have independent buckets.
const globalLimiter = rateLimit({
  store:new (require('./services/database-rate-store').DatabaseRateStore)('globalLimiter'),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  keyGenerator: rateLimitKey,
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false,
  message: { error: 'Too many update requests. Please retry after the limit resets.' },
  skip: (req) => req.path === '/api/health' || isLocalhost(req),
});

// Strict limiter for auth endpoints to prevent credential stuffing
const authLimiter = rateLimit({
  store:new (require('./services/database-rate-store').DatabaseRateStore)('authLimiter'),
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts. Please wait 15 minutes before retrying.' },
  skip: isLocalhost,
});

// Tight limiter for SOS submissions -- fake SOS flood during real disaster is a safety issue
const sosLimiter = rateLimit({
  store:new (require('./services/database-rate-store').DatabaseRateStore)('sosLimiter'),
  windowMs: 15 * 60 * 1000,
  max: 15,
  keyGenerator: rateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'SOS rate limit exceeded. If this is a genuine emergency, wait until the 15-minute limit resets and retry.' },
  skip: isLocalhost,
});

// Hazard report limiter
const hazardLimiter = rateLimit({
  store:new (require('./services/database-rate-store').DatabaseRateStore)('hazardLimiter'),
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: rateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Hazard report rate limit exceeded. Please wait before submitting again.' },
  skip: isLocalhost,
});

const readLimiter = rateLimit({
  store:new (require('./services/database-rate-store').DatabaseRateStore)('readLimiter'),
  windowMs: 15 * 60 * 1000,
  max: 600,
  keyGenerator: rateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many read requests. Please retry after the limit resets.' },
  skip: req => req.path === '/api/health' || isLocalhost(req),
});
app.use((req, res, next) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? readLimiter(req, res, next) : globalLimiter(req, res, next));

// Setup Socket.io with WSS support and polling fallback
const io = new Server(server, {
  cors: corsOptions,
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  allowRequest: (req, callback) => callback(null, isAllowedOrigin(req.headers.origin)),
});
setupSockets(io);

// Wire API Routes
app.use('/api/health', healthRoutes);
app.use('/api/auth', (req, res, next) => ['/login', '/register'].includes(req.path) && req.method === 'POST' ? authLimiter(req, res, next) : next(), authRoutes); // tighter limiter on auth
app.use('/api/alerts', alertRoutes);
app.use('/api/sos', (req, res, next) => req.path === '/' && req.method === 'POST' ? sosLimiter(req, res, next) : next(), sosRoutes);           // DoS guard: 15 SOS/15min per verified account or network
app.use('/api/shelters', shelterRoutes);
app.use('/api/hazards', (req, res, next) => req.path === '/' && req.method === 'POST' ? hazardLimiter(req, res, next) : next(), hazardRoutes); // DoS guard: 20 hazards/15min per verified account or network
app.use('/api/offline', offlineRoutes);               // sync-batch sub-route has syncBatchLimiter
app.use('/api/assets', assetRoutes);
app.use('/api/missing-persons', missingRoutes);
app.use('/api/supplies', supplyRoutes);
  app.use('/api/supply', supplyRoutes);
  app.use('/api/supply-requests', supplyRoutes);
app.use('/api/supply-shipments', shipmentRoutes);
app.use('/api/registry', registryRoutes);
app.use('/api/delivery', require('./routes/delivery.routes'));
app.use('/api/field', require('./routes/field.routes'));
app.use('/api/security', require('./routes/security.routes'));
app.use('/api/operations', require('./routes/operations.routes'));
app.use('/api/notifications', require('./routes/activity.routes'));

app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found' }));

// Error Handler
app.use((err, req, res, next) => {
  if (!err.status || err.status >= 500) console.error('Unhandled server error:', err.name, err.code || '', err.message);
  const status = err.status || (err.type === 'entity.too.large' ? 413 : 500);
  res.status(status).json({ error: status === 413 ? 'Request too large' : status === 400 ? 'Invalid JSON request body' : status === 403 ? 'Origin not allowed' : 'Internal server error occurred' });
});

// Start only after database readiness; production never pushes schemas or seeds data.
async function start() {
  const prisma = require('./db');
  await prisma.$connect();
  await prisma.user.count();
  if (process.env.NODE_ENV === 'production') {
    if (process.env.REQUIRE_OPERATOR_MFA !== 'false') require('./services/account-security.service').encrypt('startup-check');
    const bcrypt = require('bcryptjs');
    const privileged = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'VOLUNTEER'] } }, select: { passwordHash: true } });
    for (const account of privileged) if (await bcrypt.compare('password123', account.passwordHash)) throw new Error('Production startup refused: rotate or remove privileged demo accounts using the known demo password');
    if (process.env.OFFLINE_HUB_SECRET && Buffer.byteLength(process.env.OFFLINE_HUB_SECRET) < 32) throw new Error('Production relay authentication requires a random OFFLINE_HUB_SECRET of at least 32 bytes');
  }
  require('./services/maintenance.service').startMaintenance();
  require('./services/delivery.service').startDeliveryWorker();
  server.listen(PORT, HOST, () => {
    console.log('Disaster management API listening on port ' + PORT);
  // Print LAN IPs for mobile device hotspot/Wi-Fi connection
  try {
    const interfaces = os.networkInterfaces();
    console.log(`🌐 Local Network Relay Hub active. Available on LAN addresses:`);
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`   👉 http://${net.address}:${PORT} (Connect mobile devices on same Wi-Fi/Hotspot)`);
        }
      }
    }
  } catch (err) {
    console.warn('Could not enumerate network interfaces:', err.message);
  }
  });
}
if (require.main === module) start().catch(err => { console.error('Startup failed:', err.message); process.exit(1); });
module.exports = { app, server, io, start };
