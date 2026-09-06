/**
 * 마음 네컷 포토부스 - First-Party Bounded LRU Filter Preview Cache
 * Manages cached filter preview bitmaps / object URLs.
 * Strict limits: Max 24 entries, Max 48MB combined pixel memory.
 * Gracefully revokes object URLs and closes ImageBitmaps upon eviction or reset.
 */
(() => {
  'use strict';

  const MAX_ENTRIES = 24;
  const MAX_BYTES = 48 * 1024 * 1024; // 48MB

  /**
   * Generates a deterministic hash for manual adjustments
   * @param {object} adjustments
   * @returns {string}
   */
  function hashAdjustments(adjustments) {
    if (!adjustments || typeof adjustments !== 'object') return 'adj_none';
    const b = Math.round((adjustments.brightness || 0) * 100);
    const c = Math.round((adjustments.contrast || 0) * 100);
    const s = Math.round((adjustments.saturation || 0) * 100);
    const t = Math.round((adjustments.temperature || 0) * 100);
    const tint = Math.round((adjustments.tint || 0) * 100);
    if (b === 0 && c === 0 && s === 0 && t === 0 && tint === 0) {
      return 'adj_none';
    }
    return `b${b}_c${c}_s${s}_t${t}_ti${tint}`;
  }

  /**
   * Generates a standard cache key: photoId:filterId:roundedIntensity:adjhash:WxH
   * @param {string} photoId
   * @param {string} filterId
   * @param {number} intensity - 0 to 1 or 0 to 100
   * @param {object} adjustments
   * @param {number} width
   * @param {number} height
   * @returns {string}
   */
  function createCacheKey(photoId, filterId, intensity, adjustments, width, height) {
    const normIntensity = intensity > 1.0 ? Math.round(intensity) : Math.round((intensity || 0) * 100);
    const adjHash = hashAdjustments(adjustments);
    const pid = photoId || 'photo_unknown';
    const fid = filterId || 'original';
    const w = Math.round(width) || 0;
    const h = Math.round(height) || 0;
    return `${pid}:${fid}:${normIntensity}:${adjHash}:${w}x${h}`;
  }

  class FilterCache {
    constructor(maxEntries = MAX_ENTRIES, maxBytes = MAX_BYTES) {
      this.maxEntries = maxEntries;
      this.maxBytes = maxBytes;
      this.entries = new Map(); // Map preserves insertion order for LRU
      this.currentBytes = 0;
    }

    /**
     * Retrieves an item and promotes it to most-recently-used
     * @param {string} key
     * @returns {object|null}
     */
    get(key) {
      if (!this.entries.has(key)) {
        return null;
      }
      const entry = this.entries.get(key);
      // Re-insert to mark as most recently used
      this.entries.delete(key);
      this.entries.set(key, entry);
      return entry;
    }

    /**
     * Stores an item, evicting oldest items if exceeding capacity
     * @param {string} key
     * @param {object} item - { objectUrl, bitmap, blob, width, height, byteSize }
     */
    set(key, item) {
      if (!key || !item) return;

      // If already present, remove old entry and update size
      if (this.entries.has(key)) {
        this.delete(key);
      }

      const byteSize = item.byteSize || ((item.width || 0) * (item.height || 0) * 4) || 256 * 1024;
      const entry = {
        ...item,
        byteSize,
        storedAt: Date.now()
      };

      // Evict until within limits
      while (
        (this.entries.size >= this.maxEntries || (this.currentBytes + byteSize > this.maxBytes)) &&
        this.entries.size > 0
      ) {
        const oldestKey = this.entries.keys().next().value;
        this.delete(oldestKey);
      }

      this.entries.set(key, entry);
      this.currentBytes += byteSize;
    }

    /**
     * Deletes a single entry and cleans up resources
     * @param {string} key
     */
    delete(key) {
      if (!this.entries.has(key)) return false;
      const entry = this.entries.get(key);
      this.currentBytes = Math.max(0, this.currentBytes - (entry.byteSize || 0));

      this._disposeEntry(entry);
      this.entries.delete(key);
      return true;
    }

    /**
     * Disposes resources associated with an entry
     * @private
     */
    _disposeEntry(entry) {
      if (!entry) return;
      if (entry.objectUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        try {
          URL.revokeObjectURL(entry.objectUrl);
        } catch (e) {
          // ignore
        }
      }
      if (entry.bitmap && typeof entry.bitmap.close === 'function') {
        try {
          entry.bitmap.close();
        } catch (e) {
          // ignore
        }
      }
      entry.objectUrl = null;
      entry.bitmap = null;
      entry.blob = null;
    }

    /**
     * Clears all cached items and disposes all object URLs and bitmaps
     */
    clear() {
      for (const entry of this.entries.values()) {
        this._disposeEntry(entry);
      }
      this.entries.clear();
      this.currentBytes = 0;
    }

    /**
     * Purges entries matching a specific photoId
     * @param {string} photoId
     */
    clearPhoto(photoId) {
      if (!photoId) return;
      const prefix = `${photoId}:`;
      for (const key of Array.from(this.entries.keys())) {
        if (key.startsWith(prefix)) {
          this.delete(key);
        }
      }
    }

    get size() {
      return this.entries.size;
    }

    get totalBytes() {
      return this.currentBytes;
    }
  }

  // Singleton instance
  const globalFilterCache = new FilterCache();

  const FilterCacheModule = {
    FilterCache,
    globalFilterCache,
    createCacheKey,
    hashAdjustments,
    MAX_ENTRIES,
    MAX_BYTES
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FilterCacheModule;
  }
  if (typeof window !== 'undefined') {
    window.FilterCacheModule = FilterCacheModule;
  }
  if (typeof self !== 'undefined') {
    self.FilterCacheModule = FilterCacheModule;
  }
})();
