// Coalesce overlapping reads for the exact same authorization scope. No TTL cache:
// the next request after completion opens a fresh database snapshot.
const pending=new Map();
async function concurrentRead(key,read){if(pending.has(key))return pending.get(key);const work=Promise.resolve().then(read);pending.set(key,work);try{return await work;}finally{if(pending.get(key)===work)pending.delete(key);}}
module.exports={concurrentRead};
