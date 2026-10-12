const keys=['contacts','medicines','water','documents','meetingPoint','shelter','power','alerts'];
export const emptyPlan=()=>({checklist:{},meetingPoint:'',emergencyContact:'',language:'en'});
export function validPlan(plan){return Boolean(plan&&typeof plan==='object'&&plan.checklist&&typeof plan.checklist==='object'&&!Array.isArray(plan.checklist)&&Object.entries(plan.checklist).every(([k,v])=>keys.includes(k)&&typeof v==='boolean')&&['meetingPoint','emergencyContact'].every(k=>typeof plan[k]==='string'&&plan[k].length<=200)&&['en','hi'].includes(plan.language));}
export function readPlanCache(storage,userId){try{const value=JSON.parse(storage.getItem('sih-plan-draft:'+userId)||'null');if(validPlan(value?.plan))return value;if(validPlan(value))return {plan:value,dirty:true};}catch{}return null;}
export function savePlanCache(storage,userId,plan,dirty=true){if(!validPlan(plan))throw new Error('Preparedness plan could not be retained');storage.setItem('sih-plan-draft:'+userId,JSON.stringify({plan,dirty}));}
export function choosePlan(cache,serverPlan){return cache?.dirty?cache.plan:validPlan(serverPlan)?serverPlan:cache?.plan||emptyPlan();}
