/**
 * mask-refiner.js
 * 10-Stage Mask Refinement, Adaptive Edge-Aware Feathering, and Sky-Blue Spill Suppression.
 */
(function(exports) {
  'use strict';

  var ThinStructure = (typeof window !== 'undefined' && window.ThinStructure) ? window.ThinStructure : require('./thin-structure.js');

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  /**
   * Extract boundary band around foreground mask (inner and outer transition zone)
   */
  function extractBoundaryBand(mask, width, height, bandRadius) {
    var r = Math.max(1, bandRadius || 3);
    var dilated = ThinStructure.dilateMask(mask, width, height, r);
    var eroded = ThinStructure.erodeMask(mask, width, height, r);
    var band = new Float32Array(width * height);

    for (var i = 0; i < band.length; i++) {
      var d = dilated[i];
      var e = eroded[i];
      band[i] = clamp(d - e, 0.0, 1.0);
    }
    return band;
  }

  /**
   * Edge-aware adaptive feathering
   * Strong edges receive sharp narrow feather (1-2px)
   * Soft shadows receive gentle feather (up to 6px)
   */
  function applyEdgeAwareFeathering(mask, edgeMagnitudes, width, height, maxFeatherPx) {
    var maxR = Math.max(1, Math.min(6, maxFeatherPx || 3));
    var length = width * height;
    var feathered = new Float32Array(length);

    // Box blur / guide filter approximation
    for (var y = 0; y < height; y++) {
      for (var x = 0; x < width; x++) {
        var idx = y * width + x;
        var edge = edgeMagnitudes ? edgeMagnitudes[idx] : 0.5;

        // Adaptive radius inversely proportional to edge strength
        var rad = Math.round(maxR * (1.0 - clamp(edge * 0.75, 0.0, 0.8)));
        if (rad <= 0) {
          feathered[idx] = mask[idx];
          continue;
        }

        var sum = 0, count = 0;
        var minX = Math.max(0, x - rad), maxX = Math.min(width - 1, x + rad);
        var minY = Math.max(0, y - rad), maxY = Math.min(height - 1, y + rad);

        for (var ky = minY; ky <= maxY; ky++) {
          for (var kx = minX; kx <= maxX; kx++) {
            sum += mask[ky * width + kx];
            count++;
          }
        }
        feathered[idx] = sum / count;
      }
    }

    return feathered;
  }

  /**
   * Sky-blue spill suppression inside boundary band
   * Cyan excess = max(0, B - max(R, G)) * spillStrength * boundaryWeight
   */
  function suppressBlueSpill(pixels, boundaryBand, width, height, spillStrength) {
    var strength = (typeof spillStrength === 'number') ? spillStrength : 0.85;
    var length = width * height;

    for (var i = 0; i < length; i++) {
      var bandWeight = boundaryBand[i];
      if (bandWeight <= 0.05) continue;

      var pIdx = i * 4;
      var r = pixels[pIdx];
      var g = pixels[pIdx + 1];
      var b = pixels[pIdx + 2];

      var maxRG = Math.max(r, g);
      var cyanExcess = Math.max(0, b - maxRG);

      if (cyanExcess > 0) {
        var correction = cyanExcess * strength * bandWeight;
        // Restrained correction: attenuate blue without turning orange
        pixels[pIdx + 2] = clamp(Math.round(b - correction), 0, 255);
        // Slightly warm compensation
        pixels[pIdx] = clamp(Math.round(r + correction * 0.15), 0, 255);
        pixels[pIdx + 1] = clamp(Math.round(g + correction * 0.15), 0, 255);
      }
    }
  }

  /**
   * 10-Stage Mask Refinement Pipeline
   */
  function refineMaskPipeline(rawAlpha, pixels, width, height, edgeMagnitudes, options) {
    options = options || {};
    var scaleRatio = width / 1200.0;
    var closeRad = Math.max(1, Math.round(2 * scaleRatio));
    var openRad = Math.max(1, Math.round(1 * scaleRatio));
    var featherPx = Math.max(1, Math.round(options.maxFeatherPx || (4 * scaleRatio)));

    // 1. Threshold binary base
    var current = new Float32Array(rawAlpha);

    // 2. Conservative Closing (close minor cracks inside clothing)
    var closed = ThinStructure.closeMask(current, width, height, closeRad);

    // 3. Conservative Opening (clean tiny noise outside)
    var opened = ThinStructure.openMask(closed, width, height, openRad);

    // 4. Thin structure restoration (restore fingers, glasses, thin straps)
    var restored = ThinStructure.restoreThinStructures(opened, rawAlpha, edgeMagnitudes, width, height);

    // 5. Boundary band extraction
    var boundaryBand = extractBoundaryBand(restored, width, height, Math.max(2, Math.round(3 * scaleRatio)));

    // 6. Adaptive Edge-aware feathering
    var feathered = applyEdgeAwareFeathering(restored, edgeMagnitudes, width, height, featherPx);

    // 7. Sky-blue spill suppression on source image buffer
    suppressBlueSpill(pixels, boundaryBand, width, height, options.spillStrength || 0.85);

    return {
      refinedMask: feathered,
      boundaryBand: boundaryBand
    };
  }

  exports.extractBoundaryBand = extractBoundaryBand;
  exports.applyEdgeAwareFeathering = applyEdgeAwareFeathering;
  exports.suppressBlueSpill = suppressBlueSpill;
  exports.refineMaskPipeline = refineMaskPipeline;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.MaskRefiner = {}));
