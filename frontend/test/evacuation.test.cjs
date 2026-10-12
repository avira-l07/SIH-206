const {test}=require('node:test'),assert=require('node:assert/strict');
const now=Date.now();
const plan=()=>({version:1,start:[30,78],mode:'FOOT',asOf:new Date(now).toISOString(),validUntil:new Date(now+60000).toISOString(),shelter:{id:1,name:'Relief <script>alert(1)</script>',address:'Public landmark',contact:'112',lat:30,lng:78.02,reportedFreePlaces:20},advisory:{id:1,sourceName:'Recorded assessment',sourceReference:'Bulletin & review',probability:65,instructions:'Prepare and check local guidance',expiresAt:new Date(now+60000).toISOString()},route:{available:true,points:[[30,78],[30,78],[30,78.02],[30,78.02]],distanceMeters:1900,warning:'Conditions may change',corridors:[{id:1,name:'Reviewed corridor',reviewedAt:new Date(now).toISOString(),expiresAt:new Date(now+60000).toISOString()}]},helpPoints:[{id:1,name:'Bridge <img src=x onerror=alert(1)>',lat:30,lng:78.01,staffing:'CONFIRMED',confirmedAt:new Date(now).toISOString(),expiresAt:new Date(now+60000).toISOString(),publicContact:'112',assignedVolunteerId:17,privatePhone:'secret',instructions:'Ask the route team'}]});
test('local guidance uses radius or exact fallback district, expires and never treats a threshold score as probability',async()=>{
  const {nearbyAdvisories}=await import('../src/services/evacuationPlan.js');
  const a={id:1,active:true,lat:30,lng:78,radiusKm:5,region:'test',expiresAt:new Date(now+60000).toISOString(),action:'PREPARE',probability:null,score:94};
  assert.equal(nearbyAdvisories([a],{lat:30,lng:78},null,now)[0].probability,null);
  assert.equal(nearbyAdvisories([a],{lat:40,lng:78},'test',now).length,0);
  assert.equal(nearbyAdvisories([a],null,'TEST',now).length,1);
  assert.equal(nearbyAdvisories([a],null,'tes',now).length,0);
  assert.equal(nearbyAdvisories([{...a,expiresAt:new Date(now-1).toISOString()}],null,'test',now).length,0);
});
test('citizen next steps surface current guidance while keeping active SOS tracking first',async()=>{
  const {recommendedAction}=await import('../src/services/nextAction.js');const user={id:1,role:'CITIZEN'},guidance={id:3,active:true,action:'PREPARE',expiresAt:new Date(now+60000).toISOString()};
  assert.equal(recommendedAction(user,[],now,guidance).tool,'evacuation');assert.equal(recommendedAction(user,[],now,guidance).context.advisoryId,3);
  assert.equal(recommendedAction(user,[{status:'EN_ROUTE'}],now,guidance).section,'REQUESTS');
  assert.equal(recommendedAction(user,[],now,{...guidance,expiresAt:new Date(now-1).toISOString()}).section,'SHELTERS');
});
test('offline evacuation plans isolate accounts, show expired reviews, drop private team details and reject incomplete maps or storage failure',async()=>{
  const s=await import('../src/services/evacuationPlan.js');const values=new Map(),storage={setItem:(k,v)=>values.set(k,v),getItem:k=>values.get(k)||null,removeItem:k=>values.delete(k)};
  s.saveEvacuationPlan(storage,1,plan());const saved=s.readEvacuationPlan(storage,1,now);assert.equal(saved.helpPoints[0].privatePhone,undefined);assert.equal(saved.helpPoints[0].assignedVolunteerId,undefined);assert.equal(s.readEvacuationPlan(storage,2,now),null);
  assert.equal(s.planExpired(saved,now),false);assert.equal(s.planExpired(saved,now+60001),true);assert.equal(s.readEvacuationPlan(storage,1,now+8*86400000),null);
  assert.throws(()=>s.saveEvacuationPlan(storage,1,{...plan(),route:{available:false}}));assert.throws(()=>s.saveEvacuationPlan({setItem(){throw Error('quota');}},1,plan()),/quota/);
  s.clearEvacuationPlan(storage,1);assert.equal(s.readEvacuationPlan(storage,1,now),null);
});
test('download contains a self-contained escaped route map, contacts and review expiry without external scripts, map tiles or private details',async()=>{
  const {evacuationDownload}=await import('../src/services/evacuationPlan.js');const html=evacuationDownload(plan());
  assert.match(html,/<svg/);assert.match(html,/Source-reported estimate: 65%/);assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<script>alert|<img src=x|secret|assignedVolunteerId|https:\/\//);assert.match(html,/EXPIRED ROUTE REVIEW/);assert.match(html,/Street tiles and turn-by-turn instructions are not included/);
});
