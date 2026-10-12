const crypto=require('node:crypto');
class DatabaseRateStore {
  constructor(prefix){this.prefix=prefix;this.localKeys=false;}
  init(options){this.windowMs=options.windowMs;}
  async increment(key){const period=Math.floor(Date.now()/this.windowMs),resetTime=new Date((period+1)*this.windowMs),id=this.prefix+':'+period+':'+crypto.createHash('sha256').update(key).digest('hex');const item=await require('../db').rateLimitBucket.upsert({where:{id},create:{id,hits:1,resetAt:resetTime},update:{hits:{increment:1}}});return {totalHits:item.hits,resetTime:item.resetAt};}
  async decrement(key){const period=Math.floor(Date.now()/this.windowMs),id=this.prefix+':'+period+':'+crypto.createHash('sha256').update(key).digest('hex');await require('../db').rateLimitBucket.updateMany({where:{id,hits:{gt:0}},data:{hits:{decrement:1}}});}
  async resetKey(key){const period=Math.floor(Date.now()/this.windowMs),id=this.prefix+':'+period+':'+crypto.createHash('sha256').update(key).digest('hex');await require('../db').rateLimitBucket.deleteMany({where:{id}});}
}
module.exports={DatabaseRateStore};
