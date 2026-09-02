const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { createAdminCookie, verifyAdminCookie } = require('../server/crypto');
const { validateAndNormalizeBackground } = require('../server/image');

test('admin session token creates and verifies securely', () => {
  const secret = 'test-secret-key-that-is-long-enough-32bytes!';
  const session = createAdminCookie(secret, 3600);
  assert.ok(session.cookie);
  assert.ok(session.csrf);

  const verified = verifyAdminCookie(secret, session.cookie);
  assert.ok(verified);
  assert.equal(verified.csrf, session.csrf);

  // Tampering test
  const tampered = session.cookie.slice(0, -3) + 'abc';
  assert.equal(verifyAdminCookie(secret, tampered), null);

  // Wrong secret test
  const wrongSecret = 'different-secret-key-32bytes-long-here!!';
  assert.equal(verifyAdminCookie(wrongSecret, session.cookie), null);
});

test('validateAndNormalizeBackground accepts valid jpeg and png', async () => {
  // Test JPEG
  const jpegBuf = await sharp({
    create: { width: 1200, height: 1600, channels: 3, background: '#7452aa' }
  }).jpeg().toBuffer();

  const resJpeg = await validateAndNormalizeBackground(jpegBuf);
  assert.equal(resJpeg.format, 'jpeg');
  assert.ok(resJpeg.buffer.length > 100);

  // Test PNG with transparency
  const pngBuf = await sharp({
    create: { width: 1200, height: 1600, channels: 4, background: { r: 100, g: 50, b: 200, alpha: 0.5 } }
  }).png().toBuffer();

  const resPng = await validateAndNormalizeBackground(pngBuf);
  assert.equal(resPng.format, 'png');
  assert.ok(resPng.buffer.length > 100);
});

test('validateAndNormalizeBackground rejects invalid or too small buffer', async () => {
  await assert.rejects(
    async () => validateAndNormalizeBackground(Buffer.from('not an image')),
    /빈 이미지|손상되었거나/
  );

  const tooSmall = await sharp({
    create: { width: 100, height: 100, channels: 3, background: '#fff' }
  }).png({ compressionLevel: 0 }).toBuffer(); // Large uncompressed buffer > 1024 bytes

  await assert.rejects(
    async () => validateAndNormalizeBackground(tooSmall),
    /지원하지 않는 이미지 크기|빈 이미지/
  );
});
