const fs = require('fs');
const path = require('path');
const os = require('os');

const tmpDir = path.join(os.tmpdir(), 'maeum_fourcuts_storage');
try {
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
} catch {}

function getDiskFile(key) {
  return path.join(tmpDir, String(key).replace(/[^a-zA-Z0-9._-]/g, '_'));
}

/**
 * 인메모리 Redis 심 팩토리
 * - acquire/release 락 로직(server/lock.js) 호환 API 제공
 * - TTL 만료는 setTimeout으로 근사(단일 인스턴스 한정)
 */
function createMockRedis() {
  const memory = new Map();

  return {
    get: async (key) => memory.get(key) ?? null,
    set: async (key, val, opts) => {
      if (opts?.nx && memory.has(key)) return null;
      memory.set(key, val);
      if (opts?.ex) {
        setTimeout(() => memory.delete(key), opts.ex * 1000);
      }
      return 'OK';
    },
    exists: async (key) => (memory.has(key) ? 1 : 0),
    del: async (key) => (memory.delete(key) ? 1 : 0),
    eval: async (script, keys, args) => {
      const key = keys[0];
      if (memory.get(key) === args[0]) {
        memory.delete(key);
        return 1;
      }
      return 0;
    }
  };
}

/**
 * 인메모리 레이트리밋 심 팩토리
 * - Ratelimit.slidingWindow 인터페이스 모방
 * - 항상 성공 반환(limit: 100, remaining: 99)
 */
function createMockLimiter() {
  return {
    limit: async () => ({
      success: true,
      limit: 100,
      remaining: 99,
      reset: Date.now() + 60000
    })
  };
}

/**
 * 인메모리 Supabase 심 팩토리 (createLocalMockClients 내부 mockSupabase와 동일)
 * - 디스크(/tmp/maeum_fourcuts_storage) 폴백 포함
 * - storage.download() 구현 유지 (QR 직접 다운로드 지원)
 */
function createMockSupabase() {
  const memoryDb = new Map();
  const memoryStorage = new Map();

  return {
    from: (table) => {
      return {
        insert: async (data) => {
          const row = Array.isArray(data) ? data[0] : data;
          const fullRow = { ...row, created_at: new Date().toISOString() };
          memoryDb.set(row.photo_id, fullRow);
          try { fs.writeFileSync(getDiskFile('db_' + row.photo_id), JSON.stringify(fullRow)); } catch {}
          return { data: row, error: null };
        },
        select: (cols, opts) => {
          function getRow(id) {
            if (memoryDb.has(id)) return memoryDb.get(id);
            try {
              const f = getDiskFile('db_' + id);
              if (fs.existsSync(f)) {
                const parsed = JSON.parse(fs.readFileSync(f, 'utf8'));
                memoryDb.set(id, parsed);
                return parsed;
              }
            } catch {}
            return null;
          }
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
        upload: async (filePath, buffer) => {
          memoryStorage.set(filePath, buffer);
          try { fs.writeFileSync(getDiskFile('file_' + filePath), buffer); } catch {}
          return { data: { path: filePath }, error: null };
        },
        createSignedUrl: async (filePath, seconds, options) => {
          let buf = memoryStorage.get(filePath);
          if (!buf) {
            try {
              const f = getDiskFile('file_' + filePath);
              if (fs.existsSync(f)) buf = fs.readFileSync(f);
            } catch {}
          }
          if (!buf) return { data: null, error: new Error('Object not found') };
          const mime = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
          return { data: { signedUrl: `data:${mime};base64,${buf.toString('base64')}` }, error: null };
        },
        download: async (filePath) => {
          let buf = memoryStorage.get(filePath);
          if (!buf) {
            try {
              const f = getDiskFile('file_' + filePath);
              if (fs.existsSync(f)) buf = fs.readFileSync(f);
            } catch {}
          }
          if (!buf) return { data: null, error: new Error('Object not found') };
          const mime = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
          return { data: new Blob([buf], { type: mime }), error: null };
        },
        remove: async (paths) => {
          for (const p of paths) {
            memoryStorage.delete(p);
            try { const f = getDiskFile('file_' + p); if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
          }
          return { data: paths, error: null };
        }
      })
    }
  };
}

module.exports = {
  createMockRedis,
  createMockLimiter,
  createMockSupabase,
  getDiskFile
};
