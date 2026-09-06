/**
 * 마음 네컷 포토부스 - First-Party Tone Curve Engine
 * Evaluates monotonic cubic / piecewise spline control points to generate 256-entry lookup tables.
 * Deterministic, non-allocating during pixel lookups, and supports blending with identity curve.
 */
(() => {
  'use strict';

  /**
   * Generates a 256-entry Uint8Array identity lookup table where lut[i] === i
   */
  function createIdentityLUT() {
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      lut[i] = i;
    }
    return lut;
  }

  const IDENTITY_LUT = createIdentityLUT();

  /**
   * Validates and sorts control points.
   * Ensures points start at or before 0 and end at or after 255, clamp in [0, 255].
   * @param {Array<[number, number]>|null} points
   * @returns {Array<[number, number]>}
   */
  function normalizeControlPoints(points) {
    if (!Array.isArray(points) || points.length < 2) {
      return [[0, 0], [255, 255]];
    }

    // Filter, clamp, and sort by input x
    const cleaned = points
      .filter((p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
      .map(([x, y]) => [
        Math.max(0, Math.min(255, Math.round(x))),
        Math.max(0, Math.min(255, Math.round(y)))
      ])
      .sort((a, b) => a[0] - b[0]);

    if (cleaned.length === 0) return [[0, 0], [255, 255]];

    // Remove duplicates on x
    const unique = [cleaned[0]];
    for (let i = 1; i < cleaned.length; i++) {
      if (cleaned[i][0] > unique[unique.length - 1][0]) {
        unique.push(cleaned[i]);
      }
    }

    // Ensure bounds cover 0 and 255
    if (unique[0][0] > 0) {
      unique.unshift([0, unique[0][1]]);
    }
    if (unique[unique.length - 1][0] < 255) {
      unique.push([255, unique[unique.length - 1][1]]);
    }

    return unique.length >= 2 ? unique : [[0, 0], [255, 255]];
  }

  /**
   * Generates a 256-entry Uint8Array curve LUT using Catmull-Rom / Monotone cubic interpolation.
   * Monotone cubic avoids overshoot/ringing artifacts common in standard cubic splines.
   * @param {Array<[number, number]>} points
   * @returns {Uint8Array}
   */
  function generateCurveLUT(points) {
    const pts = normalizeControlPoints(points);
    const n = pts.length;
    const lut = new Uint8Array(256);

    if (n === 2 && pts[0][0] === 0 && pts[0][1] === 0 && pts[1][0] === 255 && pts[1][1] === 255) {
      lut.set(IDENTITY_LUT);
      return lut;
    }

    // Calculate slopes (secants)
    const dx = new Float64Array(n - 1);
    const dy = new Float64Array(n - 1);
    const m = new Float64Array(n - 1);
    for (let i = 0; i < n - 1; i++) {
      dx[i] = pts[i + 1][0] - pts[i][0];
      dy[i] = pts[i + 1][1] - pts[i][1];
      m[i] = dy[i] / (dx[i] === 0 ? 1e-6 : dx[i]);
    }

    // Monotone cubic Hermite tangents
    const d = new Float64Array(n);
    d[0] = m[0];
    d[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (m[i - 1] * m[i] <= 0) {
        d[i] = 0;
      } else {
        d[i] = (m[i - 1] + m[i]) / 2;
      }
    }

    for (let i = 0; i < n - 1; i++) {
      if (dy[i] === 0) {
        d[i] = 0;
        d[i + 1] = 0;
      } else {
        const a = d[i] / m[i];
        const b = d[i + 1] / m[i];
        const h = Math.hypot(a, b);
        if (h > 3) {
          const t = 3 / h;
          d[i] = t * a * m[i];
          d[i + 1] = t * b * m[i];
        }
      }
    }

    // Interpolate across all 256 integers
    let segment = 0;
    for (let x = 0; x < 256; x++) {
      while (segment < n - 2 && x > pts[segment + 1][0]) {
        segment++;
      }

      const x0 = pts[segment][0];
      const x1 = pts[segment + 1][0];
      const y0 = pts[segment][1];
      const y1 = pts[segment + 1][1];
      const span = x1 - x0;

      if (span <= 0) {
        lut[x] = Math.max(0, Math.min(255, Math.round(y0)));
        continue;
      }

      const t = (x - x0) / span;
      const t2 = t * t;
      const t3 = t2 * t;

      // Hermite basis functions
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;

      const y = h00 * y0 + h10 * span * d[segment] + h01 * y1 + h11 * span * d[segment + 1];
      lut[x] = Math.max(0, Math.min(255, Math.round(y)));
    }

    return lut;
  }

  /**
   * Blends a curve LUT toward identity by an intensity factor between 0.0 and 1.0.
   * @param {Uint8Array} lut - 256-entry full preset curve table
   * @param {number} intensity - 0.0 (identity) to 1.0 (full curve)
   * @param {Uint8Array} [target] - Optional destination buffer to avoid allocation
   * @returns {Uint8Array}
   */
  function blendCurveWithIdentity(lut, intensity, target) {
    const out = target || new Uint8Array(256);
    const clampedIntensity = Math.max(0, Math.min(1, intensity));

    if (clampedIntensity === 0) {
      out.set(IDENTITY_LUT);
      return out;
    }
    if (clampedIntensity === 1) {
      out.set(lut);
      return out;
    }

    for (let i = 0; i < 256; i++) {
      const val = i + (lut[i] - i) * clampedIntensity;
      out[i] = Math.max(0, Math.min(255, Math.round(val)));
    }
    return out;
  }

  // In-memory cache for generated curve LUTs keyed by hash
  const lutCache = new Map();
  const MAX_LUT_CACHE_ENTRIES = 128;

  /**
   * Gets or computes a blended curve LUT for a given point set and intensity.
   * @param {string} cacheKey - E.g. "presetId:rgb:intensity"
   * @param {Array<[number, number]>|null} points
   * @param {number} intensity
   * @returns {Uint8Array}
   */
  function getCachedCurveLUT(cacheKey, points, intensity) {
    if (!points || points.length < 2 || intensity <= 0) {
      return IDENTITY_LUT;
    }

    const roundedIntensity = Math.round(intensity * 100);
    const fullKey = `${cacheKey}:${roundedIntensity}`;

    if (lutCache.has(fullKey)) {
      return lutCache.get(fullKey);
    }

    const baseLUT = generateCurveLUT(points);
    const blended = roundedIntensity === 100 ? baseLUT : blendCurveWithIdentity(baseLUT, roundedIntensity / 100);

    if (lutCache.size >= MAX_LUT_CACHE_ENTRIES) {
      const firstKey = lutCache.keys().next().value;
      lutCache.delete(firstKey);
    }
    lutCache.set(fullKey, blended);
    return blended;
  }

  function clearCurveCache() {
    lutCache.clear();
  }

  const CurveEngine = {
    IDENTITY_LUT,
    normalizeControlPoints,
    generateCurveLUT,
    blendCurveWithIdentity,
    getCachedCurveLUT,
    clearCurveCache
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CurveEngine;
  }
  if (typeof window !== 'undefined') {
    window.CurveEngine = CurveEngine;
  }
  if (typeof self !== 'undefined') {
    self.CurveEngine = CurveEngine;
  }
})();
