/**
 * sketch-engine.js
 * Master Deterministic Group Color-Sketch & Paper-Illustration Engine.
 * Strict Non-AI Boundary: Pure computational image processing with zero ML models.
 * Preserves 1 to ~8 participants, poses, thin structures, overlap order, and group geometry.
 */
(function(exports) {
  'use strict';

  var isNode = (typeof module !== 'undefined' && module.exports);

  var SketchDefinitions = (typeof window !== 'undefined' && window.SketchDefinitions) ? window.SketchDefinitions : require('./sketch-definitions.js');
  var BackdropCalibrator = (typeof window !== 'undefined' && window.BackdropCalibrator) ? window.BackdropCalibrator : require('./backdrop-calibrator.js');
  var ColorKey = (typeof window !== 'undefined' && window.ColorKey) ? window.ColorKey : require('./color-key.js');
  var ComponentLabeler = (typeof window !== 'undefined' && window.ComponentLabeler) ? window.ComponentLabeler : require('./component-labeler.js');
  var GroupEnvelope = (typeof window !== 'undefined' && window.GroupEnvelope) ? window.GroupEnvelope : require('./group-envelope.js');
  var ThinStructure = (typeof window !== 'undefined' && window.ThinStructure) ? window.ThinStructure : require('./thin-structure.js');
  var MaskRefiner = (typeof window !== 'undefined' && window.MaskRefiner) ? window.MaskRefiner : require('./mask-refiner.js');
  var EdgePyramid = (typeof window !== 'undefined' && window.EdgePyramid) ? window.EdgePyramid : require('./edge-pyramid.js');
  var ColorQuantizer = (typeof window !== 'undefined' && window.ColorQuantizer) ? window.ColorQuantizer : require('./color-quantizer.js');
  var PaperComposer = (typeof window !== 'undefined' && window.PaperComposer) ? window.PaperComposer : require('./paper-composer.js');
  var ConfidenceFallback = (typeof window !== 'undefined' && window.ConfidenceFallback) ? window.ConfidenceFallback : require('./confidence-fallback.js');

  /**
   * Process an image buffer through the Group Color-Sketch pipeline
   * @param {Uint8ClampedArray} pixels - RGBA pixel buffer
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @param {object} [sketchState] - Effect parameters { effectId, intensity, lineStrength, colorStrength, paperStrength, backgroundWashStrength }
   * @param {object} [options] - Calibration / operator overrides
   * @returns {object} { pixels: Uint8ClampedArray, confidenceInfo: object, groupBounds: object, transform: object }
   */
  function process(pixels, width, height, sketchState, options) {
    sketchState = sketchState || {};
    options = options || {};

    var preset = SketchDefinitions.getSketchPreset(sketchState.effectId || 'group-color-sketch');
    var intensity = (typeof sketchState.intensity === 'number') ? (sketchState.intensity / 100.0) : 1.0;
    var lineStrength = (typeof sketchState.lineStrength === 'number') ? (sketchState.lineStrength / 100.0) : preset.lineStrength;
    var colorStrength = (typeof sketchState.colorStrength === 'number') ? (sketchState.colorStrength / 100.0) : preset.colorStrength;
    var paperStrength = (typeof sketchState.paperStrength === 'number') ? (sketchState.paperStrength / 100.0) : preset.paperStrength;
    var washStrength = (typeof sketchState.backgroundWashStrength === 'number') ? (sketchState.backgroundWashStrength / 100.0) : preset.backgroundWashStrength;

    // Working copy of source pixels
    var workPixels = new Uint8ClampedArray(pixels);

    // Stage 1: Calibrate Sky-Blue Backdrop Profile from safe perimeter patches
    var backdropProfile = options.calibratedBackdrop || BackdropCalibrator.calibrateBackdrop(workPixels, width, height);

    // Stage 2: Initial Multi-Scale Edge Pyramid
    var edgePyramidResult = EdgePyramid.buildEdgePyramid(workPixels, width, height, preset.edgeWeights);

    // Stage 3: Initial Multi-dimensional Color-Key Alpha
    var rawAlpha = ColorKey.generateColorKeyMask(workPixels, width, height, backdropProfile, null, options);

    // Stage 4: 8-Connected Component Labeling (Multi-Component Extraction)
    var labelResult = ComponentLabeler.labelComponents(rawAlpha, width, height, 0.45);

    // Stage 5: Retain Multiple Components (Never keep only the largest!)
    var retainedIds = ComponentLabeler.retainForegroundComponents(labelResult, SketchDefinitions.DEFAULT_THRESHOLDS);

    // Stage 6: Build Two-Pass Group Envelope & Spatially-Supported Region Expansion
    var envelopeResult = GroupEnvelope.buildGroupEnvelope(labelResult.components, retainedIds, width, height);
    var finalRetainedIds = envelopeResult.retainedIds;
    var groupBounds = envelopeResult.bounds;

    // Stage 7: Filter Alpha Mask to Retained Multi-Components
    var multiComponentAlpha = ComponentLabeler.applyRetainedComponents(rawAlpha, labelResult.labels, finalRetainedIds);

    // Stage 8: Re-apply Blue Clothing Protection inside the established Group Envelope
    var protectedAlpha = ColorKey.generateColorKeyMask(workPixels, width, height, backdropProfile, groupBounds, options);
    for (var i = 0; i < multiComponentAlpha.length; i++) {
      if (multiComponentAlpha[i] > 0 || protectedAlpha[i] > 0.65) {
        multiComponentAlpha[i] = Math.max(multiComponentAlpha[i], protectedAlpha[i]);
      }
    }

    // Stage 9: 10-Stage Mask Refinement, Adaptive Feathering & Spill Suppression
    var refinement = MaskRefiner.refineMaskPipeline(multiComponentAlpha, workPixels, width, height, edgePyramidResult.blendedEdges, {
      maxFeatherPx: 4,
      spillStrength: 0.85
    });
    var finalMask = refinement.refinedMask;

    // Stage 10: 3-Level Confidence & Fallback Evaluation
    var confidenceInfo = ConfidenceFallback.evaluateMaskConfidence(backdropProfile, finalMask, width, height, groupBounds);

    // If Level 3 Fallback (<0.68 confidence): Preserve full frame color sketch (zero background deletion)
    if (confidenceInfo.fallbackLevel === 3) {
      for (var f = 0; f < finalMask.length; f++) {
        finalMask[f] = 1.0; // full frame mode
      }
    } else if (confidenceInfo.fallbackLevel === 2) {
      // Level 2 (0.68 - 0.79): Blend soft wash
      for (var w = 0; w < finalMask.length; w++) {
        finalMask[w] = Math.min(1.0, finalMask[w] + 0.15 * washStrength);
      }
    }

    // Stage 11: Color Simplification via Shared Group Palette
    var quantResult = ColorQuantizer.quantizeColorField(workPixels, finalMask, width, height, preset.paletteSize);

    // Stage 12: Sketch Composition (Ink Lines + Quantized Color + Paper Base)
    var sketchOutput = PaperComposer.composeSketch(
      quantResult.simplifiedPixels,
      edgePyramidResult.classifiedEdges,
      finalMask,
      width,
      height,
      {
        inkColor: preset.inkColor,
        lineStrength: lineStrength,
        colorStrength: colorStrength,
        paperTint: preset.paperTint,
        seed: options.seed || 'group-sketch-stable-seed'
      }
    );

    // Stage 13: Uniform Scaling Composition Transform Calculation
    var transform = PaperComposer.calculateCompositionTransform(groupBounds, width, height);

    // Blend between original image and sketch according to user intensity
    if (intensity < 1.0) {
      for (var k = 0; k < sketchOutput.length; k += 4) {
        sketchOutput[k] = Math.round(pixels[k] + (sketchOutput[k] - pixels[k]) * intensity);
        sketchOutput[k + 1] = Math.round(pixels[k + 1] + (sketchOutput[k + 1] - pixels[k + 1]) * intensity);
        sketchOutput[k + 2] = Math.round(pixels[k + 2] + (sketchOutput[k + 2] - pixels[k + 2]) * intensity);
      }
    }

    return {
      pixels: sketchOutput,
      confidenceInfo: confidenceInfo,
      groupBounds: groupBounds,
      transform: transform,
      backdropProfile: backdropProfile,
      retainedComponentCount: finalRetainedIds.size
    };
  }

  exports.process = process;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.SketchEngine = {}));
