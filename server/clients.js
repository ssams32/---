const { createClient } = require('@supabase/supabase-js');
const { Redis } = require('@upstash/redis');
const { Ratelimit } = require('@upstash/ratelimit');
const { getConfig } = require('./config');
const {
  createMockRedis,
  createMockLimiter,
  createMockSupabase
} = require('./mock-factories');

let clients;

function createLocalMockClients(cfg) {
  const mockSupabase = createMockSupabase();
  const mockRedis = createMockRedis();
  // 전체 목업 모드(LOCAL_MOCK): 로컬 개발 및 테스트 전용 무제한 리미터 유지
  const mockLimiter = createMockLimiter();

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

  const isSupabaseReal = !(
    process.env.LOCAL_MOCK === 'true' ||
    cfg.supabaseUrl.includes('YOUR_PROJECT') ||
    cfg.supabaseUrl.includes('dummy') ||
    !cfg.supabaseUrl.startsWith('https://')
  );

  const isRedisReal = !(
    cfg.redisUrl.includes('YOUR_REDIS') ||
    cfg.redisUrl.includes('dummy') ||
    cfg.redisToken.includes('dummy')
  );

  // 1) Supabase dummy → 전체 목업 (로컬 개발 보존)
  if (!isSupabaseReal) {
    console.log('[Info] 로컬 전체 목업 모드 (Supabase dummy)');
    clients = createLocalMockClients(cfg);
    return clients;
  }

  // 2) Supabase real + Redis real → 완전 실서버
  if (isRedisReal) {
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

  // 3) Supabase real + Redis dummy → 하이브리드 모드
  console.log('[Info] 하이브리드 모드: Supabase 실연결 + Redis/레이트리밋 인메모리 심');
  const mockRedis = createMockRedis();
  clients = {
    supabase: createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } }),
    redis: mockRedis,
    activationLimit: createMockLimiter(10, 10 * 60 * 1000),
    adminLimit: createMockLimiter(15, 10 * 60 * 1000),
    sessionIpLimit: createMockLimiter(300, 10 * 60 * 1000),
    uploadIpLimit: createMockLimiter(150, 10 * 60 * 1000),
    sessionLimit: createMockLimiter(2, 15 * 60 * 1000)
  };
  return clients;
}

module.exports = { getClients };
