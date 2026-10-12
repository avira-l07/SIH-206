const {test}=require('node:test'),assert=require('node:assert/strict');

test('console navigation validates role-specific sections, retains unrelated URL state and supports queue links',async()=>{
  const {readSection,sectionURL}=await import('../src/services/consoleNavigation.js');
  assert.equal(readSection('?section=MAP',['MAP','REQUESTS'],'REQUESTS'),'MAP');
  assert.equal(readSection('?section=TEAM',['MAP','REQUESTS'],'REQUESTS'),'REQUESTS');
  assert.equal(readSection('?queue=AVAILABLE',['MINE','AVAILABLE'],'MINE','queue'),'AVAILABLE');
  const target=sectionURL('http://localhost:5177/volunteer?section=MAP&lang=hi#console',{section:'KANBAN',queue:'MINE'});
  assert.equal(target,'/volunteer?section=KANBAN&lang=hi&queue=MINE#console');
  assert.equal(sectionURL('http://localhost/console?section=MAP&queue=MINE',{queue:null}),'/console?section=MAP');
});

test('recommended actions prioritize active citizen work and never describe cancelled requests as active',async()=>{
  const {recommendedAction}=await import('../src/services/nextAction.js');const user={role:'CITIZEN',id:1};
  assert.equal(recommendedAction(user,[]).section,'SHELTERS');
  assert.equal(recommendedAction(user,[{status:'RESOLVED',citizenConfirmedResolved:false}]).label,'Confirm my safety');
  assert.equal(recommendedAction(user,[{status:'RESOLVED',citizenConfirmedResolved:false},{status:'PENDING'}]).label,'Track my requests');
  assert.equal(recommendedAction(user,[{status:'CANCELLED'},{status:'RESOLVED',citizenConfirmedResolved:true}]).section,'SHELTERS');
});

test('volunteer next steps keep ownership, acknowledgment and shift readiness distinct',async()=>{
  const {recommendedAction}=await import('../src/services/nextAction.js');const user={role:'VOLUNTEER',id:2,onDuty:false};
  assert.equal(recommendedAction(user,[{status:'EN_ROUTE',assignedVolunteerId:3}]).focus,'volunteer-availability');
  assert.match(recommendedAction(user,[{status:'EN_ROUTE',assignedVolunteerId:2}]).title,/acknowledgment/);
  assert.equal(recommendedAction(user,[{status:'ON_SCENE',assignedVolunteerId:2,assignmentAcknowledgedAt:'2026-01-01'}]).label,'Continue my rescue work');
  assert.equal(recommendedAction({...user,onDuty:true},[]).queue,'AVAILABLE');
});

test('operator recommendations include overdue and replacement work without treating closed requests as overdue',async()=>{
  const {recommendedAction}=await import('../src/services/nextAction.js');const user={role:'ADMIN',id:9};
  const now=Date.parse('2026-01-02');
  const result=recommendedAction(user,[{status:'EN_ROUTE',acknowledgmentDueAt:'2026-01-01'},{status:'ON_SCENE',handoffRequestedAt:'2026-01-01'}],now);
  assert.equal(result.queue,'WAITING');assert.equal(result.detail,'1 replacement request · 1 overdue acknowledgment');
  assert.equal(recommendedAction(user,[{status:'RESOLVED',acknowledgmentDueAt:'2026-01-01'}],now).queue,'ACTIVE');
});

test('fieldless commands send the JSON object required by the API without changing reads or supplied payloads',async()=>{
  const {withJsonBody}=await import('../src/services/requestConfig.js');
  for(const method of ['post','PUT','patch'])assert.deepEqual(withJsonBody({method,url:'/security/logout',headers:{Authorization:'existing'}}).data,{});
  const read={method:'get',url:'/sos'};assert.equal(withJsonBody(read),read);
  for(const data of [null,'',false,{status:'ON_SCENE'}]){const config={method:'post',data};assert.equal(withJsonBody(config),config);assert.equal(withJsonBody(config).data,data);}
});

test('rescue progress distinguishes review, dispatch, acknowledgment, replacement and citizen confirmation',async()=>{
  const {rescueProgress}=await import('../src/services/nextAction.js');
  assert.equal(rescueProgress({status:'PENDING'}).index,0);
  assert.equal(rescueProgress({status:'VERIFIED'}).index,1);
  assert.match(rescueProgress({status:'EN_ROUTE'}).next,/acknowledges/);
  assert.match(rescueProgress({status:'EN_ROUTE',assignmentAcknowledgedAt:'now'}).next,/records rescue progress/);
  assert.match(rescueProgress({status:'ON_SCENE',handoffRequestedAt:'now'}).next,/current responder remains assigned/);
  assert.equal(rescueProgress({status:'RESOLVED'}).index,3);
  assert.equal(rescueProgress({status:'RESOLVED',citizenConfirmedResolved:true}).index,4);
  assert.equal(rescueProgress({status:'CANCELLED'}).index,-1);
});

test('shelter distances remain unavailable without valid coordinates, including zero coordinate support',async()=>{
  const {calculateDistanceKm,sortSheltersByDistance}=await import('../src/services/haversine.js');
  assert.equal(calculateDistanceKm(null,null,30,78),Infinity);
  assert.equal(calculateDistanceKm(NaN,78,30,78),Infinity);
  assert.equal(calculateDistanceKm(100,78,30,78),Infinity);
  assert.equal(sortSheltersByDistance([{lat:0,lng:0}],0,0)[0].distanceKm,0);
});
