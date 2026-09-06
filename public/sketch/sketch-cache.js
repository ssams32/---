/**
 * sketch-cache.js
 * Bounded LRU Cache for Sketch Previews (Max 16 entries, Max 48MB).
 */
(function(exports) {
  'use strict';

  function SketchCache(options) {
    options = options || {};
    this.maxEntries = options.maxEntries || 16;
    this.maxMemoryBytes = options.maxMemoryBytes || (48 * 1024 * 1024);
    this.cache = new Map();
    this.totalMemoryBytes = 0;

    Object.defineProperty(this, 'entries', {
      get: function() { return this.cache; },
      configurable: true
    });
    Object.defineProperty(this, 'currentMemoryBytes', {
      get: function() { return this.totalMemoryBytes; },
      configurable: true
    });
    Object.defineProperty(this, 'currentBytes', {
      get: function() { return this.totalMemoryBytes; },
      configurable: true
    });
  }

  SketchCache.prototype.createKey = function(photoId, effectId, intensity, lineStrength, colorStrength, width, height, paperStrength) {
    var to100 = function(v, d) {
      var n = (typeof v === 'number' && !isNaN(v)) ? v : d;
      return Math.round(n > 1.0 ? n : (n * 100));
    };
    var intR = to100(intensity, 100);
    var lineR = to100(lineStrength, 85);
    var colR = to100(colorStrength, 80);
    var papR = to100(paperStrength, 45);
    return photoId + ':' + effectId + ':' + intR + '_' + lineR + '_' + colR + '_' + papR + ':' + width + 'x' + height;
  };

  SketchCache.prototype.get = function(key) {
    if (!this.cache.has(key)) return null;
    var entry = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  };

  SketchCache.prototype.set = function(key, value, estimatedBytes) {
    if (this.cache.has(key)) {
      this.delete(key);
    }
    while (
      (this.cache.size >= this.maxEntries || (this.totalMemoryBytes + estimatedBytes) > this.maxMemoryBytes) &&
      this.cache.size > 0
    ) {
      var oldestKey = this.cache.keys().next().value;
      this.delete(oldestKey);
    }
    this.cache.set(key, { value: value, bytes: estimatedBytes });
    this.totalMemoryBytes += estimatedBytes;
  };

  SketchCache.prototype.delete = function(key) {
    if (!this.cache.has(key)) return;
    var entry = this.cache.get(key);
    if (entry.value && typeof entry.value === 'string' && entry.value.indexOf('blob:') === 0) {
      try { URL.revokeObjectURL(entry.value); } catch(e) {}
    }
    this.totalMemoryBytes -= entry.bytes;
    this.cache.delete(key);
  };

  SketchCache.prototype.clear = function() {
    this.cache.forEach(function(entry) {
      if (entry.value && typeof entry.value === 'string' && entry.value.indexOf('blob:') === 0) {
        try { URL.revokeObjectURL(entry.value); } catch(e) {}
      }
    });
    this.cache.clear();
    this.totalMemoryBytes = 0;
  };

  exports.SketchCache = SketchCache;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.SketchCacheModule = {}));
