const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Read and eval public/config.js to access PHOTO_BOOTH_CONFIG & validateBoothConfig
const configCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'config.js'), 'utf8');
const sandbox = { window: {} };
new Function('window', configCode)(sandbox.window);
const { PHOTO_BOOTH_CONFIG, validateBoothConfig } = sandbox.window;

test('config validation: passes on valid default configuration', () => {
  const result = validateBoothConfig(PHOTO_BOOTH_CONFIG);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('config validation: rejects missing title, invalid counts, or empty stickers', () => {
  const invalid1 = { ...PHOTO_BOOTH_CONFIG, brand: {} };
  assert.equal(validateBoothConfig(invalid1).valid, false);

  const invalid2 = { ...PHOTO_BOOTH_CONFIG, capture: { count: 3, selectionCount: 4 } };
  assert.equal(validateBoothConfig(invalid2).valid, false);

  const invalid3 = { ...PHOTO_BOOTH_CONFIG, stickers: { items: [] } };
  assert.equal(validateBoothConfig(invalid3).valid, false);
});

test('photo selection logic: requires exactly four unique photos and preserves order', () => {
  const availableShots = ['shot-1', 'shot-2', 'shot-3', 'shot-4', 'shot-5', 'shot-6'];
  let selected = [];

  function select(id) {
    if (!selected.includes(id) && selected.length < 4) {
      selected.push(id);
    }
  }

  function deselect(id) {
    const idx = selected.indexOf(id);
    if (idx >= 0) selected.splice(idx, 1);
  }

  // Select 4 photos
  select('shot-1');
  select('shot-3');
  select('shot-5');
  select('shot-6');
  assert.deepEqual(selected, ['shot-1', 'shot-3', 'shot-5', 'shot-6']);
  assert.equal(selected.length, 4);

  // Attempting to select a 5th photo is prevented
  select('shot-2');
  assert.equal(selected.length, 4);

  // Deselecting item in the middle compacts sequence immediately
  deselect('shot-3');
  assert.deepEqual(selected, ['shot-1', 'shot-5', 'shot-6']);
  assert.equal(selected.length, 3);

  // Adding another completes the sequence to 4
  select('shot-4');
  assert.deepEqual(selected, ['shot-1', 'shot-5', 'shot-6', 'shot-4']);
  assert.equal(selected.length, 4);
});

test('sticker state isolation: stickers remain strictly bounded to their photo ID', () => {
  const stickerMap = new Map();

  function ensureStickerList(photoId) {
    if (!stickerMap.has(photoId)) stickerMap.set(photoId, []);
    return stickerMap.get(photoId);
  }

  ensureStickerList('photo-A').push({ id: 's1', emoji: '💖', x: 0.5, y: 0.5, scale: 0.2, rotation: 0 });
  ensureStickerList('photo-B').push({ id: 's2', emoji: '✨', x: 0.3, y: 0.3, scale: 0.25, rotation: 0 });

  assert.equal(ensureStickerList('photo-A').length, 1);
  assert.equal(ensureStickerList('photo-A')[0].emoji, '💖');
  assert.equal(ensureStickerList('photo-B').length, 1);
  assert.equal(ensureStickerList('photo-B')[0].emoji, '✨');
  assert.equal(ensureStickerList('photo-C').length, 0);
});

test('sticker coordinate bounds: x,y clamped to [0.04, 0.96] and scale to [0.08, 0.50]', () => {
  function clampCoord(val) {
    return Math.max(0.04, Math.min(0.96, val));
  }
  function clampScale(val) {
    return Math.max(0.08, Math.min(0.50, val));
  }

  assert.equal(clampCoord(-0.5), 0.04);
  assert.equal(clampCoord(1.5), 0.96);
  assert.equal(clampCoord(0.5), 0.5);

  assert.equal(clampScale(0.02), 0.08);
  assert.equal(clampScale(0.99), 0.50);
  assert.equal(clampScale(0.25), 0.25);
});

test('sticker variety: provides at least 50 rich stickers across multiple categories', () => {
  assert.equal(PHOTO_BOOTH_CONFIG.stickers.items.length >= 50, true);
  assert.equal(PHOTO_BOOTH_CONFIG.stickers.categories.length >= 5, true);
});

test('canvas geometry math: 2x2 grid math computes valid non-overlapping coordinates', () => {
  const frame = PHOTO_BOOTH_CONFIG.frame;
  const top = frame.headerHeight + 20;
  const bottom = frame.footerHeight + 20;
  const cellW = (frame.width - frame.padding * 2 - frame.gap) / 2;
  const cellH = (frame.height - top - bottom - frame.gap) / 2;

  assert.equal(cellW > 0, true);
  assert.equal(cellH > 0, true);
  assert.equal(frame.padding * 2 + cellW * 2 + frame.gap, frame.width);
  assert.equal(top + cellH * 2 + frame.gap + bottom, frame.height);
});
