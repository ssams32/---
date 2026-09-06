/**
 * color-key.js
 * Multi-dimensional Color-Key Segmentation with Circular Hue, Smoothstep Alpha,
 * and Conservative Blue/Cyan Clothing Protection inside Group Envelope.
 */
(function(exports) {
  'use strict';

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function smoothstep(edge0, edge1, x) {
    var t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }

  // Circular hue distance (normalized 0..1)
  function calcHueDistance(h1, h2) {
    var d = Math.abs(h1 - h2);
    if (d > 0.5) d = 1.0 - d;
    return d * 2.0; // Scale 0..0.5 to 0..1
  }

  /**
   * Compute multi-dimensional distance from pixel to calibrated backdrop profile
   */
  function computeBackgroundDistance(pHsv, pLum, pChroma, bgHsv, bgLum, bgChroma, neighborScore) {
    var dHue = calcHueDistance(pHsv[0], bgHsv[0]);
    var dSat = Math.abs(pHsv[1] - bgHsv[1]);
    var dLum = Math.abs(pLum - bgLum);
    var dChroma = Math.min(1.0, Math.abs(pChroma - bgChroma) / 80.0);
    var dNeighbor = (typeof neighborScore === 'number') ? neighborScore : 0.0;

    // Strict 5-component weighted sum from Section 6
    var dist = (dHue * 0.38) +
               (dSat * 0.18) +
               (dLum * 0.12) +
               (dChroma * 0.20) +
               (dNeighbor * 0.12);

    return dist;
  }

  /**
   * Generate raw foreground alpha map (Float32Array [0..1])
   * @param {Uint8ClampedArray} pixels - RGBA source pixels
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @param {object} bgProfile - Calibrated backdrop profile
   * @param {object} [envelope] - Optional group envelope {minX, minY, maxX, maxY}
   * @param {object} [options] - Calibration / protection options
   * @returns {Float32Array} Alpha map where 1.0 = foreground, 0.0 = background
   */
  function generateColorKeyMask(pixels, width, height, bgProfile, envelope, options) {
    options = options || {};
    var thresholdLow = options.thresholdLow || 0.18;
    var thresholdHigh = options.thresholdHigh || 0.38;
    var blueProtectionStrength = options.blueProtectionStrength || 0.85;

    var totalPixels = width * height;
    var alphaMap = new Float32Array(totalPixels);
    var bgHsv = bgProfile.hsv || [0.55, 0.37, 0.89];
    var bgLum = bgProfile.luminance || 0.77;
    var bgChroma = bgProfile.chroma || 35.0;

    // Envelope bounds check helper
    var hasEnv = envelope && (envelope.maxX > envelope.minX);
    var envMinX = hasEnv ? envelope.minX : 0;
    var envMaxX = hasEnv ? envelope.maxX : width;
    var envMinY = hasEnv ? envelope.minY : 0;
    var envMaxY = hasEnv ? envelope.maxY : height;

    // Edge margin for frame boundaries (1.5% margin)
    var marginX = Math.floor(width * 0.015);
    var marginY = Math.floor(height * 0.015);

    for (var y = 0; y < height; y++) {
      var isEdgeY = (y < marginY || y >= height - marginY);
      var isInsideEnvY = (y >= envMinY && y <= envMaxY);

      for (var x = 0; x < width; x++) {
        var idx = (y * width + x);
        var pIdx = idx * 4;
        var r = pixels[pIdx];
        var g = pixels[pIdx + 1];
        var b = pixels[pIdx + 2];

        // Rec. 709 Luminance
        var lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0;

        // HSV
        var nr = r / 255.0, ng = g / 255.0, nb = b / 255.0;
        var max = Math.max(nr, ng, nb), min = Math.min(nr, ng, nb);
        var d = max - min;
        var h = 0, s = max === 0 ? 0 : d / max, v = max;
        if (max !== min) {
          switch (max) {
            case nr: h = (ng - nb) / d + (ng < nb ? 6 : 0); break;
            case ng: h = (nb - nr) / d + 2; break;
            case nb: h = (nr - ng) / d + 4; break;
          }
          h /= 6.0;
        }

        // Approx Chroma
        var aChr = (r - g);
        var bChr = 0.5 * (r + g) - b;
        var chroma = Math.sqrt(aChr * aChr + bChr * bChr);

        // Compute multi-dimensional distance
        var dist = computeBackgroundDistance([h, s, v], lum, chroma, bgHsv, bgLum, bgChroma, 0.0);

        // Base foreground alpha via smoothstep
        var alpha = smoothstep(thresholdLow, thresholdHigh, dist);

        // Section 10: Conservative Blue/Cyan Clothing Protection inside Group Envelope
        var isEdgeX = (x < marginX || x >= width - marginX);
        var isInsideEnv = isInsideEnvY && (x >= envMinX && x <= envMaxX);

        if (!isEdgeX && !isEdgeY && isInsideEnv) {
          // Check if pixel exhibits clothing-like blue/cyan (different luminance or different saturation)
          var lumDiff = Math.abs(lum - bgLum);
          var satDiff = Math.abs(s - bgHsv[1]);
          var isBlueOrCyan = (h >= 0.45 && h <= 0.72);

          if (isBlueOrCyan && (lumDiff > 0.09 || satDiff > 0.14 || v < 0.65 || v > 0.96)) {
            // Blue clothing detected! Prevent hard deletion by boosting alpha
            var minProtectionAlpha = blueProtectionStrength;
            if (alpha < minProtectionAlpha) {
              alpha = Math.max(alpha, minProtectionAlpha);
            }
          } else if (dist < thresholdLow && isInsideEnv && lumDiff > 0.12) {
            // Shadow or darker blue tone inside group envelope
            alpha = Math.max(alpha, 0.65);
          }
        }

        alphaMap[idx] = alpha;
      }
    }

    return alphaMap;
  }

  function softAlpha(dist, thresholdLow, thresholdHigh) {
    return smoothstep(thresholdLow || 0.18, thresholdHigh || 0.38, dist);
  }

  function colorDistance(r, g, b, bgR, bgG, bgB) {
    var lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0;
    var bgLum = (0.2126 * bgR + 0.7152 * bgG + 0.0722 * bgB) / 255.0;

    var nr = r / 255.0, ng = g / 255.0, nb = b / 255.0;
    var max = Math.max(nr, ng, nb), min = Math.min(nr, ng, nb);
    var d = max - min;
    var h = 0, s = max === 0 ? 0 : d / max, v = max;
    if (max !== min) {
      switch (max) {
        case nr: h = (ng - nb) / d + (ng < nb ? 6 : 0); break;
        case ng: h = (nb - nr) / d + 2; break;
        case nb: h = (nr - ng) / d + 4; break;
      }
      h /= 6.0;
    }

    var bgnr = bgR / 255.0, bgng = bgG / 255.0, bgnb = bgB / 255.0;
    var bgmax = Math.max(bgnr, bgng, bgnb), bgmin = Math.min(bgnr, bgng, bgnb);
    var bgd = bgmax - bgmin;
    var bgh = 0, bgs = bgmax === 0 ? 0 : bgd / bgmax, bgv = bgmax;
    if (bgmax !== bgmin) {
      switch (bgmax) {
        case bgnr: bgh = (bgng - bgnb) / bgd + (bgng < bgnb ? 6 : 0); break;
        case bgng: bgh = (bgnb - bgnr) / bgd + 2; break;
        case bgnb: bgh = (bgnr - bgng) / bgd + 4; break;
      }
      bgh /= 6.0;
    }

    var aChr = (r - g);
    var bChr = 0.5 * (r + g) - b;
    var chroma = Math.sqrt(aChr * aChr + bChr * bChr);

    var bgaChr = (bgR - bgG);
    var bgbChr = 0.5 * (bgR + bgG) - bgB;
    var bgChroma = Math.sqrt(bgaChr * bgaChr + bgbChr * bgbChr);

    return computeBackgroundDistance([h, s, v], lum, chroma, [bgh, bgs, bgv], bgLum, bgChroma, 0.0);
  }

  function isConservativeBlueClothing(r, g, b, bgR, bgG, bgB) {
    var lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0;
    var bgLum = (0.2126 * bgR + 0.7152 * bgG + 0.0722 * bgB) / 255.0;
    var nr = r / 255.0, ng = g / 255.0, nb = b / 255.0;
    var max = Math.max(nr, ng, nb), min = Math.min(nr, ng, nb);
    var d = max - min;
    var h = 0, s = max === 0 ? 0 : d / max, v = max;
    if (max !== min) {
      switch (max) {
        case nr: h = (ng - nb) / d + (ng < nb ? 6 : 0); break;
        case ng: h = (nb - nr) / d + 2; break;
        case nb: h = (nr - ng) / d + 4; break;
      }
      h /= 6.0;
    }

    var bgnr = bgR / 255.0, bgng = bgG / 255.0, bgnb = bgB / 255.0;
    var bgmax = Math.max(bgnr, bgng, bgnb), bgmin = Math.min(bgnr, bgng, bgnb);
    var bgd = bgmax - bgmin;
    var bgs = bgmax === 0 ? 0 : bgd / bgmax;

    var lumDiff = Math.abs(lum - bgLum);
    var satDiff = Math.abs(s - bgs);
    var isBlueOrCyan = (h >= 0.45 && h <= 0.72);

    return isBlueOrCyan && (lumDiff > 0.09 || satDiff > 0.14 || v < 0.65 || v > 0.96);
  }

  exports.calcHueDistance = calcHueDistance;
  exports.computeBackgroundDistance = computeBackgroundDistance;
  exports.generateColorKeyMask = generateColorKeyMask;
  exports.softAlpha = softAlpha;
  exports.colorDistance = colorDistance;
  exports.isConservativeBlueClothing = isConservativeBlueClothing;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.ColorKey = {}));
