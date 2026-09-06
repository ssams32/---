/**
 * 마음 네컷 포토부스 - First-Party 24-Step Deterministic RGB Pixel Processing Engine
 * Operates directly on ImageData / Uint8ClampedArray with zero heap allocations in the pixel loop.
 * Deterministic PRNG film grain, tonal adjustments, curves, softness, sharpen, vignette.
 */
(() => {
  'use strict';

  // Resolve CurveEngine and LUTParser across Node, Window, and Web Worker
  let _CurveEngine = null;
  let _LUTParser = null;

  function getDependencies() {
    if (!_CurveEngine) {
      if (typeof CurveEngine !== 'undefined') {
        _CurveEngine = CurveEngine;
      } else if (typeof self !== 'undefined' && self.CurveEngine) {
        _CurveEngine = self.CurveEngine;
      } else if (typeof window !== 'undefined' && window.CurveEngine) {
        _CurveEngine = window.CurveEngine;
      } else if (typeof require === 'function') {
        try {
          _CurveEngine = require('./curve-engine.js');
        } catch (e) {
          // ignore
        }
      }
    }
    if (!_LUTParser) {
      if (typeof LUTParser !== 'undefined') {
        _LUTParser = LUTParser;
      } else if (typeof self !== 'undefined' && self.LUTParser) {
        _LUTParser = self.LUTParser;
      } else if (typeof window !== 'undefined' && window.LUTParser) {
        _LUTParser = window.LUTParser;
      } else if (typeof require === 'function') {
        try {
          _LUTParser = require('./lut-parser.js');
        } catch (e) {
          // ignore
        }
      }
    }
    return { CurveEngine: _CurveEngine, LUTParser: _LUTParser };
  }

  /**
   * Deterministic Mulberry32 32-bit PRNG
   * @param {number} seed
   * @returns {() => number} Returns float in [0, 1)
   */
  function createMulberry32(seed) {
    let a = seed | 0;
    return function prng() {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Hashes a string or number into a 32-bit unsigned integer seed
   * @param {string|number} input
   * @returns {number}
   */
  function hashSeed(input) {
    if (typeof input === 'number' && Number.isFinite(input)) {
      return (input | 0) >>> 0;
    }
    const str = String(input || 'maeum_filter_default_grain');
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  // Reusable working buffer for spatial operations (softness/sharpen) to avoid GC thrashing
  let reusableSpatialBuffer = null;
  let reusableSpatialSize = 0;

  function getSpatialBuffer(byteLength) {
    if (!reusableSpatialBuffer || reusableSpatialSize < byteLength) {
      reusableSpatialBuffer = new Uint8ClampedArray(byteLength);
      reusableSpatialSize = byteLength;
    }
    return reusableSpatialBuffer;
  }

  /**
   * Applies separable 1D box blur in-place to destination array using source array.
   * @param {Uint8ClampedArray} src - Source RGBA data
   * @param {Uint8ClampedArray} dst - Destination RGBA data
   * @param {number} width
   * @param {number} height
   * @param {number} radius - Blur radius (integer >= 1)
   */
  function fastBoxBlur(src, dst, width, height, radius) {
    const r = Math.max(1, Math.min(10, Math.round(radius)));
    const windowSize = 2 * r + 1;
    const invWindow = 1.0 / windowSize;

    // Temporary horizontal pass buffer
    const temp = getSpatialBuffer(width * height * 4);

    // 1. Horizontal pass: src -> temp
    for (let y = 0; y < height; y++) {
      const rowOffset = y * width * 4;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;

      // Seed initial window
      for (let k = -r; k <= r; k++) {
        const xClamped = Math.max(0, Math.min(width - 1, k));
        const idx = rowOffset + xClamped * 4;
        sumR += src[idx];
        sumG += src[idx + 1];
        sumB += src[idx + 2];
      }

      for (let x = 0; x < width; x++) {
        const outIdx = rowOffset + x * 4;
        temp[outIdx] = sumR * invWindow;
        temp[outIdx + 1] = sumG * invWindow;
        temp[outIdx + 2] = sumB * invWindow;
        temp[outIdx + 3] = src[outIdx + 3]; // preserve alpha

        // Slide window
        const nextX = Math.min(width - 1, x + r + 1);
        const prevX = Math.max(0, x - r);
        const nextIdx = rowOffset + nextX * 4;
        const prevIdx = rowOffset + prevX * 4;

        sumR += src[nextIdx] - src[prevIdx];
        sumG += src[nextIdx + 1] - src[prevIdx + 1];
        sumB += src[nextIdx + 2] - src[prevIdx + 2];
      }
    }

    // 2. Vertical pass: temp -> dst
    const stride = width * 4;
    for (let x = 0; x < width; x++) {
      const colOffset = x * 4;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;

      for (let k = -r; k <= r; k++) {
        const yClamped = Math.max(0, Math.min(height - 1, k));
        const idx = yClamped * stride + colOffset;
        sumR += temp[idx];
        sumG += temp[idx + 1];
        sumB += temp[idx + 2];
      }

      for (let y = 0; y < height; y++) {
        const outIdx = y * stride + colOffset;
        dst[outIdx] = sumR * invWindow;
        dst[outIdx + 1] = sumG * invWindow;
        dst[outIdx + 2] = sumB * invWindow;
        dst[outIdx + 3] = temp[outIdx + 3];

        const nextY = Math.min(height - 1, y + r + 1);
        const prevY = Math.max(0, y - r);
        const nextIdx = nextY * stride + colOffset;
        const prevIdx = prevY * stride + colOffset;

        sumR += temp[nextIdx] - temp[prevIdx];
        sumG += temp[nextIdx + 1] - temp[prevIdx + 1];
        sumB += temp[nextIdx + 2] - temp[prevIdx + 2];
      }
    }
  }

  /**
   * Main 24-step deterministic pixel processing function.
   * Modifies pixels directly in data (Uint8ClampedArray) or returns a processed copy.
   *
   * @param {ImageData|{data: Uint8ClampedArray, width: number, height: number}} imageData
   * @param {object} params - Complete interpolated filter parameters
   * @param {object} [options]
   * @param {string|number} [options.grainSeed]
   * @param {string} [options.photoId]
   * @param {number} [options.intensity] - 0 to 1
   * @returns {ImageData|{data: Uint8ClampedArray, width: number, height: number}}
   */
  function processPixelPipeline(imageData, params, options = {}) {
    if (!imageData || !imageData.data || !Number.isInteger(imageData.width) || !Number.isInteger(imageData.height)) {
      throw new Error('Invalid ImageData provided to processPixelPipeline');
    }

    const { width, height, data } = imageData;
    const totalPixels = width * height;
    if (totalPixels === 0) return imageData;

    const intensity = typeof options.intensity === 'number' ? Math.max(0, Math.min(1, options.intensity)) : 1.0;

    // Fast-path: intensity 0 is pure identity pass
    if (intensity <= 0) {
      return imageData;
    }

    const { CurveEngine: ce, LUTParser: lp } = getDependencies();

    // 1. Prepare parameters
    const p = params || {};
    const exposure = (p.exposure || 0);
    const brightness = (p.brightness || 0);
    const contrast = (p.contrast || 0);
    const highlights = (p.highlights || 0);
    const shadows = (p.shadows || 0);
    const whites = (p.whites || 0);
    const blacks = (p.blacks || 0);
    const temperature = (p.temperature || 0);
    const tint = (p.tint || 0);
    const rgbMult = Array.isArray(p.rgbMultipliers) && p.rgbMultipliers.length === 3 ? p.rgbMultipliers : [1.0, 1.0, 1.0];
    const saturation = (p.saturation || 0);
    const grayscale = Math.max(0, Math.min(1, p.grayscale || 0));
    const sepia = Math.max(0, Math.min(1, p.sepia || 0));
    const fade = Math.max(0, Math.min(1, p.fade || 0));
    const softness = Math.max(0, Math.min(1, p.softness || 0));
    const sharpen = Math.max(0, Math.min(1, p.sharpen || 0));
    const grain = Math.max(0, Math.min(1, p.grain || 0));
    const vignette = Math.max(0, Math.min(1, p.vignette || 0));
    const lut = p.lut || null;

    // 2. Precompute mathematical constants outside pixel loop
    const exposureFactor = Math.pow(2.0, exposure * 1.5);
    const brightnessOffset = brightness * 100.0;
    const contrastFactor = 1.0 + contrast;
    const tempRShift = temperature * 35.0;
    const tempBShift = -temperature * 35.0;
    const tintGShift = -tint * 30.0;
    const tintRShift = tint * 15.0;
    const tintBShift = tint * 15.0;
    const satFactor = 1.0 + saturation;
    const fadeScale = 1.0 - fade * 0.35;
    const fadeLift = fade * 38.0;

    // 3. Prepare curve lookup tables (256-entry Uint8Array)
    let curveLUT_RGB = null;
    let curveLUT_R = null;
    let curveLUT_G = null;
    let curveLUT_B = null;

    if (ce && p.curves) {
      if (p.curves.rgb && p.curves.rgb.length >= 2) {
        curveLUT_RGB = ce.generateCurveLUT(p.curves.rgb);
      }
      if (p.curves.red && p.curves.red.length >= 2) {
        curveLUT_R = ce.generateCurveLUT(p.curves.red);
      }
      if (p.curves.green && p.curves.green.length >= 2) {
        curveLUT_G = ce.generateCurveLUT(p.curves.green);
      }
      if (p.curves.blue && p.curves.blue.length >= 2) {
        curveLUT_B = ce.generateCurveLUT(p.curves.blue);
      }
    }

    // 4. Initialize deterministic PRNG for grain (Seedable Mulberry32)
    const grainSeedStr = options.grainSeed || options.photoId || p.grainSeed || 'default_film_grain_seed';
    const prng = grain > 0 ? createMulberry32(hashSeed(grainSeedStr)) : null;

    // 5. Vignette geometry constants
    const cx = (width - 1) * 0.5;
    const cy = (height - 1) * 0.5;
    const maxDist = Math.sqrt(cx * cx + cy * cy) || 1.0;
    const invMaxDist = 1.0 / maxDist;

    // Optional 3D LUT reusable input/output RGB buffer to prevent allocation
    const lutRGB = (lut && lp) ? new Float32Array(3) : null;

    // Steps 4 through 18 & 21-23: Primary Pixel Loop
    // Zero object/array allocations inside this loop!
    for (let i = 0; i < totalPixels; i++) {
      const idx = i * 4;
      let r = data[idx];
      let g = data[idx + 1];
      let b = data[idx + 2];

      // Step 4: Shadows & Step 5: Highlights (Luminance based)
      if (shadows !== 0 || highlights !== 0) {
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (shadows !== 0 && lum < 128.0) {
          const shadowWeight = (128.0 - lum) / 128.0;
          const sDelta = shadows * 60.0 * shadowWeight;
          r += sDelta;
          g += sDelta;
          b += sDelta;
        }
        if (highlights !== 0 && lum > 128.0) {
          const hlWeight = (lum - 128.0) / 127.0;
          const hDelta = highlights * 60.0 * hlWeight;
          r += hDelta;
          g += hDelta;
          b += hDelta;
        }
      }

      // Step 6: Exposure
      if (exposure !== 0) {
        r *= exposureFactor;
        g *= exposureFactor;
        b *= exposureFactor;
      }

      // Step 7: Brightness
      if (brightness !== 0) {
        r += brightnessOffset;
        g += brightnessOffset;
        b += brightnessOffset;
      }

      // Step 8: Contrast
      if (contrast !== 0) {
        r = (r - 128.0) * contrastFactor + 128.0;
        g = (g - 128.0) * contrastFactor + 128.0;
        b = (b - 128.0) * contrastFactor + 128.0;
      }

      // Step 9: Whites & Step 10: Blacks
      if (whites !== 0) {
        if (r > 192.0) r += ((r - 192.0) / 63.0) * whites * 35.0;
        if (g > 192.0) g += ((g - 192.0) / 63.0) * whites * 35.0;
        if (b > 192.0) b += ((b - 192.0) / 63.0) * whites * 35.0;
      }
      if (blacks !== 0) {
        if (r < 64.0) r += ((64.0 - r) / 64.0) * blacks * 35.0;
        if (g < 64.0) g += ((64.0 - g) / 64.0) * blacks * 35.0;
        if (b < 64.0) b += ((64.0 - b) / 64.0) * blacks * 35.0;
      }

      // Step 11: Temperature
      if (temperature !== 0) {
        r += tempRShift;
        b += tempBShift;
      }

      // Step 12: Tint
      if (tint !== 0) {
        g += tintGShift;
        r += tintRShift;
        b += tintBShift;
      }

      // Step 13: RGB Multipliers
      if (rgbMult[0] !== 1.0) r *= rgbMult[0];
      if (rgbMult[1] !== 1.0) g *= rgbMult[1];
      if (rgbMult[2] !== 1.0) b *= rgbMult[2];

      // Optional 3D LUT stage
      if (lut && lp && lutRGB) {
        const nr = Math.max(0.0, Math.min(1.0, r / 255.0));
        const ng = Math.max(0.0, Math.min(1.0, g / 255.0));
        const nb = Math.max(0.0, Math.min(1.0, b / 255.0));
        lp.applyLUTToRGB(lut, nr, ng, nb, lutRGB);
        r = lutRGB[0] * 255.0;
        g = lutRGB[1] * 255.0;
        b = lutRGB[2] * 255.0;
      }

      // Step 14: Saturation
      if (saturation !== 0) {
        const grayVal = 0.299 * r + 0.587 * g + 0.114 * b;
        r = grayVal + (r - grayVal) * satFactor;
        g = grayVal + (g - grayVal) * satFactor;
        b = grayVal + (b - grayVal) * satFactor;
      }

      // Step 15: Grayscale
      if (grayscale > 0) {
        const grayVal = 0.299 * r + 0.587 * g + 0.114 * b;
        const invGray = 1.0 - grayscale;
        r = r * invGray + grayVal * grayscale;
        g = g * invGray + grayVal * grayscale;
        b = b * invGray + grayVal * grayscale;
      }

      // Step 16: Sepia
      if (sepia > 0) {
        const sr = 0.393 * r + 0.769 * g + 0.189 * b;
        const sg = 0.349 * r + 0.686 * g + 0.168 * b;
        const sb = 0.272 * r + 0.534 * g + 0.131 * b;
        const invSepia = 1.0 - sepia;
        r = r * invSepia + sr * sepia;
        g = g * invSepia + sg * sepia;
        b = b * invSepia + sb * sepia;
      }

      // Step 17: Channel Curves
      if (curveLUT_RGB || curveLUT_R || curveLUT_G || curveLUT_B) {
        let cr = Math.max(0, Math.min(255, Math.round(r)));
        let cg = Math.max(0, Math.min(255, Math.round(g)));
        let cb = Math.max(0, Math.min(255, Math.round(b)));

        if (curveLUT_RGB) {
          cr = curveLUT_RGB[cr];
          cg = curveLUT_RGB[cg];
          cb = curveLUT_RGB[cb];
        }
        if (curveLUT_R) cr = curveLUT_R[cr];
        if (curveLUT_G) cg = curveLUT_G[cg];
        if (curveLUT_B) cb = curveLUT_B[cb];

        r = cr;
        g = cg;
        b = cb;
      }

      // Step 18: Fade (lifts blacks and lowers whites)
      if (fade > 0) {
        r = r * fadeScale + fadeLift;
        g = g * fadeScale + fadeLift;
        b = b * fadeScale + fadeLift;
      }

      // Step 21: Deterministic Grain
      if (grain > 0 && prng) {
        const noise = (prng() - 0.5) * grain * 58.0;
        r += noise;
        g += noise;
        b += noise;
      }

      // Step 22: Vignette
      if (vignette > 0) {
        const px = i % width;
        const py = (i / width) | 0;
        const dx = px - cx;
        const dy = py - cy;
        const dist = Math.sqrt(dx * dx + dy * dy) * invMaxDist;
        if (dist > 0.3) {
          const vFactor = Math.max(0.0, 1.0 - Math.pow((dist - 0.3) / 0.7, 1.6) * vignette * 0.85);
          r *= vFactor;
          g *= vFactor;
          b *= vFactor;
        }
      }

      // Step 23: RGB clamp [0, 255]
      data[idx] = r < 0 ? 0 : r > 255 ? 255 : (r + 0.5) | 0;
      data[idx + 1] = g < 0 ? 0 : g > 255 ? 255 : (g + 0.5) | 0;
      data[idx + 2] = b < 0 ? 0 : b > 255 ? 255 : (b + 0.5) | 0;
      // data[idx + 3] (Alpha) preserved intact
    }

    // Step 19: Softness (Box blur blend)
    if (softness > 0.01) {
      const blurRadius = Math.max(1, Math.min(6, Math.round(softness * 5.0)));
      const blurred = new Uint8ClampedArray(data.length);
      fastBoxBlur(data, blurred, width, height, blurRadius);

      const softFactor = softness * 0.7; // subtle skin glow
      const origFactor = 1.0 - softFactor;

      for (let j = 0; j < data.length; j += 4) {
        data[j] = (data[j] * origFactor + blurred[j] * softFactor + 0.5) | 0;
        data[j + 1] = (data[j + 1] * origFactor + blurred[j + 1] * softFactor + 0.5) | 0;
        data[j + 2] = (data[j + 2] * origFactor + blurred[j + 2] * softFactor + 0.5) | 0;
      }
    }

    // Step 20: Sharpen (Unsharp mask)
    if (sharpen > 0.01) {
      const blurred = new Uint8ClampedArray(data.length);
      fastBoxBlur(data, blurred, width, height, 1);

      const sharpWeight = sharpen * 1.2;

      for (let j = 0; j < data.length; j += 4) {
        const sr = data[j] + (data[j] - blurred[j]) * sharpWeight;
        const sg = data[j + 1] + (data[j + 1] - blurred[j + 1]) * sharpWeight;
        const sb = data[j + 2] + (data[j + 2] - blurred[j + 2]) * sharpWeight;

        data[j] = sr < 0 ? 0 : sr > 255 ? 255 : (sr + 0.5) | 0;
        data[j + 1] = sg < 0 ? 0 : sg > 255 ? 255 : (sg + 0.5) | 0;
        data[j + 2] = sb < 0 ? 0 : sb > 255 ? 255 : (sb + 0.5) | 0;
      }
    }

    // Step 24: output
    return imageData;
  }

  /**
   * Resets internal spatial scratch buffers to release memory
   */
  function releaseWorkingBuffers() {
    reusableSpatialBuffer = null;
    reusableSpatialSize = 0;
  }

  const PixelEngine = {
    processPixelPipeline,
    fastBoxBlur,
    createMulberry32,
    hashSeed,
    releaseWorkingBuffers
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PixelEngine;
  }
  if (typeof window !== 'undefined') {
    window.PixelEngine = PixelEngine;
  }
  if (typeof self !== 'undefined') {
    self.PixelEngine = PixelEngine;
  }
})();
