const {test}=require('node:test'),assert=require('node:assert/strict');
const e=require('../src/services/evacuation.service');
const now=Date.now(),start=[30,78];
const corridor=(id,points,mode='BOTH')=>({id,points:JSON.stringify(points),name:'Surveyed route',mode,active:true,reviewedAt:new Date(now),expiresAt:new Date(now+3600000)});
test('evacuation selects a reachable shelter by reviewed route distance, excluding full, inactive, blocked and distant destinations',()=>{
  const shelters=[{id:1,active:true,lat:30,lng:78.005,capacity:10,currentOccupancy:10},{id:2,active:false,lat:30,lng:78.005,capacity:10,currentOccupancy:0},{id:3,active:true,lat:30,lng:78.02,capacity:10,currentOccupancy:0},{id:4,active:true,lat:30.01,lng:78.01,capacity:10,currentOccupancy:0},{id:5,active:true,lat:40,lng:78,capacity:10,currentOccupancy:0}];
  const network=[corridor(1,[start,[30,78.02]]),corridor(2,[start,[30.01,78],[30.01,78.01]])];
  assert.equal(e.chooseShelter(start,shelters,network,[],'FOOT',now).shelter.id,3);
  assert.equal(e.chooseShelter(start,shelters.map(s=>s.id===3?{...s,status:'RED'}:s),network,[],'FOOT',now).shelter.id,4);
  assert.equal(e.chooseShelter(start,shelters,network,[{lat:30,lng:78.01}],'FOOT',now).shelter.id,4);
  assert.equal(e.chooseShelter(start,shelters,[] ,[],'FOOT',now).route.available,false);
  assert.equal(e.chooseShelter(start,shelters,[corridor(1,[start,[30,78.02]],'VEHICLE')],[],'FOOT',now).shelter,null);
});
test('route support only promises recorded check-in for approved on-duty volunteers before expiry and excludes private identity',()=>{
  const volunteer={role:'VOLUNTEER',trusted:true,onDuty:true,name:'Private volunteer',phone:'private'};
  const point={id:1,corridorId:4,active:true,lat:30,lng:78.01,name:'Public landmark',expiresAt:new Date(now+3600000),confirmedAt:new Date(now-1000),assignedVolunteerId:2,volunteer};
  assert.equal(e.staffing(point,volunteer,now),'CONFIRMED');
  assert.equal(e.staffing({...point,confirmedAt:new Date(now-3600000)},volunteer,now),'AWAITING_CHECK_IN');
  assert.equal(e.staffing(point,{...volunteer,onDuty:false},now),'UNAVAILABLE');
  assert.equal(e.staffing(point,{...volunteer,trusted:false},now),'UNAVAILABLE');
  assert.equal(e.staffing({...point,corridor:{active:false}},volunteer,now),'CLOSED');
  const safe=e.publicPoint(point,now);assert.equal(safe.assignedVolunteerId,undefined);assert.equal(safe.volunteer,undefined);
  const route={available:true,corridors:[{id:4}],points:[start,[30,78.02]]};
  assert.deepEqual(e.pointsOnRoute(route,[point,{...point,id:2,corridorId:5},{...point,id:3,lat:31}]).map(p=>p.id),[1]);
});
test('reported landslide and rockfall obstructions are recognized without case-sensitive database assumptions',()=>{
  const {blocksRoute}=require('../src/services/obstruction.service');
  assert.equal(blocksRoute({hazardNote:'LANDSLIDE blocks this lane',severityBenchmark:'ANKLE'}),true);
  assert.equal(blocksRoute({hazardNote:'Rockfall'}),true);
  assert.equal(blocksRoute({hazardNote:'road BLOCKED'}),true);
  assert.equal(blocksRoute({hazardNote:'shallow standing water',severityBenchmark:'ANKLE'}),false);
  assert.equal(blocksRoute({severityBenchmark:'WAIST'}),true);
});
