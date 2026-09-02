function log(level,event,fields={}) { const safe={...fields}; delete safe.token; delete safe.authorization; console[level](JSON.stringify({time:new Date().toISOString(),event,...safe})); }
module.exports={info:(e,f)=>log('info',e,f),error:(e,f)=>log('error',e,f),warn:(e,f)=>log('warn',e,f)};
