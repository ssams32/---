const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { Redis } = require('@upstash/redis');
const { Ratelimit } = require('@upstash/ratelimit');
const { acquire, release } = require('../server/lock');
const { createMockRedis } = require('../server/mock-factories');

async function withEnv(env, fn) {
  const old = { ...process.env };
  delete process.env.LOCAL_MOCK;
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  delete require.cache[require.resolve('../server/config')];
  delete require.cache[require.resolve('../server/clients')];
  try {
    const { getClients } = require('../server/clients');
    return await fn(getClients);
  } finally {
    for (const k of Object.keys(process.env)) {
      if (!(k in old)) delete process.env[k];
    }
    Object.assign(process.env, old);
    delete require.cache[require.resolve('../server/config')];
    delete require.cache[require.resolve('../server/clients')];
  }
}

describe('하이브리드 클라이언트 모드 선택', { concurrency: 1 }, () => {
  test('TC-1: Supabase dummy + Redis dummy → Full Mock', async () => {
    await withEnv({
      SUPABASE_URL: 'https://dummy.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'dummy-key',
      UPSTASH_REDIS_REST_URL: 'https://dummy.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'dummy-token'
    }, async (getClients) => {
      const clients = getClients();

      // mockSupabase 여부 확인
      assert.ok(clients.supabase.from);
      assert.equal(typeof clients.supabase.from('t').insert, 'function');
      assert.notEqual(clients.supabase.constructor.name, 'SupabaseClient');

      // mockRedis 여부 확인
      assert.equal(typeof clients.redis.get, 'function');
      assert.equal(typeof clients.redis.eval, 'function');
      assert.equal(clients.redis instanceof Redis, false);

      // mockLimiter 여부 확인 (항상 성공)
      const r = await clients.sessionIpLimit.limit('test');
      assert.equal(r.success, true);
      assert.equal(r.limit, 100);
      assert.equal(clients.sessionIpLimit instanceof Ratelimit, false);
    });
  });

  test('TC-2: Supabase real + Redis dummy → Hybrid', async () => {
    await withEnv({
      SUPABASE_URL: 'https://pgiubbcqmhijurtujnve.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'real-service-role-key-long-enough-32chars',
      UPSTASH_REDIS_REST_URL: 'https://dummy.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'dummy-token'
    }, async (getClients) => {
      const clients = getClients();

      // Supabase는 실 클라이언트(@supabase/supabase-js)
      assert.ok(clients.supabase.from);
      assert.equal(clients.supabase.constructor.name, 'SupabaseClient');

      // Redis는 mockRedis
      assert.equal(typeof clients.redis.get, 'function');
      assert.equal(typeof clients.redis.eval, 'function');
      assert.equal(clients.redis instanceof Redis, false);

      // Limiter는 mockLimiter
      const r = await clients.sessionIpLimit.limit('test');
      assert.equal(r.success, true);
      assert.equal(clients.sessionIpLimit instanceof Ratelimit, false);
    });
  });

  test('TC-3: Supabase real + Redis real → Full Real', async () => {
    await withEnv({
      SUPABASE_URL: 'https://pgiubbcqmhijurtujnve.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'real-service-role-key-long-enough-32chars',
      UPSTASH_REDIS_REST_URL: 'https://real.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'real-token-32chars-minimum'
    }, async (getClients) => {
      const clients = getClients();

      // Supabase 실 클라이언트
      assert.ok(clients.supabase.from);
      assert.equal(clients.supabase.constructor.name, 'SupabaseClient');

      // Redis 실 클라이언트(@upstash/redis)
      assert.equal(clients.redis instanceof Redis, true);

      // Ratelimit 실 인스턴스
      assert.equal(clients.sessionIpLimit instanceof Ratelimit, true);
    });
  });

  test('TC-4: Supabase dummy + Redis real → Full Mock (Supabase 우선)', async () => {
    await withEnv({
      SUPABASE_URL: 'https://dummy.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'dummy-key',
      UPSTASH_REDIS_REST_URL: 'https://real.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'real-token-32chars-minimum'
    }, async (getClients) => {
      const clients = getClients();

      // Supabase dummy면 전체 목업
      assert.notEqual(clients.supabase.constructor.name, 'SupabaseClient');
      assert.equal(clients.redis instanceof Redis, false);
      assert.equal(typeof clients.redis.get, 'function');
      const r = await clients.sessionIpLimit.limit('test');
      assert.equal(r.success, true);
      assert.equal(clients.sessionIpLimit instanceof Ratelimit, false);
    });
  });
});

describe('mockRedis 락 호환성 (server/lock.js)', () => {
  test('acquire/release 원자성 흉내 동작', async () => {
    const mockRedis = createMockRedis();

    const ok1 = await acquire(mockRedis, 'lock:test', 'owner1', 10);
    assert.equal(ok1, true);

    const ok2 = await acquire(mockRedis, 'lock:test', 'owner2', 10);
    assert.equal(ok2, false); // nx=true라 이미 있으면 실패

    const released = await release(mockRedis, 'lock:test', 'owner1');
    assert.equal(released, 1);

    const ok3 = await acquire(mockRedis, 'lock:test', 'owner2', 10);
    assert.equal(ok3, true); // 해제 후 재획득 가능
  });
});
