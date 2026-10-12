const {test}=require('node:test'),assert=require('node:assert/strict');
test('offline preparedness retains synchronized plans, isolates accounts and preserves unsaved drafts',async()=>{
  const {savePlanCache,readPlanCache,choosePlan,emptyPlan}=await import('../src/services/preparedness.js');const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  const plan={...emptyPlan(),meetingPoint:'School',language:'hi'};savePlanCache(storage,1,plan,false);assert.equal(choosePlan(readPlanCache(storage,1),null).meetingPoint,'School');assert.equal(readPlanCache(storage,2),null);
  assert.equal(choosePlan(readPlanCache(storage,1),{...plan,meetingPoint:'Updated on another device'}).meetingPoint,'Updated on another device');savePlanCache(storage,1,{...plan,meetingPoint:'Unsaved draft'},true);assert.equal(choosePlan(readPlanCache(storage,1),plan).meetingPoint,'Unsaved draft');
  storage.setItem('sih-plan-draft:1','{}');assert.equal(readPlanCache(storage,1),null);assert.throws(()=>savePlanCache({setItem(){throw Error('Storage full');}},1,plan));
});
