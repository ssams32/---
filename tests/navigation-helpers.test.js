// Regression test: every internal helper called by the screen-navigation and
// camera flow must actually be defined.
//
// Background (2026-10-03): commit 3525fbb deleted the `updateProgressRail`
// definition but left the call inside show(). Every show() for a non-start
// screen then threw `ReferenceError: updateProgressRail is not defined`,
// which aborted initializeCamera() before startShootingSequence() ran —
// the camera screen opened but auto-shoot never started and no countdown
// appeared. The error was swallowed by handleStartAction's try/catch, so it
// failed silently.
//
// The browser code cannot run under node:test (no DOM), so this is a static
// white-box test over public/app.js source.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '..', 'public', 'app.js');
const src = fs.readFileSync(appPath, 'utf8');

// Critical helpers: called during show()/initializeCamera()/startShootingSequence().
// If any of these is missing, the shooting flow dies silently.
const CRITICAL_HELPERS = [
  'updateProgressRail', // called by show()
  'renderProgressRail', // called on boot / config load
  'initializeCamera',
  'startShootingSequence',
  'updateCameraCropGuide',
  'show',
];

function isDefined(name) {
  const patterns = [
    new RegExp(`function\\s+${name}\\s*\\(`),
    new RegExp(`const\\s+${name}\\s*=\\s*(?:async\\s*)?\\(`),
    new RegExp(`const\\s+${name}\\s*=\\s*(?:async\\s*)?function`),
    new RegExp(`let\\s+${name}\\s*=\\s*(?:async\\s*)?\\(`),
  ];
  return patterns.some((re) => re.test(src));
}

for (const name of CRITICAL_HELPERS) {
  test(`critical helper '${name}' is defined in app.js`, () => {
    assert.ok(isDefined(name), `'${name}' is called but has no definition in public/app.js`);
  });
}

test('show() never calls an undefined progress-rail updater', () => {
  // Extract show() body and collect bare function calls inside it.
  const start = src.indexOf('function show(screenId)');
  assert.ok(start !== -1, 'show() not found');
  const braceOpen = src.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = braceOpen; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  assert.ok(end !== -1, 'could not find end of show()');
  const body = src.slice(braceOpen, end + 1);
  const calls = [...body.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]);
  const domHelpers = new Set(['$', '$$']);
  const keywords = new Set([
    'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'await',
    'typeof', 'new', 'delete', 'void', 'in', 'of', 'else', 'do', 'try', 'finally',
  ]);
  for (const c of calls) {
    if (domHelpers.has(c) || keywords.has(c)) continue;
    assert.ok(
      isDefined(c),
      `show() calls '${c}()' but it has no definition in public/app.js`
    );
  }
});
