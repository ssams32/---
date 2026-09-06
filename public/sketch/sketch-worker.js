/**
 * sketch-worker.js
 * Dedicated Web Worker for Off-thread Group Color Sketch Processing.
 * Strictly Non-AI, zero DOM, zero network calls, zero eval.
 */

self.importScripts(
  'sketch-definitions.js',
  'backdrop-calibrator.js',
  'color-key.js',
  'component-labeler.js',
  'group-envelope.js',
  'thin-structure.js',
  'mask-refiner.js',
  'edge-pyramid.js',
  'color-quantizer.js',
  'paper-composer.js',
  'confidence-fallback.js',
  'sketch-engine.js'
);

self.onmessage = function(e) {
  var data = e.data;
  if (!data || !data.taskId) return;

  var taskId = data.taskId;
  var photoId = data.photoId;
  var width = data.width;
  var height = data.height;
  var pixels = data.pixels;
  var sketchState = data.sketchState || {};
  var options = data.options || {};

  var startTime = performance.now();

  try {
    var uint8Clamped = new Uint8ClampedArray(pixels);
    var result = self.SketchEngine.process(uint8Clamped, width, height, sketchState, options);
    var processingMs = Math.round(performance.now() - startTime);

    self.postMessage({
      taskId: taskId,
      photoId: photoId,
      width: width,
      height: height,
      pixels: result.pixels.buffer,
      confidenceInfo: result.confidenceInfo,
      groupBounds: result.groupBounds,
      transform: result.transform,
      retainedComponentCount: result.retainedComponentCount,
      processingMs: processingMs,
      success: true
    }, [result.pixels.buffer]);
  } catch (err) {
    self.postMessage({
      taskId: taskId,
      photoId: photoId,
      error: err.message,
      success: false
    });
  }
};
