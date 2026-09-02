const { execFileSync }=require('child_process');const fs=require('fs');const path=require('path');
const files=['api/index.js','local-server.js',...fs.readdirSync('server').filter(x=>x.endsWith('.js')).map(x=>'server/'+x),...fs.readdirSync('public').filter(x=>x.endsWith('.js')).map(x=>'public/'+x)];
for(const file of files)execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
for(const file of fs.readdirSync('public')){const p=path.join('public',file);if(fs.statSync(p).isFile()&&/SUPABASE_SERVICE_ROLE_KEY|UPSTASH_REDIS_REST_TOKEN|DOWNLOAD_TOKEN_SECRET|ADMIN_SECRET|ADMIN_PASSWORD|KIOSK_ACTIVATION_SECRET/.test(fs.readFileSync(p,'utf8')))throw new Error(`Secret name leaked into client file: ${p}`);}
JSON.parse(fs.readFileSync('package.json'));JSON.parse(fs.readFileSync('vercel.json'));console.log(`Checked ${files.length} JavaScript files and client secret scan.`);
