const helmet=require('helmet');const {getConfig}=require('./config');const {hmacRef}=require('./crypto');
function cookieMap(header=''){return Object.fromEntries(header.split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return i<1?['','']:[x.slice(0,i),decodeURIComponent(x.slice(i+1))]}).filter(([k])=>k));}
function clientIp(req){return String(req.headers['x-forwarded-for']||req.ip||'unknown').split(',')[0].trim().slice(0,64);}
function clientKey(req){return hmacRef(getConfig().rateLimitHashSecret,clientIp(req));}
function originGuard(req,res,next){
  if(!['POST','PUT','PATCH','DELETE'].includes(req.method))return next();
  const origin=String(req.get('origin')||'').replace(/\/$/,'');
  if(!origin)return next();
  const cfg=getConfig();
  if(cfg.allowedOrigins.includes(origin)||origin.endsWith('.vercel.app')||origin.includes('localhost')||origin.includes('127.0.0.1'))return next();
  return res.status(403).json({error:'허용되지 않은 요청 출처입니다.'});
}
function securityHeaders(){
  let host='';
  try{host=new URL(getConfig().supabaseUrl).origin;}catch{}
  return helmet({
    contentSecurityPolicy:{
      directives:{
        defaultSrc:["'self'"],
        scriptSrc:["'self'","'unsafe-inline'","'unsafe-eval'","https://cdn.jsdelivr.net"],
        styleSrc:["'self'","'unsafe-inline'","https://cdn.jsdelivr.net"],
        fontSrc:["'self'","https://cdn.jsdelivr.net","data:"],
        imgSrc:["'self'",'data:','blob:','https:','*'],
        connectSrc:["'self'",host||"'self'",'https:'],
        objectSrc:["'none'"],
        baseUri:["'none'"],
        frameAncestors:["'none'"],
        formAction:["'self'"]
      }
    },
    referrerPolicy:{policy:'no-referrer'},
    hsts:getConfig().production?{maxAge:31536000,includeSubDomains:true,preload:true}:false,
    crossOriginResourcePolicy:{policy:'cross-origin'}
  });
}
module.exports={cookieMap,clientKey,originGuard,securityHeaders};
