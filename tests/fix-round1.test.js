const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { createMockLimiter } = require('../server/mock-factories');
const { createAdminCookie, createSession } = require('../server/crypto');

function startTestServer(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        server,
        base: `http://127.0.0.1:${port}`,
        close: () => new Promise((res) => server.close(res))
      });
    });
  });
}

describe('F-7: 인메모리 슬라이딩 윈도우 레이트리밋', () => {
  test('지정된 한도(max) 초과 시 success=false 및 remaining=0 반환', async () => {
    const limiter = createMockLimiter(2, 60000);
    const key = 'test-client-ip';

    const r1 = await limiter.limit(key);
    assert.equal(r1.success, true);
    assert.equal(r1.limit, 2);
    assert.equal(r1.remaining, 1);
    assert.ok(r1.reset > Date.now());

    const r2 = await limiter.limit(key);
    assert.equal(r2.success, true);
    assert.equal(r2.limit, 2);
    assert.equal(r2.remaining, 0);

    const r3 = await limiter.limit(key);
    assert.equal(r3.success, false);
    assert.equal(r3.limit, 2);
    assert.equal(r3.remaining, 0);

    // 다른 키는 영향받지 않음 (키 격리)
    const other = await limiter.limit('other-key');
    assert.equal(other.success, true);
    assert.equal(other.remaining, 1);
  });

  test('인자 없이 호출 시 전체 목업용 무제한 리미터 반환', async () => {
    const unlimited = createMockLimiter();
    for (let i = 0; i < 20; i++) {
      const r = await unlimited.limit('key');
      assert.equal(r.success, true);
    }
  });
});

describe('F-3: 프로덕션 시크릿 fail-closed', () => {
  test('프로덕션 판정 시 필수 시크릿 미설정 시 기동 차단(throw)', () => {
    const oldVercelEnv = process.env.VERCEL_ENV;
    const oldNodeEnv = process.env.NODE_ENV;
    const oldSessionSecret = process.env.SESSION_SECRET;

    try {
      process.env.VERCEL_ENV = 'production';
      delete process.env.SESSION_SECRET;

      delete require.cache[require.resolve('../server/config')];
      const { getConfig } = require('../server/config');

      assert.throws(
        () => getConfig(),
        /Production requires environment variable SESSION_SECRET/
      );
    } finally {
      if (oldVercelEnv !== undefined) process.env.VERCEL_ENV = oldVercelEnv;
      else delete process.env.VERCEL_ENV;
      if (oldNodeEnv !== undefined) process.env.NODE_ENV = oldNodeEnv;
      else delete process.env.NODE_ENV;
      if (oldSessionSecret !== undefined) process.env.SESSION_SECRET = oldSessionSecret;
      else delete process.env.SESSION_SECRET;

      delete require.cache[require.resolve('../server/config')];
    }
  });
});

describe('F-4: 키오스크 세션 자동발급 제거 및 업로드 가드', () => {
  let appServer;
  let app;
  let cfg;

  test('서버 기동', async () => {
    delete require.cache[require.resolve('../server/config')];
    delete require.cache[require.resolve('../server/clients')];
    delete require.cache[require.resolve('../api/index')];
    app = require('../api/index');
    cfg = require('../server/config').getConfig();
    appServer = await startTestServer(app);
  });

  test('GET /api/session 요청 시 pb_kiosk가 자동 발급되지 않음', async () => {
    const res = await fetch(`${appServer.base}/api/session`);
    assert.equal(res.status, 200);
    const cookies = res.headers.get('set-cookie') || '';
    assert.ok(cookies.includes('pb_session='), 'pb_session은 발급되어야 함');
    assert.ok(!cookies.includes('pb_kiosk='), 'pb_kiosk는 절대 자동 발급되지 않아야 함');
  });

  test('활성화 없이도 POST /api/photos 업로드 가능 (활성화 기능 제거됨)', async () => {
    const sessionRes = await fetch(`${appServer.base}/api/session`);
    const sessionCookie = (sessionRes.headers.get('set-cookie') || '').split(';')[0];
    const { csrfToken } = await sessionRes.json();

    const sharp = require('sharp');
    const jpeg = await sharp({
      create: { width: 1200, height: 1360, channels: 3, background: { r: 140, g: 170, b: 220 } }
    }).jpeg({ quality: 85 }).toBuffer();
    const form = new FormData();
    form.append('photo', new Blob([jpeg], { type: 'image/jpeg' }), 'photo.jpg');

    const res = await fetch(`${appServer.base}/api/photos`, {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        'x-csrf-token': csrfToken
      },
      body: form
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.photoId, 'photoId가 발급되어야 함');
  });

  test('서버 종료', async () => {
    if (appServer) await appServer.close();
  });
});

describe('F-3 & F-6: 관리자 인증 fail-closed 및 상태변경 CSRF 검증', () => {
  let appServer;
  let app;
  let cfg;

  test('서버 기동', async () => {
    delete require.cache[require.resolve('../server/config')];
    delete require.cache[require.resolve('../server/clients')];
    delete require.cache[require.resolve('../api/index')];
    app = require('../api/index');
    cfg = require('../server/config').getConfig();
    appServer = await startTestServer(app);
  });

  test('adminPassword 또는 adminSecret 미설정 시 로그인 503 반환', async () => {
    // 기본 상태에서는 process.env.ADMIN_PASSWORD / ADMIN_SECRET이 미설정이므로 cfg.adminPassword === null
    assert.equal(cfg.adminPassword, null, '기본 설정에서 adminPassword는 null이어야 함');
    assert.equal(cfg.adminSecret, null, '기본 설정에서 adminSecret는 null이어야 함');

    const res = await fetch(`${appServer.base}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'any' })
    });

    assert.equal(res.status, 503);
    const body = await res.json();
    assert.match(body.error, /관리자 인증이 설정되지 않았습니다/);
  });

  test('adminPassword 또는 adminSecret 미설정 시 adminRequired 보호 라우트 503 반환', async () => {
    const res = await fetch(`${appServer.base}/api/admin/config`);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.match(body.error, /관리자 인증이 설정되지 않았습니다/);
  });

  test('관리자 설정 후 상태변경 요청 시 x-csrf-token 누락/불일치 시 403 반환', async () => {
    const testAdminSecret = 'test-admin-secret-key-32bytes-ok!';
    const adminSession = createAdminCookie(testAdminSecret, 3600);

    // cfg를 일시적으로 주입하기 위해 config mock 환경 구성
    const oldAdminPass = process.env.ADMIN_PASSWORD;
    const oldAdminSec = process.env.ADMIN_SECRET;
    process.env.ADMIN_PASSWORD = 'admin-password-test-123';
    process.env.ADMIN_SECRET = testAdminSecret;

    delete require.cache[require.resolve('../server/config')];
    delete require.cache[require.resolve('../server/clients')];
    delete require.cache[require.resolve('../api/index')];
    const newApp = require('../api/index');
    const newServer = await startTestServer(newApp);

    try {
      // 1. GET은 CSRF 없이도 통과
      const getRes = await fetch(`${newServer.base}/api/admin/config`, {
        headers: { cookie: `pb_admin=${adminSession.cookie}` }
      });
      assert.equal(getRes.status, 200, 'GET /api/admin/config는 CSRF 토큰 없이 통과');

      // 2. POST에 CSRF 토큰 누락 시 403
      const postNoCsrf = await fetch(`${newServer.base}/api/admin/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `pb_admin=${adminSession.cookie}`
        },
        body: JSON.stringify({ config: { title: '테스트' } })
      });
      assert.equal(postNoCsrf.status, 403);
      const errNoCsrf = await postNoCsrf.json();
      assert.match(errNoCsrf.error, /관리자 CSRF 토큰이 유효하지 않습니다/);

      // 3. POST에 잘못된 CSRF 토큰 전송 시 403
      const postBadCsrf = await fetch(`${newServer.base}/api/admin/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `pb_admin=${adminSession.cookie}`,
          'x-csrf-token': 'wrong-csrf-token'
        },
        body: JSON.stringify({ config: { title: '테스트' } })
      });
      assert.equal(postBadCsrf.status, 403);

      // 4. 올바른 CSRF 토큰 전송 시 200 통과
      const postOk = await fetch(`${newServer.base}/api/admin/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `pb_admin=${adminSession.cookie}`,
          'x-csrf-token': adminSession.csrf
        },
        body: JSON.stringify({ config: { title: '테스트' } })
      });
      assert.equal(postOk.status, 200);
      const okBody = await postOk.json();
      assert.equal(okBody.ok, true);
    } finally {
      await newServer.close();
      if (oldAdminPass !== undefined) process.env.ADMIN_PASSWORD = oldAdminPass;
      else delete process.env.ADMIN_PASSWORD;
      if (oldAdminSec !== undefined) process.env.ADMIN_SECRET = oldAdminSec;
      else delete process.env.ADMIN_SECRET;
      delete require.cache[require.resolve('../server/config')];
      delete require.cache[require.resolve('../server/clients')];
      delete require.cache[require.resolve('../api/index')];
    }
  });

  test('서버 종료', async () => {
    if (appServer) await appServer.close();
  });
});

describe('F-6: originGuard 출처 검증', () => {
  const { originGuard } = require('../server/security');

  function mockReqRes(method, origin) {
    const headers = {};
    if (origin !== undefined) headers['origin'] = origin;
    const req = {
      method,
      get: (h) => headers[h.toLowerCase()]
    };
    let statusCode = null;
    let jsonBody = null;
    let nextCalled = false;
    const res = {
      status: (code) => {
        statusCode = code;
        return {
          json: (b) => { jsonBody = b; }
        };
      }
    };
    const next = () => { nextCalled = true; };
    return { req, res, next, getStatus: () => statusCode, getBody: () => jsonBody, isNext: () => nextCalled };
  }

  test('프로덕션 판정 시 .vercel.app 와일드카드 차단 (403)', () => {
    const oldVercel = process.env.VERCEL_ENV;
    try {
      process.env.VERCEL_ENV = 'production';
      const { req, res, next, getStatus, isNext } = mockReqRes('POST', 'https://attacker.vercel.app');
      originGuard(req, res, next);
      assert.equal(getStatus(), 403);
      assert.equal(isNext(), false);
    } finally {
      if (oldVercel !== undefined) process.env.VERCEL_ENV = oldVercel;
      else delete process.env.VERCEL_ENV;
    }
  });

  test('프로덕션 판정 시 allowedOrigins 정확 일치만 허용', () => {
    const oldVercel = process.env.VERCEL_ENV;
    const cfg = require('../server/config').getConfig();
    const validOrigin = cfg.allowedOrigins[0];
    try {
      process.env.VERCEL_ENV = 'production';
      const { req, res, next, isNext } = mockReqRes('POST', validOrigin);
      originGuard(req, res, next);
      assert.equal(isNext(), true);
    } finally {
      if (oldVercel !== undefined) process.env.VERCEL_ENV = oldVercel;
      else delete process.env.VERCEL_ENV;
    }
  });

  test('Origin 헤더 없음은 통과 (현행 유지)', () => {
    const { req, res, next, isNext } = mockReqRes('POST', undefined);
    originGuard(req, res, next);
    assert.equal(isNext(), true);
  });

  test('GET 요청은 Origin 검증 대상 제외', () => {
    const { req, res, next, isNext } = mockReqRes('GET', 'https://malicious.com');
    originGuard(req, res, next);
    assert.equal(isNext(), true);
  });
});

describe('F-8: admin_config 저장소 연동', () => {
  test('mockSupabase에서 admin_config upsert 및 select 정상 동작', async () => {
    const { createMockSupabase } = require('../server/mock-factories');
    const mockDb = createMockSupabase();

    const configPayload = { title: '테스트 복지센터 네컷' };
    const upRes = await mockDb.from('admin_config').upsert({
      key: 'fourcuts:admin:config',
      value: configPayload,
      updated_at: new Date().toISOString()
    });
    assert.equal(upRes.error, null);

    const selRes = await mockDb.from('admin_config').select('value').eq('key', 'fourcuts:admin:config').maybeSingle();
    assert.equal(selRes.error, null);
    assert.deepEqual(selRes.data.value, configPayload);
  });
});


