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
  const dataQrMarker = 'if (data && data.qr)';
  const dataQrStart = workflowBody.indexOf(dataQrMarker);
  assert.ok(dataQrStart !== -1, 'if (data && data.qr) branch not found');
  const elseMarker = '} else {';
  const dataQrEnd = workflowBody.indexOf(elseMarker, dataQrStart);
  assert.ok(dataQrEnd !== -1, 'else branch marker not found after data.qr check');

  const branch = workflowBody.slice(dataQrStart, dataQrEnd);
  assert.ok(
    /(?:previewQr|previewQrImg)\.src\s*=\s*data\.qr/.test(branch) ||
    /setQrSrc\s*\(\s*data\.qr\s*\)/.test(branch),
    '#previewQr must receive data.qr when server returns data.qr'
  );
});

test('#previewQr is set in QRCode.toDataURL fallback path', () => {
  const elseMarker = '} else {';
  const elseStart = workflowBody.indexOf(elseMarker);
  assert.ok(elseStart !== -1, 'else branch not found');
  const elseBranch = workflowBody.slice(elseStart);

  assert.ok(
    elseBranch.includes('toDataURL'),
    'fallback must attempt window.QRCode.toDataURL'
  );

  assert.ok(
    /(?:previewQr|previewQrImg)\.src\s*=\s*qrDataUrl/.test(elseBranch) ||
    /setQrSrc\s*\(\s*qrDataUrl\s*\)/.test(elseBranch),
    '#previewQr must receive qrDataUrl on successful toDataURL generation'
  );
});

test('#previewQr is set in qrserver fallback catch path', () => {
  const elseMarker = '} else {';
  const elseStart = workflowBody.indexOf(elseMarker);
  assert.ok(elseStart !== -1, 'else branch not found');
  const elseBranch = workflowBody.slice(elseStart);

  assert.ok(
    elseBranch.includes('api.qrserver.com'),
    'fallback catch must invoke api.qrserver.com'
  );

  const catchBlock = elseBranch.slice(elseBranch.indexOf('catch'));
  assert.ok(
    /(?:previewQr|previewQrImg)\.src\s*=/.test(catchBlock) ||
    /setQrSrc\s*\(/.test(catchBlock),
    '#previewQr must receive qrserver fallback URL inside catch block'
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
