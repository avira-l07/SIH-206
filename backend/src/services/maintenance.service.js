const prisma=require('../db'),f=require('./field.service'),{transaction}=require('./transaction.service');
async function runMaintenance(now=new Date()){
  return transaction(async tx=>{
    const advisories=await tx.evacuationAdvisory.findMany({where:{active:true,expiresAt:{lte:now}},take:100});
    for(const advisory of advisories){await tx.evacuationAdvisory.update({where:{id:advisory.id},data:{active:false}});await tx.alert.updateMany({where:{id:advisory.alertId,active:true},data:{active:false}});}
    const expired=await tx.assetReservation.findMany({where:{status:'REQUESTED',expiresAt:{lte:now}},take:100});
    for(const item of expired)await f.releaseReservation(tx,item,'EXPIRED','Owner did not accept before the hold expired');
    const overdue=await tx.sOSRequest.findMany({where:{status:{in:f.DISPATCHED},assignmentAcknowledgedAt:null,acknowledgmentDueAt:{lte:now},escalatedAt:null},take:100});
    for(const item of overdue){if(!(await tx.sOSRequest.updateMany({where:{id:item.id,escalatedAt:null,assignmentAcknowledgedAt:null,assignedVolunteerId:item.assignedVolunteerId,status:item.status,acknowledgmentDueAt:item.acknowledgmentDueAt},data:{escalatedAt:now}})).count)continue;
      const admins=await tx.user.findMany({where:{role:'ADMIN',OR:[{serviceRegion:null},{serviceRegion:item.region}]},select:{id:true}});
      await f.notice(tx,[...admins.map(a=>a.id),item.assignedVolunteerId],'ESCALATION',`Request #${item.id}: acknowledgment overdue. Operator follow-up is required.`,item.id);
      await tx.rescueEvent.create({data:{sosId:item.id,kind:'ESCALATED',fromStatus:item.status,toStatus:item.status,actorName:'Follow-up scheduler',actorRole:'SYSTEM',detail:'Assignment acknowledgment deadline exceeded; operator notified'}});
    }
    await tx.rateLimitBucket.deleteMany({where:{resetAt:{lt:new Date(+now-3600000)}}});
    await tx.publicPhoneChallenge.deleteMany({where:{expiresAt:{lt:new Date(+now-7*86400000)}}});
    await tx.accountChallenge.deleteMany({where:{expiresAt:{lt:new Date(+now-7*86400000)}}});
    // Remove recipient payloads after 30 days; keep delivery state/count evidence.
    await tx.deliveryJob.updateMany({where:{updatedAt:{lt:new Date(+now-30*86400000)},status:{in:['DELIVERED','ACCEPTED','FAILED','UNCONFIGURED','SIMULATED','UNKNOWN']}},data:{recipient:'[expired]',payload:'{}'}});
    return {expired:expired.length,overdue:overdue.length,expiredAdvisories:advisories.map(a=>a.alertId)};
  });
}
function startMaintenance(){let running=false;const tick=async()=>{if(running)return;running=true;try{const result=await runMaintenance();for(const id of result.expiredAdvisories)require('../sockets/socketHandler').broadcastAlertDeactivated({id});if(result.expired||result.overdue||result.expiredAdvisories.length){require('../sockets/socketHandler').notifyOperationsChanged('follow-up');require('../sockets/socketHandler').notifyInboxChanged();}}catch(error){console.warn('Maintenance retry pending',error.code||error.name);}finally{running=false;}};tick();const timer=setInterval(tick,60000);timer.unref();return timer;}
module.exports={runMaintenance,startMaintenance};
