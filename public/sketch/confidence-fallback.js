/**
 * confidence-fallback.js
 * 3-Level Confidence Scoring & Graceful Degradation Strategy.
 * Level 1 (>= 0.80): Clean paper illustration
 * Level 2 (0.68 - 0.79): Soft-edge illustration with subtle wash
 * Level 3 (< 0.68): Full-frame color sketch (zero missing foreground)
 */
(function(exports) {
  'use strict';

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  /**
   * Calculate Mask Extraction Confidence Score
   */
  function evaluateMaskConfidence(calibration, mask, width, height, envelope) {
    var length = width * height;
    var fgPixels = 0;
    var edgeBgPixels = 0;
    var totalEdgePixels = 0;

    var borderThickness = Math.max(2, Math.floor(Math.min(width, height) * 0.02));

    for (var y = 0; y < height; y++) {
      var isBorderY = (y < borderThickness || y >= height - borderThickness);
      for (var x = 0; x < width; x++) {
        var idx = y * width + x;
        var val = mask[idx];
        if (val >= 0.5) fgPixels++;

        var isBorderX = (x < borderThickness || x >= width - borderThickness);
        if (isBorderX || isBorderY) {
          totalEdgePixels++;
          if (val < 0.3) edgeBgPixels++;
        }
      }
    }

    var fgRatio = fgPixels / length;
    var edgeBgRatio = totalEdgePixels > 0 ? (edgeBgPixels / totalEdgePixels) : 1.0;

    // Component 1: Backdrop patch agreement (0..1)
    var calibScore = 0.5;
    if (calibration.status === 'good') calibScore = 1.0;
    else if (calibration.status === 'uneven') calibScore = 0.75;
    else calibScore = 0.45;

    // Component 2: Frame edge background coverage (should be mostly background at perimeter)
    var edgeScore = clamp(edgeBgRatio / 0.85, 0.0, 1.0);

    // Component 3: Reasonable foreground coverage (typically 15% to 80% for groups)
    var coverageScore = 1.0;
    if (fgRatio < 0.08) coverageScore = 0.5;
    else if (fgRatio > 0.88) coverageScore = 0.6;

    // Weighted composite confidence
    var confidence = (calibScore * 0.35) + (edgeScore * 0.40) + (coverageScore * 0.25);
    confidence = clamp(confidence, 0.0, 1.0);

    // Determine Fallback Level
    var fallbackLevel = 1;
    var mode = 'paper-illustration';

    if (confidence >= 0.80) {
      fallbackLevel = 1;
      mode = 'paper-illustration';
    } else if (confidence >= 0.68) {
      fallbackLevel = 2;
      mode = 'paper-illustration'; // With soft edge wash
    } else {
      fallbackLevel = 3;
      mode = 'full-frame-sketch'; // Complete source frame sketch without background deletion
    }

    return {
      confidence: Math.round(confidence * 100) / 100,
      fallbackLevel: fallbackLevel,
      mode: mode,
      foregroundCoverage: Math.round(fgRatio * 100),
      edgeBackgroundCoverage: Math.round(edgeBgRatio * 100),
      calibrationStatus: calibration.status
    };
  }

  exports.evaluateMaskConfidence = evaluateMaskConfidence;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.ConfidenceFallback = {}));
