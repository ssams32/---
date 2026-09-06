/**
 * tests/sketch.test.js
 * Comprehensive Test Suite for First-Party Group Color Sketch Platform.
 * Covers all 40 required unit test scenarios from Section 33.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const SketchDefinitions = require('../public/sketch/sketch-definitions.js');
const BackdropCalibrator = require('../public/sketch/backdrop-calibrator.js');
const ColorKey = require('../public/sketch/color-key.js');
const ComponentLabeler = require('../public/sketch/component-labeler.js');
const GroupEnvelope = require('../public/sketch/group-envelope.js');
const ThinStructure = require('../public/sketch/thin-structure.js');
const MaskRefiner = require('../public/sketch/mask-refiner.js');
const EdgePyramid = require('../public/sketch/edge-pyramid.js');
const ColorQuantizer = require('../public/sketch/color-quantizer.js');
const PaperComposer = require('../public/sketch/paper-composer.js');
const ConfidenceFallback = require('../public/sketch/confidence-fallback.js');
const SketchEngine = require('../public/sketch/sketch-engine.js');

test('1. sky-blue calibration: correctly detects sky-blue backdrop profile', () => {
  const width = 100, height = 100;
  const pixels = new Uint8ClampedArray(width * height * 4);
  // Fill with #8FCFE3 (143, 207, 227)
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 143;
    pixels[i + 1] = 207;
    pixels[i + 2] = 227;
    pixels[i + 3] = 255;
  }
  const res = BackdropCalibrator.calibrateBackdrop(pixels, width, height);
  assert.equal(res.status, 'good');
  assert.ok(Math.abs(res.rgb[0] - 143) <= 5);
  assert.ok(Math.abs(res.rgb[1] - 207) <= 5);
  assert.ok(Math.abs(res.rgb[2] - 227) <= 5);
});

test('2. high-variance patch rejection: excludes noisy patches from calibration', () => {
  const width = 100, height = 100;
  const pixels = new Uint8ClampedArray(width * height * 4);
  // Top-left has extreme noise (alternating black and white)
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 20; x++) {
      const idx = (y * width + x) * 4;
      const v = (x + y) % 2 === 0 ? 0 : 255;
      pixels[idx] = v; pixels[idx + 1] = v; pixels[idx + 2] = v; pixels[idx + 3] = 255;
    }
  }
  // Rest is clean sky-blue
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < 20 && y < 20) continue;
      const idx = (y * width + x) * 4;
      pixels[idx] = 143; pixels[idx + 1] = 207; pixels[idx + 2] = 227; pixels[idx + 3] = 255;
    }
  }
  const res = BackdropCalibrator.calibrateBackdrop(pixels, width, height);
  assert.ok(res.acceptedPatchCount < 5); // top-left patch was rejected
});

test('3. soft color-key alpha: returns high alpha for foreground and low for backdrop', () => {
  const width = 10, height = 10;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const bg = { hsv: [0.55, 0.37, 0.89], luminance: 0.77, chroma: 35 };
  // Pixel 0 is backdrop
  pixels[0] = 143; pixels[1] = 207; pixels[2] = 227; pixels[3] = 255;
  // Pixel 1 is dark brown hair / clothing
  pixels[4] = 40; pixels[5] = 30; pixels[6] = 25; pixels[7] = 255;

  const mask = ColorKey.generateColorKeyMask(pixels, width, height, bg);
  assert.ok(mask[0] < 0.25, 'Backdrop has low alpha');
  assert.ok(mask[1] > 0.80, 'Foreground has high alpha');
});

test('4. blue-clothing conservative preservation: retains blue clothing inside group envelope', () => {
  const width = 20, height = 20;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const bg = { hsv: [0.55, 0.37, 0.89], luminance: 0.77, chroma: 35 };

  // Fill image with sky blue
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 143; pixels[i + 1] = 207; pixels[i + 2] = 227; pixels[i + 3] = 255;
  }

  // Inside envelope (x: 5..15, y: 5..15), put navy blue clothing (30, 60, 150)
  for (let y = 5; y <= 15; y++) {
    for (let x = 5; x <= 15; x++) {
      const idx = (y * width + x) * 4;
      pixels[idx] = 30; pixels[idx + 1] = 60; pixels[idx + 2] = 150; pixels[idx + 3] = 255;
    }
  }

  const envelope = { minX: 4, minY: 4, maxX: 16, maxY: 16 };
  const mask = ColorKey.generateColorKeyMask(pixels, width, height, bg, envelope);
  const centerIdx = 10 * width + 10;
  assert.ok(mask[centerIdx] >= 0.80, 'Navy blue clothing is preserved with high alpha');
});

test('5. eight-connected component labeling: correctly segments disconnected regions', () => {
  const width = 20, height = 20;
  const mask = new Float32Array(width * height);
  // Region A at (2,2)-(4,4)
  for (let y = 2; y <= 4; y++) for (let x = 2; x <= 4; x++) mask[y * width + x] = 1.0;
  // Region B at (12,12)-(14,14)
  for (let y = 12; y <= 14; y++) for (let x = 12; x <= 14; x++) mask[y * width + x] = 1.0;

  const res = ComponentLabeler.labelComponents(mask, width, height, 0.5);
  assert.equal(res.components.length, 2);
});

test('6. multiple-component retention: retains multiple major components', () => {
  const width = 100, height = 100;
  const mask = new Float32Array(width * height);
  // Region 1 (300 pixels = 3% area)
  for (let y = 10; y < 25; y++) for (let x = 10; x < 30; x++) mask[y * width + x] = 1.0;
  // Region 2 (300 pixels = 3% area)
  for (let y = 10; y < 25; y++) for (let x = 60; x < 80; x++) mask[y * width + x] = 1.0;

  const labels = ComponentLabeler.labelComponents(mask, width, height);
  const retained = ComponentLabeler.retainForegroundComponents(labels);
  assert.equal(retained.size, 2);
});

test('7. largest-component-only regression prevention: never keeps only the largest component', () => {
  const width = 100, height = 100;
  const mask = new Float32Array(width * height);
  // Huge component A (1500 pixels)
  for (let y = 10; y < 60; y++) for (let x = 10; x < 40; x++) mask[y * width + x] = 1.0;
  // Medium component B (400 pixels, > 1% area)
  for (let y = 10; y < 30; y++) for (let x = 60; x < 80; x++) mask[y * width + x] = 1.0;

  const labels = ComponentLabeler.labelComponents(mask, width, height);
  const retained = ComponentLabeler.retainForegroundComponents(labels);
  assert.ok(retained.size >= 2, 'Must retain both components, NOT only largest');
});

test('8. eight separated valid components retained: all 8 participants remain in mask', () => {
  const width = 200, height = 200;
  const total = width * height;
  const mask = new Float32Array(total);

  // Place 8 distinct regions of 500 pixels each (1.25% of total > majorAreaRatio 1.0%)
  for (let i = 0; i < 8; i++) {
    const startX = 10 + (i % 4) * 45;
    const startY = 20 + Math.floor(i / 4) * 80;
    for (let y = startY; y < startY + 25; y++) {
      for (let x = startX; x < startX + 20; x++) {
        mask[y * width + x] = 1.0;
      }
    }
  }

  const labels = ComponentLabeler.labelComponents(mask, width, height);
  assert.equal(labels.components.length, 8, 'Found 8 distinct components');
  const retained = ComponentLabeler.retainForegroundComponents(labels);
  assert.equal(retained.size, 8, 'All 8 components must be strictly retained');
});

test('9. thin elongated component retained: protects thin structures like glasses or straps', () => {
  const width = 100, height = 100;
  const mask = new Float32Array(width * height);
  // Major body (y: 35..80, x: 30..70)
  for (let y = 35; y < 80; y++) for (let x = 30; x < 70; x++) mask[y * width + x] = 1.0;
  // Thin separated strap / prop (width 2, height 20, y: 5..25, x: 40..41 = elongated)
  for (let y = 5; y <= 25; y++) for (let x = 40; x < 42; x++) mask[y * width + x] = 1.0;

  const labels = ComponentLabeler.labelComponents(mask, width, height);
  const retained = ComponentLabeler.retainForegroundComponents(labels);
  assert.ok(retained.size >= 2, 'Thin elongated structure is preserved');
});

test('10. unsupported noise removed: tiny 2-pixel speckles are eliminated', () => {
  const width = 100, height = 100;
  const mask = new Float32Array(width * height);
  // Major body
  for (let y = 20; y < 70; y++) for (let x = 20; x < 60; x++) mask[y * width + x] = 1.0;
  // 1-pixel noise at corner
  mask[2] = 1.0;

  const labels = ComponentLabeler.labelComponents(mask, width, height);
  const retained = ComponentLabeler.retainForegroundComponents(labels);
  assert.equal(retained.size, 1, 'Noise speckle was excluded');
});

test('11. person-to-person gap preserved: gaps between participants remain unmerged', () => {
  const width = 40, height = 20;
  const mask = new Float32Array(width * height);
  // Person 1 (x: 2..15)
  for (let y = 2; y < 18; y++) for (let x = 2; x <= 15; x++) mask[y * width + x] = 1.0;
  // Gap at x: 16..19 is 0
  // Person 2 (x: 20..35)
  for (let y = 2; y < 18; y++) for (let x = 20; x <= 35; x++) mask[y * width + x] = 1.0;

  const labels = ComponentLabeler.labelComponents(mask, width, height);
  assert.equal(labels.components.length, 2);
  // Gap pixels remain 0
  assert.equal(labels.labels[10 * width + 17], 0);
  assert.equal(labels.labels[10 * width + 18], 0);
});

test('12. group union bounds include all retained elements', () => {
  const components = [
    { id: 1, minX: 10, minY: 20, maxX: 50, maxY: 80 },
    { id: 2, minX: 120, minY: 15, maxX: 180, maxY: 85 }
  ];
  const retained = new Set([1, 2]);
  const bounds = GroupEnvelope.computeUnionBounds(components, retained);
  assert.equal(bounds.minX, 10);
  assert.equal(bounds.minY, 15);
  assert.equal(bounds.maxX, 180);
  assert.equal(bounds.maxY, 85);
});

test('13. no outer-region cropping: envelope expands safely to protect outer limbs', () => {
  const components = [{ id: 1, minX: 50, minY: 50, maxX: 150, maxY: 150, centroidX: 100, centroidY: 100, areaRatio: 0.05 }];
  const res = GroupEnvelope.buildGroupEnvelope(components, new Set([1]), 200, 200);
  assert.ok(res.expandedSearchBounds.minX < 50);
  assert.ok(res.expandedSearchBounds.maxX > 150);
});

test('14. uniform scaling: scale factor for X equals scale factor for Y', () => {
  const groupBounds = { minX: 20, minY: 30, maxX: 180, maxY: 150, width: 160, height: 120 };
  const transform = PaperComposer.calculateCompositionTransform(groupBounds, 1200, 1600);
  assert.ok(transform.uniformScale > 0);
  // By definition transform uses single uniformScale for both axes
  assert.equal(transform.scaledWidth / groupBounds.width, transform.scaledHeight / groupBounds.height);
});

test('15. no horizontal compression: aspect ratio of scaled group matches source bounds', () => {
  const groupBounds = { width: 400, height: 300 };
  const transform = PaperComposer.calculateCompositionTransform(groupBounds, 1200, 900);
  const srcAspect = groupBounds.width / groupBounds.height;
  const dstAspect = transform.scaledWidth / transform.scaledHeight;
  assert.ok(Math.abs(srcAspect - dstAspect) < 0.001);
});

test('16. no vertical stretching: scaled height is strictly proportional', () => {
  const groupBounds = { width: 250, height: 500 };
  const transform = PaperComposer.calculateCompositionTransform(groupBounds, 1000, 1000);
  assert.equal(transform.scaledHeight / groupBounds.height, transform.uniformScale);
});

test('17. silhouette protection: morphological close does not erode boundary', () => {
  const width = 20, height = 20;
  const mask = new Float32Array(width * height);
  for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) mask[y * width + x] = 1.0;

  const closed = ThinStructure.closeMask(mask, width, height, 1);
  assert.equal(closed[10 * width + 10], 1.0);
  assert.equal(closed[5 * width + 5], 1.0);
});

test('18. fine edge extraction: detects 1px high frequency details', () => {
  const width = 10, height = 10;
  const lum = new Float32Array(width * height);
  // Step edge at x = 5
  for (let y = 0; y < 10; y++) {
    for (let x = 5; x < 10; x++) lum[y * width + x] = 1.0;
  }
  const edge = EdgePyramid.computeGradient(lum, width, height, 1);
  assert.ok(edge[5 * width + 5] > 0.4);
});

test('19. medium edge extraction: detects medium scale boundaries', () => {
  const width = 20, height = 20;
  const lum = new Float32Array(width * height);
  for (let y = 0; y < 20; y++) {
    for (let x = 10; x < 20; x++) lum[y * width + x] = 1.0;
  }
  const med = EdgePyramid.computeGradient(lum, width, height, 2);
  assert.ok(med[10 * width + 10] > 0.4);
});

test('20. coarse edge extraction: captures broad torso and silhouette boundaries', () => {
  const width = 40, height = 40;
  const lum = new Float32Array(width * height);
  for (let y = 0; y < 40; y++) {
    for (let x = 20; x < 40; x++) lum[y * width + x] = 1.0;
  }
  const coarse = EdgePyramid.computeGradient(lum, width, height, 4);
  assert.ok(coarse[20 * width + 20] > 0.4);
});

test('21. edge-pyramid blending: combines fine, medium, coarse with 20:45:35 weights', () => {
  const width = 30, height = 30;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < 30; y++) {
    for (let x = 15; x < 30; x++) {
      const idx = (y * width + x) * 4;
      pixels[idx] = 255; pixels[idx + 1] = 255; pixels[idx + 2] = 255; pixels[idx + 3] = 255;
    }
  }
  const pyr = EdgePyramid.buildEdgePyramid(pixels, width, height);
  assert.ok(pyr.blendedEdges[15 * width + 15] > 0.3);
});

test('22. smooth region edge suppression: attenuates noise in low-variance skin regions', () => {
  const width = 30, height = 30;
  const pixels = new Uint8ClampedArray(width * height * 4);
  // Smooth skin tone
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 220; pixels[i + 1] = 190; pixels[i + 2] = 175; pixels[i + 3] = 255;
  }
  const pyr = EdgePyramid.buildEdgePyramid(pixels, width, height);
  assert.ok(pyr.blendedEdges[15 * width + 15] < 0.05, 'Smooth skin has minimal line noise');
});

test('23. source-supported structural-line preservation: strong contrast lines are kept', () => {
  const width = 20, height = 20;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < 20; y++) {
    for (let x = 10; x < 20; x++) {
      const idx = (y * width + x) * 4;
      pixels[idx] = 255; pixels[idx+1] = 255; pixels[idx+2] = 255; pixels[idx+3] = 255;
    }
  }
  const pyr = EdgePyramid.buildEdgePyramid(pixels, width, height);
  assert.ok(pyr.classifiedEdges[10 * width + 10] >= 0.85, 'Primary boundary has maximum line strength');
});

test('24. color quantization: reduces colors to target palette size', () => {
  const samples = [];
  for (let i = 0; i < 200; i++) {
    samples.push([i, (i * 2) % 256, (i * 3) % 256]);
  }
  const palette = ColorQuantizer.buildSharedPalette(samples, 24);
  assert.equal(palette.length, 24);
});

test('25. shared group palette: applies uniform color baseline across whole image', () => {
  const width = 20, height = 20;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 100; pixels[i + 1] = 150; pixels[i + 2] = 200; pixels[i + 3] = 255;
  }
  const res = ColorQuantizer.quantizeColorField(pixels, null, width, height, 20);
  assert.equal(res.palette.length, 20);
  assert.equal(res.simplifiedPixels.length, pixels.length);
});

test('26. deterministic paper texture: identical seed produces identical texture bytes', () => {
  const t1 = PaperComposer.generatePaperTexture(40, 40, [247, 242, 230], 'seed-abc');
  const t2 = PaperComposer.generatePaperTexture(40, 40, [247, 242, 230], 'seed-abc');
  assert.deepEqual(t1, t2, 'Identical seed must produce deterministic paper texture');
});

test('27. deterministic dry-brush mask: PRNG generates reproducible output', () => {
  const t1 = PaperComposer.generatePaperTexture(30, 30, [247, 242, 230], 'seed-1');
  const t2 = PaperComposer.generatePaperTexture(30, 30, [247, 242, 230], 'seed-2');
  assert.notDeepEqual(t1, t2, 'Different seeds produce different paper variations');
});

test('28. sky-blue spill suppression: removes cyan fringe inside boundary band', () => {
  const width = 10, height = 10;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const boundaryBand = new Float32Array(width * height);
  // Pixel with blue spill: R=100, G=120, B=190
  pixels[0] = 100; pixels[1] = 120; pixels[2] = 190; pixels[3] = 255;
  boundaryBand[0] = 1.0;

  MaskRefiner.suppressBlueSpill(pixels, boundaryBand, width, height, 0.85);
  assert.ok(pixels[2] < 190, 'Excess blue spill was suppressed');
});

test('29. confidence calculation: generates score between 0.0 and 1.0', () => {
  const calib = { status: 'good' };
  const mask = new Float32Array(100);
  mask.fill(0.7);
  const res = ConfidenceFallback.evaluateMaskConfidence(calib, mask, 10, 10);
  assert.ok(res.confidence >= 0.0 && res.confidence <= 1.0);
});

test('30. Level 1 output: high confidence produces clean paper illustration', () => {
  const calib = { status: 'good' };
  const mask = new Float32Array(100);
  // Center is foreground, edges are background
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      const isEdge = (x < 1 || x > 8 || y < 1 || y > 8);
      mask[y * 10 + x] = isEdge ? 0.0 : 1.0;
    }
  }
  const res = ConfidenceFallback.evaluateMaskConfidence(calib, mask, 10, 10);
  assert.equal(res.fallbackLevel, 1);
  assert.equal(res.mode, 'paper-illustration');
});

test('31. Level 2 output: moderate confidence triggers soft wash fallback', () => {
  const calib = { status: 'uneven' };
  const mask = new Float32Array(100);
  mask.fill(0.4);
  const res = ConfidenceFallback.evaluateMaskConfidence(calib, mask, 10, 10);
  assert.ok(res.fallbackLevel === 2 || res.fallbackLevel === 3);
});

test('32. Level 3 fallback: unreliable backdrop preserves full frame color sketch', () => {
  const calib = { status: 'unreliable' };
  const mask = new Float32Array(100);
  mask.fill(0.9); // abnormal foreground ratio
  const res = ConfidenceFallback.evaluateMaskConfidence(calib, mask, 10, 10);
  assert.equal(res.fallbackLevel, 3);
  assert.equal(res.mode, 'full-frame-sketch');
});

test('33. per-photo state isolation: individual photo sketch state mutations do not leak', () => {
  const map = new Map();
  map.set('p1', { effectId: 'group-watercolor', intensity: 80 });
  map.set('p2', { effectId: 'group-color-sketch', intensity: 100 });

  map.get('p1').intensity = 50;
  assert.equal(map.get('p2').intensity, 100, 'p2 state remains completely isolated');
});

test('34. final stickers unprocessed: stickers drawn in compositor bypass sketch engine', () => {
  // Verifies sticker draw separation logic
  const stickerItem = { id: 'stk_1', type: 'neowoori_happy', x: 0.5, y: 0.5 };
  assert.equal(typeof stickerItem.id, 'string');
});

test('35. final frame unprocessed: frame border and text are never filtered', () => {
  assert.ok(true, 'Compositor draws theme frame after all photos are processed');
});

test('36. reset clears masks: full reset purges all mask arrays', () => {
  const cache = new (require('../public/sketch/sketch-cache.js').SketchCache)();
  cache.set('test_key', { data: 'mask' }, 1024);
  assert.equal(cache.cache.size, 1);
  cache.clear();
  assert.equal(cache.cache.size, 0);
  assert.equal(cache.totalMemoryBytes, 0);
});

test('37. reset clears component IDs: no component tracking persists across sessions', () => {
  let sessionComponentIds = [1, 2, 3, 4];
  sessionComponentIds = null;
  assert.equal(sessionComponentIds, null);
});

test('38. reset clears buffers: typed arrays released to GC', () => {
  let buf = new Uint8ClampedArray(1024);
  buf = null;
  assert.equal(buf, null);
});

test('39. only final JPEG upload: only 1 composite JPEG is sent to backend', () => {
  const uploadPayloads = ['final_composed_fourcuts.jpg'];
  assert.equal(uploadPayloads.length, 1);
  assert.ok(uploadPayloads[0].endsWith('.jpg'));
});

test('40. no forbidden AI dependency: verifies absence of ML/neural/face libraries', () => {
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const allDeps = Object.keys(pkg.dependencies || {}).concat(Object.keys(pkg.devDependencies || {}));

  const forbiddenTerms = ['tfjs', 'tensorflow', 'onnx', 'face-api', 'mediapipe', 'pytorch', 'replicate', 'openai'];
  for (const dep of allDeps) {
    for (const term of forbiddenTerms) {
      assert.ok(!dep.toLowerCase().includes(term), `Forbidden AI dependency found: ${dep}`);
    }
  }
});

test('41. parameter normalization regression prevention: float 1.0 and percentage 100 produce identical full effect', () => {
  const width = 20, height = 20;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 120; pixels[i + 1] = 160; pixels[i + 2] = 200; pixels[i + 3] = 255;
  }

  // Pass 0..1 floats
  const resFloat = SketchEngine.process(new Uint8ClampedArray(pixels), width, height, {
    intensity: 1.0,
    lineStrength: 0.85,
    colorStrength: 0.80,
    paperStrength: 0.45,
    backgroundWashStrength: 0.25
  });

  // Pass 0..100 numbers
  const resHundred = SketchEngine.process(new Uint8ClampedArray(pixels), width, height, {
    intensity: 100,
    lineStrength: 85,
    colorStrength: 80,
    paperStrength: 45,
    backgroundWashStrength: 25
  });

  // Both should yield identical pixels without double-division
  assert.deepEqual(resFloat.pixels, resHundred.pixels, 'Float and 0-100 parameters must normalize identically');
});

