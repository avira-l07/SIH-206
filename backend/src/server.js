require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const { setupSockets } = require('./sockets/socketHandler');
const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const alertRoutes = require('./routes/alert.routes');
const sosRoutes = require('./routes/sos.routes');
const shelterRoutes = require('./routes/shelter.routes');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

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

    if (isExplicitlyAllowed || matchesPattern || process.env.CORS_ORIGIN === '*') {
      return callback(null, true);
    }

    // Permissive fallback for hackathon live judging demo to avoid silent CORS blockage
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(express.json());

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
app.use('/api/auth', authRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/sos', sosRoutes);
app.use('/api/shelters', shelterRoutes);

// Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal server error occurred' });
});

server.listen(PORT, () => {
  console.log(`🚀 SIH26206 Disaster Management Backend running on port ${PORT}`);
  console.log(`📡 WebSocket server listening for real-time dispatch events`);
  console.log(`🩺 Health check accessible at: http://localhost:${PORT}/api/health`);
});
