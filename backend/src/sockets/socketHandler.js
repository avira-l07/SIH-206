let ioInstance = null;

function setupSockets(io) {
  ioInstance = io;

  io.on('connection', (socket) => {
    console.log(`⚡ Client connected to real-time dispatch: ${socket.id}`);

    socket.on('disconnect', () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);
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
  broadcastShelterOccupancy,
  broadcastShelterAudit,
  broadcastHazardCreated,
  broadcastHazardConfirmed,
  broadcastHazardTierChanged,
};
