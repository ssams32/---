/**
 * sketch-client.js
 * Client-Side Controller for Group Color Sketch Platform.
 * Features Web Worker offloading, LRU Preview Cache, Main-Thread Fallback, and Sequential Final Rendering.
 */
(function(exports) {
  'use strict';

  var worker = null;
  var pendingTasks = new Map();
  var taskCounter = 0;
  var cache = null;

  function initWorker() {
    if (typeof Worker === 'undefined') return null;
    if (worker) return worker;

    try {
      worker = new Worker('/sketch/sketch-worker.js');
      worker.onmessage = function(e) {
        var data = e.data;
        if (!data || !data.taskId) return;
        var p = pendingTasks.get(data.taskId);
        if (p) {
          pendingTasks.delete(data.taskId);
          if (data.success) {
            p.resolve(data);
          } else {
            p.reject(new Error(data.error || 'Worker sketch failed'));
          }
        }
      };
      worker.onerror = function(err) {
        console.warn('Sketch worker error, using fallback:', err);
        pendingTasks.forEach(function(p) {
          p.reject(err);
        });
        pendingTasks.clear();
        terminateWorker();
      };
    } catch (e) {
      console.warn('Unable to initialize Sketch Web Worker:', e);
      worker = null;
    }
    return worker;
  }

  function terminateWorker() {
    if (worker) {
      try { worker.terminate(); } catch(e) {}
      worker = null;
    }
    pendingTasks.clear();
  }

  function getCache() {
    if (!cache && typeof window !== 'undefined' && window.SketchCacheModule) {
      cache = new window.SketchCacheModule.SketchCache({ maxEntries: 16, maxMemoryBytes: 48 * 1024 * 1024 });
    }
    return cache;
  }

  /**
   * Render sketch processing offloaded to Worker or fallback to main-thread
   */
  async function processSketch(pixels, width, height, photoId, sketchState, options) {
    var c = getCache();
    var key = c ? c.createKey(
      photoId,
      sketchState.effectId,
      sketchState.intensity,
      sketchState.lineStrength,
      sketchState.colorStrength,
      width,
      height,
      sketchState.paperStrength
    ) : null;

    if (c && key) {
      var cached = c.get(key);
      if (cached) return cached;
    }

    var w = initWorker();
    if (w) {
      var taskId = 'sketch_task_' + (++taskCounter) + '_' + Date.now();
      var promise = new Promise(function(resolve, reject) {
        pendingTasks.set(taskId, { resolve: resolve, reject: reject });
        setTimeout(function() {
          if (pendingTasks.has(taskId)) {
            pendingTasks.delete(taskId);
            reject(new Error('Sketch worker task timeout'));
          }
        }, 12000);
      });

      // Transfer pixel buffer to worker without copying
      var bufferCopy = pixels.buffer.slice(0);
      w.postMessage({
        taskId: taskId,
        photoId: photoId,
        width: width,
        height: height,
        pixels: bufferCopy,
        sketchState: sketchState,
        options: options
      }, [bufferCopy]);

      try {
        var workerRes = await promise;
        var outPixels = new Uint8ClampedArray(workerRes.pixels);
        var resultObj = {
          pixels: outPixels,
          confidenceInfo: workerRes.confidenceInfo,
          groupBounds: workerRes.groupBounds,
          transform: workerRes.transform,
          retainedComponentCount: workerRes.retainedComponentCount
        };

        if (c && key) {
          c.set(key, resultObj, outPixels.byteLength);
        }
        return resultObj;
      } catch (err) {
        console.warn('Worker sketch execution failed, running main-thread fallback:', err);
      }
    }

    // Main-Thread Fallback
    if (typeof window !== 'undefined' && window.SketchEngine) {
      var fallbackRes = window.SketchEngine.process(pixels, width, height, sketchState, options);
      if (c && key) {
        c.set(key, fallbackRes, fallbackRes.pixels.byteLength);
      }
      return fallbackRes;
    }

    throw new Error('Sketch engine unavailable in current environment');
  }

  /**
   * Render sketch preview onto HTML5 Canvas
   */
  async function renderPreviewToCanvas(canvas, imgEl, photoId, sketchState, options) {
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;

    // Draw source scaled to canvas dimensions with zero-distortion aspect preservation
    var sW = imgEl.naturalWidth || imgEl.videoWidth || imgEl.width || w;
    var sH = imgEl.naturalHeight || imgEl.videoHeight || imgEl.height || h;
    var scale = Math.max(w / sW, h / sH);
    var cropW = w / scale;
    var cropH = h / scale;
    var cropX = (sW - cropW) / 2;
    var cropY = (sH - cropH) / 2;
    ctx.drawImage(imgEl, cropX, cropY, cropW, cropH, 0, 0, w, h);
    var imgData = ctx.getImageData(0, 0, w, h);

    var res = await processSketch(imgData.data, w, h, photoId, sketchState, options);
    var outData = new ImageData(res.pixels, w, h);
    ctx.putImageData(outData, 0, 0);

    return res;
  }

  /**
   * Render full-resolution sketch bitmap for final canvas composition
   */
  async function renderToBitmap(sourceBlob, sketchState, targetW, targetH, options) {
    var bmp = await createImageBitmap(sourceBlob);
    var canvas = document.createElement('canvas');
    canvas.width = targetW || 1200;
    canvas.height = targetH || 900;
    var ctx = canvas.getContext('2d');

    // Crop center 4:3 or slot ratio
    var sAspect = bmp.width / bmp.height;
    var tAspect = canvas.width / canvas.height;
    var sx = 0, sy = 0, sw = bmp.width, sh = bmp.height;

    if (sAspect > tAspect) {
      sw = bmp.height * tAspect;
      sx = (bmp.width - sw) / 2;
    } else {
      sh = bmp.width / tAspect;
      sy = (bmp.height - sh) / 2;
    }

    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    try { bmp.close(); } catch(e) {}

    var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var res = await processSketch(imgData.data, canvas.width, canvas.height, 'final_' + Date.now(), sketchState, options);
    var outData = new ImageData(res.pixels, canvas.width, canvas.height);
    ctx.putImageData(outData, 0, 0);

    return await createImageBitmap(canvas);
  }

  /**
   * Full privacy reset: purge cache, terminate workers, clear pending tasks
   */
  function reset() {
    terminateWorker();
    if (cache) {
      cache.clear();
      cache = null;
    }
  }

  exports.initWorker = initWorker;
  exports.terminateWorker = terminateWorker;
  exports.processSketch = processSketch;
  exports.renderPreviewToCanvas = renderPreviewToCanvas;
  exports.renderToBitmap = renderToBitmap;
  exports.reset = reset;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.SketchClient = {}));
