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
   * Quantize image pixels using the shared group palette
   * @param {Uint8ClampedArray} pixels - RGBA buffer
   * @param {Float32Array} mask - Foreground alpha mask
   * @param {number} width - Width
   * @param {number} height - Height
   * @param {number} paletteSize - Number of palette colors (16 to 32)
   * @returns {Uint8ClampedArray} Simplified color field buffer
   */
  function quantizeColorField(pixels, mask, width, height, paletteSize) {
    paletteSize = Math.max(16, Math.min(32, paletteSize || 24));
    var length = width * height;

    // 1. Gather representative foreground sample colors (stride sampling for speed)
    var samples = [];
    var stride = Math.max(1, Math.floor(length / 5000));
    for (var i = 0; i < length; i += stride) {
      if (mask && mask[i] < 0.35) continue;
      var p = i * 4;
      samples.push([pixels[p], pixels[p + 1], pixels[p + 2]]);
    }

    if (samples.length === 0) {
      // Fallback: sample all pixels
      for (var k = 0; k < length; k += stride) {
        var pk = k * 4;
        samples.push([pixels[pk], pixels[pk + 1], pixels[pk + 2]]);
      }
    }

    // 2. Build shared group palette
    var palette = buildSharedPalette(samples, paletteSize);

    // 3. Fast mapping of pixels to closest palette color
    var out = new Uint8ClampedArray(length * 4);

    for (var j = 0; j < length; j++) {
      var pIdx = j * 4;
      var r = pixels[pIdx];
      var g = pixels[pIdx + 1];
      var b = pixels[pIdx + 2];

      var bestDist = Infinity;
      var bestCol = palette[0];

      for (var c = 0; c < palette.length; c++) {
        var pal = palette[c];
        var dr = r - pal[0];
        var dg = g - pal[1];
        var db = b - pal[2];
        var d = dr * dr + dg * dg + db * db;
        if (d < bestDist) {
          bestDist = d;
          bestCol = pal;
        }
      }

      out[pIdx] = bestCol[0];
      out[pIdx + 1] = bestCol[1];
      out[pIdx + 2] = bestCol[2];
      out[pIdx + 3] = pixels[pIdx + 3];
    }

    return {
      simplifiedPixels: out,
      palette: palette
    };
  }

  exports.buildSharedPalette = buildSharedPalette;
  exports.quantizeColorField = quantizeColorField;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.ColorQuantizer = {}));
