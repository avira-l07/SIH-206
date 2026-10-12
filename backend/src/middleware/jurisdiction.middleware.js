const prisma=require('../db');
const {regionKey,fail}=require('../services/field.service');
async function authorizeJurisdiction(req,res) {
  const scope=regionKey(req.user.serviceRegion); if(!scope||req.user.role==='CITIZEN')return;
  const root=req.baseUrl.replace('/api/',''),id=Number(req.params.id);
  let record;
  if((root==='sos' || root==='notifications'&&req.path.startsWith('/sos/'))&&id)record=await prisma.sOSRequest.findUnique({where:{id}});
  if(root==='alerts'&&id)record=await prisma.alert.findUnique({where:{id}});
  if(root==='assets'&&id)record=await prisma.civilianAsset.findUnique({where:{id}});
  if(root==='shelters'&&id)record=await prisma.shelter.findUnique({where:{id}});
  if(root==='hazards'&&id)record=await prisma.hazardReport.findUnique({where:{id}});
  if(root==='missing-persons'&&id)record=await prisma.missingPerson.findUnique({where:{id}});
  if(['supplies','supply','supply-requests'].includes(root)&&id){const supply=await prisma.supplyRequest.findUnique({where:{id}});if(supply)record=await prisma.shelter.findUnique({where:{id:supply.shelterId}});}
  if(root==='supply-shipments'&&id){const shipment=await prisma.supplyShipment.findUnique({where:{id}});if(shipment)record=await prisma.shelter.findUnique({where:{id:shipment.shelterId}});}
  if(req.body?.shelterId)record=await prisma.shelter.findUnique({where:{id:req.body.shelterId}});
  if(record&&regionKey(record.region)!==scope)fail(403,'Record belongs to another service district');
  if(root==='auth'&&id){const target=await prisma.user.findUnique({where:{id}});if(target&&regionKey(target.serviceRegion)!==scope)fail(403,'Responder belongs to another service district');}
  if(root==='offline'&&req.path!=='/sync-batch')fail(403,'District responders use incident and shelter workflows; relay ingestion requires a global coordinator');
  if(req.body&&['alerts','shelters','hazards','assets','missing-persons','sos'].includes(root)&&['POST','PUT'].includes(req.method)){
    if(req.body.region&&regionKey(req.body.region)!==scope)fail(403,'Publish only within your service district');req.body.region=scope;
  }
  if(root==='alerts'&&req.body?.targetPhones?.length)fail(403,'District operators cannot override alert recipient districts');
  const original=res.json.bind(res);
  res.json=body=>{
    if(body&&root==='sos'&&Array.isArray(body.requests))body={...body,requests:body.requests.filter(x=>regionKey(x.region)===scope)};
    if(body&&root==='sos'&&Array.isArray(body.sosRequests))body={...body,sosRequests:body.sosRequests.filter(x=>regionKey(x.region)===scope)};
    for(const key of ['assets','suggestions','reports'])if(body&&Array.isArray(body[key])&&['assets','hazards','missing-persons'].includes(root))body={...body,[key]:body[key].filter(x=>regionKey(x.region)===scope)};
    for(const key of ['users','responders'])if(body&&root==='auth'&&Array.isArray(body[key]))body={...body,[key]:body[key].filter(x=>regionKey(x.serviceRegion)===scope)};
    return original(body);
  };
}
module.exports={authorizeJurisdiction};
