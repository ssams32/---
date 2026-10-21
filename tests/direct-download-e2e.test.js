// Integration test: the no-login QR direct download must work end to end.
//
// Boots the real local server (mock clients), uploads a photo through the
// real session flow, then fetches the QR pageUrl with NO cookies — exactly
// what a phone does after scanning — and requires a real JPEG attachment.
//
// This covers the storage.download() path that the white-box tests in
// direct-download.test.js cannot see (the mock storage once lacked a
// download() method, which made the production /file route return 500).
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const path = require('path');

const PORT = 3217;
const BASE = `http://127.0.0.1:${PORT}`;

async function waitForServer(proc) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) throw new Error(`server exited early: ${proc.exitCode}`);
    try {
      const r = await fetch(`${BASE}/api/admin/check`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not start in time');
}

test('no-login direct download returns the uploaded JPEG', { timeout: 60000 }, async (t) => {
  const proc = spawn('node', ['local-server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), LOCAL_MOCK: 'true' },
    stdio: 'ignore',
  });
  t.after(() => proc.kill('SIGKILL'));
  await waitForServer(proc);

  // 1. Shooting session (what the kiosk does before uploading)
  const sessionRes = await fetch(`${BASE}/api/session`);
  assert.equal(sessionRes.status, 200);
  const { csrfToken } = await sessionRes.json();
  const cookie = sessionRes.headers.get('set-cookie');
  assert.ok(cookie && csrfToken, 'session must issue cookie + csrf');

  // 2. Upload a real JPEG (master-card size)
  const sharp = require('sharp');
  const jpeg = await sharp({
    create: { width: 1200, height: 1360, channels: 3, background: { r: 140, g: 170, b: 220 } },
  }).jpeg({ quality: 85 }).toBuffer();
  const form = new FormData();
  form.append('photo', new Blob([jpeg], { type: 'image/jpeg' }), 'photo.jpg');
  const upRes = await fetch(`${BASE}/api/photos`, {
    method: 'POST',
    headers: { cookie, 'x-csrf-token': csrfToken },
    body: form,
  });
  assert.equal(upRes.status, 201, `upload failed: ${upRes.status} ${await upRes.clone().text().catch(() => '')}`);
  const { pageUrl } = await upRes.json();
  assert.ok(pageUrl.includes('/api/photo/') && pageUrl.includes('/file?t='), 'pageUrl must be the direct file URL');

  // 3. Fetch the QR URL with NO cookies (phone scan) -> real JPEG attachment
  const dlRes = await fetch(pageUrl.replace(/^https?:\/\/[^/]+/, BASE));
  assert.equal(dlRes.status, 200, `direct download failed: ${dlRes.status}`);
  assert.match(dlRes.headers.get('content-type') || '', /image\/jpeg/);
  assert.match(dlRes.headers.get('content-disposition') || '', /attachment/);
  const body = Buffer.from(await dlRes.arrayBuffer());
  assert.ok(body.length > 1000, 'downloaded body too small');
  assert.equal(body[0], 0xff);
  assert.equal(body[1], 0xd8, 'downloaded body must be a JPEG (SOI marker)');

  // 4. A tampered token must be rejected
  const badRes = await fetch(pageUrl.replace(/^https?:\/\/[^/]+/, BASE).replace(/t=[^&]+/, 't=bad.token'));
  assert.equal(badRes.status, 404, 'tampered token must be rejected');
});
