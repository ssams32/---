/**
 * 마음 네컷 포토부스 - Strict Local 3D LUT (.cube) Parser & Trilinear Interpolator
 * Only processes local bundled or in-memory .cube text with size 17 or 33.
 * Deterministic, non-allocating during pixel interpolation, and strictly bounded.
 */
(() => {
  'use strict';

  /**
   * @typedef {Object} ParsedLUT
   * @property {number} size - 17 or 33
   * @property {Float32Array} table - size*size*size*3 values in range [0, 1]
   * @property {string} title
   */

  /**
   * Parses a 3D .cube file string.
   * Strictly enforces:
   * - LUT_3D_SIZE must be exactly 17 or 33.
   * - Total entries must match size^3 triplets.
   * - Values must be finite and normalized to [0, 1].
   * @param {string} cubeText
   * @returns {ParsedLUT}
   */
  function parseCubeLUT(cubeText) {
    if (typeof cubeText !== 'string' || cubeText.length < 50) {
      throw new Error('Invalid .cube text: content too short or empty');
    }

    const lines = cubeText.split(/\r?\n/);
    let size = 0;
    let title = 'Untitled LUT';
    const rawNumbers = [];
    let domainMin = [0.0, 0.0, 0.0];
    let domainMax = [1.0, 1.0, 1.0];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;

      if (line.startsWith('TITLE')) {
        title = line.replace(/^TITLE\s*"?/, '').replace(/"?$/, '') || 'Untitled';
        continue;
      }
      if (line.startsWith('LUT_3D_SIZE')) {
        const parts = line.split(/\s+/);
        size = parseInt(parts[1], 10);
        if (size !== 17 && size !== 33) {
          throw new Error(`Unsupported LUT size ${size}: only 17 and 33 are supported`);
        }
        continue;
      }
      if (line.startsWith('DOMAIN_MIN')) {
        const parts = line.split(/\s+/).slice(1).map(Number);
        if (parts.length >= 3 && parts.every(Number.isFinite)) {
          domainMin = parts.slice(0, 3);
        }
        continue;
      }
      if (line.startsWith('DOMAIN_MAX')) {
        const parts = line.split(/\s+/).slice(1).map(Number);
        if (parts.length >= 3 && parts.every(Number.isFinite)) {
          domainMax = parts.slice(0, 3);
        }
        continue;
      }
      if (line.startsWith('LUT_1D_SIZE')) {
        throw new Error('1D LUTs are not supported; use curves instead');
      }

      // Check numeric data lines
      const parts = line.split(/\s+/);
      if (parts.length >= 3) {
        const r = parseFloat(parts[0]);
        const g = parseFloat(parts[1]);
        const b = parseFloat(parts[2]);
        if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
          throw new Error(`Invalid non-finite float at line ${i + 1}`);
        }
        rawNumbers.push(r, g, b);
      }
    }

    if (size === 0) {
      throw new Error('Missing LUT_3D_SIZE directive');
    }

    const expectedFloats = size * size * size * 3;
    if (rawNumbers.length !== expectedFloats) {
      throw new Error(`Invalid entry count: expected ${expectedFloats} floats, found ${rawNumbers.length}`);
    }

    // Normalize entries to [0, 1] using domain bounds
    const table = new Float32Array(expectedFloats);
    const rangeR = domainMax[0] - domainMin[0] || 1.0;
    const rangeG = domainMax[1] - domainMin[1] || 1.0;
    const rangeB = domainMax[2] - domainMin[2] || 1.0;

    for (let i = 0; i < expectedFloats; i += 3) {
      const nr = (rawNumbers[i] - domainMin[0]) / rangeR;
      const ng = (rawNumbers[i + 1] - domainMin[1]) / rangeG;
      const nb = (rawNumbers[i + 2] - domainMin[2]) / rangeB;
      table[i] = Math.max(0.0, Math.min(1.0, nr));
      table[i + 1] = Math.max(0.0, Math.min(1.0, ng));
      table[i + 2] = Math.max(0.0, Math.min(1.0, nb));
    }

    return { size, table, title };
  }

  /**
   * Applies 3D trilinear interpolation to a single RGB triplet in range [0, 255].
   * Mutates the passed outArray [r, g, b] in-place to avoid GC thrashing.
   * @param {ParsedLUT} lut
   * @param {number} r - 0 to 255
   * @param {number} g - 0 to 255
   * @param {number} b - 0 to 255
   * @param {Float64Array|Array<number>} outArray - mutated with interpolated [0, 255]
   */
  function applyTrilinearLUT(lut, r, g, b, outArray) {
    const size = lut.size;
    const table = lut.table;
    const maxIdx = size - 1;

    // Map [0, 255] to float index [0, maxIdx]
    const rf = (r / 255) * maxIdx;
    const gf = (g / 255) * maxIdx;
    const bf = (b / 255) * maxIdx;

    const r0 = Math.floor(rf);
    const g0 = Math.floor(gf);
    const b0 = Math.floor(bf);

    const r1 = Math.min(r0 + 1, maxIdx);
    const g1 = Math.min(g0 + 1, maxIdx);
    const b1 = Math.min(b0 + 1, maxIdx);

    const dr = rf - r0;
    const dg = gf - g0;
    const db = bf - b0;

    // In .cube format: index = (r + g * size + b * size * size) * 3
    const s2 = size * size;
    const idx000 = (r0 + g0 * size + b0 * s2) * 3;
    const idx100 = (r1 + g0 * size + b0 * s2) * 3;
    const idx010 = (r0 + g1 * size + b0 * s2) * 3;
    const idx110 = (r1 + g1 * size + b0 * s2) * 3;
    const idx001 = (r0 + g0 * size + b1 * s2) * 3;
    const idx101 = (r1 + g0 * size + b1 * s2) * 3;
    const idx011 = (r0 + g1 * size + b1 * s2) * 3;
    const idx111 = (r1 + g1 * size + b1 * s2) * 3;

    // Trilinear interpolation for each color channel
    for (let c = 0; c < 3; c++) {
      const c000 = table[idx000 + c];
      const c100 = table[idx100 + c];
      const c010 = table[idx010 + c];
      const c110 = table[idx110 + c];
      const c001 = table[idx001 + c];
      const c101 = table[idx101 + c];
      const c011 = table[idx011 + c];
      const c111 = table[idx111 + c];

      const c00 = c000 * (1 - dr) + c100 * dr;
      const c01 = c001 * (1 - dr) + c101 * dr;
      const c10 = c010 * (1 - dr) + c110 * dr;
      const c11 = c011 * (1 - dr) + c111 * dr;

      const c0 = c00 * (1 - dg) + c10 * dg;
      const c1 = c01 * (1 - dg) + c11 * dg;

      const finalVal = (c0 * (1 - db) + c1 * db) * 255;
      outArray[c] = Math.max(0, Math.min(255, finalVal));
    }
  }

  // Memory bounded LUT cache
  const loadedLUTCache = new Map();

  async function loadLocalLUT(path) {
    if (!path || typeof path !== 'string') return null;
    // Strictly forbid external or protocol URLs
    if (path.includes('://') || path.startsWith('//') || path.includes('..')) {
      console.warn('Rejecting non-local LUT path:', path);
      return null;
    }

    if (loadedLUTCache.has(path)) {
      return loadedLUTCache.get(path);
    }

    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const parsed = parseCubeLUT(text);
      if (loadedLUTCache.size >= 8) {
        const firstKey = loadedLUTCache.keys().next().value;
        loadedLUTCache.delete(firstKey);
      }
      loadedLUTCache.set(path, parsed);
      return parsed;
    } catch (e) {
      console.warn(`LUT load failed for ${path}, falling back to parameter pipeline:`, e.message);
      return null;
    }
  }

  function clearLUTCache() {
    loadedLUTCache.clear();
  }

  const LUTParser = {
    parseCubeLUT,
    applyTrilinearLUT,
    loadLocalLUT,
    clearLUTCache
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = LUTParser;
  }
  if (typeof window !== 'undefined') {
    window.LUTParser = LUTParser;
  }
  if (typeof self !== 'undefined') {
    self.LUTParser = LUTParser;
  }
})();
