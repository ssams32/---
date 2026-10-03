// Regression test: QR download must work without any login or cookies.
//
// The QR code points directly at GET /api/photo/:id/file?t={token}, which
// verifies the stateless HMAC download token from the query string and
// streams the JPEG with Content-Disposition: attachment. No Google login,
// no cookies, no JS page in between — works on iPhone Safari and Android
// Chrome by just scanning.
//
// Static white-box test over api/index.js (no server needed).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const apiPath = path.join(__dirname, '..', 'api', 'index.js');
const src = fs.readFileSync(apiPath, 'utf8');

function routeBlock(route) {
  const marker = `app.get('${route}'`;
  const start = src.indexOf(marker);
  assert.ok(start !== -1, `route ${route} not found in api/index.js`);
  // crude block extraction: from marker to the next top-level app.<method>(
  const rest = src.slice(start);
  const next = rest.search(/\napp\.(get|post|put|delete|use)\(/);
  return next === -1 ? rest : rest.slice(0, next);
}

test('direct file download route exists', () => {
  routeBlock('/api/photo/:id/file');
});

test('file route does NOT require the cookie session (no login)', () => {
  const block = routeBlock('/api/photo/:id/file');
  assert.ok(
    !block.includes('downloadRequired'),
    'the file route must not use the cookie-based downloadRequired middleware'
  );
});

test('file route verifies the stateless token from the query string', () => {
  const block = routeBlock('/api/photo/:id/file');
  assert.ok(
    /parseDownloadToken\([^)]*req\.query\.t/.test(block),
    'the file route must verify parseDownloadToken(..., req.query.t)'
  );
});

test('file route streams as an attachment download', () => {
  const block = routeBlock('/api/photo/:id/file');
  assert.ok(block.includes('Content-Disposition'), 'must set Content-Disposition');
  assert.ok(block.includes('attachment'), 'Content-Disposition must be attachment');
  assert.ok(block.includes('image/jpeg'), 'must serve image/jpeg');
});

test('QR pageUrl points at the direct file URL', () => {
  assert.ok(
    /pageUrl=`\$\{baseUrl\}\/api\/photo\/\$\{photoId\}\/file\?t=/.test(src),
    'the QR-encoded pageUrl must be the direct /api/photo/:id/file?t= URL'
  );
});
