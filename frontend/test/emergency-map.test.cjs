const {test}=require('node:test');
const assert=require('node:assert/strict');
test('offline map references isolate accounts, retain valid zero coordinates, exclude private reports and expire',async()=>{
  const m=await import('../src/services/offlineMap.js'),values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const scope=m.mapScope({id:1,role:'VOLUNTEER',trusted:true,serviceRegion:'test'},'authenticated'),now=Date.now();
  const reference=m.saveMapReference(storage,scope,{shelters:[{id:1,lat:0,lng:0,name:'Camp',capacity:10,currentOccupancy:3}],hazardReports:[{id:2,lat:30,lng:78,photoUrl:'private-photo',userName:'Private person',hazardNote:'Private details',confidenceTier:'RED'}],sosRequests:[{id:3,userPhone:'private'}]}, {center:{lat:0,lng:0},zoom:14},now);
  assert.equal(reference.shelters.length,1);assert.equal(reference.hazardReports[0].userName,undefined);assert.equal(reference.hazardReports[0].photoUrl,undefined);assert.equal(reference.sosRequests,undefined);
  assert.equal(m.readMapReference(storage,scope,now).view.zoom,14);assert.equal(m.readMapReference(storage,m.mapScope({id:2,role:'VOLUNTEER'},'authenticated'),now),null);
  assert.equal(m.readMapReference(storage,m.mapScope({id:1,role:'VOLUNTEER',trusted:false,serviceRegion:'test'},'authenticated'),now),null);
  assert.equal(m.readMapReference(storage,scope,now+8*86400000),null);assert.equal(m.readMapReference(storage,scope,now-1),null);
  m.clearMapReference(storage,scope);assert.equal(m.readMapReference(storage,scope),null);
  assert.throws(()=>m.saveMapReference({setItem(){throw Error('quota');}},scope,{},reference.view),/quota/);
});
test('emergency SMS preserves proxy details, validates coordinates and cannot inject a gateway URI',async()=>{
  const e=await import('../src/services/emergency.js');
  assert.equal(e.validEmergencyCoords({lat:'',lng:0}),false);assert.equal(e.validEmergencyCoords({lat:0,lng:0}),true);assert.equal(e.validEmergencyCoords({lat:91,lng:0}),false);
  const text=e.emergencySMS({lat:30,lng:78,hazardType:'FLOOD',reportedByProxy:true,subjectDescription:'Two neighbours',message:'Roof\nhelp',vulnerabilityTags:['elderly']});
  assert.match(text,/On behalf of: Two neighbours/);assert.match(text,/Roof help/);
  assert.equal(e.smsURI(text,'+919876543210',true).split('&body=')[0],'sms:+919876543210');
  assert.ok(e.smsURI(text,'javascript:bad').startsWith('sms:?body='));
});
