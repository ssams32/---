async function acquire(redis,key,owner,ttlSeconds){return (await redis.set(key,owner,{nx:true,ex:ttlSeconds}))==='OK';}
async function release(redis,key,owner){return redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",[key],[owner]);}
module.exports={acquire,release};
