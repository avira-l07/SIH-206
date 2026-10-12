const { transaction } = require('./transaction.service');

const labels = { CREATED: 'Help request received', VERIFIED: 'Request verified', ASSIGNED: 'Responder assigned', STATUS: 'Rescue progress updated', CANCELLED: 'Request cancelled', TRIAGE: 'Triage priority updated', CONFIRMED: 'Citizen confirmed safe', REOPENED: 'Citizen still needs help', ACKNOWLEDGED: 'Responder acknowledged assignment', HANDOFF_REQUESTED: 'Responder needs a replacement', REASSIGNED: 'Responder reassigned' };
async function recordRescueEvent(tx, sos, actor, kind, fromStatus = null, oldAssignee = null, detail) {
  const event = await tx.rescueEvent.create({ data: {
    sosId: sos.id, kind, fromStatus, toStatus: sos.status,
    actorId: actor?.id || null, actorName: actor?.name || 'Report received', actorRole: actor?.role || 'SYSTEM',
    detail: detail ?? (kind === 'CANCELLED' ? sos.cancelReason : kind === 'TRIAGE' ? sos.triageTag : kind === 'HANDOFF_REQUESTED' ? sos.handoffReason : null),
  } });
  const operators = await tx.user.findMany({ where: { role: 'ADMIN', OR:[{serviceRegion:null},{serviceRegion:sos.region}] }, select: { id: true } });
  const recipients = new Set([...operators.map(u => u.id), sos.userId, sos.assignedVolunteerId, oldAssignee].filter(Boolean));
  await tx.notification.createMany({ data: [...recipients].map(userId => ({ userId, sosId: sos.id, kind: 'RESCUE', title: `Request #${sos.id}: ${labels[kind] || 'Updated'} (${sos.status.toLowerCase().replaceAll('_', ' ')})` })) });
  return event;
}

async function recordNotice(tx, kind, title, respondersOnly = false) {
  const users = await tx.user.findMany({ where: respondersOnly ? { OR: [{ role: 'ADMIN' }, { role: 'VOLUNTEER', trusted: true }] } : {}, select: { id: true } });
  if (users.length) await tx.notification.createMany({ data: users.map(u => ({ userId: u.id, kind, title: title.slice(0, 300) })) });
}
async function publishNotice(kind, title, respondersOnly = false) {
  await transaction(tx => recordNotice(tx, kind, title, respondersOnly));
  require('../sockets/socketHandler').notifyInboxChanged();
}
module.exports = { recordRescueEvent, recordNotice, publishNotice };
