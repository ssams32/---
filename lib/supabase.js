const { createClient } = require('@supabase/supabase-js');
let client;
function env(name, fallback) { const value=process.env[name] || fallback; if(!value) throw new Error(`Missing environment variable: ${name}`); return value; }
function admin(){
  if(!client) client=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{'X-Client-Info':'maeum-fourcuts/2.0'}}});
  return client;
}
module.exports={admin,env};
