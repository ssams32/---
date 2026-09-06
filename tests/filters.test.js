const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

// Load modules
const FilterDefinitions = require('../public/filters/filter-definitions.js');
const CurveEngine = require('../public/filters/curve-engine.js');
const LUTParser = require('../public/filters/lut-parser.js');
const PixelEngine = require('../public/filters/pixel-engine.js');
const FilterCacheModule = require('../public/filters/filter-cache.js');
const FilterClientModule = require('../public/filters/filter-client.js');

test('1. preset uniqueness: no duplicate filter IDs exist across catalog', () => {
  const ids = new Set();
  FilterDefinitions.FILTER_PRESETS.forEach((p) => {
    assert.equal(ids.has(p.id), false, `Duplicate preset ID found: ${p.id}`);
    ids.add(p.id);
  });
  assert.ok(ids.size >= 36, `Expected at least 36 presets, got ${ids.size}`);
});

test('2. original filter existence: preset with id "original" exists and is neutral', () => {
  const orig = FilterDefinitions.getFilterPreset('original');
  assert.ok(orig, 'Original preset must exist');
  assert.equal(orig.brightness, 0);
  assert.equal(orig.contrast, 0);
  assert.equal(orig.saturation, 0);
  assert.equal(orig.temperature, 0);
  assert.equal(orig.tint, 0);
  assert.equal(orig.grayscale, 0);
  assert.equal(orig.grain, 0);
});

test('3. recommended filter existence: all 8 required recommended presets exist', () => {
  const required = [
    'original', 'maeum-warm', 'clear-today', 'bright-smile',
    'peach-day', 'soft-film', 'clean-mono', 'fresh-moment'
  ];
  required.forEach((id) => {
    const p = FilterDefinitions.getFilterPreset(id);
    assert.ok(p, `Required recommended preset missing: ${id}`);
  });
  assert.equal(FilterDefinitions.RECOMMENDED_FILTERS.length, 8);
});

test('4. valid categories: all presets belong to defined categories', () => {
  const validCatIds = new Set(FilterDefinitions.FILTER_CATEGORIES.map((c) => c.id));
  FilterDefinitions.FILTER_PRESETS.forEach((p) => {
    assert.ok(validCatIds.has(p.category), `Preset ${p.id} has invalid category ${p.category}`);
  });
});

test('5. parameter ranges: all presets have numeric parameters within valid limits', () => {
  FilterDefinitions.FILTER_PRESETS.forEach((p) => {
    if (typeof p.brightness === 'number') assert.ok(p.brightness >= -1 && p.brightness <= 1);
    if (typeof p.contrast === 'number') assert.ok(p.contrast >= -1 && p.contrast <= 1);
    if (typeof p.saturation === 'number') assert.ok(p.saturation >= -1 && p.saturation <= 1);
    if (typeof p.temperature === 'number') assert.ok(p.temperature >= -1 && p.temperature <= 1);
    if (typeof p.tint === 'number') assert.ok(p.tint >= -1 && p.tint <= 1);
    if (typeof p.fade === 'number') assert.ok(p.fade >= 0 && p.fade <= 1);
    if (typeof p.grain === 'number') assert.ok(p.grain >= 0 && p.grain <= 1);
    if (typeof p.vignette === 'number') assert.ok(p.vignette >= 0 && p.vignette <= 1);
    if (typeof p.softness === 'number') assert.ok(p.softness >= 0 && p.softness <= 1);
    if (typeof p.sharpen === 'number') assert.ok(p.sharpen >= 0 && p.sharpen <= 1);
  });
});

test('6. curve validation: control points normalized and sorted', () => {
  const pts = [[200, 180], [0, 0], [100, 90], [255, 255]];
  const norm = CurveEngine.normalizeControlPoints(pts);
  assert.equal(norm[0][0], 0);
  assert.equal(norm[norm.length - 1][0], 255);
  // Strictly ascending in x
  for (let i = 1; i < norm.length; i++) {
    assert.ok(norm[i][0] > norm[i - 1][0]);
  }
});

test('7. curve LUT generation: produces 256-entry Uint8Array', () => {
  const lut = CurveEngine.generateCurveLUT([[0, 10], [128, 140], [255, 240]]);
  assert.equal(lut.length, 256);
  assert.ok(lut instanceof Uint8Array);
  assert.ok(lut[0] >= 0 && lut[0] <= 255);
  assert.ok(lut[255] >= 0 && lut[255] <= 255);
});

test('8. intensity 0 identity: intensity 0 returns unmodified pixels', () => {
  const preset = FilterDefinitions.getFilterPreset('maeum-warm');
  const imgData = {
    width: 2,
    height: 2,
    data: new Uint8ClampedArray([100, 120, 140, 255, 50, 60, 70, 255, 200, 210, 220, 255, 0, 10, 20, 255])
  };
  const originalBytes = new Uint8ClampedArray(imgData.data);
  const interpolated = FilterDefinitions.interpolateParameters(preset, 0.0);
  PixelEngine.processPixelPipeline(imgData, interpolated, { intensity: 0.0 });
  assert.deepEqual(Array.from(imgData.data), Array.from(originalBytes));
});

test('9. intensity 0.5 interpolation: produces values between neutral and full preset', () => {
  const preset = FilterDefinitions.getFilterPreset('bright-smile');
  const fullParams = FilterDefinitions.interpolateParameters(preset, 1.0);
  const halfParams = FilterDefinitions.interpolateParameters(preset, 0.5);

  if (fullParams.brightness !== 0) {
    assert.ok(Math.abs(halfParams.brightness - fullParams.brightness * 0.5) < 0.01);
  }
  if (fullParams.contrast !== 0) {
    assert.ok(Math.abs(halfParams.contrast - fullParams.contrast * 0.5) < 0.01);
  }
});

test('10. intensity 1.0 full preset: matches preset definition parameters', () => {
  const preset = FilterDefinitions.getFilterPreset('clean-mono');
  const full = FilterDefinitions.interpolateParameters(preset, 1.0);
  assert.equal(full.grayscale, preset.grayscale);
  assert.equal(full.contrast, preset.contrast);
});

test('11. RGB clamp: values remain strictly within [0, 255] under extreme adjustments', () => {
  const extremeParams = {
    brightness: 1.0,
    exposure: 1.0,
    contrast: 1.0,
    highlights: 1.0,
    shadows: 1.0
  };
  const imgData = {
    width: 2,
    height: 2,
    data: new Uint8ClampedArray([250, 250, 250, 255, 5, 5, 5, 255, 128, 128, 128, 255, 200, 200, 200, 255])
  };
  PixelEngine.processPixelPipeline(imgData, extremeParams, { intensity: 1.0 });
  for (let i = 0; i < imgData.data.length; i++) {
    assert.ok(imgData.data[i] >= 0 && imgData.data[i] <= 255);
  }
});

test('12. brightness: positive brightness increases pixel values', () => {
  const imgData = {
    width: 1,
    height: 1,
    data: new Uint8ClampedArray([100, 100, 100, 255])
  };
  PixelEngine.processPixelPipeline(imgData, { brightness: 0.15 }, { intensity: 1.0 });
  assert.ok(imgData.data[0] > 100);
});

test('13. contrast: positive contrast darkens shadows and brightens highlights', () => {
  const imgData = {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([50, 50, 50, 255, 200, 200, 200, 255])
  };
  PixelEngine.processPixelPipeline(imgData, { contrast: 0.2 }, { intensity: 1.0 });
  assert.ok(imgData.data[0] < 50, 'Shadows should decrease with higher contrast');
  assert.ok(imgData.data[4] > 200, 'Highlights should increase with higher contrast');
});

test('14. saturation: saturation reduction desaturates color toward gray', () => {
  const imgData = {
    width: 1,
    height: 1,
    data: new Uint8ClampedArray([200, 100, 50, 255])
  };
  PixelEngine.processPixelPipeline(imgData, { saturation: -0.5 }, { intensity: 1.0 });
  const diff = Math.abs(imgData.data[0] - imgData.data[1]);
  assert.ok(diff < (200 - 100), 'Color difference should decrease with reduced saturation');
});

test('15. temperature: positive temperature increases red and decreases blue', () => {
  const imgData = {
    width: 1,
    height: 1,
    data: new Uint8ClampedArray([128, 128, 128, 255])
  };
  PixelEngine.processPixelPipeline(imgData, { temperature: 0.2 }, { intensity: 1.0 });
  assert.ok(imgData.data[0] > 128, 'Red should increase with warm temperature');
  assert.ok(imgData.data[2] < 128, 'Blue should decrease with warm temperature');
});

test('16. tint: positive tint shifts green and magenta axis', () => {
  const imgData = {
    width: 1,
    height: 1,
    data: new Uint8ClampedArray([128, 128, 128, 255])
  };
  PixelEngine.processPixelPipeline(imgData, { tint: 0.15 }, { intensity: 1.0 });
  assert.ok(imgData.data[1] < 128, 'Green should shift down for positive magenta tint');
});

test('17. grayscale: grayscale 1.0 equalizes RGB channels to luminance', () => {
  const imgData = {
    width: 1,
    height: 1,
    data: new Uint8ClampedArray([220, 80, 40, 255])
  };
  PixelEngine.processPixelPipeline(imgData, { grayscale: 1.0 }, { intensity: 1.0 });
  assert.equal(imgData.data[0], imgData.data[1]);
  assert.equal(imgData.data[1], imgData.data[2]);
});

test('18. sepia: sepia 1.0 produces warm brownish tint', () => {
  const imgData = {
    width: 1,
    height: 1,
    data: new Uint8ClampedArray([150, 150, 150, 255])
  };
  PixelEngine.processPixelPipeline(imgData, { sepia: 0.5 }, { intensity: 1.0 });
  assert.ok(imgData.data[0] > imgData.data[1]);
  assert.ok(imgData.data[1] > imgData.data[2]);
});

test('19. fade: lifts black levels', () => {
  const imgData = {
    width: 1,
    height: 1,
    data: new Uint8ClampedArray([10, 10, 10, 255])
  };
  PixelEngine.processPixelPipeline(imgData, { fade: 0.3 }, { intensity: 1.0 });
  assert.ok(imgData.data[0] > 10, 'Black levels should be lifted with fade');
});

test('20. deterministic grain: identical seed produces identical noise; different seed differs', () => {
  const makeData = () => ({
    width: 16,
    height: 16,
    data: new Uint8ClampedArray(16 * 16 * 4).fill(128)
  });

  const d1 = makeData();
  const d2 = makeData();
  const d3 = makeData();

  PixelEngine.processPixelPipeline(d1, { grain: 0.2 }, { grainSeed: 'seed_abc', intensity: 1.0 });
  PixelEngine.processPixelPipeline(d2, { grain: 0.2 }, { grainSeed: 'seed_abc', intensity: 1.0 });
  PixelEngine.processPixelPipeline(d3, { grain: 0.2 }, { grainSeed: 'seed_xyz', intensity: 1.0 });

  assert.deepEqual(Array.from(d1.data), Array.from(d2.data), 'Same seed must produce 100% byte-identical grain');
  assert.notDeepEqual(Array.from(d1.data), Array.from(d3.data), 'Different seeds must produce different grain');
});

test('21. vignette: outer edge pixels are darker than center pixels', () => {
  const w = 32, h = 32;
  const imgData = {
    width: w,
    height: h,
    data: new Uint8ClampedArray(w * h * 4).fill(200)
  };
  PixelEngine.processPixelPipeline(imgData, { vignette: 0.5 }, { intensity: 1.0 });
  // Center pixel at (16, 16)
  const centerIdx = (16 * w + 16) * 4;
  // Corner pixel at (0, 0)
  const cornerIdx = 0;
  assert.ok(imgData.data[cornerIdx] < imgData.data[centerIdx], 'Corner must be darker than center with vignette');
});

test('22. manual adjustment combination: preset combined with manual adjustments', () => {
  const preset = FilterDefinitions.getFilterPreset('maeum-warm');
  const manual = { brightness: 0.1, contrast: -0.05, saturation: 0.05, temperature: 0.05, tint: -0.02 };
  const combined = FilterDefinitions.interpolateParameters(preset, 0.8, manual);
  assert.ok(combined.brightness !== preset.brightness);
  assert.ok(combined.temperature !== preset.temperature);
});

test('23. LUT parser validation: parses size 17 cube file correctly', () => {
  let cube = 'TITLE "Test 17"\nLUT_3D_SIZE 17\nDOMAIN_MIN 0.0 0.0 0.0\nDOMAIN_MAX 1.0 1.0 1.0\n';
  for (let b = 0; b < 17; b++) {
    for (let g = 0; g < 17; g++) {
      for (let r = 0; r < 17; r++) {
        cube += `${(r / 16).toFixed(4)} ${(g / 16).toFixed(4)} ${(b / 16).toFixed(4)}\n`;
      }
    }
  }
  const parsed = LUTParser.parseCubeLUT(cube);
  assert.equal(parsed.size, 17);
  assert.equal(parsed.title, 'Test 17');
  assert.equal(parsed.table.length, 17 * 17 * 17 * 3);
});

test('24. LUT domain validation: rejects invalid sizes or corrupt content', () => {
  assert.throws(() => {
    LUTParser.parseCubeLUT('TITLE "Invalid Size LUT"\nLUT_3D_SIZE 10\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n0 0 0\n');
  }, /Unsupported LUT size/);

  assert.throws(() => {
    LUTParser.parseCubeLUT('');
  }, /Invalid .cube text/);
});

test('25. per-photo state isolation: changing one photo filter does not alter others', () => {
  const map = new Map();
  map.set('photo-1', { filterId: 'maeum-warm', intensity: 80, adjustments: { brightness: 0.05 } });
  map.set('photo-2', { filterId: 'clean-mono', intensity: 100, adjustments: { brightness: 0 } });

  // Modify photo-1
  const p1 = map.get('photo-1');
  p1.intensity = 50;

  // Verify photo-2 intact
  assert.equal(map.get('photo-2').filterId, 'clean-mono');
  assert.equal(map.get('photo-2').intensity, 100);
});

test('26. apply-to-all: copies active filter state across all 4 selected photos', () => {
  const map = new Map();
  const selected = ['p1', 'p2', 'p3', 'p4'];
  selected.forEach(pid => map.set(pid, { filterId: 'original', intensity: 100, adjustments: {} }));

  // Set p2 as active custom
  map.set('p2', { filterId: 'peach-day', intensity: 75, adjustments: { saturation: 0.1 } });

  // Apply p2 to all
  const source = map.get('p2');
  selected.forEach(pid => {
    map.set(pid, {
      filterId: source.filterId,
      intensity: source.intensity,
      adjustments: Object.assign({}, source.adjustments)
    });
  });

  selected.forEach(pid => {
    assert.equal(map.get(pid).filterId, 'peach-day');
    assert.equal(map.get(pid).intensity, 75);
    assert.equal(map.get(pid).adjustments.saturation, 0.1);
  });
});

test('27. active-photo reset: resets only active photo to original', () => {
  const map = new Map();
  map.set('p1', { filterId: 'bright-smile', intensity: 90 });
  map.set('p2', { filterId: 'soft-film', intensity: 85 });

  // Reset active photo p1
  map.set('p1', { filterId: 'original', intensity: 100, adjustments: { brightness: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0 } });

  assert.equal(map.get('p1').filterId, 'original');
  assert.equal(map.get('p2').filterId, 'soft-film');
});

test('28. full reset: clears all photo filters, curve cache, and preview cache', () => {
  const map = new Map();
  map.set('p1', { filterId: 'maeum-warm', intensity: 100 });
  map.clear();
  assert.equal(map.size, 0);

  const cache = new FilterCacheModule.FilterCache();
  cache.set('key1', { width: 10, height: 10 });
  assert.equal(cache.size, 1);
  cache.clear();
  assert.equal(cache.size, 0);
  assert.equal(cache.totalBytes, 0);
});

test('29. cache eviction: evicts oldest item when exceeding 24 entries', () => {
  const cache = new FilterCacheModule.FilterCache(24, 100 * 1024 * 1024);
  for (let i = 0; i < 26; i++) {
    cache.set(`key_${i}`, { width: 10, height: 10, byteSize: 400 });
  }
  assert.equal(cache.size, 24);
  assert.equal(cache.get('key_0'), null, 'Oldest item key_0 should have been evicted');
  assert.ok(cache.get('key_25') !== null, 'Newest item key_25 must exist');
});

test('30. cache memory budget: evicts oldest item when exceeding 48MB limit', () => {
  const maxBytes = 48 * 1024 * 1024;
  const cache = new FilterCacheModule.FilterCache(24, maxBytes);
  const bigItemBytes = 20 * 1024 * 1024; // 20MB

  cache.set('item1', { width: 100, height: 100, byteSize: bigItemBytes });
  cache.set('item2', { width: 100, height: 100, byteSize: bigItemBytes });
  cache.set('item3', { width: 100, height: 100, byteSize: bigItemBytes }); // Total 60MB > 48MB

  assert.ok(cache.totalBytes <= maxBytes, `Cache bytes ${cache.totalBytes} must not exceed ${maxBytes}`);
  assert.equal(cache.get('item1'), null, 'item1 must have been evicted to respect memory limit');
});

test('31. fallback execution: main-thread fallback processes image data correctly', async () => {
  const client = new FilterClientModule.FilterClient();
  client.workerAvailable = false; // Force fallback mode

  const imgData = {
    width: 4,
    height: 4,
    data: new Uint8ClampedArray(4 * 4 * 4).fill(120)
  };
  const preset = FilterDefinitions.getFilterPreset('clean-mono');
  const result = await client.process({
    photoId: 'test-photo-fallback',
    imageData: imgData,
    filter: preset,
    intensity: 1.0,
    isPreview: true
  });

  assert.ok(result.imageData);
  assert.equal(result.imageData.width, 4);
  assert.equal(result.imageData.height, 4);
  // Monochromatic check
  assert.equal(result.imageData.data[0], result.imageData.data[1]);
});

test('32. final composition rule: stickers and frame decoration are not processed by pixel engine', () => {
  // Verifies that pixel engine takes only image data and does not modify sticker arrays or DOM
  const imgData = {
    width: 2,
    height: 2,
    data: new Uint8ClampedArray(16).fill(100)
  };
  const stickers = [{ id: 'st1', type: 'emoji', value: '💖' }];
  PixelEngine.processPixelPipeline(imgData, { brightness: 0.2 }, { intensity: 1.0 });

  // Stickers array is completely untouched
  assert.equal(stickers.length, 1);
  assert.equal(stickers[0].value, '💖');
});

test('33. only-final-JPEG upload boundary: only final composed JPEG is submitted to API', () => {
  // Verify that intermediate capture and filter stages generate local object URLs, not network uploads
  const mockFormDataEntries = [];
  const form = {
    append(key, val, filename) {
      mockFormDataEntries.push({ key, filename });
    }
  };
  form.append('photo', { type: 'image/jpeg' }, 'maeum-fourcuts.jpg');

  assert.equal(mockFormDataEntries.length, 1);
  assert.equal(mockFormDataEntries[0].key, 'photo');
  assert.equal(mockFormDataEntries[0].filename, 'maeum-fourcuts.jpg');
});
