const {test}=require('node:test'),assert=require('node:assert/strict');
process.env.NODE_ENV='test';process.env.JWT_SECRET='isolated-unit-test-key';process.env.MFA_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64');
const security=require('../src/services/account-security.service'),routing=require('../src/services/routing.service');
test('RFC 6238 SHA-1 vectors, replay protection and authenticated secret encryption',()=>{
  const secret=security.base32(Buffer.from('12345678901234567890'));
  for(const [seconds,expected] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']])assert.equal(security.totp(secret,Math.floor(seconds/30),8),expected);
  const now=1234567890000,step=Math.floor(now/30000),code=security.totp(secret,step);
  assert.equal(security.verifyTotp(secret,code,null,now),step);assert.equal(security.verifyTotp(secret,code,step,now),null);
  const encrypted=security.encrypt(secret);assert.equal(security.decrypt(encrypted),secret);const buffer=Buffer.from(encrypted,'base64');buffer[30]^=1;assert.throws(()=>security.decrypt(buffer.toString('base64')));
});
test('routing excludes blocked, stale and wrong-mode corridors and never invents a route',()=>{
  const now=Date.now(),a=[30,78],b=[30,78.02],c=[30.01,78],d=[30.01,78.02];
  const corridor=(id,points,mode='BOTH',expires=now+10000)=>({id,name:'Reviewed '+id,points:JSON.stringify(points),mode,active:true,reviewedAt:new Date(now),expiresAt:new Date(expires)});
  const direct=corridor(1,[a,b]),detour=corridor(2,[a,c,d,b]);
  assert.equal(routing.route(a,b,[direct],[],'FOOT',now).available,true);
  const hazards=[{lat:30,lng:78.01}];const result=routing.route(a,b,[direct,detour],hazards,'FOOT',now);assert.equal(result.available,true);assert.equal(result.excludedSegments,1);assert.deepEqual(result.corridors.map(x=>x.id),[2]);
  assert.equal(routing.route(a,b,[direct],hazards,'FOOT',now).available,false);
  assert.equal(routing.route(a,b,[corridor(3,[a,b],'VEHICLE')],[],'FOOT',now).available,false);
  assert.equal(routing.route(a,b,[corridor(4,[a,b],'BOTH',now-1)],[],'FOOT',now).available,false);
  assert.equal(routing.route(a,a,[direct],[],'FOOT',now).available,false);
});
