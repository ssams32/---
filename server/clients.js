const { createClient } = require('@supabase/supabase-js');
const { Redis } = require('@upstash/redis');
const { Ratelimit } = require('@upstash/ratelimit');
const { getConfig } = require('./config');

let clients;

function createLocalMockClients(cfg) {
  const memoryDb = new Map();
  const memoryStorage = new Map();
  const memoryRedis = new Map();

  const mockRedis = {
    get: async (key) => memoryRedis.get(key) || null,
    set: async (key, val, opts) => {
      if (opts && opts.nx && memoryRedis.has(key)) return null;
      memoryRedis.set(key, val);
      if (opts && opts.ex) {
        setTimeout(() => memoryRedis.delete(key), opts.ex * 1000);
      }
      return 'OK';
    },
    exists: async (key) => (memoryRedis.has(key) ? 1 : 0),
    del: async (key) => (memoryRedis.delete(key) ? 1 : 0),
    eval: async (script, keys, args) => {
      const key = keys[0];
      if (memoryRedis.get(key) === args[0]) {
        memoryRedis.delete(key);
        return 1;
      }
      return 0;
    }
  };

  const mockLimiter = {
    limit: async () => ({ success: true, limit: 100, remaining: 99, reset: Date.now() + 60000 })
  };

  const mockSupabase = {
    from: (table) => {
      return {
        insert: async (data) => {
          const row = Array.isArray(data) ? data[0] : data;
          memoryDb.set(row.photo_id, { ...row, created_at: new Date().toISOString() });
          return { data: row, error: null };
        },
        select: (cols, opts) => {
          return {
            eq: (field, val) => {
              return {
                eq: (f2, v2) => {
                  return {
                    maybeSingle: async () => {
                      for (const row of memoryDb.values()) {
                        if (row[field] === val && row[f2] === v2) return { data: row, error: null };
                      }
                      return { data: null, error: null };
                    },
                    select: (selCols) => ({
                      maybeSingle: async () => {
                        for (const row of memoryDb.values()) {
                          if (row[field] === val && row[f2] === v2) return { data: row, error: null };
                        }
                        return { data: null, error: null };
                      }
                    })
                  };
                },
                gt: (f2, v2) => {
                  if (opts && opts.head) {
                    let count = 0;
                    for (const row of memoryDb.values()) {
                      if (row[field] === val && row[f2] > v2) count++;
                    }
                    return Promise.resolve({ count, data: null, error: null });
                  }
                  return Promise.resolve({ data: [], error: null });
                },
                lte: (f2, v2) => {
                  if (opts && opts.head) {
                    let count = 0;
                    for (const row of memoryDb.values()) {
                      if (row[field] === val && row[f2] <= v2) count++;
                    }
                    return Promise.resolve({ count, data: null, error: null });
                  }
                  return Promise.resolve({ data: [], error: null });
                },
                maybeSingle: async () => {
                  for (const row of memoryDb.values()) {
                    if (row[field] === val) return { data: row, error: null };
                  }
                  return { data: null, error: null };
                },
                in: (f2, arr) => ({
                  select: (selCols) => ({
                    maybeSingle: async () => {
                      for (const row of memoryDb.values()) {
                        if (row[field] === val && arr.includes(row[f2])) return { data: row, error: null };
                      }
                      return { data: null, error: null };
                    }
                  })
                })
              };
            },
            gt: (field, val) => {
              let count = 0;
              for (const row of memoryDb.values()) {
                if (row[field] > val) count++;
              }
              return Promise.resolve({ count, data: null, error: null });
            },
            lte: (field, val) => {
              let count = 0;
              for (const row of memoryDb.values()) {
                if (row[field] <= val) count++;
              }
              return Promise.resolve({ count, data: null, error: null });
            },
            or: (cond) => ({
              order: () => ({
                limit: async (num) => {
                  const arr = [...memoryDb.values()].slice(0, num);
                  return { data: arr, error: null };
                }
              })
            })
          };
        },
        update: (updateData) => {
          return {
            eq: (field, val) => {
              return {
                eq: (f2, v2) => ({
                  select: (selCols) => ({
                    maybeSingle: async () => {
                      for (const [k, row] of memoryDb.entries()) {
                        if (row[field] === val && row[f2] === v2) {
                          const updated = { ...row, ...updateData };
                          memoryDb.set(k, updated);
                          return { data: updated, error: null };
                        }
                      }
                      return { data: null, error: null };
                    }
                  })
                }),
                in: (f2, arr) => ({
                  select: (selCols) => ({
                    maybeSingle: async () => {
                      for (const [k, row] of memoryDb.entries()) {
                        if (row[field] === val && arr.includes(row[f2])) {
                          const updated = { ...row, ...updateData };
                          memoryDb.set(k, updated);
                          return { data: updated, error: null };
                        }
                      }
                      return { data: null, error: null };
                    }
                  })
                })
              };
            }
          };
        },
        delete: () => ({
          eq: async (field, val) => {
            for (const [k, row] of memoryDb.entries()) {
              if (row[field] === val) memoryDb.delete(k);
            }
            return { error: null };
          }
        })
      };
    },
    storage: {
      from: (bucket) => ({
        upload: async (path, buffer) => {
          memoryStorage.set(path, buffer);
          return { data: { path }, error: null };
        },
        createSignedUrl: async (path, seconds, options) => {
          const buf = memoryStorage.get(path);
          if (!buf) return { data: null, error: new Error('Object not found') };
          const mime = path.endsWith('.png') ? 'image/png' : 'image/jpeg';
          return { data: { signedUrl: `data:${mime};base64,${buf.toString('base64')}` }, error: null };
        },
        remove: async (paths) => {
          for (const p of paths) memoryStorage.delete(p);
          return { data: paths, error: null };
        }
      })
    }
  };

  return {
    supabase: mockSupabase,
    redis: mockRedis,
    activationLimit: mockLimiter,
    adminLimit: mockLimiter,
    sessionIpLimit: mockLimiter,
    uploadIpLimit: mockLimiter,
    sessionLimit: mockLimiter
  };
}

function getClients() {
  if (clients) return clients;
  const cfg = getConfig();

  const isLocalMock =
    process.env.LOCAL_MOCK === 'true' ||
    cfg.supabaseUrl.includes('YOUR_PROJECT') ||
    cfg.redisUrl.includes('YOUR_REDIS') ||
    !cfg.supabaseUrl.startsWith('https://');

  if (isLocalMock) {
    console.log('[Info] 로컬 개발용 인메모리 저장소(Memory DB & Storage & Redis) 모드로 실행됩니다.');
    clients = createLocalMockClients(cfg);
    return clients;
  }

  const redis = new Redis({ url: cfg.redisUrl, token: cfg.redisToken });
  clients = {
    supabase: createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } }),
    redis,
    activationLimit: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '10 m'), prefix: 'fourcuts:activation', analytics: true }),
    adminLimit: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(15, '10 m'), prefix: 'fourcuts:admin', analytics: true }),
    sessionIpLimit: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(300, '10 m'), prefix: 'fourcuts:session-ip', analytics: true }),
    uploadIpLimit: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(150, '10 m'), prefix: 'fourcuts:upload-ip', analytics: true }),
    sessionLimit: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(2, '15 m'), prefix: 'fourcuts:session', analytics: true })
  };
  return clients;
}

module.exports = { getClients };
