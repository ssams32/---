/**
 * 마음 네컷 포토부스 - First-Party Filter Web Worker
 * Offloads 24-step pixel processing pipeline to a dedicated thread.
 * Zero external calls, zero eval, zero DOM access, zero persistence.
 * Uses zero-copy Transferable ArrayBuffers for optimal iPad Safari throughput.
 */
(() => {
  'use strict';

  // Load dependent engines inside Worker scope
  try {
    importScripts('./curve-engine.js', './lut-parser.js', './filter-definitions.js', './pixel-engine.js');
  } catch (err) {
    // In environments where importScripts is not available (or already bundled), ignore
  }

  self.onmessage = function handleWorkerMessage(event) {
    const data = event.data;
    if (!data || !data.taskId) {
      return;
    }

    const startTime = performance.now();
    const { taskId, photoId, width, height, pixels, filter, intensity, adjustments, grainSeed } = data;

    if (!pixels || !(pixels instanceof ArrayBuffer)) {
      self.postMessage({
        taskId,
        photoId,
        error: 'Invalid or missing ArrayBuffer in worker request'
      });
      return;
    }

    try {
      // Wrap transferred ArrayBuffer into Uint8ClampedArray
      const pixelArray = new Uint8ClampedArray(pixels);
      const imageData = {
        width,
        height,
        data: pixelArray
      };

      // Resolve combined filter parameters
      let combinedParams = {};
      if (self.FilterDefinitions && self.FilterDefinitions.interpolateParameters) {
        combinedParams = self.FilterDefinitions.interpolateParameters(filter, intensity, adjustments);
      } else {
        combinedParams = Object.assign({}, filter, adjustments);
      }

      // Execute deterministic 24-step pixel pipeline
      if (self.PixelEngine && self.PixelEngine.processPixelPipeline) {
        self.PixelEngine.processPixelPipeline(imageData, combinedParams, {
          intensity: typeof intensity === 'number' ? intensity : 1.0,
          grainSeed: grainSeed || photoId || taskId,
          photoId
        });
      }

      const processingMs = performance.now() - startTime;

      // Transfer the modified ArrayBuffer back with zero copy
      self.postMessage(
        {
          taskId,
          photoId,
          width,
          height,
          pixels: pixelArray.buffer,
          processingMs
        },
        [pixelArray.buffer]
      );
    } catch (err) {
      self.postMessage({
        taskId,
        photoId,
        error: err && err.message ? err.message : 'Unknown filter worker error'
      });
    }
  };
})();
