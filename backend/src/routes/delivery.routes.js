const router=require('express').Router(),prisma=require('../db'),f=require('../services/field.service');
const {authenticateToken,requireRole}=require('../middleware/auth.middleware'),{wrap}=require('../controllers/field.controller');
const {transaction}=require('../services/transaction.service');
router.param('id',require('../middleware/request.middleware').validateId);
function signed(req,res,next){const secret=process.env.TWILIO_AUTH_TOKEN,base=process.env.TWILIO_WEBHOOK_BASE_URL,signature=req.headers['x-twilio-signature'];if(!secret||!base||!signature||!require('twilio').validateRequest(secret,signature,base.replace(/\/$/,'')+req.originalUrl,req.body))return res.status(403).json({error:'Invalid provider signature'});next();}
router.post('/twilio/status',signed,wrap(async(req,res)=>{
  const state={delivered:'DELIVERED',failed:'FAILED',undelivered:'FAILED',sent:'ACCEPTED',queued:'ACCEPTED',accepted:'ACCEPTED'}[req.body.MessageStatus];
  if(!state||typeof req.body.MessageSid!=='string')return res.json({received:true});
  // Terminal outcomes never regress when delayed provider callbacks arrive.
  await prisma.deliveryJob.updateMany({where:{OR:[{providerId:req.body.MessageSid},...(Number.isSafeInteger(Number(req.query.jobId))&&Number(req.query.jobId)>0?[{id:Number(req.query.jobId),channel:'SMS',providerId:null,status:'SENDING'}]:[])],status:{notIn:['DELIVERED','FAILED','SIMULATED']}},data:{status:state,providerId:req.body.MessageSid,leaseUntil:null,lastError:state==='FAILED'?'Provider reported undeliverable':null}});res.json({received:true});
}));
router.post('/twilio/inbound',signed,wrap(async(req,res)=>{
  const from=typeof req.body.From==='string'?req.body.From:'',sid=req.body.MessageSid;
  if(typeof sid!=='string'||!/^SM[a-fA-F0-9]{32}$/.test(sid)||typeof req.body.Body!=='string'||req.body.Body.length>1000)f.fail(400,'Invalid inbound message');
  const users=await prisma.user.findMany({where:{phone:from,phoneVerifiedAt:{not:null}},take:2});
  if(users.length!==1)f.fail(403,'Sender must belong to one verified account');
  const user=users[0],parsed=require('../services/smsParser.service').parseSMSPayload(req.body.Body);if(!parsed.success)f.fail(400,parsed.error);
  if(parsed.type==='SHELTER_AUDIT'){if(!(user.role==='ADMIN'||user.role==='VOLUNTEER'&&user.trusted))f.fail(403,'Responder approval required');const shelter=await prisma.shelter.findUnique({where:{id:parsed.data.shelterId}});f.assertScope(user,shelter?.region);}
  const key='twilio:'+sid;if(!await prisma.offlineSyncLog.findUnique({where:{idempotencyKey:key}})){try{await require('../services/smsParser.service').applyParsedPayload(parsed,'Verified SMS gateway',{userId:user.id,idempotencyKey:key});}catch(error){if(error.code!=='P2002')throw error;}}
  res.type('text/xml').send('<Response><Message>Report received by DisasterShield. Receipt does not mean a responder has been dispatched.</Message></Response>');
}));
router.use(authenticateToken,requireRole(['ADMIN']));
router.get('/',wrap(async(req,res)=>{let where={};if(req.user.serviceRegion){const alerts=await prisma.alert.findMany({where:{region:req.user.serviceRegion},select:{id:true}});where.alertId={in:alerts.map(a=>a.id)};}const jobs=await prisma.deliveryJob.findMany({where,select:{id:true,alertId:true,channel:true,status:true,attempts:true,lastError:true,createdAt:true,updatedAt:true},orderBy:{id:'desc'},take:100});res.json({jobs,providers:{sms:require('../services/delivery.service').configured('SMS'),push:require('../services/delivery.service').configured('PUSH')},note:'Accepted means provider acceptance, not confirmed device receipt. Simulated messages are never delivered.'});}));
router.post('/:id/retry',wrap(async(req,res)=>res.json({job:await require('../services/delivery.service').retry(req.user,Number(req.params.id))})));
module.exports=router;
