/**
 * paper-composer.js
 * Paper Illustration Composition, Uniform Geometry Scaling Invariants,
 * Deterministic Paper Texture, Wide Group Mode, and Watercolor Blending.
 */
(function(exports) {
  'use strict';

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  // Seedable deterministic pseudorandom number generator (Xorshift32)
  function PRNG(seed) {
    var s = 0;
    if (typeof seed === 'string') {
      for (var i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) | 0;
    } else {
      s = (seed || 123456789) | 0;
    }
    this.state = s === 0 ? 1 : s;
  }
  PRNG.prototype.next = function() {
    var x = this.state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    this.state = x;
    return ((x >>> 0) / 4294967296);
  };

  /**
   * Generate procedural deterministic paper texture
   */
  function generatePaperTexture(width, height, paperTint, seed, paperStrength) {
    var rng = new PRNG(seed || 'paper-texture-seed');
    var length = width * height;
    var paper = new Uint8ClampedArray(length * 4);
    var baseR = paperTint[0] || 247;
    var baseG = paperTint[1] || 242;
    var baseB = paperTint[2] || 230;
    var pStrength = (typeof paperStrength === 'number') ? paperStrength : 0.45;
    var grainScale = 8.0 + (pStrength * 14.0);

    for (var i = 0; i < length; i++) {
      var p = i * 4;
      // Gentle grain variation modulated by paperStrength
      var n = (rng.next() - 0.5) * grainScale;
      // Rare fibrous fleck
      if (rng.next() < 0.003) {
        n -= (16 + pStrength * 12);
      }

      paper[p] = clamp(Math.round(baseR + n), 0, 255);
      paper[p + 1] = clamp(Math.round(baseG + n * 0.9), 0, 255);
      paper[p + 2] = clamp(Math.round(baseB + n * 0.8), 0, 255);
      paper[p + 3] = 255;
    }
    return paper;
  }

  /**
   * Calculate Uniform Scaling Geometry Invariants
   * Strict Section 18 rule: Same uniformScale applies to X and Y.
   * Zero horizontal compression, zero vertical stretching.
   */
  function calculateCompositionTransform(groupBounds, canvasWidth, canvasHeight) {
    var gw = Math.max(1, groupBounds.width);
    var gh = Math.max(1, groupBounds.height);
    var groupAspect = gw / gh;

    // Margins from Section 22 & 23
    var minMarginLeft = canvasWidth * 0.08;
    var minMarginRight = canvasWidth * 0.08;
    var minMarginTop = canvasHeight * 0.10;
    var minMarginBottom = canvasHeight * 0.14;

    var maxAvailW = canvasWidth - (minMarginLeft + minMarginRight);
    var maxAvailH = canvasHeight - (minMarginTop + minMarginBottom);

    // Group density target width ratio (Section 22 & 23)
    var isWideGroup = (groupAspect >= 1.25);
    var targetWidthRatio = 0.74;
    if (groupAspect < 0.90) {
      targetWidthRatio = 0.65; // narrow group
    } else if (isWideGroup) {
      targetWidthRatio = 0.84; // wide group mode
    }

    var targetW = canvasWidth * targetWidthRatio;
    var scaleByWidth = targetW / gw;
    var scaleByHeight = maxAvailH / gh;

    // Strict Uniform Scale
    var uniformScale = Math.min(scaleByWidth, scaleByHeight);

    var scaledW = gw * uniformScale;
    var scaledH = gh * uniformScale;

    // Centered placement inside margins
    var offsetX = (canvasWidth - scaledW) / 2.0;
    var offsetY = minMarginTop + (maxAvailH - scaledH) / 2.0;

    return {
      uniformScale: uniformScale,
      offsetX: offsetX,
      offsetY: offsetY,
      isWideGroup: isWideGroup,
      scaledWidth: scaledW,
      scaledHeight: scaledH
    };
  }

  /**
   * Compose Sketch Artwork with Paper and Ink
   */
  function composeSketch(colorField, classifiedEdges, mask, width, height, options) {
    options = options || {};
    var ink = options.inkColor || [44, 38, 36]; // Warm dip-pen espresso ink
    var lineStrength = (typeof options.lineStrength === 'number') ? options.lineStrength : 0.85;
    var colorStrength = (typeof options.colorStrength === 'number') ? options.colorStrength : 0.80;
    var paperStrength = (typeof options.paperStrength === 'number') ? options.paperStrength : 0.45;
    var paperTint = options.paperTint || [248, 245, 238];
    var seed = options.seed || 'sketch-seed';
    var isFullFrame = options.isFullFrame || false;

    var paper = generatePaperTexture(width, height, paperTint, seed, paperStrength);
    var output = new Uint8ClampedArray(width * height * 4);
    var length = width * height;

    // Precalculate vignette parameters if full frame mode
    var cx = width * 0.50;
    var cy = height * 0.48;
    var rx = width * 0.48;
    var ry = height * 0.49;

    for (var i = 0; i < length; i++) {
      var p = i * 4;
      var fgAlpha = mask ? mask[i] : 1.0;
      var edgeAlpha = (classifiedEdges ? classifiedEdges[i] : 0.0) * lineStrength;

      // Color field sample
      var cr = colorField[p];
      var cg = colorField[p + 1];
      var cb = colorField[p + 2];

      // Paper background sample
      var pr = paper[p];
      var pg = paper[p + 1];
      var pb = paper[p + 2];

      // Luminous watercolor pigment boost
      var wr = clamp(Math.round(cr * 1.04 + 6), 0, 255);
      var wg = clamp(Math.round(cg * 1.02 + 4), 0, 255);
      var wb = clamp(Math.round(cb * 1.01 + 2), 0, 255);

      // Blend watercolor wash onto paper with colorStrength
      var blendedR = pr + (wr - pr) * colorStrength;
      var blendedG = pg + (wg - pg) * colorStrength;
      var blendedB = pb + (wb - pb) * colorStrength;

      // Wet ink layer: dip-pen ink interacts with watercolor pigment
      var finalR = blendedR * (1.0 - edgeAlpha) + ink[0] * edgeAlpha;
      var finalG = blendedG * (1.0 - edgeAlpha) + ink[1] * edgeAlpha;
      var finalB = blendedB * (1.0 - edgeAlpha) + ink[2] * edgeAlpha;

      // If full frame fallback, add subtle watercolor vignette fade near outer borders
      var effAlpha = fgAlpha;
      if (isFullFrame && effAlpha >= 0.99) {
        var pxCoord = i % width;
        var pyCoord = Math.floor(i / width);
        var dx = (pxCoord - cx) / rx;
        var dy = (pyCoord - cy) / ry;
        var dDist = Math.sqrt(dx * dx + dy * dy);
        if (dDist > 0.72) {
          effAlpha = clamp(1.0 - (dDist - 0.72) / 0.28, 0.0, 1.0);
          effAlpha = Math.pow(effAlpha, 1.4);
        }
      }

      // Composite foreground watercolor wash onto paper base
      output[p] = clamp(Math.round(pr + (finalR - pr) * effAlpha), 0, 255);
      output[p + 1] = clamp(Math.round(pg + (finalG - pg) * effAlpha), 0, 255);
      output[p + 2] = clamp(Math.round(pb + (finalB - pb) * effAlpha), 0, 255);
      output[p + 3] = 255;
    }

    return output;
  }

  function isWideGroupMode(groupBounds) {
    if (!groupBounds) return false;
    var gw = groupBounds.width || (groupBounds.maxX - groupBounds.minX + 1);
    var gh = groupBounds.height || (groupBounds.maxY - groupBounds.minY + 1);
    return (gw / Math.max(1, gh)) >= 1.25;
  }

  exports.generatePaperTexture = generatePaperTexture;
  exports.calculateCompositionTransform = calculateCompositionTransform;
  exports.composeSketch = composeSketch;
  exports.isWideGroupMode = isWideGroupMode;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.PaperComposer = {}));
