/**
 * thin-structure.js
 * Restrained Morphology & Thin Structure Protection.
 * Protects fingers, arms, legs, hair boundaries, glasses, straps, shoes and handheld props.
 */
(function(exports) {
  'use strict';

  /**
   * Fast separable or box dilation on Float32Array / Uint8Array mask
   */
  function dilateMask(src, width, height, radius) {
    if (radius <= 0) return new Float32Array(src);
    var dst = new Float32Array(width * height);
    var temp = new Float32Array(width * height);

    // Horizontal pass
    for (var y = 0; y < height; y++) {
      var rowOffset = y * width;
      for (var x = 0; x < width; x++) {
        var maxVal = src[rowOffset + x];
        var minK = Math.max(0, x - radius);
        var maxK = Math.min(width - 1, x + radius);
        for (var k = minK; k <= maxK; k++) {
          var v = src[rowOffset + k];
          if (v > maxVal) maxVal = v;
        }
        temp[rowOffset + x] = maxVal;
      }
    }

    // Vertical pass
    for (var x2 = 0; x2 < width; x2++) {
      for (var y2 = 0; y2 < height; y2++) {
        var maxVal2 = temp[y2 * width + x2];
        var minL = Math.max(0, y2 - radius);
        var maxL = Math.min(height - 1, y2 + radius);
        for (var l = minL; l <= maxL; l++) {
          var v2 = temp[l * width + x2];
          if (v2 > maxVal2) maxVal2 = v2;
        }
        dst[y2 * width + x2] = maxVal2;
      }
    }

    return dst;
  }

  /**
   * Fast separable erosion on mask
   */
  function erodeMask(src, width, height, radius) {
    if (radius <= 0) return new Float32Array(src);
    var dst = new Float32Array(width * height);
    var temp = new Float32Array(width * height);

    // Horizontal pass
    for (var y = 0; y < height; y++) {
      var rowOffset = y * width;
      for (var x = 0; x < width; x++) {
        var minVal = src[rowOffset + x];
        var minK = Math.max(0, x - radius);
        var maxK = Math.min(width - 1, x + radius);
        for (var k = minK; k <= maxK; k++) {
          var v = src[rowOffset + k];
          if (v < minVal) minVal = v;
        }
        temp[rowOffset + x] = minVal;
      }
    }

    // Vertical pass
    for (var x2 = 0; x2 < width; x2++) {
      for (var y2 = 0; y2 < height; y2++) {
        var minVal2 = temp[y2 * width + x2];
        var minL = Math.max(0, y2 - radius);
        var maxL = Math.min(height - 1, y2 + radius);
        for (var l = minL; l <= maxL; l++) {
          var v2 = temp[l * width + x2];
          if (v2 < minVal2) minVal2 = v2;
        }
        dst[y2 * width + x2] = minVal2;
      }
    }

    return dst;
  }

  // Morphological Closing: Dilate then Erode
  function closeMask(src, width, height, radius) {
    var dilated = dilateMask(src, width, height, radius);
    return erodeMask(dilated, width, height, radius);
  }

  // Morphological Opening: Erode then Dilate
  function openMask(src, width, height, radius) {
    var eroded = erodeMask(src, width, height, radius);
    return dilateMask(eroded, width, height, radius);
  }

  /**
   * Restore thin structures lost during standard morphological filtering
   * @param {Float32Array} currentMask - Filtered mask
   * @param {Float32Array} originalMask - Raw mask before opening
   * @param {Float32Array} edgeMagnitudes - Structural edge map
   * @returns {Float32Array} Restored mask
   */
  function restoreThinStructures(currentMask, originalMask, edgeMagnitudes, width, height) {
    var length = width * height;
    var restored = new Float32Array(length);

    for (var i = 0; i < length; i++) {
      var cur = currentMask[i];
      var orig = originalMask[i];
      var edge = edgeMagnitudes ? edgeMagnitudes[i] : 0.0;

      // If original had foreground and there is high structural edge support or elongation, restore it
      if (cur < 0.4 && orig >= 0.5 && edge > 0.25) {
        restored[i] = Math.max(cur, orig);
      } else {
        restored[i] = cur;
      }
    }
    return restored;
  }

  exports.dilateMask = dilateMask;
  exports.erodeMask = erodeMask;
  exports.closeMask = closeMask;
  exports.openMask = openMask;
  exports.restoreThinStructures = restoreThinStructures;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.ThinStructure = {}));
