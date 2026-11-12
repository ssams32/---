const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const ENV_KEYS = ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_DRIVE_REFRESH_TOKEN'];
let savedEnv = {};
let savedFetch = null;

function loadModule() {
  delete require.cache[require.resolve('../server/drive-backup')];
  return require('../server/drive-backup');
}

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k]; }
  savedFetch = global.fetch;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k];
  }
  global.fetch = savedFetch;
});

describe('drive-backup: env gate', () => {
  test('자격증명이 없으면 비활성이고 업로드를 시도하지 않음', async () => {
    const mod = loadModule();
    assert.equal(mod.isDriveBackupEnabled(), false);
    let called = false;
    global.fetch = async () => { called = true; throw new Error('must not be called'); };
    const ok = await mod.backupPhotoToDrive(Buffer.from('x'), 'a.jpg');
    assert.equal(ok, false);
    assert.equal(called, false);
    const quiet = await mod.backupPhotoQuietly(Buffer.from('x'), 'a.jpg');
    assert.equal(quiet, false);
  });
});

describe('drive-backup: upload flow (fetch stub)', () => {
  test('토큰 교환 → 폴더 생성 → 멀티파트 업로드 순서로 동작', async () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'csecret';
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN = 'rtoken';
    const mod = loadModule();
    mod._resetCacheForTest();
    assert.equal(mod.isDriveBackupEnabled(), true);

    const calls = [];
    global.fetch = async (url, opts = {}) => {
      calls.push({ url: String(url), opts });
      const u = String(url);
      if (u.includes('oauth2.googleapis.com/token')) {
        return { ok: true, json: async () => ({ access_token: 'at-123', expires_in: 3600 }) };
      }
      if (u.includes('upload/drive/v3/files')) {
        return { ok: true, json: async () => ({ id: 'file-1' }) };
      }
      if ((opts.method || 'GET') === 'GET' && u.includes('drive/v3/files')) {
        return { ok: true, json: async () => ({ files: [] }) }; // folder not found
      }
      if ((opts.method || 'GET') === 'POST' && u.includes('drive/v3/files')) {
        const body = JSON.parse(opts.body);
        return { ok: true, json: async () => ({ id: 'folder-' + body.name }) };
      }
      throw new Error('unexpected fetch: ' + u);
    };

    const ok = await mod.backupPhotoToDrive(Buffer.from([0xff, 0xd8, 0xff]), 'photo-1.jpg');
    assert.equal(ok, true);

    const upload = calls.find(c => c.url.includes('upload/drive/v3/files'));
    assert.ok(upload, '업로드 호출이 있어야 함');
    assert.equal(upload.opts.headers.Authorization, 'Bearer at-123');
    assert.match(upload.opts.headers['Content-Type'], /multipart\/related; boundary=/);
    assert.ok(Buffer.isBuffer(upload.opts.body));
    assert.ok(upload.opts.body.includes(Buffer.from('photo-1.jpg')), '파일명이 메타데이터에 포함되어야 함');

    const folderCreates = calls.filter(c => (c.opts.method || 'GET') === 'POST' && c.url.includes('drive/v3/files') && !c.url.includes('upload'));
    assert.ok(folderCreates.length >= 2, '루트 폴더와 날짜 폴더가 생성되어야 함');
  });

  test('업로드 실패 시 backupPhotoQuietly는 throw하지 않고 false 반환', async () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'csecret';
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN = 'rtoken';
    const mod = loadModule();
    mod._resetCacheForTest();
    global.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
    const ok = await mod.backupPhotoQuietly(Buffer.from('x'), 'a.jpg');
    assert.equal(ok, false);
  });
});
