require('dotenv').config();
const http = require('http');
const os = require('os');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');

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
const CORS_ORIGIN = process.env.CORS_ORIGIN || '';

// Trust reverse proxies (Render, Railway, Cloudflare, Vercel)
app.set('trust proxy', 1);

// Robust CORS for local dev and deployed cloud origins (Vercel, Render, Railway)
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);

    const allowedDomainPatterns = [
      'localhost',
      '127.0.0.1',
      '.vercel.app',
      '.onrender.com',
      '.railway.app',
      '.supabase.co',
    ];

    const isExplicitlyAllowed = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).includes(origin)
      : false;

    const matchesPattern = allowedDomainPatterns.some((pattern) => origin.includes(pattern));

    if (isExplicitlyAllowed || matchesPattern) {
      return callback(null, true);
    }

    // Reject origins that do not match any allowed pattern or explicit whitelist
    return callback(new Error(`CORS: Origin '${origin}' not allowed`), false);
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

// Cap request body at 16 KB to prevent memory exhaustion attacks
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));

// Global rate limiter: 200 req / 15 min per IP (window can be tuned per-route)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again after 15 minutes.' },
  skip: (req) => req.path === '/api/health', // health checks are exempt
});

// Strict limiter for auth endpoints to prevent credential stuffing
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts. Please wait 15 minutes before retrying.' },
});

// Tight limiter for SOS submissions -- fake SOS flood during real disaster is a safety issue
const sosLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'SOS rate limit exceeded. If this is a genuine emergency, wait 1 minute and retry.' },
});

// Hazard report limiter
const hazardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Hazard report rate limit exceeded. Please wait before submitting again.' },
});

// Sync-batch limiter -- each flush is one batch; 10 per 15 min is generous for legit PWA use
const syncBatchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Sync-batch rate limit exceeded.' },
});

app.use(globalLimiter);

// Setup Socket.io with WSS support and polling fallback
const io = new Server(server, {
  cors: corsOptions,
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  allowEIO3: true,
});
setupSockets(io);

// Wire API Routes
app.use('/api/health', healthRoutes);
app.use('/api/auth', authLimiter, authRoutes); // tighter limiter on auth
app.use('/api/alerts', alertRoutes);
app.use('/api/sos', sosLimiter, sosRoutes);           // DoS guard: 15 SOS/15min per IP
app.use('/api/shelters', shelterRoutes);
app.use('/api/hazards', hazardLimiter, hazardRoutes); // DoS guard: 20 hazard/15min per IP
app.use('/api/offline', offlineRoutes);               // sync-batch sub-route has syncBatchLimiter
app.use('/api/assets', assetRoutes);
app.use('/api/missing-persons', missingRoutes);
app.use('/api/supplies', supplyRoutes);
app.use('/api/supply-shipments', shipmentRoutes);
app.use('/api/registry', registryRoutes);

// Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal server error occurred' });
});

server.listen(PORT, HOST, () => {
  console.log(`🚀 SIH26206 Disaster Management Backend running on http://${HOST}:${PORT}`);
  console.log(`📡 WebSocket server listening for real-time dispatch events`);
  console.log(`🩺 Health check accessible at: http://localhost:${PORT}/api/health`);

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
