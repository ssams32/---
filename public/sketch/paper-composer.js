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
   * Generate procedural deterministic cold-press watercolor paper texture
   * Emulates cold-press cotton paper with gentle undulating cotton clouds (macro)
   * and toothy fiber pockets (micro) that catch sedimenting watercolor pigment.
   */
  function generatePaperTexture(width, height, paperTint, seed, paperStrength) {
    var rng = new PRNG(seed || 'paper-texture-seed');
    var length = width * height;
    var paper = new Uint8ClampedArray(length * 4);
    var baseR = paperTint[0] || 250;
    var baseG = paperTint[1] || 247;
    var baseB = paperTint[2] || 238;
    var pStrength = (typeof paperStrength === 'number') ? paperStrength : 0.45;
    var grainScale = 6.0 + (pStrength * 16.0);

    // 1. Low-frequency undulating cotton fiber clouds (32x24 coarse grid)
    var gridW = Math.max(4, Math.min(32, Math.floor(width / 16)));
    var gridH = Math.max(4, Math.min(24, Math.floor(height / 16)));
    var clouds = new Float32Array(gridW * gridH);
    for (var ci = 0; ci < clouds.length; ci++) {
      clouds[ci] = (rng.next() - 0.5) * (grainScale * 0.9);
    }

    // 2. High-frequency fiber tooth
    for (var y = 0; y < height; y++) {
      var gy = (y / Math.max(1, height - 1)) * (gridH - 1);
      var y0 = Math.floor(gy);
      var y1 = Math.min(gridH - 1, y0 + 1);
      var fy = gy - y0;

      for (var x = 0; x < width; x++) {
        var gx = (x / Math.max(1, width - 1)) * (gridW - 1);
        var x0 = Math.floor(gx);
        var x1 = Math.min(gridW - 1, x0 + 1);
        var fx = gx - x0;

        var c00 = clouds[y0 * gridW + x0];
        var c10 = clouds[y0 * gridW + x1];
        var c01 = clouds[y1 * gridW + x0];
        var c11 = clouds[y1 * gridW + x1];
        var cloudVal = (c00 * (1 - fx) + c10 * fx) * (1 - fy) + (c01 * (1 - fx) + c11 * fx) * fy;

        var microTooth = (rng.next() - 0.5) * grainScale;
        // Rare cotton fleck
        if (rng.next() < 0.002) {
          microTooth -= (14 + pStrength * 10);
        }

        var totalGrain = cloudVal * 0.5 + microTooth * 0.6;
        var p = (y * width + x) * 4;
        paper[p] = clamp(Math.round(baseR + totalGrain), 0, 255);
        paper[p + 1] = clamp(Math.round(baseG + totalGrain * 0.94), 0, 255);
        paper[p + 2] = clamp(Math.round(baseB + totalGrain * 0.86), 0, 255);
        paper[p + 3] = 255;
      }
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

      var paperNormR = pr / 255.0;
      var paperNormG = pg / 255.0;
      var paperNormB = pb / 255.0;

      // Color field sample normalized
      var pNormR = cr / 255.0;
      var pNormG = cg / 255.0;
      var pNormB = cb / 255.0;

      // Subtractive Watercolor Glaze:
      // Physically models light penetrating transparent pigment, reflecting off paper tooth,
      // and re-emerging. White highlights are paper white; darks sink into paper crevices.
      var glazeR = paperNormR * (1.0 - (1.0 - pNormR) * colorStrength);
      var glazeG = paperNormG * (1.0 - (1.0 - pNormG) * colorStrength);
      var glazeB = paperNormB * (1.0 - (1.0 - pNormB) * colorStrength);

      // Dip-pen ink absorbed into paper fibers & watercolor wash
      var inkNormR = ink[0] / 255.0;
      var inkNormG = ink[1] / 255.0;
      var inkNormB = ink[2] / 255.0;

      var finalR = (glazeR * (1.0 - edgeAlpha) + inkNormR * paperNormR * edgeAlpha) * 255.0;
      var finalG = (glazeG * (1.0 - edgeAlpha) + inkNormG * paperNormG * edgeAlpha) * 255.0;
      var finalB = (glazeB * (1.0 - edgeAlpha) + inkNormB * paperNormB * edgeAlpha) * 255.0;

      // If full frame fallback, add soft organic watercolor vignette fade near outer borders
      var effAlpha = fgAlpha;
      if (isFullFrame && effAlpha >= 0.99) {
        var pxCoord = i % width;
        var pyCoord = Math.floor(i / width);
        var dx = (pxCoord - cx) / rx;
        var dy = (pyCoord - cy) / ry;
        var dDist = Math.sqrt(dx * dx + dy * dy);
        if (dDist > 0.65) {
          effAlpha = clamp(1.0 - (dDist - 0.65) / 0.35, 0.0, 1.0);
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
