const prisma=require('../db'),crypto=require('node:crypto'),security=require('./account-security.service');
const {transaction}=require('./transaction.service');
const sms=require('./sms.service');
function configured(channel){if(process.env.DISABLE_EXTERNAL_DELIVERY==='true')return false;return channel==='SMS'?security.providers().sms:Boolean(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY&&process.env.VAPID_SUBJECT);}
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function regionMatch(a,b){if(!a||!b)return true;const x=a.toLowerCase(),y=b.toLowerCase();return x.startsWith('all')||y.startsWith('all')||x.includes(y)||y.includes(x);}
async function enqueue(tx,alert,explicitPhones=[]){
  const [phones,users,push]=await Promise.all([tx.phoneRegistration.findMany({where:{verifiedAt:{not:null}}}),tx.user.findMany({where:{role:'CITIZEN',phoneVerifiedAt:{not:null}},select:{phone:true,region:true,lat:true,lng:true}}),tx.pushSubscription.findMany()]);
  const recipientPhones=new Set(phones.filter(x=>regionMatch(x.region,alert.region)).map(x=>sms.normalizePhoneNumber(x.phoneNumber)));
  const distance=require('./routing.service').distance;
  for(const u of users)if(u.lat!=null&&u.lng!=null?distance([u.lat,u.lng],[alert.lat,alert.lng])<=alert.radiusKm*1000:regionMatch(u.region,alert.region))recipientPhones.add(sms.normalizePhoneNumber(u.phone));
  explicitPhones.forEach(x=>recipientPhones.add(sms.normalizePhoneNumber(x)));
  const message=`DisasterShield ${alert.sourceKind==='DEMO'?'DEMO ':''}${alert.severity}: ${alert.region}. ${alert.message}`;
  const jobs=[...[...recipientPhones].filter(x=>/^\+[1-9]\d{6,14}$/.test(x||'')).map(recipient=>({channel:'SMS',recipient,payload:{message}})),...push.filter(x=>regionMatch(x.region,alert.region)).map(recipient=>({channel:'PUSH',recipient:JSON.stringify(recipient),payload:{title:`${alert.sourceKind==='DEMO'?'DEMO ':''}${alert.severity} ${alert.hazardType}`,body:alert.region+': '+alert.message,alertId:alert.id,severity:alert.severity,url:'/'}}))];
  for(const job of jobs){const key=hash(alert.id+':'+job.channel+':'+job.recipient);const status=alert.sourceKind==='DEMO'||process.env.DISABLE_EXTERNAL_DELIVERY==='true'?'SIMULATED':configured(job.channel)?'QUEUED':'UNCONFIGURED';await tx.deliveryJob.upsert({where:{key},create:{alertId:alert.id,channel:job.channel,recipient:security.encrypt(job.recipient),payload:JSON.stringify(job.payload),key,status},update:{}});}
  return jobs.length;
}
async function sendJob(job){
  const recipient=security.decrypt(job.recipient),payload=JSON.parse(job.payload);
  if(job.channel==='SMS'){
    const client=require('twilio')(process.env.TWILIO_ACCOUNT_SID,process.env.TWILIO_AUTH_TOKEN,{timeout:8000,autoRetry:false});
    // Disable transport-level retries: ambiguous send failures must not silently duplicate messages.
    const args={from:process.env.TWILIO_FROM_NUMBER,to:recipient,body:payload.message};
    if(process.env.TWILIO_WEBHOOK_BASE_URL)args.statusCallback=process.env.TWILIO_WEBHOOK_BASE_URL.replace(/\/$/,'')+'/api/delivery/twilio/status?jobId='+job.id;
    const result=await client.messages.create(args);return {status:'ACCEPTED',providerId:result.sid};
  }
  const subscription=JSON.parse(recipient);
  if(!require('../config/security').isAllowedPushEndpoint(subscription.endpoint))throw Object.assign(new Error('Invalid push endpoint'),{permanent:true});
  const wp=require('web-push');wp.setVapidDetails(process.env.VAPID_SUBJECT,process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
  await wp.sendNotification({endpoint:subscription.endpoint,keys:JSON.parse(subscription.keys)},JSON.stringify(payload),{TTL:3600,timeout:5000});return {status:'ACCEPTED'};
}
async function processDeliveries(now=new Date()){
  // A process dying after network send leaves an ambiguous result; require operator review, not blind resend.
  await prisma.deliveryJob.updateMany({where:{status:'SENDING',leaseUntil:{lt:now}},data:{status:'UNKNOWN',lastError:'Sender interrupted; check provider before retrying',leaseUntil:null}});
  const jobs=await prisma.deliveryJob.findMany({where:{status:'QUEUED',nextAttemptAt:{lte:now}},take:10,orderBy:{id:'asc'}});
  for(const item of jobs){if(!configured(item.channel)){await prisma.deliveryJob.updateMany({where:{id:item.id,status:'QUEUED'},data:{status:'UNCONFIGURED'}});continue;}
    if(!(await prisma.deliveryJob.updateMany({where:{id:item.id,status:'QUEUED'},data:{status:'SENDING',attempts:{increment:1},leaseUntil:new Date(Date.now()+60000)}})).count)continue;
    try{const result=await module.exports.sendJob(item);await prisma.deliveryJob.updateMany({where:{id:item.id,status:'SENDING'},data:{...result,leaseUntil:null,lastError:null}});}catch(error){const code=Number(error.status||error.statusCode),retryable=code===429&&item.attempts<3;await prisma.deliveryJob.updateMany({where:{id:item.id,status:'SENDING'},data:{status:retryable?'QUEUED':code>=400&&code<500||error.permanent?'FAILED':'UNKNOWN',nextAttemptAt:new Date(Date.now()+30000*2**item.attempts),leaseUntil:null,lastError:retryable?'Provider unavailable; retry scheduled':code>=400&&code<500||error.permanent?'Provider rejected the request':'Delivery outcome uncertain; check provider before retrying'}});}
  }
  return jobs.length;
}
function startDeliveryWorker(){let running=false;const timer=setInterval(async()=>{if(running)return;running=true;try{await processDeliveries();}catch(error){console.warn('Delivery worker retry pending',error.code||error.name);}finally{running=false;}},5000);timer.unref();return timer;}
async function retry(actor,id){return transaction(async tx=>{const job=await tx.deliveryJob.findUnique({where:{id}});if(!job)require('./field.service').fail(404,'Delivery not found');if(actor.serviceRegion){const alert=await tx.alert.findUnique({where:{id:job.alertId}});require('./field.service').assertScope(actor,alert?.region);}
  if(!['UNCONFIGURED','FAILED'].includes(job.status))require('./field.service').fail(409,'Only failed/unconfigured deliveries can be retried; ambiguous outcomes require provider investigation');if(job.recipient==='[expired]')require('./field.service').fail(409,'Recipient retention period ended');if(!configured(job.channel))require('./field.service').fail(503,'Provider is not configured');return tx.deliveryJob.update({where:{id,status:job.status},data:{status:'QUEUED',nextAttemptAt:new Date(),lastError:null}});});}
module.exports={configured,enqueue,sendJob,processDeliveries,startDeliveryWorker,retry};
