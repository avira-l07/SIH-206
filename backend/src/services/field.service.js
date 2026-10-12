const crypto = require('node:crypto');
const { transaction } = require('./transaction.service');
const prisma = require('../db');
const ACTIVE = ['REQUESTED', 'ACCEPTED'];
const DISPATCHED = ['EN_ROUTE', 'ON_SCENE', 'EVACUATED', 'HANDED_OVER_TO_MEDICAL'];
const regionKey = value => typeof value === 'string' ? value.trim().toLowerCase() : null;
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
function text(value, label, max = 500) { if (typeof value !== 'string' || !value.trim() || value.length > max) fail(400, `${label} is required (up to ${max} characters)`); return value.trim(); }
function integer(value, label) { if (!Number.isSafeInteger(value) || value < 1) fail(400, `Invalid ${label}`); return value; }
function assertScope(actor, region) { if (actor.serviceRegion && regionKey(actor.serviceRegion) !== regionKey(region)) fail(403, 'This record belongs to another service district'); }
const scopeWhere = actor => actor.serviceRegion ? { region: regionKey(actor.serviceRegion) } : {};
async function responder(tx, actor, admin = false) {
  const current = await tx.user.findUnique({ where: { id: actor.id } });
  if (!current || (admin ? current.role !== 'ADMIN' : current.role !== 'ADMIN' && !(current.role === 'VOLUNTEER' && current.trusted))) fail(403, 'Approved responder access required');
  return current;
}
async function notice(tx, ids, kind, title, sosId = null) {
  const users = await tx.user.findMany({ where: { id: { in: [...new Set(ids.filter(Boolean))] } }, select: { id: true } });
  if (users.length) await tx.notification.createMany({ data: users.map(u => ({ userId: u.id, kind, title, sosId })) });
}
async function releaseReservation(tx, reservation, status, reason) {
  const changed = await tx.assetReservation.updateMany({ where: { id: reservation.id, status: { in: ACTIVE } }, data: { status, reason, releasedAt: new Date() } });
  if (!changed.count) return false;
  await tx.civilianAsset.updateMany({ where: { id: reservation.assetId, activeReservationId: reservation.id }, data: { available: true, activeReservationId: null } });
  await notice(tx, [reservation.ownerId, reservation.requestedById], 'RESOURCE', `Resource booking #${reservation.id}: ${status.toLowerCase()}. ${reason}`, null);
  return true;
}
async function releaseIncidentReservations(tx, sosId) {
  for (const item of await tx.assetReservation.findMany({ where: { sosId, status: { in: ACTIVE } } })) await releaseReservation(tx, item, 'RELEASED', 'Incident closed');
}
async function reserve(actor, assetId, body) {
  integer(body.sosId, 'request'); const reason = text(body.reason, 'Reason');
  return transaction(async tx => {
    const staff = await responder(tx, actor);
    const [asset, sos] = await Promise.all([tx.civilianAsset.findUnique({ where: { id: assetId } }), tx.sOSRequest.findUnique({ where: { id: body.sosId } })]);
    if (!asset || !sos) fail(404, 'Resource or incident not found');
    assertScope(staff, sos.region); assertScope(staff, asset.region);
    if (!DISPATCHED.includes(sos.status) || (staff.role !== 'ADMIN' && sos.assignedVolunteerId !== staff.id)) fail(403, 'Book resources for your active assignment');
    if (!asset.userId) fail(409, 'An account owner must claim this legacy resource before booking');
    if (asset.activeReservationId) {
      const previous = await tx.assetReservation.findUnique({ where: { id: asset.activeReservationId } });
      if (previous?.status === 'REQUESTED' && previous.expiresAt <= new Date()) await releaseReservation(tx, previous, 'EXPIRED', 'Owner did not accept in time');
    }
    if (!(await tx.civilianAsset.updateMany({ where: { id: assetId, available: true, activeReservationId: null }, data: { available: false } })).count) fail(409, 'Resource is already held or unavailable');
    const reservation = await tx.assetReservation.create({ data: { assetId, sosId: sos.id, requestedById: staff.id, ownerId: asset.userId, region: sos.region, reason, expiresAt: new Date(Date.now() + 15 * 60000) } });
    await tx.civilianAsset.update({ where: { id: assetId }, data: { activeReservationId: reservation.id } });
    await notice(tx, [asset.userId, staff.id], 'RESOURCE', `Resource ${asset.title} requested for incident #${sos.id}. Owner acceptance is required.`, null);
    return reservation;
  });
}
async function decideReservation(actor, id, body) {
  const decision = text(body.decision, 'Decision', 20), reason = text(body.reason, 'Reason');
  if (!['ACCEPTED', 'DECLINED', 'RELEASED'].includes(decision)) fail(400, 'Invalid booking decision');
  return transaction(async tx => {
    const item = await tx.assetReservation.findUnique({ where: { id } }); if (!item) fail(404, 'Booking not found');
    const current = await tx.user.findUnique({ where: { id: actor.id } }); if (!current) fail(401, 'Account unavailable');
    const owner = item.ownerId === current.id;
    if (decision !== 'RELEASED' && !owner) fail(403, 'Only the resource owner can accept or decline');
    const assigned=await tx.sOSRequest.findUnique({where:{id:item.sosId},select:{assignedVolunteerId:true}});
    if (decision === 'RELEASED' && !owner && item.requestedById !== current.id && current.role !== 'ADMIN' && assigned?.assignedVolunteerId!==current.id) fail(403, 'You cannot release this booking');
    if (!owner) { await responder(tx, actor); assertScope(current, item.region); }
    if (!ACTIVE.includes(item.status)) fail(409, 'Booking has already ended');
    if (decision === 'ACCEPTED') {
      if (item.status !== 'REQUESTED' || item.expiresAt <= new Date()) fail(409, 'This request has expired or was already accepted');
      const sos = await tx.sOSRequest.findUnique({ where: { id: item.sosId } }); if (!sos || !DISPATCHED.includes(sos.status)) fail(409, 'Incident is no longer active');
      if (!(await tx.assetReservation.updateMany({ where: { id, status: 'REQUESTED', updatedAt: item.updatedAt }, data: { status: decision, reason, decidedAt: new Date() } })).count) fail(409, 'Booking changed; refresh');
      await notice(tx, [item.requestedById, item.ownerId], 'RESOURCE', `Resource booking #${id} accepted by its owner.`, null);
    } else await releaseReservation(tx, item, decision, reason);
    return tx.assetReservation.findUnique({ where: { id } });
  });
}
async function listReservations(actor) {
  const assignments=actor.role==='VOLUNTEER'&&actor.trusted?await prisma.sOSRequest.findMany({where:{assignedVolunteerId:actor.id,...scopeWhere(actor)},select:{id:true}}):[];
  const where = actor.role === 'ADMIN' ? scopeWhere(actor) : { OR: [{ ownerId: actor.id }, { requestedById: actor.id },{sosId:{in:assignments.map(s=>s.id)}}] };
  const reservations = await prisma.assetReservation.findMany({ where, orderBy: { id: 'desc' }, take: 100 });
  const assets = await prisma.civilianAsset.findMany({ where: { id: { in: reservations.map(r => r.assetId) } }, select: { id: true, title: true } });
  return reservations.map(r => ({ ...r, assetTitle: assets.find(a => a.id === r.assetId)?.title || 'Resource' }));
}
async function admit(actor, body) {
  integer(body.shelterId, 'shelter'); const fullName = text(body.fullName, 'Name', 200), description = text(body.description, 'Identifying details');
  const key = text(body.idempotencyKey, 'Submission key', 128);
  if (body.age != null && (!Number.isInteger(body.age) || body.age < 0 || body.age > 130)) fail(400, 'Invalid age');
  if (typeof body.consentToMatching !== 'boolean') fail(400, 'Matching consent must be explicit');
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify([body.shelterId, fullName, body.age ?? null, description, body.consentToMatching])).digest('hex');
  return transaction(async tx => {
    const staff = await responder(tx, actor); const shelter = await tx.shelter.findUnique({ where: { id: body.shelterId } });
    if (!shelter?.active) fail(404, 'Active shelter not found'); assertScope(staff, shelter.region);
    const prior = await tx.shelterIntake.findUnique({ where: { idempotencyKey: key } });
    if (prior) { if (prior.admittedById !== actor.id || prior.payloadHash !== payloadHash) fail(409, 'Submission key belongs to a different arrival'); return prior; }
    if (shelter.currentOccupancy >= shelter.capacity) fail(409, 'Shelter has no reported free beds');
    if (!(await tx.shelter.updateMany({ where: { id: shelter.id, currentOccupancy: shelter.currentOccupancy, capacity: shelter.capacity, active: true }, data: { currentOccupancy: { increment: 1 } } })).count) fail(409, 'Occupancy changed; retry');
    const intake = await tx.shelterIntake.create({ data: { shelterId: shelter.id, region: shelter.region, fullName, age: body.age ?? null, description, consentToMatching: body.consentToMatching, admittedById: actor.id, idempotencyKey: key, payloadHash } });
    await tx.shelterEvent.create({ data: { shelterId: shelter.id, deltaOccupancy: 1, operatorName: staff.name, reason: 'Recorded arrival #' + intake.id } });
    const updated = await tx.shelter.findUnique({ where: { id: shelter.id } });
    await tx.shelter.update({ where: { id: shelter.id }, data: { status: require('../controllers/shelter.controller').computeShelterStatus(updated), lastAuditedAt: new Date() } });
    return intake;
  });
}
async function depart(actor, id, body) {
  const reason = text(body.reason, 'Departure reason');
  return transaction(async tx => {
    const staff = await responder(tx, actor); const item = await tx.shelterIntake.findUnique({ where: { id } }); if (!item) fail(404, 'Arrival not found'); assertScope(staff, item.region);
    if (item.status !== 'PRESENT') fail(409, 'Departure already recorded');
    const shelter = await tx.shelter.findUnique({ where: { id: item.shelterId } });
    if (!shelter || shelter.currentOccupancy < 1) fail(409, 'Reconcile shelter occupancy before recording departure');
    if (!(await tx.shelterIntake.updateMany({ where: { id, status: 'PRESENT' }, data: { status: 'DEPARTED', departedAt: new Date(), departureReason: reason } })).count) fail(409, 'Departure already recorded');
    if (!(await tx.shelter.updateMany({ where: { id: shelter.id, currentOccupancy: shelter.currentOccupancy }, data: { currentOccupancy: { decrement: 1 } } })).count) fail(409, 'Occupancy changed; retry');
    await tx.shelterEvent.create({ data: { shelterId: shelter.id, deltaOccupancy: -1, operatorName: staff.name, reason: 'Recorded departure #' + id } });
    const updated = await tx.shelter.findUnique({ where: { id: shelter.id } });
    await tx.shelter.update({ where: { id: shelter.id }, data: { status: require('../controllers/shelter.controller').computeShelterStatus(updated), lastAuditedAt: new Date() } });
    const matched = await tx.missingPerson.findMany({ where: { matchedIntakeId: id } });
    for (const report of matched) {
      await tx.missingPerson.update({ where: { id: report.id }, data: { status: 'LOCATED', shelterName: null } });
      await notice(tx, [report.reportedByUserId], 'FAMILY', `Departure recorded for the shelter match on report #${report.id}; contact staff for current whereabouts.`);
    }
    return tx.shelterIntake.findUnique({ where: { id } });
  });
}
function matchExplanation(report, item) {
  const tokens = name => new Set(name.toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const a = tokens(report.fullName), b = tokens(item.fullName), common = [...a].filter(x => b.has(x)).length;
  const nameSimilarity = common / Math.max(1, new Set([...a, ...b]).size);
  const ageDifference = report.age != null && item.age != null ? Math.abs(report.age - item.age) : null;
  const reasons = ['Name overlap: ' + Math.round(nameSimilarity * 100) + '%']; if (ageDifference != null) reasons.push('Age difference: ' + ageDifference + ' years');
  return { score: Math.round(nameSimilarity * 80 + (ageDifference == null ? 0 : ageDifference <= 2 ? 20 : 0)), reasons };
}
async function matchSuggestions(actor, id) {
  const staff = await responder(prisma, actor); const report = await prisma.missingPerson.findUnique({ where: { id } }); if (!report) fail(404, 'Report not found'); assertScope(staff, report.region);
  const intakes = await prisma.shelterIntake.findMany({ where: { consentToMatching: true, status: 'PRESENT', ...scopeWhere(staff) }, take: 500, orderBy: { id: 'desc' } });
  return intakes.map(item => ({ intakeId: item.id, fullName: item.fullName, age: item.age, shelterId: item.shelterId, ...matchExplanation(report, item) })).filter(x => x.score >= 40).sort((a, b) => b.score - a.score).slice(0, 20);
}
async function confirmMatch(actor, id, body) {
  integer(body.intakeId, 'arrival'); const reason = text(body.reason, 'Evidence checked with family and shelter staff');
  if (!['CONFIRM', 'REJECT', 'REVOKE'].includes(body.decision)) fail(400, 'Choose confirm or reject');
  return transaction(async tx => {
    const staff = await responder(tx, actor); const report = await tx.missingPerson.findUnique({ where: { id } }), intake = await tx.shelterIntake.findUnique({ where: { id: body.intakeId } });
    if (!report || !intake) fail(404, 'Report or arrival not found'); assertScope(staff, report.region); assertScope(staff, intake.region);
    if (body.decision !== 'REVOKE' && (!intake.consentToMatching || intake.status !== 'PRESENT')) fail(409, 'This arrival is unavailable for matching');
    if(body.decision==='REVOKE'){if(report.matchedIntakeId!==intake.id)fail(409,'This match is not current');if(!(await tx.missingPerson.updateMany({where:{id,updatedAt:report.updatedAt,matchedIntakeId:intake.id},data:{matchedIntakeId:null,status:'MISSING',shelterName:null}})).count)fail(409,'Report changed; refresh');await notice(tx,[report.reportedByUserId],'FAMILY',`Staff corrected the previous shelter match on report #${id}. Contact staff for details.`);}
    if (body.decision === 'CONFIRM') {
      if (report.matchedIntakeId) fail(409, 'A match is already recorded');
      const shelter = await tx.shelter.findUnique({ where: { id: intake.shelterId } }); if (!shelter) fail(409, 'Shelter unavailable');
      if (!(await tx.missingPerson.updateMany({ where: { id, updatedAt: report.updatedAt, matchedIntakeId: null }, data: { status: 'SAFE_AT_SHELTER', shelterName: shelter.name, matchedIntakeId: intake.id } })).count) fail(409, 'Report changed; refresh');
      await notice(tx, [report.reportedByUserId], 'FAMILY', `Staff confirmed a shelter match for missing-person report #${id}. Contact shelter staff to arrange reunification.`);
    }
    return tx.familyMatch.create({ data: { missingPersonId: id, intakeId: intake.id, reviewedById: staff.id, decision: body.decision, reason } });
  });
}
module.exports = { ACTIVE, DISPATCHED, regionKey, fail, text, integer, assertScope, scopeWhere, responder, notice, reserve, decideReservation, listReservations, releaseReservation, releaseIncidentReservations, admit, depart, matchExplanation, matchSuggestions, confirmMatch };
