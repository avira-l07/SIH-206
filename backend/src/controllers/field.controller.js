const prisma = require('../db');
const { transaction } = require('../services/transaction.service');
const f = require('../services/field.service');
const sockets = require('../sockets/socketHandler');
const wrap = fn => async (req, res, next) => { try { await fn(req, res); } catch (error) { if (error.status) res.status(error.status).json({ error: error.message }); else if (['P2002','P2025'].includes(error.code)) res.status(409).json({ error: 'Record changed; refresh and retry' }); else next(error); } };
const changed = () => { sockets.notifyOperationsChanged('field'); sockets.notifyInboxChanged(); };
exports.reservations = wrap(async (req, res) => res.json({ reservations: await f.listReservations(req.user) }));
exports.reserve = wrap(async (req, res) => { const reservation = await f.reserve(req.user, Number(req.params.id), req.body); changed(); res.status(201).json({ reservation }); });
exports.decideReservation = wrap(async (req, res) => { const reservation = await f.decideReservation(req.user, Number(req.params.id), req.body); changed(); res.json({ reservation }); });
exports.intakes = wrap(async (req, res) => {
  await f.responder(prisma, req.user);
  const where = { ...f.scopeWhere(req.user) }; if (req.query.shelterId) where.shelterId = f.integer(Number(req.query.shelterId), 'shelter');
  const intakes = await prisma.shelterIntake.findMany({ where, take: 100, orderBy: { id: 'desc' } });
  res.json({ intakes: intakes.map(({ payloadHash, idempotencyKey, ...item }) => item) });
});
exports.admit = wrap(async (req, res) => { const intake = await f.admit(req.user, req.body); const shelter = await prisma.shelter.findUnique({ where: { id: intake.shelterId } }); sockets.broadcastShelterOccupancy(shelter); changed(); const {payloadHash, idempotencyKey, ...safe}=intake; res.status(201).json({ intake:safe }); });
exports.depart = wrap(async (req, res) => { const intake = await f.depart(req.user, Number(req.params.id), req.body); const shelter = await prisma.shelter.findUnique({ where: { id: intake.shelterId } }); sockets.broadcastShelterOccupancy(shelter); changed(); const {payloadHash,idempotencyKey,...safe}=intake;res.json({ intake:safe }); });
exports.suggestions = wrap(async (req, res) => res.json({ suggestions: await f.matchSuggestions(req.user, Number(req.params.id)), note: 'Suggestions are name/age overlap, not identity verification. Staff must verify consent and evidence before confirming.' }));
exports.consent = wrap(async(req,res)=>{
  if(typeof req.body.consentToMatching!=='boolean')f.fail(400,'Explicit consent is required');const reason=f.text(req.body.reason,'Consent review reason');
  const intake=await transaction(async tx=>{const staff=await f.responder(tx,req.user),item=await tx.shelterIntake.findUnique({where:{id:Number(req.params.id)}});if(!item)f.fail(404,'Arrival not found');f.assertScope(staff,item.region);if(item.status!=='PRESENT')f.fail(409,'Arrival is no longer present');
    const updated=await tx.shelterIntake.update({where:{id:item.id},data:{consentToMatching:req.body.consentToMatching}});
    await tx.shelterEvent.create({data:{shelterId:item.shelterId,operatorName:staff.name,reason:`Arrival #${item.id} matching consent ${req.body.consentToMatching?'recorded':'withdrawn'}: ${reason}`}});
    if(!req.body.consentToMatching)for(const report of await tx.missingPerson.findMany({where:{matchedIntakeId:item.id}})){await tx.missingPerson.update({where:{id:report.id},data:{matchedIntakeId:null,shelterName:null,status:'LOCATED'}});await tx.familyMatch.create({data:{missingPersonId:report.id,intakeId:item.id,reviewedById:staff.id,decision:'CONSENT_WITHDRAWN',reason}});await f.notice(tx,[report.reportedByUserId],'FAMILY',`Matching consent withdrawn for report #${report.id}; contact staff for follow-up.`);}
    const {payloadHash,idempotencyKey,...safe}=updated;return safe;});changed();res.json({intake});
});
exports.match = wrap(async (req, res) => { const decision = await f.confirmMatch(req.user, Number(req.params.id), req.body); changed(); sockets.broadcastMissingChanged({ id: Number(req.params.id) }); res.json({ decision }); });
exports.recoveryList = wrap(async (req, res) => {
  const where = req.user.role === 'ADMIN' ? f.scopeWhere(req.user) : req.user.role === 'VOLUNTEER' && req.user.trusted ? { OR:[{assignedToId:req.user.id},{userId:req.user.id}], ...f.scopeWhere(req.user) } : { userId: req.user.id };
  res.json({ cases: await prisma.recoveryCase.findMany({ where, include: { events: { orderBy: { id: 'asc' } } }, orderBy: { id: 'desc' }, take: 100 }) });
});
exports.createRecovery = wrap(async (req, res) => {
  const description = f.text(req.body.description, 'What help is needed?', 2000), region = f.regionKey(f.text(req.body.region, 'District', 200));
  if (!['DAMAGE','AID','RECOVERY'].includes(req.body.kind)) f.fail(400, 'Choose damage, aid or recovery');
  if (req.user.role !== 'CITIZEN') f.assertScope(req.user, region);
  const item = await transaction(async tx => {
    const record = await tx.recoveryCase.create({ data: { userId: req.user.id, region, kind: req.body.kind, description, events: { create: { actorId: req.user.id, status: 'REPORTED', note: 'Case reported' } } } });
    const admins = await tx.user.findMany({ where: { role: 'ADMIN', OR: [{ serviceRegion: null }, { serviceRegion: region }] }, select: { id: true } });
    await f.notice(tx, [req.user.id, ...admins.map(x=>x.id)], 'RECOVERY', `Recovery case #${record.id} reported in ${region}`); return record;
  }); changed(); res.status(201).json({ case: item });
});
exports.updateRecovery = wrap(async (req, res) => {
  const note = f.text(req.body.reason, 'Update or closure evidence');
  if (!['IN_PROGRESS','COMPLETED','REOPENED'].includes(req.body.status)) f.fail(400, 'Invalid recovery status');
  const item = await transaction(async tx => {
    const staff = await f.responder(tx, req.user), record = await tx.recoveryCase.findUnique({ where: { id: Number(req.params.id) } });
    if (!record) f.fail(404, 'Recovery case not found'); f.assertScope(staff, record.region);
    if (staff.role !== 'ADMIN' && record.assignedToId !== staff.id) f.fail(403, 'Only the assigned responder can update this case');
    if (req.body.expectedUpdatedAt !== record.updatedAt.toISOString()) f.fail(409, 'Case changed; refresh');
    const reassignment=staff.role==='ADMIN'&&record.status==='IN_PROGRESS'&&req.body.status==='IN_PROGRESS'&&Object.hasOwn(req.body,'assignedToId')&&req.body.assignedToId!==record.assignedToId;
    if (!reassignment && (req.body.status === 'REOPENED' ? record.status !== 'COMPLETED' || staff.role !== 'ADMIN' : req.body.status === 'COMPLETED' ? record.status !== 'IN_PROGRESS' : !['REPORTED','REOPENED'].includes(record.status))) f.fail(409, 'This transition is unavailable');
    let assignedToId = record.assignedToId;
    if(Object.hasOwn(req.body,'assignedToId')&&req.body.assignedToId===null){if(staff.role!=='ADMIN')f.fail(403,'Only an operator assigns recovery work');assignedToId=null;}
    if (req.body.assignedToId != null) { if (staff.role !== 'ADMIN') f.fail(403, 'Only an operator assigns recovery work'); f.integer(req.body.assignedToId, 'responder'); const target = await tx.user.findUnique({ where: { id: req.body.assignedToId } }); if (!target || !(target.role === 'ADMIN' || target.role === 'VOLUNTEER' && target.trusted) || target.onDuty === false) f.fail(409, 'Responder unavailable'); f.assertScope(target, record.region); assignedToId = target.id; }
    const result = await tx.recoveryCase.update({ where: { id: record.id, updatedAt: record.updatedAt }, data: { status: req.body.status, assignedToId, events: { create: { actorId: staff.id, status: req.body.status, note:reassignment?'Responder reassignment: '+note:note } } } });
    await f.notice(tx, [record.userId, assignedToId,record.assignedToId], 'RECOVERY', `Recovery case #${record.id}: ${req.body.status.toLowerCase()}. ${note}`); return result;
  }); changed(); res.json({ case: item });
});
const checklistKeys = ['contacts','medicines','water','documents','meetingPoint','shelter','power','alerts'];
exports.getPlan = wrap(async (req, res) => { const plan = await prisma.preparednessPlan.findUnique({ where: { userId: req.user.id } }); res.json({ plan: plan ? {...plan, checklist:JSON.parse(plan.checklist)} : null }); });
exports.savePlan = wrap(async (req, res) => {
  const body = req.body;
  if (!body.checklist || typeof body.checklist !== 'object' || Array.isArray(body.checklist) || Object.keys(body.checklist).some(k=>!checklistKeys.includes(k)) || Object.values(body.checklist).some(v=>typeof v!=='boolean')) f.fail(400, 'Invalid preparedness checklist');
  for (const key of ['meetingPoint','emergencyContact']) if (typeof body[key] !== 'string' || body[key].length > 200) f.fail(400, 'Invalid ' + key);
  if (!['en','hi'].includes(body.language) || body.drillCompleted != null && typeof body.drillCompleted !== 'boolean') f.fail(400, 'Invalid plan settings');
  const data = { checklist:JSON.stringify(body.checklist), meetingPoint:body.meetingPoint.trim(), emergencyContact:body.emergencyContact.trim(), language:body.language, ...(body.drillCompleted === true ? {drillCompletedAt:new Date()} : {}) };
  const plan = await prisma.preparednessPlan.upsert({ where:{userId:req.user.id}, create:{userId:req.user.id,...data}, update:data }); res.json({ plan:{...plan,checklist:JSON.parse(plan.checklist)} });
});
exports.metrics = wrap(async (req, res) => {
  const tickets = await prisma.sOSRequest.findMany({ where:f.scopeWhere(req.user), select:{id:true,createdAt:true,status:true,assignedAt:true,assignmentAcknowledgedAt:true,citizenConfirmedResolved:true,events:{orderBy:{id:'asc'},select:{kind:true,toStatus:true,createdAt:true}}} });
  const summarize = values => { values.sort((a,b)=>a-b); return {samples:values.length, medianSeconds:values.length ? Math.round(values[Math.floor(values.length/2)]/1000) : null, p90Seconds:values.length ? Math.round(values[Math.min(values.length-1,Math.ceil(values.length*.9)-1)]/1000) : null}; };
  const duration = (a,b) => a && b && b >= a ? b-a : null;
  const metric = (start,end) => summarize(tickets.map(t=>duration(start(t),end(t))).filter(x=>x!==null));
  const reviews = await prisma.warningReview.findMany({where:f.scopeWhere(req.user),select:{expectedHazard:true,predictedHazard:true}});
  const tp=reviews.filter(r=>r.predictedHazard!=='SAFE' && r.predictedHazard===r.expectedHazard).length, fp=reviews.filter(r=>r.predictedHazard!=='SAFE' && r.predictedHazard!==r.expectedHazard).length, fn=reviews.filter(r=>r.expectedHazard!=='SAFE' && r.predictedHazard!==r.expectedHazard).length;
  res.json({ metrics:{totalRequests:tickets.length, citizenConfirmedSafe:tickets.filter(t=>t.status==='RESOLVED' && t.citizenConfirmedResolved).length, dispatch:metric(t=>t.createdAt,t=>t.events.find(e=>e.kind==='ASSIGNED')?.createdAt), acknowledgment:metric(t=>t.assignedAt,t=>t.assignmentAcknowledgedAt), completion:metric(t=>t.createdAt,t=>t.events.find(e=>e.toStatus==='RESOLVED')?.createdAt), warningReview:{samples:reviews.length,agreements:reviews.filter(r=>r.expectedHazard===r.predictedHazard).length,falsePositive:fp,falseNegative:fn,precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null,description:'Agreement with operator-labeled observations; not independently validated forecast accuracy'}, baseline:'No baseline has been measured. Compare these deployment observations with a documented pilot baseline.'} });
});
exports.warningReview = wrap(async (req, res) => {
  const sourceReference = f.text(req.body.sourceReference,'Ground-truth source reference'), region=f.regionKey(f.text(req.body.region,'District',200)); f.assertScope(req.user,region);
  if (!['SAFE','FLOOD','LANDSLIDE','FIRE','EARTHQUAKE'].includes(req.body.expectedHazard)) f.fail(400,'Invalid observed hazard');
  const telemetry = req.body.telemetry; if (!telemetry || typeof telemetry!=='object' || Array.isArray(telemetry) || JSON.stringify(telemetry).length>2000) f.fail(400,'Invalid telemetry');
  for (const [key,value] of Object.entries(telemetry)) { if (!['rain1h','windSpeed','temp','humidity','seismic','smokeIndex','soilMoisture'].includes(key) || typeof value!=='number' || !Number.isFinite(value)) f.fail(400,'Only finite numeric telemetry readings are accepted'); }
  const prediction=require('../services/riskEngine.service').evaluateRisk(telemetry);
  const review=await prisma.warningReview.create({data:{region,sourceReference,telemetry:JSON.stringify(telemetry),expectedHazard:req.body.expectedHazard,predictedHazard:prediction.hazardType || 'SAFE',reviewedById:req.user.id}}); res.status(201).json({review,prediction:{...prediction,interpretation:'Rule severity score; not a probability'}});
});
exports.wrap = wrap;
