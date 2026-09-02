const express=require('express');const multer=require('multer');const QRCode=require('qrcode');const crypto=require('crypto');const path=require('path');const fs=require('fs');
const {getConfig}=require('../server/config');const {getClients}=require('../server/clients');
const {createSession,verifySession,createKioskCookie,verifyKioskCookie,createAdminCookie,verifyAdminCookie,createDownloadToken,parseDownloadToken,createDownloadSession,verifyDownloadSession,safeEqual,hmacRef}=require('../server/crypto');
const {cookieMap,clientKey,originGuard,securityHeaders}=require('../server/security');const {validateAndNormalizeJpeg,validateAndNormalizeBackground}=require('../server/image');const {acquire,release}=require('../server/lock');const log=require('../server/logger');
const cfg=getConfig(),app=express();
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:cfg.maxUploadBytes,files:1,fields:0}});
const uploadBg=multer({storage:multer.memoryStorage(),limits:{fileSize:cfg.maxBackgroundUploadBytes,files:1,fields:2}});

app.disable('x-powered-by');app.set('trust proxy',Number(process.env.TRUST_PROXY||1));
app.use((req,res,next)=>{req.requestId=crypto.randomUUID();res.set('X-Request-Id',req.requestId);res.set('Cache-Control','private, no-store, max-age=0');next();});
app.use(securityHeaders());app.use(originGuard);app.use(express.json({limit:'64kb',type:'application/json'}));
const cookies=(req)=>cookieMap(req.get('cookie'));
function setCookie(res,name,value,maxAge){res.append('Set-Cookie',`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${cfg.production?'; Secure':''}`);}
function clearCookie(res,name){res.append('Set-Cookie',`${name}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${cfg.production?'; Secure':''}`);}
function eventActive(){const now=Date.now();return now>=cfg.eventActiveFrom.getTime()&&now<=cfg.eventActiveUntil.getTime();}
function validUuid(v){return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v||'');}
async function limit(limiter,key,res){const x=await limiter.limit(key);res.set('RateLimit-Limit',String(x.limit));res.set('RateLimit-Remaining',String(x.remaining));res.set('RateLimit-Reset',String(x.reset));if(x.success)return true;res.set('Retry-After',String(Math.max(1,Math.ceil((x.reset-Date.now())/1000))));res.status(429).json({error:'요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'});return false;}
function kioskRequired(req,res,next){if(!verifyKioskCookie(cfg.sessionSecret,cookies(req).pb_kiosk))return res.status(403).json({error:'이 iPad는 행사 기기로 활성화되지 않았습니다.'});next();}
function adminRequired(req,res,next){const admin=verifyAdminCookie(cfg.adminSecret,cookies(req).pb_admin);if(!admin)return res.status(401).json({error:'관리자 로그인이 필요합니다.'});req.admin=admin;next();}
function bearer(req){const h=String(req.get('authorization')||'');return h.startsWith('Bearer ')?h.slice(7):'';}
function downloadRequired(req,res,next){const session=cookies(req).pb_download;if(!validUuid(req.params.id)||!verifyDownloadSession(cfg.downloadSecret,session,req.params.id))return res.status(404).json({error:'유효하지 않거나 만료된 사진 세션입니다.'});next();}

const DEFAULT_ADMIN_CONFIG={
  centerName:'마음건강복지센터',
  title:'오늘의 마음 네컷',
  message:'당신의 오늘을 응원합니다 ✨',
  privacyNotice:'완성 사진은 다운로드를 위해 잠시 보관된 후 자동 삭제됩니다.',
  defaultTheme:'lavender',
  defaultLayout:'grid-2x2',
  capture:{count:6,countdownSeconds:3,betweenShotsMs:750},
  customBackgrounds:[]
};

async function getStoredAdminConfig(){
  try{
    const {redis}=getClients();
    const data=await redis.get('fourcuts:admin:config');
    if(!data)return DEFAULT_ADMIN_CONFIG;
    return typeof data==='string'?JSON.parse(data):data;
  }catch{
    return DEFAULT_ADMIN_CONFIG;
  }
}

app.get('/admin',(req,res)=>{
  const adminHtmlPath=path.join(__dirname,'..','public','admin.html');
  if(fs.existsSync(adminHtmlPath))return res.sendFile(adminHtmlPath);
  res.type('html').send('<!doctype html><h1>Admin UI loading...</h1>');
});

app.post('/api/admin/login',async(req,res,next)=>{
  try{
    const {adminLimit}=getClients();
    if(!await limit(adminLimit,`admin:${clientKey(req)}`,res))return;
    const password=String(req.body?.password||'');
    if(!safeEqual(password,cfg.adminPassword)&&!safeEqual(password,cfg.kioskActivationSecret)) {
      return res.status(403).json({error:'관리자 비밀번호가 올바르지 않습니다.'});
    }
    const adminSession=createAdminCookie(cfg.adminSecret,28800);
    setCookie(res,'pb_admin',adminSession.cookie,adminSession.expiresIn);
    res.json({ok:true,csrf:adminSession.csrf});
  }catch(e){next(e);}
});

app.post('/api/admin/logout',(req,res)=>{
  clearCookie(res,'pb_admin');
  res.json({ok:true});
});

app.get('/api/admin/check',async(req,res)=>{
  const admin=verifyAdminCookie(cfg.adminSecret,cookies(req).pb_admin);
  res.json({authenticated:!!admin,eventActive:eventActive()});
});

app.get('/api/admin/config',adminRequired,async(req,res,next)=>{
  try{
    const config=await getStoredAdminConfig();
    res.json({config});
  }catch(e){next(e);}
});

app.post('/api/admin/config',adminRequired,async(req,res,next)=>{
  try{
    const {redis}=getClients();
    const newConfig=req.body?.config;
    if(!newConfig||typeof newConfig!=='object')return res.status(400).json({error:'유효하지 않은 설정 데이터입니다.'});
    const current=await getStoredAdminConfig();
    const merged={
      ...current,
      ...newConfig,
      customBackgrounds:Array.isArray(newConfig.customBackgrounds)?newConfig.customBackgrounds:current.customBackgrounds
    };
    await redis.set('fourcuts:admin:config',JSON.stringify(merged));
    res.json({ok:true,config:merged});
  }catch(e){next(e);}
});

app.post('/api/admin/backgrounds',adminRequired,uploadBg.single('background'),async(req,res,next)=>{
  try{
    if(!req.file)return res.status(400).json({error:'배경 이미지 파일이 제공되지 않았습니다.'});
    const name=String(req.body?.name||'특별 커스텀 배경').slice(0,50);
    const normalized=await validateAndNormalizeBackground(req.file.buffer);
    const bgId=crypto.randomUUID();
    const storagePath=`backgrounds/${bgId}.${normalized.format}`;
    const {supabase,redis}=getClients();
    
    let publicUrl='';
    const stored=await supabase.storage.from(cfg.bucket).upload(storagePath,normalized.buffer,{contentType:`image/${normalized.format}`,upsert:true});
    if(!stored.error){
      const signed=await supabase.storage.from(cfg.bucket).createSignedUrl(storagePath,315360000);
      publicUrl=signed.data?.signedUrl||'';
    }
    if(!publicUrl){
      publicUrl=`data:image/${normalized.format};base64,${normalized.buffer.toString('base64')}`;
    }

    const item={
      id:bgId,
      name,
      format:normalized.format,
      url:publicUrl,
      storagePath,
      width:normalized.width,
      height:normalized.height,
      createdAt:new Date().toISOString()
    };

    const current=await getStoredAdminConfig();
    current.customBackgrounds=(current.customBackgrounds||[]).filter((x)=>x.id!==bgId);
    current.customBackgrounds.unshift(item);
    await redis.set('fourcuts:admin:config',JSON.stringify(current));

    res.status(201).json({ok:true,background:item});
  }catch(e){next(e);}
});

app.delete('/api/admin/backgrounds/:id',adminRequired,async(req,res,next)=>{
  try{
    const id=req.params.id;
    if(!id)return res.status(400).json({error:'배경 ID가 필요합니다.'});
    const current=await getStoredAdminConfig();
    const target=(current.customBackgrounds||[]).find((x)=>x.id===id);
    if(target&&target.storagePath){
      const {supabase}=getClients();
      try{await supabase.storage.from(cfg.bucket).remove([target.storagePath]);}catch{}
    }
    current.customBackgrounds=(current.customBackgrounds||[]).filter((x)=>x.id!==id);
    const {redis}=getClients();
    await redis.set('fourcuts:admin:config',JSON.stringify(current));
    res.json({ok:true});
  }catch(e){next(e);}
});

app.get('/api/admin/stats',adminRequired,async(req,res,next)=>{
  try{
    const {supabase}=getClients();
    const nowIso=new Date().toISOString();
    const readyQ=await supabase.from('photo_downloads').select('photo_id',{count:'exact',head:true}).eq('status','ready');
    const pendingQ=await supabase.from('photo_downloads').select('photo_id',{count:'exact',head:true}).eq('status','pending');
    const activeQ=await supabase.from('photo_downloads').select('photo_id',{count:'exact',head:true}).gt('expires_at',nowIso);
    const expiredQ=await supabase.from('photo_downloads').select('photo_id',{count:'exact',head:true}).lte('expires_at',nowIso);
    res.json({
      readyCount:readyQ.count||0,
      pendingCount:pendingQ.count||0,
      activeCount:activeQ.count||0,
      expiredCount:expiredQ.count||0,
      eventActive:eventActive()
    });
  }catch(e){next(e);}
});

app.get('/api/public-config',async(req,res,next)=>{
  try{
    const config=await getStoredAdminConfig();
    res.set('Cache-Control','public, max-age=15, stale-while-revalidate=60');
    res.json({config,eventActive:eventActive()});
  }catch(e){next(e);}
});

app.get('/activate',(req,res)=>res.type('html').send('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>행사 기기 활성화</title><link rel="stylesheet" href="/download.css"></head><body><main class="download-card"><h1>행사 기기 활성화</h1><p id="status">운영자 전용 활성화 코드를 입력하세요.</p><input id="code" type="password" autocomplete="off" aria-label="활성화 코드"><div class="download-actions"><button id="activate">활성화</button></div></main><script src="/activate.js"></script></body></html>'));

app.post('/api/kiosk/activate',async(req,res,next)=>{
  try{
    const {activationLimit}=getClients();
    if(!await limit(activationLimit,clientKey(req),res))return;
    if(!safeEqual(req.body?.code||'',cfg.kioskActivationSecret))return res.status(403).json({error:'활성화 코드가 올바르지 않습니다.'});
    setCookie(res,'pb_kiosk',createKioskCookie(cfg.sessionSecret,86400),86400);
    res.json({ok:true});
  }catch(e){next(e);}
});

app.get('/api/session',kioskRequired,async(req,res,next)=>{
  try{
    if(!eventActive())return res.status(403).json({error:'현재는 행사 운영 시간이 아닙니다.'});
    const {sessionIpLimit}=getClients();
    if(!await limit(sessionIpLimit,`session:${clientKey(req)}`,res))return;
    const s=createSession(cfg.sessionSecret,900);
    setCookie(res,'pb_session',s.cookie,s.expiresIn);
    res.json({csrfToken:s.csrf,expiresIn:s.expiresIn});
  }catch(e){next(e);}
});

app.post('/api/photos',kioskRequired,upload.single('photo'),async(req,res,next)=>{
  let reservationKey,photoId,storagePath,dbCreated=false;
  try{
    if(!eventActive())return res.status(403).json({error:'현재는 행사 운영 시간이 아닙니다.'});
    const session=verifySession(cfg.sessionSecret,cookies(req).pb_session);
    if(!session||!safeEqual(req.get('x-csrf-token')||'',session.csrf))return res.status(403).json({error:'촬영 세션이 만료되었습니다. 처음부터 다시 시작해 주세요.'});
    if(!req.file||req.file.mimetype!=='image/jpeg')return res.status(415).json({error:'JPEG 사진만 업로드할 수 있습니다.'});
    const {supabase,redis,uploadIpLimit,sessionLimit}=getClients();
    if(!await limit(uploadIpLimit,clientKey(req),res)||!await limit(sessionLimit,session.id,res))return;
    const usedKey=`fourcuts:used:${session.id}`;
    if(await redis.exists(usedKey))return res.status(409).json({error:'이미 완료된 촬영 세션입니다.'});
    reservationKey=`fourcuts:reserve:${session.id}`;
    if(!await acquire(redis,reservationKey,req.requestId,180))return res.status(409).json({error:'사진 업로드가 이미 진행 중입니다.'});
    const normalized=await validateAndNormalizeJpeg(req.file.buffer);
    photoId=crypto.randomUUID();
    const expiresAt=new Date(Date.now()+cfg.photoTtlMinutes*60000).toISOString();
    storagePath=`photos/${new Date().toISOString().slice(0,10)}/${photoId}.jpg`;
    const created=await supabase.from('photo_downloads').insert({photo_id:photoId,expires_at:expiresAt,storage_path:storagePath,status:'pending'});
    if(created.error)throw created.error;
    dbCreated=true;
    const stored=await supabase.storage.from(cfg.bucket).upload(storagePath,normalized,{contentType:'image/jpeg',cacheControl:'60',upsert:false});
    if(stored.error)throw stored.error;
    const ready=await supabase.from('photo_downloads').update({status:'ready'}).eq('photo_id',photoId).eq('status','pending').select('photo_id').maybeSingle();
    if(ready.error)throw ready.error;
    if(!ready.data)throw new Error('Photo state transition failed');
    const token=createDownloadToken(cfg.downloadSecret,photoId,expiresAt);
    const pageUrl=`${cfg.publicUrl}/d/${photoId}#${token}`;
    const qr=await QRCode.toDataURL(pageUrl,{width:420,margin:2,errorCorrectionLevel:'M'});
    await redis.set(usedKey,'1',{ex:900});
    await release(redis,reservationKey,req.requestId);
    reservationKey=null;
    log.info('photo_created',{requestId:req.requestId,photoRef:hmacRef(cfg.rateLimitHashSecret,photoId,12),bytes:normalized.length});
    res.status(201).json({photoId,pageUrl,qr,expiresAt});
  }catch(e){
    const {supabase,redis}=getClients();
    if(storagePath){try{await supabase.storage.from(cfg.bucket).remove([storagePath]);}catch{}}
    if(dbCreated&&photoId){try{await supabase.from('photo_downloads').delete().eq('photo_id',photoId);}catch{}}
    if(reservationKey){try{await release(redis,reservationKey,req.requestId);}catch{}}
    next(e);
  }
});

app.post('/api/photo/:id/exchange',async(req,res,next)=>{
  try{
    if(!validUuid(req.params.id))return res.status(404).json({error:'잘못된 사진 주소입니다.'});
    const parsed=parseDownloadToken(cfg.downloadSecret,req.params.id,bearer(req));
    if(!parsed)return res.status(404).json({error:'유효하지 않거나 만료된 다운로드 인증정보입니다.'});
    const row=await record(req.params.id);
    if(!row||new Date(row.expires_at).getTime()<=Date.now())return res.status(410).json({error:'다운로드 시간이 만료되었습니다.'});
    const session=createDownloadSession(cfg.downloadSecret,req.params.id,row.expires_at);
    res.append('Set-Cookie',`pb_download=${encodeURIComponent(session.cookie)}; Path=/api/photo/${req.params.id}; HttpOnly; SameSite=Strict; Max-Age=${session.maxAge}${cfg.production?'; Secure':''}`);
    res.json({ok:true});
  }catch(e){next(e);}
});

async function record(id){
  const {data,error}=await getClients().supabase.from('photo_downloads').select('photo_id,expires_at,storage_path,status').eq('photo_id',id).eq('status','ready').maybeSingle();
  if(error)throw error;
  return data;
}

async function signed(row,download){
  const remain=Math.floor((new Date(row.expires_at).getTime()-Date.now())/1000);
  if(remain<=0)return null;
  const seconds=Math.min(cfg.signedUrlTtlSeconds,remain);
  const options=download?{download:`maeum-fourcuts-${row.photo_id.slice(0,8)}.jpg`}:undefined;
  const r=await getClients().supabase.storage.from(cfg.bucket).createSignedUrl(row.storage_path,seconds,options);
  if(r.error)throw r.error;
  return {url:r.data.signedUrl,seconds};
}

app.get('/api/photo/:id/preview',downloadRequired,async(req,res,next)=>{
  try{
    const row=await record(req.params.id);
    if(!row)return res.status(404).json({error:'사진을 찾을 수 없습니다.'});
    const u=await signed(row,false);
    if(!u)return res.status(410).json({error:'다운로드 시간이 만료되었습니다.'});
    res.json({previewUrl:u.url,expiresAt:row.expires_at});
  }catch(e){next(e);}
});

app.get('/api/photo/:id/download',downloadRequired,async(req,res,next)=>{
  try{
    const row=await record(req.params.id);
    if(!row)return res.status(404).json({error:'사진을 찾을 수 없습니다.'});
    const u=await signed(row,true);
    if(!u)return res.status(410).json({error:'다운로드 시간이 만료되었습니다.'});
    res.json({downloadUrl:u.url});
  }catch(e){next(e);}
});

app.get('/d/:id',(req,res)=>{
  if(!validUuid(req.params.id))return res.status(404).send('잘못된 사진 주소입니다.');
  res.type('html').send(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>마음 네컷 다운로드</title><link rel="stylesheet" href="/download.css"></head><body><main class="download-card" data-photo-id="${req.params.id}"><h1 class="download-brand-title">마음 네컷</h1><div id="status" class="download-status-badge" aria-live="polite">사진을 안전하게 불러오는 중입니다...</div><div id="photoWrap" class="download-preview-wrap" hidden><img id="photo" alt="완성된 마음 네컷"></div><div class="download-actions"><button id="save" class="btn-download-main" hidden>사진 저장하기</button><button id="retry" class="btn-retry" hidden>다시 시도</button></div><p class="download-help-text">저장 화면이 열리면 공유 버튼을 누른 뒤<br>‘이미지 저장’을 선택하세요.</p><div id="expiredBox" class="expired-state-box" hidden><div class="expired-title">다운로드 시간이 지났어요</div><div class="expired-desc">개인정보 보호를 위해 사진이 만료되었거나 삭제되었습니다.</div></div></main><script src="/download.js"></script></body></html>`);
});

async function runCleanup(requestId){
  const {supabase,redis}=getClients(),key='fourcuts:cleanup-lock';
  let locked=false;
  try{
    locked=await acquire(redis,key,requestId,120);
    if(!locked)return {ok:false,error:'Cleanup already running',status:409};
    let removed=0,failures=0;
    const deadline=Date.now()+50000;
    while(Date.now()<deadline){
      const q=await supabase.from('photo_downloads').select('photo_id,storage_path,status').or(`expires_at.lte.${new Date().toISOString()},and(status.eq.pending,created_at.lte.${new Date(Date.now()-10*60000).toISOString()})`).order('created_at',{ascending:true}).limit(100);
      if(q.error)throw q.error;
      if(!q.data.length)break;
      for(const row of q.data){
        if(Date.now()>=deadline)break;
        const deleting=await supabase.from('photo_downloads').update({status:'deleting'}).eq('photo_id',row.photo_id).in('status',['ready','pending','deleting']).select('photo_id').maybeSingle();
        if(deleting.error||!deleting.data){failures++;continue;}
        const del=await supabase.storage.from(cfg.bucket).remove([row.storage_path]);
        if(del.error){failures++;await supabase.from('photo_downloads').update({status:row.status==='ready'?'ready':'pending'}).eq('photo_id',row.photo_id);continue;}
        const db=await supabase.from('photo_downloads').delete().eq('photo_id',row.photo_id);
        if(db.error){failures++;continue;}
        removed++;
      }
      if(q.data.length<100)break;
    }
    log.info('cleanup_complete',{requestId,removed,failures});
    return {ok:!failures,removed,failures,status:failures?207:200};
  }finally{
    if(locked)try{await release(redis,key,requestId);}catch{}
  }
}

app.post('/api/admin/cleanup',adminRequired,async(req,res,next)=>{
  try{
    const r=await runCleanup(req.requestId);
    res.status(r.status||200).json(r);
  }catch(e){next(e);}
});

app.get('/api/cleanup',async(req,res,next)=>{
  if(!safeEqual(req.get('authorization')||'',`Bearer ${cfg.cronSecret}`))return res.status(401).json({error:'Unauthorized'});
  try{
    const r=await runCleanup(req.requestId);
    res.status(r.status||200).json(r);
  }catch(e){next(e);}
});

app.get('/api/health',(_,res)=>res.json({ok:true,eventActive:eventActive()}));

app.use((err,req,res,next)=>{
  log.error('request_failed',{requestId:req.requestId,path:req.path,name:err.name,message:err.message});
  if(err instanceof multer.MulterError)return res.status(err.code==='LIMIT_FILE_SIZE'?413:400).json({error:err.code==='LIMIT_FILE_SIZE'?'사진 파일이 너무 큽니다.':'잘못된 업로드 요청입니다.'});
  const status=Number(err.status)||500;
  res.status(status).json({error:status<500?err.message:'요청 처리 중 오류가 발생했습니다.',requestId:req.requestId});
});

module.exports=app;
