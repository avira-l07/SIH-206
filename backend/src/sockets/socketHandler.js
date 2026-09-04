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

module.exports = {
  setupSockets,
  getIO,
  broadcastAlert,
  broadcastSOSCreated,
  broadcastSOSStatus,
  broadcastShelterOccupancy,
};
