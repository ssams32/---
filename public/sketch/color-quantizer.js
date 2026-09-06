/**
 * color-quantizer.js
 * Shared Group Palette Color Quantization & Color Simplification.
 * Establishes a unified exposure and tonal baseline across all group members.
 */
(function(exports) {
  'use strict';

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  /**
   * Deterministic 3D Color Box for Median Cut
   */
  function ColorBox(colors) {
    this.colors = colors;
    this.minR = 255; this.maxR = 0;
    this.minG = 255; this.maxG = 0;
    this.minB = 255; this.maxB = 0;

    for (var i = 0; i < colors.length; i++) {
      var c = colors[i];
      if (c[0] < this.minR) this.minR = c[0];
      if (c[0] > this.maxR) this.maxR = c[0];
      if (c[1] < this.minG) this.minG = c[1];
      if (c[1] > this.maxG) this.maxG = c[1];
      if (c[2] < this.minB) this.minB = c[2];
      if (c[2] > this.maxB) this.maxB = c[2];
    }
  }
  ColorBox.prototype.rangeR = function() { return this.maxR - this.minR; };
  ColorBox.prototype.rangeG = function() { return this.maxG - this.minG; };
  ColorBox.prototype.rangeB = function() { return this.maxB - this.minB; };
  ColorBox.prototype.longestAxis = function() {
    var r = this.rangeR(), g = this.rangeG(), b = this.rangeB();
    if (r >= g && r >= b) return 0;
    if (g >= r && g >= b) return 1;
    return 2;
  };
  ColorBox.prototype.volume = function() {
    return (this.rangeR() + 1) * (this.rangeG() + 1) * (this.rangeB() + 1);
  };
  ColorBox.prototype.average = function() {
    if (this.colors.length === 0) return [128, 128, 128];
    var sumR = 0, sumG = 0, sumB = 0;
    for (var i = 0; i < this.colors.length; i++) {
      sumR += this.colors[i][0];
      sumG += this.colors[i][1];
      sumB += this.colors[i][2];
    }
    return [
      Math.round(sumR / this.colors.length),
      Math.round(sumG / this.colors.length),
      Math.round(sumB / this.colors.length)
    ];
  };

  /**
   * Deterministic Median-Cut Color Palette Generation
   */
  function buildSharedPalette(sampleColors, targetSize) {
    if (sampleColors.length === 0) {
      return [[240, 235, 225], [60, 50, 48], [120, 160, 190], [210, 140, 130]];
    }

    var boxes = [new ColorBox(sampleColors)];

    while (boxes.length < targetSize) {
      // Find box with largest volume that has more than 1 color
      var bestIdx = -1;
      var bestVol = -1;
      for (var i = 0; i < boxes.length; i++) {
        if (boxes[i].colors.length > 1) {
          var vol = boxes[i].volume();
          if (vol > bestVol) {
            bestVol = vol;
            bestIdx = i;
          }
        }
      }
      if (bestIdx === -1) break;

      var boxToSplit = boxes.splice(bestIdx, 1)[0];
      var axis = boxToSplit.longestAxis();

      boxToSplit.colors.sort(function(a, b) {
        return a[axis] - b[axis];
      });

      var mid = Math.floor(boxToSplit.colors.length / 2);
      boxes.push(new ColorBox(boxToSplit.colors.slice(0, mid)));
      boxes.push(new ColorBox(boxToSplit.colors.slice(mid)));
    }

    var palette = [];
    for (var j = 0; j < boxes.length; j++) {
      palette.push(boxes[j].average());
    }
    return palette;
  }

  /**
   * Fast O(1) Integral Image Kuwahara Painterly Watercolor Filter
   * Smooths micro-noise and pores into organic watercolor/gouache planes
   * while preserving and snapping to structural boundaries.
   */
  function kuwaharaFilter(src, width, height, radius) {
    var length = width * height;
    radius = Math.max(1, Math.min(8, radius || 3));

    var lum = new Float32Array(length);
    for (var i = 0; i < length; i++) {
      var p = i * 4;
      lum[i] = (0.299 * src[p] + 0.587 * src[p + 1] + 0.114 * src[p + 2]);
    }

    var stride = width + 1;
    var intR = new Float64Array(stride * (height + 1));
    var intG = new Float64Array(stride * (height + 1));
    var intB = new Float64Array(stride * (height + 1));
    var intL = new Float64Array(stride * (height + 1));
    var intL2 = new Float64Array(stride * (height + 1));

    for (var y = 0; y < height; y++) {
      var rowR = 0, rowG = 0, rowB = 0, rowL = 0, rowL2 = 0;
      var yStride = (y + 1) * stride;
      var prevYStride = y * stride;
      var srcRow = y * width;
      for (var x = 0; x < width; x++) {
        var sp = (srcRow + x) * 4;
        var r = src[sp], g = src[sp + 1], b = src[sp + 2], l = lum[srcRow + x];
        rowR += r; rowG += g; rowB += b; rowL += l; rowL2 += l * l;
        var idx = yStride + (x + 1);
        var prevIdx = prevYStride + (x + 1);
        intR[idx] = intR[prevIdx] + rowR;
        intG[idx] = intG[prevIdx] + rowG;
        intB[idx] = intB[prevIdx] + rowB;
        intL[idx] = intL[prevIdx] + rowL;
        intL2[idx] = intL2[prevIdx] + rowL2;
      }
    }

    function getRegion(intTable, x1, y1, x2, y2) {
      x1 = Math.max(0, Math.min(width, x1)); y1 = Math.max(0, Math.min(height, y1));
      x2 = Math.max(0, Math.min(width, x2)); y2 = Math.max(0, Math.min(height, y2));
      return intTable[y2 * stride + x2] - intTable[y1 * stride + x2] - intTable[y2 * stride + x1] + intTable[y1 * stride + x1];
    }

    var out = new Uint8ClampedArray(length * 4);
    for (var cy = 0; cy < height; cy++) {
      for (var cx = 0; cx < width; cx++) {
        var regions = [
          [cx - radius, cy - radius, cx + 1, cy + 1],
          [cx, cy - radius, cx + radius + 1, cy + 1],
          [cx - radius, cy, cx + 1, cy + radius + 1],
          [cx, cy, cx + radius + 1, cy + radius + 1]
        ];
        var minVar = Infinity;
        var op = (cy * width + cx) * 4;
        var bestR = src[op];
        var bestG = src[op + 1];
        var bestB = src[op + 2];

        for (var q = 0; q < 4; q++) {
          var reg = regions[q];
          var x1 = reg[0], y1 = reg[1], x2 = reg[2], y2 = reg[3];
          var count = (x2 - x1) * (y2 - y1);
          if (count <= 0) continue;
          var sumL = getRegion(intL, x1, y1, x2, y2);
          var sumL2 = getRegion(intL2, x1, y1, x2, y2);
          var meanL = sumL / count;
          var variance = (sumL2 / count) - (meanL * meanL);
          if (variance < minVar) {
            minVar = variance;
            bestR = getRegion(intR, x1, y1, x2, y2) / count;
            bestG = getRegion(intG, x1, y1, x2, y2) / count;
            bestB = getRegion(intB, x1, y1, x2, y2) / count;
          }
        }
        out[op] = clamp(Math.round(bestR), 0, 255);
        out[op + 1] = clamp(Math.round(bestG), 0, 255);
        out[op + 2] = clamp(Math.round(bestB), 0, 255);
        out[op + 3] = src[op + 3] || 255;
      }
    }
    return out;
  }

  /**
   * Boost Watercolor Pigment Saturation & Clarity
   * Emulates transparent watercolor pigment by increasing chroma in midtones
   * while maintaining luminous paper highlights.
   */
  function boostWatercolorPigment(r, g, b) {
    var max = Math.max(r, Math.max(g, b));
    var min = Math.min(r, Math.min(g, b));
    var delta = max - min;
    var lum = (max + min) / 2;

    if (delta === 0) return [r, g, b];

    var sat = lum < 128 ? delta / (max + min) : delta / (510 - max - min);
    var newSat = Math.min(1.0, sat * 1.25);
    var boost = (newSat / sat);

    var nr = clamp(Math.round(lum + (r - lum) * boost), 0, 255);
    var ng = clamp(Math.round(lum + (g - lum) * boost), 0, 255);
    var nb = clamp(Math.round(lum + (b - lum) * boost), 0, 255);

    nr = clamp(Math.round(nr * 1.05 + 6), 0, 255);
    ng = clamp(Math.round(ng * 1.03 + 4), 0, 255);
    nb = clamp(Math.round(nb * 1.01 + 2), 0, 255);

    return [nr, ng, nb];
  }

  /**
   * Quantize image pixels using 2-pass Kuwahara watercolor smoothing and shared group palette
   * @param {Uint8ClampedArray} pixels - RGBA buffer
   * @param {Float32Array} mask - Foreground alpha mask
   * @param {number} width - Width
   * @param {number} height - Height
   * @param {number} paletteSize - Number of palette colors (16 to 32)
   * @returns {object} { simplifiedPixels, palette, painterlyPixels, poolFringe }
   */
  function quantizeColorField(pixels, mask, width, height, paletteSize) {
    paletteSize = Math.max(16, Math.min(32, paletteSize || 24));
    var length = width * height;

    // 1. Gather representative foreground sample colors
    var samples = [];
    var stride = Math.max(1, Math.floor(length / 5000));
    for (var i = 0; i < length; i += stride) {
      if (mask && mask[i] < 0.35) continue;
      var p = i * 4;
      samples.push([pixels[p], pixels[p + 1], pixels[p + 2]]);
    }

    if (samples.length === 0) {
      for (var k = 0; k < length; k += stride) {
        var pk = k * 4;
        samples.push([pixels[pk], pixels[pk + 1], pixels[pk + 2]]);
      }
    }

    var palette = buildSharedPalette(samples, paletteSize);

    // 2. Two-Pass Kuwahara Painterly Watercolor Smoothing
    var r1 = 3;
    var r2 = 2;
    if (width > 800 || height > 600) {
      r1 = 4;
      r2 = 3;
    }
    var pass1 = kuwaharaFilter(pixels, width, height, r1);
    var pass2 = kuwaharaFilter(pass1, width, height, r2);

    // 3. Compute Pigment Pooling (Edge Darkening / Coffee-Ring Fringe)
    var poolFringe = new Float32Array(length);
    for (var y = 1; y < height - 1; y++) {
      for (var x = 1; x < width - 1; x++) {
        var idx = y * width + x;
        var pL = (idx - 1) * 4;
        var pR = (idx + 1) * 4;
        var pU = (idx - width) * 4;
        var pD = (idx + width) * 4;
        var dx = Math.abs(pass2[pR] - pass2[pL]) + Math.abs(pass2[pR + 1] - pass2[pL + 1]) + Math.abs(pass2[pR + 2] - pass2[pL + 2]);
        var dy = Math.abs(pass2[pD] - pass2[pU]) + Math.abs(pass2[pD + 1] - pass2[pU + 1]) + Math.abs(pass2[pD + 2] - pass2[pU + 2]);
        var grad = (dx + dy) / (255.0 * 6.0);
        if (grad > 0.04 && grad < 0.35) {
          poolFringe[idx] = clamp((grad - 0.04) * 2.2, 0.0, 0.30);
        }
      }
    }

    // 4. Watercolor Luminous Pigment Boost
    var out = new Uint8ClampedArray(length * 4);
    for (var j = 0; j < length; j++) {
      var pIdx = j * 4;
      var boosted = boostWatercolorPigment(pass2[pIdx], pass2[pIdx + 1], pass2[pIdx + 2]);

      // Apply subtle pigment pooling darkening along boundaries
      var pool = poolFringe[j];
      var finalR = boosted[0] * (1.0 - pool * 0.45);
      var finalG = boosted[1] * (1.0 - pool * 0.45);
      var finalB = boosted[2] * (1.0 - pool * 0.40);

      out[pIdx] = clamp(Math.round(finalR), 0, 255);
      out[pIdx + 1] = clamp(Math.round(finalG), 0, 255);
      out[pIdx + 2] = clamp(Math.round(finalB), 0, 255);
      out[pIdx + 3] = pixels[pIdx + 3] || 255;
    }

    return {
      simplifiedPixels: out,
      palette: palette,
      painterlyPixels: out,
      poolFringe: poolFringe
    };
  }

  exports.kuwaharaFilter = kuwaharaFilter;
  exports.buildSharedPalette = buildSharedPalette;
  exports.boostWatercolorPigment = boostWatercolorPigment;
  exports.quantizeColorField = quantizeColorField;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.ColorQuantizer = {}));


