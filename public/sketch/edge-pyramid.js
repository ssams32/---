/**
 * edge-pyramid.js
 * 3-Scale Structural Edge Pyramid (Fine, Medium, Coarse),
 * Edge Importance Classification (Primary, Secondary, Texture),
 * and Smooth Region Suppression (Facial Region Protection without Face Detection).
 */
(function(exports) {
  'use strict';

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  // Convert RGB to luminance array
  function extractLuminance(pixels, width, height) {
    var length = width * height;
    var lum = new Float32Array(length);
    for (var i = 0; i < length; i++) {
      var p = i * 4;
      lum[i] = (0.2126 * pixels[p] + 0.7152 * pixels[p + 1] + 0.0722 * pixels[p + 2]) / 255.0;
    }
    return lum;
  }

  /**
   * Fast Sobel/Scharr gradient magnitude with radius step
   */
  function computeGradient(lum, width, height, step) {
    var length = width * height;
    var grad = new Float32Array(length);
    step = Math.max(1, step || 1);

    for (var y = step; y < height - step; y++) {
      var row = y * width;
      var rowPrev = (y - step) * width;
      var rowNext = (y + step) * width;

      for (var x = step; x < width - step; x++) {
        // Horizontal Sobel
        var gx = (lum[rowPrev + (x + step)] + 2.0 * lum[row + (x + step)] + lum[rowNext + (x + step)]) -
                 (lum[rowPrev + (x - step)] + 2.0 * lum[row + (x - step)] + lum[rowNext + (x - step)]);

        // Vertical Sobel
        var gy = (lum[rowNext + (x - step)] + 2.0 * lum[rowNext + x] + lum[rowNext + (x + step)]) -
                 (lum[rowPrev + (x - step)] + 2.0 * lum[rowPrev + x] + lum[rowPrev + (x + step)]);

        var mag = Math.sqrt(gx * gx + gy * gy) * 0.25;
        grad[row + x] = clamp(mag, 0.0, 1.0);
      }
    }
    return grad;
  }

  /**
   * Compute local variance to identify smooth skin/background surfaces
   */
  function computeLocalVariance(lum, width, height, radius) {
    var length = width * height;
    var variance = new Float32Array(length);
    radius = Math.max(1, radius || 2);

    for (var y = radius; y < height - radius; y++) {
      for (var x = radius; x < width - radius; x++) {
        var sum = 0, sumSq = 0, count = 0;
        for (var dy = -radius; dy <= radius; dy++) {
          for (var dx = -radius; dx <= radius; dx++) {
            var v = lum[(y + dy) * width + (x + dx)];
            sum += v;
            sumSq += v * v;
            count++;
          }
        }
        var mean = sum / count;
        var varVal = (sumSq / count) - (mean * mean);
        variance[y * width + x] = Math.max(0, varVal);
      }
    }
    return variance;
  }

  /**
   * Fast 1D Separable Gaussian Blur
   */
  function gaussianBlur1D(src, width, height, sigma) {
    var radius = Math.ceil(sigma * 2.5);
    var size = radius * 2 + 1;
    var kernel = new Float32Array(size);
    var kSum = 0;
    for (var i = -radius; i <= radius; i++) {
      var v = Math.exp(-(i * i) / (2 * sigma * sigma));
      kernel[i + radius] = v;
      kSum += v;
    }
    for (var k = 0; k < size; k++) kernel[k] /= kSum;

    var temp = new Float32Array(width * height);
    var out = new Float32Array(width * height);

    for (var y = 0; y < height; y++) {
      var row = y * width;
      for (var x = 0; x < width; x++) {
        var sum = 0;
        for (var ki = -radius; ki <= radius; ki++) {
          var px = clamp(x + ki, 0, width - 1);
          sum += src[row + px] * kernel[ki + radius];
        }
        temp[row + x] = sum;
      }
    }
    for (var x2 = 0; x2 < width; x2++) {
      for (var y2 = 0; y2 < height; y2++) {
        var sum2 = 0;
        for (var ki2 = -radius; ki2 <= radius; ki2++) {
          var py = clamp(y2 + ki2, 0, height - 1);
          sum2 += temp[py * width + x2] * kernel[ki2 + radius];
        }
        out[y2 * width + x2] = sum2;
      }
    }
    return out;
  }

  /**
   * Extended Difference of Gaussians (XDoG)
   * Produces smooth, continuous, comic/manga hand-drawn ink linework with soft tapering.
   */
  function computeXDoG(lum, width, height, sigma, gamma, epsilon, phi) {
    sigma = sigma || 1.0;
    gamma = (typeof gamma === 'number') ? gamma : 0.98;
    epsilon = (typeof epsilon === 'number') ? epsilon : -0.015;
    phi = phi || 10.0;

    var g1 = gaussianBlur1D(lum, width, height, sigma);
    var g2 = gaussianBlur1D(lum, width, height, sigma * 1.6);
    var length = width * height;
    var lineArt = new Float32Array(length);

    for (var i = 0; i < length; i++) {
      var diff = g1[i] - gamma * g2[i];
      if (diff < epsilon) {
        lineArt[i] = 1.0;
      } else {
        var v = 1.0 + Math.tanh(phi * (diff - epsilon));
        lineArt[i] = clamp(1.0 - v * 0.5, 0.0, 1.0);
      }
    }
    return lineArt;
  }

  /**
   * Build 3-Scale Structural Edge Pyramid with XDoG Linework
   * Section 15: Fine (0.20) + Medium (0.45) + Coarse (0.35)
   */
  function buildEdgePyramid(pixels, width, height, options) {
    options = options || {};
    var fineWeight = (typeof options.fine === 'number') ? options.fine : 0.20;
    var mediumWeight = (typeof options.medium === 'number') ? options.medium : 0.45;
    var coarseWeight = (typeof options.coarse === 'number') ? options.coarse : 0.35;

    var lum = extractLuminance(pixels, width, height);

    // Fine scale: 1px step
    var fineEdge = computeGradient(lum, width, height, 1);
    // Medium scale: 2px step
    var mediumEdge = computeGradient(lum, width, height, 2);
    // Coarse scale: 4px step
    var coarseEdge = computeGradient(lum, width, height, 4);

    // Local variance for smooth region detection
    var variance = computeLocalVariance(lum, width, height, 2);

    // High quality XDoG hand-drawn linework
    var xdogLines = computeXDoG(lum, width, height, 0.95, 0.98, -0.015, 10.0);

    var length = width * height;
    var blended = new Float32Array(length);
    var classified = new Float32Array(length);

    for (var i = 0; i < length; i++) {
      var f = fineEdge[i];
      var m = mediumEdge[i];
      var c = coarseEdge[i];
      var v = variance[i];

      // Suppress fine edge in smooth low-variance regions
      if (v < 0.0012) {
        f *= 0.15;
      } else if (v < 0.003) {
        f *= 0.45;
      }

      var structuralMag = (f * fineWeight) + (m * mediumWeight) + (c * coarseWeight);
      blended[i] = structuralMag;

      // Section 16: Edge Importance Classification
      var rawAlpha = 0.0;
      if (structuralMag >= 0.35) {
        rawAlpha = 0.85 + clamp((structuralMag - 0.35) * 0.3, 0.0, 0.15);
      } else if (structuralMag >= 0.15) {
        rawAlpha = 0.45 + ((structuralMag - 0.15) / 0.20) * 0.30;
      } else if (structuralMag >= 0.06) {
        rawAlpha = 0.05 + ((structuralMag - 0.06) / 0.09) * 0.20;
      }

      // XDoG clean linework weighting (suppress noise in ultra-smooth skin)
      var xdogWeight = (v < 0.0010) ? 0.0 : (v < 0.0025 ? 0.5 : 1.0);
      var xdogVal = xdogLines[i] * xdogWeight;

      classified[i] = clamp(Math.max(rawAlpha, xdogVal), 0.0, 1.0);
    }

    return {
      blendedEdges: blended,
      classifiedEdges: classified,
      fineEdge: fineEdge,
      mediumEdge: mediumEdge,
      coarseEdge: coarseEdge,
      xdogLines: xdogLines
    };
  }

  function classifyEdge(val) {
    if (val >= 0.35) return 'primary';
    if (val >= 0.15) return 'secondary';
    if (val >= 0.06) return 'texture';
    return 'none';
  }

  exports.gaussianBlur1D = gaussianBlur1D;
  exports.computeXDoG = computeXDoG;
  exports.computeGradient = computeGradient;
  exports.buildEdgePyramid = buildEdgePyramid;
  exports.classifyEdge = classifyEdge;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.EdgePyramid = {}));
