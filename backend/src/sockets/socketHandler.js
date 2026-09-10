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

    // Explicit role join event (cryptographically verified for privileged roles)
    socket.on('join:role', (payload) => {
      const requestedRole = typeof payload === 'string' ? payload.toUpperCase() : payload?.role?.toUpperCase();
      const token = typeof payload === 'object' ? payload?.token : null;

      if (!requestedRole) return;

      // CITIZEN room is public for public emergency alerts
      if (requestedRole === 'CITIZEN') {
        socket.join('role:CITIZEN');
        socket.userRole = 'CITIZEN';
        return;
      }

      // Privileged roles (ADMIN, VOLUNTEER) require valid JWT token
      if (['VOLUNTEER', 'ADMIN'].includes(requestedRole)) {
        const verificationToken = token || socket.handshake.auth?.token || socket.handshake.query?.token;
        if (!verificationToken) {
          console.warn(`[Socket Security] Denied join to privileged room role:${requestedRole} for unauthenticated socket ${socket.id}`);
          socket.emit('error:unauthorized', { error: `Authentication token required to join role:${requestedRole}` });
          return;
        }

        try {
          const decoded = jwt.verify(verificationToken, JWT_SECRET);
          const userRole = decoded.role?.toUpperCase();
          if (userRole === requestedRole || (requestedRole === 'VOLUNTEER' && userRole === 'ADMIN')) {
            const roleRoom = `role:${requestedRole}`;
            socket.join(roleRoom);
            socket.userRole = requestedRole;
            console.log(`⚡ Socket ${socket.id} verified and joined role room: ${roleRoom}`);
          } else {
            console.warn(`[Socket Security] Role mismatch for socket ${socket.id}: token role is ${userRole}, requested ${requestedRole}`);
            socket.emit('error:unauthorized', { error: `Insufficient permissions for role:${requestedRole}` });
          }
        } catch (err) {
          console.warn(`[Socket Security] Invalid token for role join from socket ${socket.id}: ${err.message}`);
          socket.emit('error:unauthorized', { error: 'Invalid or expired authentication token' });
        }
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
