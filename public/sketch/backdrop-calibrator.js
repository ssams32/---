/**
 * backdrop-calibrator.js
 * First-Party Sky-Blue Background Dynamic Calibration System
 * Samples safe border patches, rejects variance/shadow/outliers, computes median profile.
 */
(function(exports) {
  'use strict';

  var DEFAULT_RGB = [143, 207, 227]; // #8FCFE3

  // Convert RGB [0..255] to normalized HSV [0..1]
  function rgbToHsv(r, g, b) {
    var nr = r / 255, ng = g / 255, nb = b / 255;
    var max = Math.max(nr, ng, nb), min = Math.min(nr, ng, nb);
    var d = max - min;
    var h = 0, s = max === 0 ? 0 : d / max, v = max;

    if (max !== min) {
      switch (max) {
        case nr: h = (ng - nb) / d + (ng < nb ? 6 : 0); break;
        case ng: h = (nb - nr) / d + 2; break;
        case nb: h = (nr - ng) / d + 4; break;
      }
      h /= 6;
    }
    return [h, s, v];
  }

  // Calculate standard luminance (Rec. 709)
  function calcLuminance(r, g, b) {
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }

  // Approximate Lab Chroma from RGB
  function calcApproxLabChroma(r, g, b) {
    // simplified opponent color chroma: sqrt(a^2 + b^2)
    var a = (r - g);
    var bChroma = 0.5 * (r + g) - b;
    return Math.sqrt(a * a + bChroma * bChroma);
  }

  function samplePatch(pixels, width, height, startX, startY, pWidth, pHeight) {
    var rList = [];
    var gList = [];
    var bList = [];

    var endX = Math.min(width, startX + pWidth);
    var endY = Math.min(height, startY + pHeight);

    for (var y = startY; y < endY; y++) {
      for (var x = startX; x < endX; x++) {
        var idx = (y * width + x) * 4;
        rList.push(pixels[idx]);
        gList.push(pixels[idx + 1]);
        bList.push(pixels[idx + 2]);
      }
    }

    if (rList.length === 0) return null;

    rList.sort(function(a, b) { return a - b; });
    gList.sort(function(a, b) { return a - b; });
    bList.sort(function(a, b) { return a - b; });

    var mid = Math.floor(rList.length / 2);
    var medR = rList[mid];
    var medG = gList[mid];
    var medB = bList[mid];

    // Compute variance
    var sumVar = 0;
    for (var i = 0; i < rList.length; i++) {
      var dr = rList[i] - medR;
      var dg = gList[i] - medG;
      var db = bList[i] - medB;
      sumVar += (dr * dr + dg * dg + db * db);
    }
    var variance = sumVar / (rList.length * 3);
    var lum = calcLuminance(medR, medG, medB);
    var hsv = rgbToHsv(medR, medG, medB);
    var chroma = calcApproxLabChroma(medR, medG, medB);

    return {
      rgb: [medR, medG, medB],
      hsv: hsv,
      luminance: lum,
      chroma: chroma,
      variance: variance,
      sampleCount: rList.length
    };
  }

  /**
   * Calibrate effective backdrop from safe perimeter patches
   * @param {Uint8ClampedArray|Array} pixels - RGBA pixel buffer
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @returns {object} Calibration result
   */
  function calibrateBackdrop(pixels, width, height) {
    var patchW = Math.max(16, Math.floor(width * 0.08));
    var patchH = Math.max(16, Math.floor(height * 0.08));

    // 5 Defined safe sampling locations
    var candidateLocations = [
      { name: 'top-left', x: Math.floor(width * 0.02), y: Math.floor(height * 0.02) },
      { name: 'top-center', x: Math.floor(width * 0.46), y: Math.floor(height * 0.02) },
      { name: 'top-right', x: Math.floor(width * 0.90), y: Math.floor(height * 0.02) },
      { name: 'middle-left', x: Math.floor(width * 0.02), y: Math.floor(height * 0.45) },
      { name: 'middle-right', x: Math.floor(width * 0.90), y: Math.floor(height * 0.45) }
    ];

    var validPatches = [];

    for (var i = 0; i < candidateLocations.length; i++) {
      var loc = candidateLocations[i];
      var patch = samplePatch(pixels, width, height, loc.x, loc.y, patchW, patchH);
      if (!patch) continue;

      // Filter: variance threshold (exclude high variance edges / hair / subject overlap)
      if (patch.variance > 320) continue;

      // Filter: luminance limits (exclude dark shadow < 0.25, near-white > 0.92, near-black < 0.08)
      if (patch.luminance < 0.25 || patch.luminance > 0.92) continue;

      // Filter: must resemble a blueish/cyan hue (Hue range approx 0.45 to 0.70)
      var h = patch.hsv[0];
      var s = patch.hsv[1];
      if (s < 0.10) continue; // Not washed out gray
      if (h < 0.40 || h > 0.75) continue; // Must be in blue/cyan zone

      validPatches.push(patch);
    }

    // Outlier rejection: reject patches that strongly disagree with the median of valid patches
    if (validPatches.length >= 3) {
      var rVals = validPatches.map(function(p) { return p.rgb[0]; }).sort(function(a,b){ return a-b; });
      var gVals = validPatches.map(function(p) { return p.rgb[1]; }).sort(function(a,b){ return a-b; });
      var bVals = validPatches.map(function(p) { return p.rgb[2]; }).sort(function(a,b){ return a-b; });
      var mR = rVals[Math.floor(rVals.length / 2)];
      var mG = gVals[Math.floor(gVals.length / 2)];
      var mB = bVals[Math.floor(bVals.length / 2)];

      validPatches = validPatches.filter(function(p) {
        var diff = Math.abs(p.rgb[0] - mR) + Math.abs(p.rgb[1] - mG) + Math.abs(p.rgb[2] - mB);
        return diff < 75; // Reject strong deviation
      });
    }

    var status = 'unreliable';
    var effectiveRgb = DEFAULT_RGB.slice();
    var effectiveHsv = rgbToHsv(effectiveRgb[0], effectiveRgb[1], effectiveRgb[2]);
    var effectiveLum = calcLuminance(effectiveRgb[0], effectiveRgb[1], effectiveRgb[2]);
    var effectiveChroma = calcApproxLabChroma(effectiveRgb[0], effectiveRgb[1], effectiveRgb[2]);
    var avgVariance = 0;

    if (validPatches.length >= 4) {
      status = 'good';
    } else if (validPatches.length >= 2) {
      status = 'uneven';
    } else {
      status = 'unreliable';
    }

    if (validPatches.length >= 2) {
      var sumR = 0, sumG = 0, sumB = 0, sumVar = 0;
      for (var j = 0; j < validPatches.length; j++) {
        sumR += validPatches[j].rgb[0];
        sumG += validPatches[j].rgb[1];
        sumB += validPatches[j].rgb[2];
        sumVar += validPatches[j].variance;
      }
      effectiveRgb = [
        Math.round(sumR / validPatches.length),
        Math.round(sumG / validPatches.length),
        Math.round(sumB / validPatches.length)
      ];
      effectiveHsv = rgbToHsv(effectiveRgb[0], effectiveRgb[1], effectiveRgb[2]);
      effectiveLum = calcLuminance(effectiveRgb[0], effectiveRgb[1], effectiveRgb[2]);
      effectiveChroma = calcApproxLabChroma(effectiveRgb[0], effectiveRgb[1], effectiveRgb[2]);
      avgVariance = sumVar / validPatches.length;
    }

    return {
      status: status, // 'good' | 'uneven' | 'unreliable'
      rgb: effectiveRgb,
      hsv: effectiveHsv,
      luminance: effectiveLum,
      chroma: effectiveChroma,
      variance: avgVariance,
      acceptedPatchCount: validPatches.length
    };
  }

  exports.rgbToHsv = rgbToHsv;
  exports.calcLuminance = calcLuminance;
  exports.calcApproxLabChroma = calcApproxLabChroma;
  exports.calibrateBackdrop = calibrateBackdrop;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.BackdropCalibrator = {}));
