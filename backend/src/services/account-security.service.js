const crypto=require('node:crypto'), fs=require('node:fs'),path=require('node:path');
const jwt=require('jsonwebtoken'),bcrypt=require('bcryptjs');
const {JWT_SECRET}=require('../config/security');
const {fail}=require('./field.service');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function encryptionKey(){
  let value=process.env.MFA_ENCRYPTION_KEY;
  if(!value){if(process.env.NODE_ENV==='production')fail(503,'MFA encryption key is not configured');const file=path.resolve(__dirname,'../../.mfa-key');if(!fs.existsSync(file))try{fs.writeFileSync(file,crypto.randomBytes(32).toString('base64'),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}value=fs.readFileSync(file,'utf8').trim();}
  const key=Buffer.from(value,'base64');if(key.length!==32)fail(503,'MFA encryption key must be 32 bytes encoded as base64');return key;
}
function encrypt(value){const nonce=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',encryptionKey(),nonce);const content=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return Buffer.concat([nonce,cipher.getAuthTag(),content]).toString('base64');}
function decrypt(value){const buffer=Buffer.from(value,'base64');const decipher=crypto.createDecipheriv('aes-256-gcm',encryptionKey(),buffer.subarray(0,12));decipher.setAuthTag(buffer.subarray(12,28));return Buffer.concat([decipher.update(buffer.subarray(28)),decipher.final()]).toString('utf8');}
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(buffer){let bits=0,value=0,out='';for(const byte of buffer){value=(value<<8)|byte;bits+=8;while(bits>=5){bits-=5;out+=alphabet[(value>>>bits)&31];}}if(bits)out+=alphabet[(value<<(5-bits))&31];return out;}
function decode32(secret){let bits=0,value=0,out=[];for(const c of secret.toUpperCase().replace(/=+$/,'')){const n=alphabet.indexOf(c);if(n<0)fail(400,'Invalid authenticator secret');value=(value<<5)|n;bits+=5;if(bits>=8){bits-=8;out.push((value>>>bits)&255);}}return Buffer.from(out);}
function totp(secret,step,digits=6){const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step));const digest=crypto.createHmac('sha1',decode32(secret)).update(counter).digest();const offset=digest[digest.length-1]&15;return String((digest.readUInt32BE(offset)&0x7fffffff)%10**digits).padStart(digits,'0');}
function verifyTotp(secret,code,lastStep=null,now=Date.now()){if(typeof code!=='string'||!/^\d{6}$/.test(code))return null;const current=Math.floor(now/30000);for(const step of [current,current-1,current+1])if((lastStep==null||step>lastStep)&&crypto.timingSafeEqual(Buffer.from(totp(secret,step)),Buffer.from(code)))return step;return null;}
async function factor(tx,user,code){
  if(!user.mfaEnabledAt)return;
  const step=verifyTotp(decrypt(user.mfaSecret),code,user.mfaLastStep);
  if(step!==null){if(!(await tx.user.updateMany({where:{id:user.id,mfaLastStep:user.mfaLastStep,mfaSecret:user.mfaSecret},data:{mfaLastStep:step}})).count)fail(401,'Authenticator code was already used');return;}
  const hashes=JSON.parse(user.mfaRecoveryHashes||'[]'), candidate=typeof code==='string'?hash(code.trim().toLowerCase()):'';
  if(!hashes.includes(candidate))fail(401,'Enter a new authenticator code or unused recovery code');
  if(!(await tx.user.updateMany({where:{id:user.id,mfaRecoveryHashes:user.mfaRecoveryHashes},data:{mfaRecoveryHashes:JSON.stringify(hashes.filter(h=>h!==candidate))}})).count)fail(401,'Recovery code was already used');
}
function token(user){return jwt.sign({id:user.id,ver:user.tokenVersion,mfa:Boolean(user.mfaEnabledAt)},JWT_SECRET,{expiresIn:user.role==='ADMIN'?'8h':'24h'});}
async function password(user,value){if(typeof value!=='string'||!await bcrypt.compare(value,user.passwordHash))fail(401,'Current password is incorrect');}
function newPassword(value){if(typeof value!=='string'||value.length<12||Buffer.byteLength(value,'utf8')>72)fail(400,'Use a password of at least 12 characters and at most 72 UTF-8 bytes');}
function providers(){return {email:Boolean(process.env.RESEND_API_KEY&&process.env.EMAIL_FROM&&process.env.DISABLE_EXTERNAL_DELIVERY!=='true'),sms:Boolean(/^AC[a-f0-9]{32}$/i.test(process.env.TWILIO_ACCOUNT_SID||'')&&process.env.TWILIO_AUTH_TOKEN&&/^\+[1-9]\d{6,14}$/.test(process.env.TWILIO_FROM_NUMBER||'')&&process.env.DISABLE_EXTERNAL_DELIVERY!=='true')};}
async function sendEmail(to,subject,text){if(!providers().email)fail(503,'Email delivery is not configured');const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[to],subject,text}),signal:AbortSignal.timeout(8000)});if(!response.ok)fail(503,'Email provider did not accept the message');return true;}
async function sendCode(userId,phone,code){if(!providers().sms)fail(503,'SMS verification is not configured');const client=require('twilio')(process.env.TWILIO_ACCOUNT_SID,process.env.TWILIO_AUTH_TOKEN,{timeout:8000,autoRetry:false});await client.messages.create({from:process.env.TWILIO_FROM_NUMBER,to:phone,body:`DisasterShield verification code: ${code}. Expires in 5 minutes. Do not share this code.`});}
module.exports={hash,encrypt,decrypt,base32,decode32,totp,verifyTotp,factor,token,password,newPassword,providers,sendEmail,sendCode};
