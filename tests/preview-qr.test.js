// Regression test: QR code synchronization on dedicated print preview screen.
//
// Background: Fast-lane participants need to download their 4-cut photos via QR
// code while viewing the print preview (#preview), without waiting for the final #result screen.
//
// Static white-box test over public/app.js & public/style.css.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '..', 'public', 'app.js');
const appSrc = fs.readFileSync(appPath, 'utf8');

const cssPath = path.join(__dirname, '..', 'public', 'style.css');
const cssSrc = fs.readFileSync(cssPath, 'utf8');

function extractFunctionBody(src, fnSignature) {
  const start = src.indexOf(fnSignature);
  assert.ok(start !== -1, `${fnSignature} not found in source`);
  const braceOpen = src.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = braceOpen; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  assert.ok(end !== -1, `could not find closing brace for ${fnSignature}`);
  return src.slice(braceOpen, end + 1);
}

const workflowBody = extractFunctionBody(appSrc, 'async function executeCompletionWorkflow(');

test('executeCompletionWorkflow references #previewQr element', () => {
  assert.ok(
    workflowBody.includes('#previewQr'),
    'executeCompletionWorkflow must reference #previewQr element'
  );
});

test('#previewQr is set in data.qr response path', () => {
  assert.ok(
    /(?:previewQr|previewQrImg)\.src\s*=\s*data\.qr/.test(workflowBody),
    '#previewQr must receive data.qr when server returns data.qr'
  );
});

test('upload failure shows #uploadErrorBox without external fallback', () => {
  assert.ok(
    workflowBody.includes('#uploadErrorBox'),
    'failure path must display #uploadErrorBox'
  );
  assert.ok(
    !workflowBody.includes('catbox.moe') && !workflowBody.includes('api.qrserver.com'),
    'external upload and QR fallbacks must be completely removed'
  );
});

test('no activation guidance remains (activation feature removed)', () => {
  assert.ok(
    !workflowBody.includes('/activate 페이지에서 기기 활성화가 필요합니다'),
    'activation guidance must be removed together with the activation feature'
  );
});

test('.preview-qr-strip styles are properly defined in style.css', () => {
  assert.ok(cssSrc.includes('.preview-qr-strip'), '.preview-qr-strip must be styled');
  assert.ok(cssSrc.includes('.preview-qr-img'), '.preview-qr-img must be styled');
  assert.ok(cssSrc.includes('.preview-qr-texts'), '.preview-qr-texts must be styled');

  const stripMatch = cssSrc.match(/\.preview-qr-strip\s*\{([^}]+)\}/);
  assert.ok(stripMatch, '.preview-qr-strip block found');
  assert.ok(
    /flex:\s*none/.test(stripMatch[1]),
    '.preview-qr-strip must specify flex: none'
  );
});
