const crypto=require('crypto');
const b64url=(v)=>Buffer.from(v).toString('base64url');
const sign=(secret,value)=>crypto.createHmac('sha256',secret).update(value).digest('base64url');
function safeEqual(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function makeSignedCookie(secret,purpose,seconds,extra=''){const exp=Math.floor(Date.now()/1000)+seconds,nonce=crypto.randomBytes(24).toString('base64url'),payload=`${purpose}.${exp}.${nonce}.${extra}`;return `${b64url(payload)}.${sign(secret,payload)}`;}
function parseSignedCookie(secret,token,purpose){if(!token||!token.includes('.'))return null;const cut=token.lastIndexOf('.'),encoded=token.slice(0,cut),sig=token.slice(cut+1);let payload;try{payload=Buffer.from(encoded,'base64url').toString('utf8');}catch{return null;}if(!safeEqual(sig,sign(secret,payload)))return null;const [p,exp,nonce,...extra]=payload.split('.');if(p!==purpose||Number(exp)<=Math.floor(Date.now()/1000)||!nonce)return null;return {exp:Number(exp),nonce,extra:extra.join('.')};}
function createSession(secret,seconds=900){const id=crypto.randomUUID(),csrf=crypto.randomBytes(24).toString('base64url'),cookie=makeSignedCookie(secret,'session',seconds,`${id}.${csrf}`);return {cookie,id,csrf,expiresIn:seconds};}
function verifySession(secret,token){const parsed=parseSignedCookie(secret,token,'session');if(!parsed)return null;const [id,csrf]=parsed.extra.split('.');return /^[0-9a-f-]{36}$/i.test(id)&&csrf?{id,csrf,exp:parsed.exp}:null;}
function createKioskCookie(secret,seconds=86400){return makeSignedCookie(secret,'kiosk',seconds,crypto.randomUUID());}
function verifyKioskCookie(secret,token){return parseSignedCookie(secret,token,'kiosk');}
function createAdminCookie(secret,seconds=28800){const csrf=crypto.randomBytes(24).toString('base64url');return {cookie:makeSignedCookie(secret,'admin',seconds,csrf),csrf,expiresIn:seconds};}
function verifyAdminCookie(secret,token){const parsed=parseSignedCookie(secret,token,'admin');return parsed?{csrf:parsed.extra,exp:parsed.exp}:null;}
function createDownloadToken(secret,photoId,expiresAt){const exp=Math.floor(new Date(expiresAt).getTime()/1000);return `${exp}.${sign(secret,`${photoId}.${exp}`)}`;}
function parseDownloadToken(secret,photoId,token){const [e,s]=String(token||'').split('.'),exp=Number(e);if(!Number.isInteger(exp)||exp<=Math.floor(Date.now()/1000)||!s||!safeEqual(s,sign(secret,`${photoId}.${exp}`)))return null;return {exp};}
function verifyDownloadToken(secret,photoId,token){return !!parseDownloadToken(secret,photoId,token);}
function createDownloadSession(secret,photoId,expiresAt){const remain=Math.max(1,Math.floor((new Date(expiresAt).getTime()-Date.now())/1000));return {cookie:makeSignedCookie(secret,'download',remain,photoId),maxAge:remain};}
function verifyDownloadSession(secret,token,photoId){const parsed=parseSignedCookie(secret,token,'download');return !!parsed&&parsed.extra===photoId;}
function hmacRef(secret,value,length=32){return sign(secret,String(value)).slice(0,length);}
module.exports={safeEqual,createSession,verifySession,createKioskCookie,verifyKioskCookie,createAdminCookie,verifyAdminCookie,createDownloadToken,parseDownloadToken,verifyDownloadToken,createDownloadSession,verifyDownloadSession,hmacRef};
