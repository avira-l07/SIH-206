const prisma = require('../db');
const f = require('../services/field.service');
const e = require('../services/evacuation.service');
const r = require('../services/routing.service');
const { transaction } = require('../services/transaction.service');
const { wrap } = require('./field.controller');
const sockets = require('../sockets/socketHandler');
const changed = () => { sockets.notifyOperationsChanged('evacuation'); sockets.notifyInboxChanged(); };
function deadline(value, maximumHours) { const date = new Date(value); if (!Number.isFinite(+date) || date <= new Date() || +date > Date.now()+maximumHours*3600000) f.fail(400, `Validity must end within ${maximumHours} hours`); return date; }
function point(body) { if (!e.validPoint([body.lat,body.lng])) f.fail(400,'Valid latitude and longitude are required'); }
const isStaff = actor => actor.role === 'ADMIN' || actor.role === 'VOLUNTEER' && actor.trusted;
exports.list = wrap(async(req,res) => {
  const now = new Date();
  const advisories = await prisma.evacuationAdvisory.findMany({where:{...f.scopeWhere(req.user),...(req.user.role==='ADMIN'?{}:{active:true,expiresAt:{gt:now}})},orderBy:{publishedAt:'desc'},take:100});
  // Respect closure of the linked public alert as well as the advisory's own deadline.
  const activeAlerts = await prisma.alert.findMany({where:{id:{in:advisories.map(a=>a.alertId)},active:true,deletedAt:null},select:{id:true}});
  const ids = new Set(activeAlerts.map(a=>a.id));
  res.json({advisories:advisories.map(a=>({...a,active:a.active && ids.has(a.alertId)})).filter(a=>req.user.role==='ADMIN'||a.active),asOf:now.toISOString()});
});
exports.publish = wrap(async(req,res) => {
  const b=req.body; point(b);
  const region=f.regionKey(f.text(b.region,'District',200)); f.assertScope(req.user,region);
  if (!['LANDSLIDE','FLOOD','FIRE','EARTHQUAKE','ADVISORY'].includes(b.hazardType) || !['PREPARE','EVACUATE'].includes(b.action)) f.fail(400,'Choose a hazard and prepare/evacuate action');
  if (!Number.isFinite(b.radiusKm) || b.radiusKm<=0 || b.radiusKm>50) f.fail(400,'Affected radius must be greater than zero and at most 50 km');
  if (b.probability!=null && (!Number.isFinite(b.probability) || b.probability<0 || b.probability>100)) f.fail(400,'Reported probability must be between 0 and 100');
  const sourceName=f.text(b.sourceName,'Assessment source',120),sourceReference=f.text(b.sourceReference,'Source reference',500),assessmentNote=f.text(b.assessmentNote,'Assessment basis and time window',1000),instructions=f.text(b.instructions,'Local action instructions',1500);
  const observedAt=new Date(b.observedAt),expiresAt=deadline(b.expiresAt,24);
  if(!Number.isFinite(+observedAt)||+observedAt>Date.now()+60000||+observedAt<Date.now()-24*3600000||observedAt>=expiresAt)f.fail(400,'Assessment observation must be within the last 24 hours');
  const result=await transaction(async tx=>{
    await f.responder(tx,req.user,true);
    const message=`${b.action==='EVACUATE'?'Evacuation guidance':'Prepare for possible evacuation'}: ${instructions}${b.probability!=null?` Source-reported estimate ${b.probability}% (${sourceName}); not an app prediction.`:''} Open your dashboard for reviewed shelter routes and route help points.`;
    const alert=await tx.alert.create({data:{region,hazardType:b.hazardType,severity:b.action==='EVACUATE'?'CRITICAL':'WATCH',lat:b.lat,lng:b.lng,radiusKm:b.radiusKm,message,sourceKind:'MANUAL',observedAt,evidence:sourceReference}});
    const advisory=await tx.evacuationAdvisory.create({data:{alertId:alert.id,region,hazardType:b.hazardType,action:b.action,probability:b.probability??null,sourceName,sourceReference,assessmentNote,instructions,lat:b.lat,lng:b.lng,radiusKm:b.radiusKm,observedAt,expiresAt,publishedById:req.user.id}});
    await require('../services/delivery.service').enqueue(tx,alert);
    const recipients=await tx.user.findMany({where:{role:'CITIZEN'},select:{id:true,region:true,lat:true,lng:true}});
    await f.notice(tx,recipients.filter(u=>u.lat!=null&&u.lng!=null?r.distance([u.lat,u.lng],[b.lat,b.lng])<=b.radiusKm*1000:f.regionKey(u.region)===region).map(u=>u.id),'EVACUATION',`${region}: ${b.action==='EVACUATE'?'Evacuation guidance':'Prepare for possible evacuation'}. Open shelter route guidance.`);
    return {advisory,alert};
  });
  sockets.broadcastAlert({...result.alert,evacuation:{active:true,expiresAt:result.advisory.expiresAt}});changed();res.status(201).json({advisory:result.advisory,message:'Guidance published. SMS and push delivery depend on configured providers.'});
});
exports.close = wrap(async(req,res) => {
  const advisory=await transaction(async tx=>{await f.responder(tx,req.user,true);const a=await tx.evacuationAdvisory.findUnique({where:{id:Number(req.params.id)}});if(!a)f.fail(404,'Guidance not found');f.assertScope(req.user,a.region);await tx.alert.update({where:{id:a.alertId},data:{active:false}});return tx.evacuationAdvisory.update({where:{id:a.id},data:{active:false}});});
  sockets.broadcastAlertDeactivated({id:advisory.alertId});changed();res.json({advisory});
});
exports.helpPoints = wrap(async(req,res) => {
  const where={...f.scopeWhere(req.user),...(req.user.role==='ADMIN'?{}:req.user.role==='VOLUNTEER'?{assignedVolunteerId:req.user.id}:{active:true,expiresAt:{gt:new Date()},corridor:{active:true,expiresAt:{gt:new Date()}}})};
  const points=await prisma.routeHelpPoint.findMany({where,include:{corridor:{select:{active:true,expiresAt:true}},volunteer:{select:{id:true,name:true,trusted:true,role:true,onDuty:true}}},orderBy:{id:'desc'},take:200});
  res.json({helpPoints:points.map(p=>({...e.publicPoint(p),...(isStaff(req.user)?{assignedVolunteerId:p.assignedVolunteerId,volunteerName:p.volunteer.name,active:p.active}: {})}))});
});
exports.createPoint = wrap(async(req,res) => {
  const b=req.body;point(b);f.integer(b.corridorId,'corridor');f.integer(b.assignedVolunteerId,'volunteer');
  const name=f.text(b.name,'Help point name',120),instructions=f.text(b.instructions,'Help point instructions',1000),expiresAt=deadline(b.expiresAt,4);
  const publicContact=b.publicContact?f.text(b.publicContact,'Public team telephone',30):null;if(publicContact&&!/^\+?[0-9 ()-]{3,30}$/.test(publicContact))f.fail(400,'Use a public team telephone number');
  const helpPoint=await transaction(async tx=>{
    await f.responder(tx,req.user,true);
    const corridor=await tx.evacuationCorridor.findUnique({where:{id:b.corridorId}});if(!corridor?.active||corridor.expiresAt<=new Date())f.fail(409,'Choose a current reviewed corridor');f.assertScope(req.user,corridor.region);
    if(expiresAt>corridor.expiresAt)f.fail(400,'Help point cannot outlast its corridor review');
    const volunteer=await tx.user.findUnique({where:{id:b.assignedVolunteerId}});if(!volunteer?.trusted||volunteer.role!=='VOLUNTEER'||volunteer.onDuty!==true)f.fail(409,'Choose an approved volunteer on duty');
    if(volunteer.serviceRegion&&f.regionKey(volunteer.serviceRegion)!==corridor.region)f.fail(403,'Volunteer belongs to another service district');
    const points=JSON.parse(corridor.points);if(!points.slice(1).some((end,i)=>r.pointSegmentDistance([b.lat,b.lng],points[i],end)<=100))f.fail(400,'Place the help point within 100 m of its reviewed corridor');
    const result=await tx.routeHelpPoint.create({data:{corridorId:corridor.id,assignedVolunteerId:volunteer.id,name,region:corridor.region,lat:b.lat,lng:b.lng,instructions,publicContact,createdById:req.user.id,expiresAt}});
    await f.notice(tx,[volunteer.id],'EVACUATION',`Route help point assigned: ${name}. Check in when you are physically there.`);return result;
  });changed();res.status(201).json({helpPoint});
});
exports.checkIn = wrap(async(req,res) => {
  if(typeof req.body.present!=='boolean')f.fail(400,'Confirm whether you are present at the help point');
  const helpPoint=await transaction(async tx=>{
    const volunteer=await f.responder(tx,req.user);const item=await tx.routeHelpPoint.findUnique({where:{id:Number(req.params.id)},include:{corridor:true}});if(!item)f.fail(404,'Help point not found');f.assertScope(req.user,item.region);
    if(item.assignedVolunteerId!==req.user.id)f.fail(403,'Only the assigned volunteer can confirm presence');
    if(!item.active||item.expiresAt<=new Date()||!item.corridor.active||item.corridor.expiresAt<=new Date())f.fail(409,'Help point or corridor review has ended');
    if(req.body.present&&volunteer.onDuty!==true)f.fail(409,'Start your shift before checking in');
    if(req.body.present&&await tx.sOSRequest.count({where:{assignedVolunteerId:volunteer.id,status:{in:f.DISPATCHED}}}))f.fail(409,'An active rescue needs you. Complete or hand off that assignment before staffing a help point');
    if(req.body.present)await tx.routeHelpPoint.updateMany({where:{assignedVolunteerId:volunteer.id,id:{not:item.id},confirmedAt:{not:null}},data:{confirmedAt:null}});
    return tx.routeHelpPoint.update({where:{id:item.id},data:{confirmedAt:req.body.present?new Date():null}});
  });changed();res.json({helpPoint});
});
exports.closePoint = wrap(async(req,res) => {
  const item=await prisma.routeHelpPoint.findUnique({where:{id:Number(req.params.id)}});if(!item)f.fail(404,'Help point not found');f.assertScope(req.user,item.region);
  await f.responder(prisma,req.user,true);const helpPoint=await prisma.routeHelpPoint.update({where:{id:item.id},data:{active:false,confirmedAt:null}});changed();res.json({helpPoint});
});
exports.plan = wrap(async(req,res) => {
  const {start,mode,advisoryId}=req.body;if(!e.validPoint(start)||!['FOOT','VEHICLE'].includes(mode))f.fail(400,'Valid starting coordinates and travel mode are required');
  let advisory=null;if(advisoryId!=null){f.integer(advisoryId,'guidance');advisory=await prisma.evacuationAdvisory.findUnique({where:{id:advisoryId}});const alert=advisory&&await prisma.alert.findUnique({where:{id:advisory.alertId}});if(!advisory?.active||advisory.expiresAt<=new Date()||!alert?.active||alert.deletedAt)f.fail(409,'Guidance expired or was withdrawn. Refresh before planning');f.assertScope(req.user,advisory.region);}
  const region=advisory?.region||req.user.serviceRegion||null;
  const where=region?{region}:{};
  const [shelters,corridors,hazards,points]=await Promise.all([
    prisma.shelter.findMany({where:{...where,active:true},take:500}),
    prisma.evacuationCorridor.findMany({where:{...where,active:true,expiresAt:{gt:new Date()}},take:500,orderBy:{reviewedAt:'desc'}}),
    require('../services/obstruction.service').currentObstructions(prisma),
    prisma.routeHelpPoint.findMany({where:{...where,active:true,expiresAt:{gt:new Date()}},include:{volunteer:{select:{role:true,trusted:true,onDuty:true}}},take:500})
  ]);
  const selected=e.chooseShelter(start,shelters,corridors,hazards,mode),asOf=new Date().toISOString();
  const shelter=selected.shelter&&{id:selected.shelter.id,name:selected.shelter.name,address:selected.shelter.address,contact:selected.shelter.contact,lat:selected.shelter.lat,lng:selected.shelter.lng,reportedFreePlaces:Math.max(0,selected.shelter.capacity-selected.shelter.currentOccupancy),lastAuditedAt:selected.shelter.lastAuditedAt};
  const helpPoints=e.pointsOnRoute(selected.route,points).map(p=>e.publicPoint(p));
  const validUntil=selected.route.available?new Date(Math.min(Date.now()+3600000,...selected.route.corridors.map(c=>+new Date(c.expiresAt)),...(advisory?[+advisory.expiresAt]:[]))).toISOString():null;
  res.json({plan:{version:1,start,mode,advisory,shelter,route:selected.route,helpPoints,asOf,validUntil,selection:'Shortest reviewed route among up to 50 nearby shelters with reported space and without critical readiness flags, within 50 km. Space is not reserved.'}});
});
