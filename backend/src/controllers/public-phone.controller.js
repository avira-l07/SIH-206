const crypto=require('node:crypto'),prisma=require('../db'),security=require('../services/account-security.service'),f=require('../services/field.service');
const {wrap}=require('./field.controller'),{transaction}=require('../services/transaction.service');
exports.request=wrap(async(req,res)=>{
  const phone=require('../services/sms.service').normalizePhoneNumber(req.body.phoneNumber);
  if(!/^\+[1-9]\d{6,14}$/.test(phone||''))f.fail(400,'Enter a valid international phone number');
  const region=req.body.region?f.text(req.body.region,'District',200):null;
  if(!security.providers().sms){await prisma.phoneRegistration.upsert({where:{phoneNumber:phone},create:{phoneNumber:phone,region},update:{}});return res.json({success:true,message:'Saved as unverified. SMS delivery is unavailable until a provider is configured and this phone is verified.'});}
  const count=await prisma.publicPhoneChallenge.count({where:{phoneNumber:phone,createdAt:{gt:new Date(Date.now()-3600000)}}});if(count>=3)f.fail(429,'Wait an hour before requesting another code for this phone');
  const id=crypto.randomBytes(16).toString('hex'),code=String(crypto.randomInt(1000000)).padStart(6,'0');
  await prisma.publicPhoneChallenge.create({data:{id,phoneNumber:phone,region,codeHash:security.hash(id+':'+code),expiresAt:new Date(Date.now()+300000)}});
  try{await security.sendCode(null,phone,code);}catch{await prisma.publicPhoneChallenge.update({where:{id},data:{usedAt:new Date()}});f.fail(503,'Verification SMS could not be sent');}
  res.json({success:true,challengeId:id,message:'Enter the verification code sent to your phone. Enrollment is completed only after verification.'});
});
exports.verify=wrap(async(req,res)=>{
  if(typeof req.body.challengeId!=='string'||!/^[a-f0-9]{32}$/.test(req.body.challengeId)||typeof req.body.code!=='string'||!/^\d{6}$/.test(req.body.code))f.fail(400,'Enter the six-digit verification code');
  const valid=await transaction(async tx=>{const c=await tx.publicPhoneChallenge.findUnique({where:{id:req.body.challengeId}});if(!c||c.usedAt||c.expiresAt<=new Date()||c.attempts>=5)return false;await tx.publicPhoneChallenge.update({where:{id:c.id},data:{attempts:{increment:1}}});if(c.codeHash!==security.hash(c.id+':'+req.body.code))return false;await tx.publicPhoneChallenge.update({where:{id:c.id},data:{usedAt:new Date()}});await tx.phoneRegistration.upsert({where:{phoneNumber:c.phoneNumber},create:{phoneNumber:c.phoneNumber,region:c.region,verifiedAt:new Date()},update:{region:c.region,verifiedAt:new Date()}});return true;});
  if(!valid)f.fail(400,'Code invalid, expired or attempts exhausted');require('../sockets/socketHandler').getIO().emit('registry:changed');res.json({message:'Phone verified and enrolled for emergency alerts'});
});
