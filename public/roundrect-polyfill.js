// CanvasRenderingContext2D.roundRect polyfill.
//
// Safari 16 미만(구형 iPad의 iOS 15 이하)에는 roundRect가 없어
// 완성 합성 단계가 "ctx.roundRect is not a function"으로 멈춥니다.
// (2026-11-12 현장 iPad에서 확인됨.)
//
// 네이티브가 있으면 아무것도 하지 않고, 없을 때만 arcTo 기반으로
// 같은 경로를 그리는 구현을 채워 넣습니다. MDN 문서의 폴리필과
// 같은 방식이며, beginPath()를 호출하지 않으므로 기존 호출 코드
// (beginPath → roundRect → fill/clip)를 그대로 쓸 수 있습니다.
(function () {
  if (typeof CanvasRenderingContext2D === 'undefined') return;
  if (typeof CanvasRenderingContext2D.prototype.roundRect === 'function') return;

  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, radii) {
    var r;
    if (typeof radii === 'number') {
      r = { tl: radii, tr: radii, br: radii, bl: radii };
    } else {
      r = { tl: 0, tr: 0, br: 0, bl: 0 };
      if (radii) {
        if (typeof radii.tl === 'number') r.tl = radii.tl;
        if (typeof radii.tr === 'number') r.tr = radii.tr;
        if (typeof radii.br === 'number') r.br = radii.br;
        if (typeof radii.bl === 'number') r.bl = radii.bl;
      }
    }
    this.moveTo(x + r.tl, y);
    this.lineTo(x + w - r.tr, y);
    this.arcTo(x + w, y, x + w, y + r.tr, r.tr);
    this.lineTo(x + w, y + h - r.br);
    this.arcTo(x + w, y + h, x + w - r.br, y + h, r.br);
    this.lineTo(x + r.bl, y + h);
    this.arcTo(x, y + h, x, y + h - r.bl, r.bl);
    this.lineTo(x, y + r.tl);
    this.arcTo(x, y, x + r.tl, y, r.tl);
    this.closePath();
    return this;
  };
})();

// Node 테스트에서 require()로 읽을 수 있게 합니다 (브라우저에서는 무의미).
if (typeof module !== 'undefined' && module.exports) module.exports = {};
