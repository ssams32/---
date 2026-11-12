const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

let savedCtx = null;

function loadPolyfill() {
  delete require.cache[require.resolve('../public/roundrect-polyfill.js')];
  require('../public/roundrect-polyfill.js');
}

beforeEach(() => {
  savedCtx = global.CanvasRenderingContext2D;
});

afterEach(() => {
  if (savedCtx === undefined) delete global.CanvasRenderingContext2D;
  else global.CanvasRenderingContext2D = savedCtx;
});

function recordingCtx() {
  const calls = [];
  return {
    calls,
    moveTo: (x, y) => calls.push(['moveTo', x, y]),
    lineTo: (x, y) => calls.push(['lineTo', x, y]),
    arcTo: (x1, y1, x2, y2, r) => calls.push(['arcTo', x1, y1, x2, y2, r]),
    closePath: () => calls.push(['closePath'])
  };
}

describe('roundrect-polyfill: 구형 Safari(iOS 15 이하) 대응', () => {
  test('roundRect가 없을 때만 폴리필을 채움', () => {
    global.CanvasRenderingContext2D = function () {};
    global.CanvasRenderingContext2D.prototype = {};
    loadPolyfill();
    assert.equal(typeof global.CanvasRenderingContext2D.prototype.roundRect, 'function');
  });

  test('네이티브 roundRect가 있으면 건드리지 않음', () => {
    const native = function () {};
    global.CanvasRenderingContext2D = function () {};
    global.CanvasRenderingContext2D.prototype = { roundRect: native };
    loadPolyfill();
    assert.equal(global.CanvasRenderingContext2D.prototype.roundRect, native);
  });

  test('숫자 반경으로 네 모서리 둥근 사각형 경로를 그림', () => {
    global.CanvasRenderingContext2D = function () {};
    global.CanvasRenderingContext2D.prototype = {};
    loadPolyfill();
    const ctx = recordingCtx();
    const ret = global.CanvasRenderingContext2D.prototype.roundRect.call(ctx, 10, 20, 100, 50, 8);
    assert.equal(ret, ctx);
    assert.deepEqual(ctx.calls, [
      ['moveTo', 18, 20],
      ['lineTo', 102, 20],
      ['arcTo', 110, 20, 110, 28, 8],
      ['lineTo', 110, 62],
      ['arcTo', 110, 70, 102, 70, 8],
      ['lineTo', 18, 70],
      ['arcTo', 10, 70, 10, 62, 8],
      ['lineTo', 10, 28],
      ['arcTo', 10, 20, 18, 20, 8],
      ['closePath']
    ]);
  });

  test('객체 반경({tl,tr,br,bl})도 처리', () => {
    global.CanvasRenderingContext2D = function () {};
    global.CanvasRenderingContext2D.prototype = {};
    loadPolyfill();
    const ctx = recordingCtx();
    global.CanvasRenderingContext2D.prototype.roundRect.call(ctx, 0, 0, 40, 30, { tl: 5, tr: 10, br: 15, bl: 20 });
    assert.equal(ctx.calls[0][0], 'moveTo');
    assert.equal(ctx.calls[0][1], 5); // x + tl
    assert.equal(ctx.calls[0][2], 0);
  });
});
