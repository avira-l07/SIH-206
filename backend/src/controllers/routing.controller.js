const prisma=require('../db'),f=require('../services/field.service'),r=require('../services/routing.service');
const {wrap}=require('./field.controller');
exports.list=wrap(async(req,res)=>res.json({corridors:await prisma.evacuationCorridor.findMany({where:f.scopeWhere(req.user),orderBy:{id:'desc'},take:200})}));
exports.create=wrap(async(req,res)=>{
  const name=f.text(req.body.name,'Corridor name',100),region=f.regionKey(f.text(req.body.region,'District',200)),reviewNote=f.text(req.body.reason,'Field review evidence');f.assertScope(req.user,region);
  if(!r.validPoints(req.body.points)||!['FOOT','VEHICLE','BOTH'].includes(req.body.mode))f.fail(400,'Provide 2–50 valid [latitude,longitude] points and travel mode');
  const expiresAt=new Date(req.body.expiresAt); if(!Number.isFinite(+expiresAt)||+expiresAt<=Date.now()||+expiresAt>Date.now()+24*3600000)f.fail(400,'Review must expire within 24 hours');
  const corridor=await prisma.evacuationCorridor.create({data:{name,region,mode:req.body.mode,points:JSON.stringify(req.body.points),reviewNote,reviewedById:req.user.id,expiresAt}});res.status(201).json({corridor});
});
exports.close=wrap(async(req,res)=>{const item=await prisma.evacuationCorridor.findUnique({where:{id:Number(req.params.id)}});if(!item)f.fail(404,'Corridor not found');f.assertScope(req.user,item.region);const corridor=await prisma.evacuationCorridor.update({where:{id:item.id},data:{active:false}});res.json({corridor});});
exports.suggest=wrap(async(req,res)=>{
  const {start,end,mode}=req.body;if(!r.validPoints([start,end])||!['FOOT','VEHICLE'].includes(mode))f.fail(400,'Provide valid start/end coordinates and travel mode');
  if(r.distance(start,end)>50000)f.fail(400,'Route planning is limited to a local 50km area');
  const corridors=await prisma.evacuationCorridor.findMany({where:{active:true,expiresAt:{gt:new Date()},...(req.user.serviceRegion?f.scopeWhere(req.user):{})},take:500,orderBy:{reviewedAt:'desc'}});
  // Stale reports are excluded from route planning; safety is never inferred from absence.
  const hazards=await require('../services/obstruction.service').currentObstructions(prisma);
  res.json({route:r.route(start,end,corridors,hazards,mode),asOf:new Date().toISOString(),obstructionPolicy:'100m clearance from AMBER/RED waist-deep/submerged or landslide/rockfall/road-blocked reports from the last 24h'});
});
