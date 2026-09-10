const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth.middleware');

let ioInstance = null;

function setupSockets(io) {
  ioInstance = io;

  io.on('connection', (socket) => {
    // Attempt automatic authentication & role room assignment from handshake auth or query
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded && decoded.role) {
          const roleRoom = `role:${decoded.role.toUpperCase()}`;
          socket.join(roleRoom);
          socket.userRole = decoded.role.toUpperCase();
          console.log(`⚡ Socket ${socket.id} auto-joined room: ${roleRoom}`);
        }
      } catch (err) {
        console.warn(`Socket handshake token verification failed: ${err.message}`);
      }
    }

    // Explicit role join event (for dynamic logins or test runners)
    socket.on('join:role', (role) => {
      if (role && ['CITIZEN', 'VOLUNTEER', 'ADMIN'].includes(String(role).toUpperCase())) {
        const roleRoom = `role:${String(role).toUpperCase()}`;
        socket.join(roleRoom);
        socket.userRole = String(role).toUpperCase();
        console.log(`⚡ Socket ${socket.id} joined role room: ${roleRoom}`);
      }
    });

    socket.on('disconnect', () => {
      // Client disconnected
    });

    // Handle voluntary client ping for latency test
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });
  });

  return io;
}

function getIO() {
  if (!ioInstance) {
    throw new Error('Socket.io instance has not been initialized yet!');
  }
  return ioInstance;
}

function broadcastAlert(alert) {
  if (ioInstance) {
    ioInstance.emit('alert:new', alert);
  }
}

function broadcastSOSCreated(sos) {
  if (ioInstance) {
    ioInstance.emit('sos:created', sos);
  }
}

function broadcastSOSStatus(sos) {
  if (ioInstance) {
    ioInstance.emit('sos:status_changed', sos);
  }
}

function broadcastSOSVerified(sos) {
  if (ioInstance) {
    ioInstance.emit('sos:verified', sos);
    ioInstance.emit('sos:status_changed', sos);
  }
}

function broadcastSOSCancelled(sos) {
  if (ioInstance) {
    ioInstance.emit('sos:cancelled', sos);
    ioInstance.emit('sos:status_changed', sos);
  }
}

function broadcastSOSTriageTagged(sos) {
  if (ioInstance) {
    ioInstance.emit('sos:triage_tagged', sos);
    ioInstance.emit('sos:status_changed', sos);
  }
}

function broadcastShelterOccupancy(shelter) {
  if (ioInstance) {
    ioInstance.emit('shelter:occupancy_changed', shelter);
  }
}

function broadcastShelterAudit(shelter) {
  if (ioInstance) {
    ioInstance.emit('shelter:audit_updated', shelter);
    ioInstance.emit('shelter:occupancy_changed', shelter);
  }
}

function broadcastRestockNeeded(shelter, details) {
  if (ioInstance) {
    // Scoped strictly to admin and volunteer roles (Decision 0.3)
    ioInstance.to('role:ADMIN').to('role:VOLUNTEER').emit('shelter:restock_needed', {
      shelter,
      ...details,
    });
  }
}

function broadcastHazardCreated(report) {
  if (ioInstance) {
    ioInstance.emit('hazard:new', report);
  }
}

function broadcastHazardConfirmed(report) {
  if (ioInstance) {
    ioInstance.emit('hazard:confirmed', report);
  }
}

function broadcastHazardTierChanged(report) {
  if (ioInstance) {
    ioInstance.emit('hazard:tier_changed', report);
  }
}

module.exports = {
  setupSockets,
  getIO,
  broadcastAlert,
  broadcastSOSCreated,
  broadcastSOSStatus,
  broadcastSOSVerified,
  broadcastSOSCancelled,
  broadcastSOSTriageTagged,
  broadcastShelterOccupancy,
  broadcastShelterAudit,
  broadcastRestockNeeded,
  broadcastHazardCreated,
  broadcastHazardConfirmed,
  broadcastHazardTierChanged,
};
