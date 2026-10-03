// Regression test: startShootingSequence must reset state.isShooting on EVERY exit path.
//
// Background: early `return` statements on `run !== state.runId` used to leave
// `state.isShooting === true` forever, so subsequent calls hit the
// `if (state.isShooting) return;` guard and silently did nothing
// (camera opens, but the auto 6-shot sequence never starts).
//
// The browser code cannot run under node:test (no DOM), so this is a static
// white-box test over public/app.js source. It fails if the guard/fix is removed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '..', 'public', 'app.js');
const src = fs.readFileSync(appPath, 'utf8');

// Extract the startShootingSequence function body (from its definition to the
// matching closing brace at the same nesting level).
function extractFunctionBody(source, name) {
  const startMarker = `async function ${name}()`;
  const start = source.indexOf(startMarker);
  assert.ok(start !== -1, `${name} not found in app.js`);
  const braceOpen = source.indexOf('{', start);
  let depth = 0;
  for (let i = braceOpen; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(braceOpen, i + 1);
    }
  }
  throw new Error(`could not find end of ${name}`);
}

test('startShootingSequence has an entry guard on state.isShooting', () => {
  const body = extractFunctionBody(src, 'startShootingSequence');
  assert.ok(
    /if\s*\(\s*state\.isShooting\s*\)\s*return;/.test(body),
    'entry guard `if (state.isShooting) return;` must exist'
  );
});

test('startShootingSequence resets isShooting in a finally block', () => {
  const body = extractFunctionBody(src, 'startShootingSequence');
  assert.ok(
    /finally\s*\{[^}]*state\.isShooting\s*=\s*false/.test(body),
    'a finally block must reset state.isShooting = false so early returns ' +
    '(run !== state.runId) cannot leave the flag stuck'
  );
});

test('early run-mismatch returns stay inside the try protected by finally', () => {
  const body = extractFunctionBody(src, 'startShootingSequence');
  const tryIdx = body.indexOf('try {');
  const finallyIdx = body.lastIndexOf('finally');
  assert.ok(tryIdx !== -1 && finallyIdx > tryIdx, 'try/finally structure must exist');
  const earlyReturns = [...body.matchAll(/if\s*\(\s*run\s*!==\s*state\.runId\s*\)\s*return;/g)];
  assert.ok(earlyReturns.length > 0, 'expected run-mismatch early returns to exist');
  for (const m of earlyReturns) {
    assert.ok(
      m.index > tryIdx && m.index < finallyIdx,
      'every `if (run !== state.runId) return;` must be inside the try block'
    );
  }
});
