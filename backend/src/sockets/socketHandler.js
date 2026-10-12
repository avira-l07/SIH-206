const { verifyIdentity } = require('../middleware/auth.middleware');

let ioInstance = null;

function setupSockets(io) {
  ioInstance = io;
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next();
    try { socket.user = await verifyIdentity(token); next(); }
    catch { next(new Error('Invalid or expired authentication token')); }
  });
  io.on('connection', socket => {
    const user = socket.user;
    if (user) {
      socket.join('user:' + user.id);
      if (!user.securitySetupRequired && (user.role !== 'VOLUNTEER' || user.trusted)) socket.join('role:' + user.role + (user.serviceRegion && user.role !== 'CITIZEN' ? ':' + user.serviceRegion : ''));
      const timeout = Number.isFinite(user.expiresAt) ? setTimeout(() => socket.disconnect(true), Math.max(0, (user.expiresAt * 1000) - Date.now())) : null;
      timeout?.unref();
      socket.on('disconnect', () => clearTimeout(timeout));
    }
    socket.on('join:role', payload => {
      const role = typeof payload === 'string' ? payload : payload?.role;
      if (typeof role !== 'string') return;
      if (role === 'CITIZEN' && user) return socket.join('role:CITIZEN');
      if (user && (user.role === role || (user.role === 'ADMIN' && role === 'VOLUNTEER')) && (user.role !== 'VOLUNTEER' || user.trusted)) !user.securitySetupRequired && socket.join('role:' + role + (user.serviceRegion && role !== 'CITIZEN' ? ':' + user.serviceRegion : ''));
      else socket.emit('error:unauthorized', { error: 'Insufficient room permissions' });
    });
    socket.on('ping', () => socket.emit('pong', { timestamp: Date.now() }));
  });
  return io;
}

function emitSOS(event, sos) {
  notifyOperationsChanged('sos');
  notifyInboxChanged();
  if (!ioInstance) return;
  let rooms = ioInstance.to('role:ADMIN').to('role:VOLUNTEER');
  if(sos.region) rooms = rooms.to('role:ADMIN:' + sos.region).to('role:VOLUNTEER:' + sos.region);
  if(sos.assignedVolunteerId) rooms = rooms.to('user:' + sos.assignedVolunteerId);
  if (sos.userId) rooms = rooms.to('user:' + sos.userId);
  rooms.emit(event, sos);
}

function notifyOperationsChanged(topic) {
  if (ioInstance) ioInstance.emit('operations:changed', { topic });
}

function notifyInboxChanged() {
  if (ioInstance) ioInstance.emit('inbox:changed', {});
}

function notifyRespondersChanged() {
  if (ioInstance) ioInstance.to('role:ADMIN').to('role:VOLUNTEER').emit('responders:changed', {});
}

function broadcastAssetChanged(asset) {
  notifyOperationsChanged('assets');
  if (!ioInstance) return;
  let rooms = ioInstance.to('role:ADMIN').to('role:VOLUNTEER');
  if (asset.userId) rooms = rooms.to('user:' + asset.userId);
  rooms.emit('asset:changed', { id: asset.id });
}

function broadcastMissingChanged(report) {
  notifyOperationsChanged('missing');
  if (ioInstance) ioInstance.to('role:ADMIN').to('role:VOLUNTEER').to('role:CITIZEN').emit('missing:changed', { id: report.id });
}

function getIO() {
  if (!ioInstance) {
    throw new Error('Socket.io instance has not been initialized yet!');
  }
  return ioInstance;
}

function broadcastAlert(alert) {
  notifyInboxChanged();
  notifyOperationsChanged('alerts');
  if (ioInstance) {
    ioInstance.emit('alert:new', alert);
  }
}

function broadcastAlertDeactivated(alert) {
  notifyOperationsChanged('alerts');
  if (ioInstance) {
    ioInstance.emit('alert:deactivated', alert);
  }
}

function broadcastAlertDeleted(payload) {
  notifyOperationsChanged('alerts');
  if (ioInstance) {
    ioInstance.emit('alert:deleted', payload);
  }
}

function broadcastSOSCreated(sos) {
  if (ioInstance) {
    emitSOS('sos:created', sos);
  }
}

function broadcastSOSStatus(sos) {
  if (ioInstance) {
    emitSOS('sos:status_changed', sos);
  }
}

function broadcastSOSVerified(sos) {
  if (ioInstance) {
    emitSOS('sos:verified', sos);
    emitSOS('sos:status_changed', sos);
  }
}

function broadcastSOSCancelled(sos) {
  if (ioInstance) {
    emitSOS('sos:cancelled', sos);
    emitSOS('sos:status_changed', sos);
  }
}

function broadcastSOSTriageTagged(sos) {
  if (ioInstance) {
    emitSOS('sos:triage_tagged', sos);
    emitSOS('sos:status_changed', sos);
  }
}

function broadcastShelterOccupancy(shelter) {
  notifyOperationsChanged('shelters');
  if (ioInstance) {
    ioInstance.emit('shelter:occupancy_changed', shelter);
  }
}

function broadcastShelterAudit(shelter) {
  notifyOperationsChanged('shelters');
  if (ioInstance) {
    ioInstance.emit('shelter:audit_updated', shelter);
    ioInstance.emit('shelter:occupancy_changed', shelter);
  }
}

function broadcastRestockNeeded(shelter, details) {
  notifyInboxChanged();
  if (ioInstance) {
    // Scoped strictly to admin and volunteer roles (Decision 0.3)
    ioInstance.to('role:ADMIN').to('role:VOLUNTEER').emit('shelter:restock_needed', {
      shelter,
      shelterId: shelter.id,
      message: `${shelter.name}: ${details.resourceType} below reserve threshold`,
      ...details,
    });
  }
}

function broadcastHazardCreated(report) {
  notifyOperationsChanged('hazards');
  if (ioInstance) {
    ioInstance.emit('hazard:new', report);
  }
}

function broadcastHazardConfirmed(report) {
  notifyOperationsChanged('hazards');
  if (ioInstance) {
    ioInstance.emit('hazard:confirmed', report);
  }
}

function broadcastHazardTierChanged(report) {
  if (ioInstance) {
    ioInstance.emit('hazard:tier_changed', report);
  }
}


function broadcastSupplyUpdated(payload) {
  notifyOperationsChanged('supplies');
  if (ioInstance) {
    ioInstance.emit('supply:updated', payload);
  }
}

function broadcastSupplyDistributed(payload) {
  if (ioInstance) {
    let rooms = ioInstance.to('role:ADMIN').to('role:VOLUNTEER');
    if (payload.distribution?.citizenId) rooms = rooms.to('user:' + payload.distribution.citizenId);
    rooms.emit('supply:distributed', payload);
  }
}

module.exports = {
  notifyInboxChanged,
  notifyRespondersChanged,
  notifyOperationsChanged,
  broadcastAssetChanged,
  broadcastMissingChanged,
  setupSockets,
  getIO,
  broadcastAlert,
  broadcastAlertDeactivated,
  broadcastAlertDeleted,
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
  broadcastSupplyUpdated,
  broadcastSupplyDistributed,
};
