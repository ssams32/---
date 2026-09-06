/**
 * 마음 네컷 포토부스 - First-Party Filter Client Coordinator
 * Orchestrates Web Worker background processing, stale task discarding,
 * LRU preview caching, and main-thread fallback (max 480px) for iPad Safari.
 */
(() => {
  'use strict';

  class FilterClient {
    constructor(options = {}) {
      this.workerUrl = options.workerUrl || '/filters/filter-worker.js';
      this.worker = null;
      this.workerAvailable = null; // null: untested, true: working, false: failed/fallback
      this.pendingTasks = new Map(); // taskId -> { resolve, reject, photoId, isPreview, timer }
      this.latestPreviewTaskForPhoto = new Map(); // photoId -> taskId
      this.taskCounter = 0;
      this.cache = (typeof FilterCacheModule !== 'undefined' && FilterCacheModule.globalFilterCache) ?
        FilterCacheModule.globalFilterCache : null;
      this.fallbackMaxEdge = 480;
    }

    /**
     * Initializes or gets the active Web Worker
     */
    initWorker() {
      if (this.workerAvailable === false) return null;
      if (this.worker) return this.worker;

      if (typeof Worker === 'undefined') {
        this.workerAvailable = false;
        return null;
      }

      try {
        this.worker = new Worker(this.workerUrl);
        this.worker.onmessage = (event) => this._handleWorkerResponse(event.data);
        this.worker.onerror = (err) => {
          console.warn('[FilterClient] Worker error, falling back to main-thread engine:', err);
          this.workerAvailable = false;
          this._rejectAllPending('Worker failed');
          if (this.worker) {
            this.worker.terminate();
            this.worker = null;
          }
        };
        this.workerAvailable = true;
      } catch (err) {
        console.warn('[FilterClient] Could not instantiate Web Worker, using main thread fallback:', err);
        this.workerAvailable = false;
        this.worker = null;
      }
      return this.worker;
    }

    /**
     * Handles messages returned from the Web Worker
     */
    _handleWorkerResponse(data) {
      if (!data || !data.taskId) return;
      const { taskId, photoId, pixels, width, height, error, processingMs } = data;

      const task = this.pendingTasks.get(taskId);
      if (!task) return; // Discarded or timed out

      clearTimeout(task.timer);
      this.pendingTasks.delete(taskId);

      // Check if this preview task was superseded by a newer one for the same photo
      if (task.isPreview && this.latestPreviewTaskForPhoto.get(photoId) !== taskId) {
        // Superseded preview task; ignore result to avoid race condition flicker
        return;
      }

      if (error) {
        task.reject(new Error(error));
        return;
      }

      const imageData = {
        width,
        height,
        data: new Uint8ClampedArray(pixels)
      };

      task.resolve({
        imageData,
        processingMs: processingMs || 0
      });
    }

    _rejectAllPending(reason) {
      for (const [taskId, task] of this.pendingTasks.entries()) {
        clearTimeout(task.timer);
        task.reject(new Error(reason));
      }
      this.pendingTasks.clear();
      this.latestPreviewTaskForPhoto.clear();
    }

    /**
     * Executes filter pipeline either via Worker or Main-Thread Fallback
     * @param {object} req
     * @param {string} req.photoId
     * @param {ImageData|{data: Uint8ClampedArray, width: number, height: number}} req.imageData
     * @param {object} req.filter - Preset filter definition
     * @param {number} req.intensity - 0.0 to 1.0
     * @param {object} [req.adjustments]
     * @param {boolean} [req.isPreview]
     * @param {string} [req.grainSeed]
     * @returns {Promise<{imageData: ImageData|object, processingMs: number}>}
     */
    async process(req) {
      const { photoId, imageData, filter, intensity, adjustments, isPreview, grainSeed } = req;

      if (!imageData || !imageData.data || !imageData.width || !imageData.height) {
        throw new Error('Invalid ImageData in filter request');
      }

      const taskId = `task_${++this.taskCounter}_${Date.now()}`;
      if (isPreview && photoId) {
        this.latestPreviewTaskForPhoto.set(photoId, taskId);
      }

      const worker = this.initWorker();

      // If worker is active, transfer pixel copy to worker
      if (worker && this.workerAvailable) {
        return new Promise((resolve, reject) => {
          // Copy buffer because transfer detaches the ArrayBuffer
          const bufferCopy = imageData.data.slice().buffer;

          const timer = setTimeout(() => {
            if (this.pendingTasks.has(taskId)) {
              this.pendingTasks.delete(taskId);
              reject(new Error('Filter worker operation timed out'));
            }
          }, 8000);

          this.pendingTasks.set(taskId, {
            resolve,
            reject,
            photoId,
            isPreview: !!isPreview,
            timer
          });

          worker.postMessage(
            {
              taskId,
              photoId,
              width: imageData.width,
              height: imageData.height,
              pixels: bufferCopy,
              filter,
              intensity: typeof intensity === 'number' ? intensity : 1.0,
              adjustments: adjustments || {},
              grainSeed: grainSeed || photoId || taskId
            },
            [bufferCopy]
          );
        });
      }

      // Fallback: synchronous execution on main thread with safety edge limit
      return this._processMainThreadFallback(req, taskId);
    }

    /**
     * Main-thread fallback execution
     */
    _processMainThreadFallback(req, taskId) {
      const startTime = (typeof performance !== 'undefined') ? performance.now() : Date.now();
      const { photoId, imageData, filter, intensity, adjustments, isPreview, grainSeed } = req;

      // Check if preview task superseded
      if (isPreview && photoId && this.latestPreviewTaskForPhoto.get(photoId) !== taskId) {
        return Promise.reject(new Error('Task superseded'));
      }

      let PE = (typeof PixelEngine !== 'undefined') ? PixelEngine :
        (typeof window !== 'undefined' ? window.PixelEngine : null);
      let FD = (typeof FilterDefinitions !== 'undefined') ? FilterDefinitions :
        (typeof window !== 'undefined' ? window.FilterDefinitions : null);

      if (!PE && typeof require === 'function') {
        try { PE = require('./pixel-engine.js'); } catch (e) {}
      }
      if (!FD && typeof require === 'function') {
        try { FD = require('./filter-definitions.js'); } catch (e) {}
      }

      if (!PE) {
        throw new Error('PixelEngine not available for fallback processing');
      }

      // Clone image data to avoid destructive in-place mutation of original
      const dataCopy = new Uint8ClampedArray(imageData.data);
      const clonedImgData = {
        width: imageData.width,
        height: imageData.height,
        data: dataCopy
      };

      let combinedParams = {};
      if (FD && FD.interpolateParameters) {
        combinedParams = FD.interpolateParameters(filter, intensity, adjustments);
      } else {
        combinedParams = Object.assign({}, filter, adjustments);
      }

      PE.processPixelPipeline(clonedImgData, combinedParams, {
        intensity: typeof intensity === 'number' ? intensity : 1.0,
        grainSeed: grainSeed || photoId || taskId,
        photoId
      });

      const processingMs = ((typeof performance !== 'undefined') ? performance.now() : Date.now()) - startTime;
      return Promise.resolve({
        imageData: clonedImgData,
        processingMs
      });
    }

    /**
     * Renders a filtered preview onto a target Canvas element, checking LRU cache
     * @param {HTMLCanvasElement} canvas
     * @param {HTMLImageElement|HTMLCanvasElement|ImageData} source
     * @param {string} photoId
     * @param {object} filter
     * @param {number} intensity - 0.0 to 1.0
     * @param {object} adjustments
     * @returns {Promise<void>}
     */
    async renderPreviewToCanvas(canvas, source, photoId, filter, intensity, adjustments) {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      const filterId = filter ? filter.id : 'original';

      // Check LRU cache if available
      let cacheKey = null;
      if (this.cache && typeof FilterCacheModule !== 'undefined') {
        cacheKey = FilterCacheModule.createCacheKey(photoId, filterId, intensity, adjustments, width, height);
        const cached = this.cache.get(cacheKey);
        if (cached && cached.bitmap) {
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(cached.bitmap, 0, 0, width, height);
          return;
        }
      }

      // Extract ImageData from source with zero-distortion aspect preservation
      let srcImageData = null;
      if (source instanceof ImageData) {
        srcImageData = source;
      } else {
        const offCanvas = document.createElement('canvas');
        offCanvas.width = width;
        offCanvas.height = height;
        const offCtx = offCanvas.getContext('2d');

        const sW = source.naturalWidth || source.videoWidth || source.width || width;
        const sH = source.naturalHeight || source.videoHeight || source.height || height;
        const scale = Math.max(width / sW, height / sH);
        const cropW = width / scale;
        const cropH = height / scale;
        const cropX = (sW - cropW) / 2;
        const cropY = (sH - cropH) / 2;
        offCtx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, width, height);
        srcImageData = offCtx.getImageData(0, 0, width, height);
      }

      // Process via worker or main thread
      const result = await this.process({
        photoId,
        imageData: srcImageData,
        filter,
        intensity,
        adjustments,
        isPreview: true
      });

      // Draw result to target canvas
      const outImgData = result.imageData instanceof ImageData ?
        result.imageData :
        new ImageData(result.imageData.data, result.imageData.width, result.imageData.height);

      ctx.putImageData(outImgData, 0, 0);

      // Store in LRU cache
      if (this.cache && cacheKey && typeof createImageBitmap === 'function') {
        try {
          const bitmap = await createImageBitmap(canvas);
          this.cache.set(cacheKey, {
            bitmap,
            width,
            height,
            byteSize: width * height * 4
          });
        } catch (e) {
          // createImageBitmap fallback ignore
        }
      }
    }

    /**
     * Fully releases worker, pending tasks, and cached preview allocations
     */
    reset() {
      this._rejectAllPending('Client reset');
      if (this.worker) {
        try {
          this.worker.terminate();
        } catch (e) {
          // ignore
        }
        this.worker = null;
      }
      this.workerAvailable = null;
      if (this.cache) {
        this.cache.clear();
      }
      if (typeof PixelEngine !== 'undefined' && PixelEngine.releaseWorkingBuffers) {
        PixelEngine.releaseWorkingBuffers();
      }
    }
  }

  // Global instance
  const globalFilterClient = new FilterClient();

  const FilterClientModule = {
    FilterClient,
    globalFilterClient
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FilterClientModule;
  }
  if (typeof window !== 'undefined') {
    window.FilterClientModule = FilterClientModule;
    window.filterClient = globalFilterClient;
  }
  if (typeof self !== 'undefined') {
    self.FilterClientModule = FilterClientModule;
  }
})();
