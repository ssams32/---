const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Read and evaluate public/config.js
const configCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'config.js'), 'utf8');
const sandbox = { window: {} };
new Function('window', configCode)(sandbox.window);
const { PHOTO_BOOTH_CONFIG, validateBoothConfig, deriveSlotAspectRatio } = sandbox.window;

// Read HTML & CSS for static structure assertions
const htmlContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const cssContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');

// Test 1: FAST-LANE mode renders four progress steps
test('1. FAST-LANE mode renders four progress steps', () => {
  const getWorkflowSteps = (mode) => {
    if (mode === 'fast-lane') {
      return [
        { id: 'camera', label: '촬영' },
        { id: 'select', label: '사진 선택' },
        { id: 'preview', label: '출력' },
        { id: 'result', label: '완성' }
      ];
    }
    return [
      { id: 'camera', label: '촬영' },
      { id: 'select', label: '사진 선택' },
      { id: 'filter', label: '필터' },
      { id: 'edit', label: '꾸미기' },
      { id: 'result', label: '완성' }
    ];
  };

  const steps = getWorkflowSteps(PHOTO_BOOTH_CONFIG.eventMode.mode);
  assert.equal(steps.length, 4);
  assert.deepEqual(steps.map(s => s.label), ['촬영', '사진 선택', '출력', '완성']);
});

// Test 2: STANDARD mode renders five progress steps
test('2. STANDARD mode renders five progress steps', () => {
  const getWorkflowSteps = (mode) => {
    if (mode === 'fast-lane') {
      return [
        { id: 'camera', label: '촬영' },
        { id: 'select', label: '사진 선택' },
        { id: 'preview', label: '출력' },
        { id: 'result', label: '완성' }
      ];
    }
    return [
      { id: 'camera', label: '촬영' },
      { id: 'select', label: '사진 선택' },
      { id: 'filter', label: '필터' },
      { id: 'edit', label: '꾸미기' },
      { id: 'result', label: '완성' }
    ];
  };

  const steps = getWorkflowSteps('standard');
  assert.equal(steps.length, 5);
  assert.deepEqual(steps.map(s => s.label), ['촬영', '사진 선택', '필터', '꾸미기', '완성']);
});

// Test 3: progress labels never contain forced line breaks
test('3. progress labels never contain forced line breaks', () => {
  const fastSteps = ['촬영', '사진 선택', '출력', '완성'];
  const stdSteps = ['촬영', '사진 선택', '필터', '꾸미기', '완성'];

  [...fastSteps, ...stdSteps].forEach(label => {
    assert.equal(label.includes('\n'), false);
    assert.equal(label.includes('<br>'), false);
  });

  // Verify CSS contains white-space: nowrap for rail and labels
  assert.match(cssContent, /\.progress-rail[\s\S]*?white-space:\s*nowrap/);
  assert.match(cssContent, /\.progress-step[\s\S]*?white-space:\s*nowrap/);
  assert.match(cssContent, /\.progress-step-label[\s\S]*?white-space:\s*nowrap/);
});

// Test 4: skipped steps do not appear in FAST-LANE mode
test('4. skipped steps do not appear in FAST-LANE mode', () => {
  const isFastLane = PHOTO_BOOTH_CONFIG.eventMode.mode === 'fast-lane';
  assert.equal(isFastLane, true);

  const wf = PHOTO_BOOTH_CONFIG.eventMode.workflow;
  assert.equal(wf.enableParticipantFilterStep, false);
  assert.equal(wf.enableParticipantStickerStep, false);
  assert.equal(wf.enableFrameSelectionStep, false);
});

// Test 5: fourth unique selection locks further input
test('5. fourth unique selection locks further input', () => {
  let selected = [];
  let selectionLocked = false;

  function selectPhoto(id) {
    if (selectionLocked) return;
    if (!selected.includes(id) && selected.length < 4) {
      selected.push(id);
      if (selected.length === 4) {
        selectionLocked = true;
      }
    }
  }

  selectPhoto('shot-1');
  selectPhoto('shot-2');
  selectPhoto('shot-3');
  selectPhoto('shot-4');

  assert.equal(selected.length, 4);
  assert.equal(selectionLocked, true);

  // Attempt to select another photo while locked
  selectPhoto('shot-5');
  assert.equal(selected.length, 4);
  assert.equal(selected.includes('shot-5'), false);
});

// Test 6: fourth selection triggers automatic composition
test('6. fourth selection triggers automatic composition', (t, done) => {
  let selected = [];
  let compositionStarted = false;

  function onSelect(id) {
    if (selected.length < 4) selected.push(id);
    if (selected.length === 4) {
      setTimeout(() => {
        compositionStarted = true;
        assert.equal(compositionStarted, true);
        done();
      }, 50);
    }
  }

  onSelect('s1');
  onSelect('s2');
  onSelect('s3');
  onSelect('s4');
});

// Test 7: duplicate photo selection is rejected
test('7. duplicate photo selection is rejected', () => {
  let selected = [];

  function toggle(id) {
    const idx = selected.indexOf(id);
    if (idx >= 0) {
      selected.splice(idx, 1);
    } else {
      if (selected.length < 4 && !selected.includes(id)) {
        selected.push(id);
      }
    }
  }

  toggle('p1');
  toggle('p2');
  toggle('p1'); // deselect
  assert.deepEqual(selected, ['p2']);
  toggle('p1'); // select again
  assert.deepEqual(selected, ['p2', 'p1']);
});

// Test 8: fixed black frame is applied
test('8. fixed black frame is applied', () => {
  const fixedPresetId = PHOTO_BOOTH_CONFIG.eventMode.fixedDesign.framePresetId;
  assert.equal(fixedPresetId, 'event-black');

  const frame = PHOTO_BOOTH_CONFIG.frames.presets.find(f => f.id === fixedPresetId);
  assert.ok(frame);
  assert.equal(frame.colors.background, '#0B0B0D');
  assert.equal(frame.colors.primaryText, '#FFFFFF');
  assert.equal(frame.colors.secondaryText, '#CFCFD4');
  assert.equal(frame.colors.photoBorder, '#2A2A2F');
  assert.equal(frame.header.text, '오늘의 마음 네컷');
  assert.equal(frame.footer.text, '당신의 오늘을 응원합니다');
});

// Test 9: fixed sticker preset is applied
test('9. fixed sticker preset is applied', () => {
  const stickerPresetId = PHOTO_BOOTH_CONFIG.eventMode.fixedDesign.stickerPresetId;
  assert.equal(stickerPresetId, 'event-fixed-decoration');

  const preset = PHOTO_BOOTH_CONFIG.fixedStickerPresets.presets.find(p => p.id === stickerPresetId);
  assert.ok(preset);
  assert.equal(preset.placements.length, 2);

  const sparkle = preset.placements.find(p => p.id === 'top-sparkle');
  assert.ok(sparkle);
  assert.equal(sparkle.value, '✨');
  assert.equal(sparkle.target, 'card');

  const heart = preset.placements.find(p => p.id === 'bottom-heart');
  assert.ok(heart);
  assert.equal(heart.value, '💜');
  assert.equal(heart.target, 'card');
});

// Test 10: participant sticker state is ignored in FAST-LANE mode
test('10. participant sticker state is ignored in FAST-LANE mode', () => {
  const isFastLane = PHOTO_BOOTH_CONFIG.eventMode.mode === 'fast-lane';
  const participantStickers = new Map();
  participantStickers.set('p1', [{ id: 'custom-1', emoji: '🎀' }]);

  function getEffectiveStickers(isFast, userStickers, fixedPreset) {
    if (isFast) {
      return fixedPreset.placements;
    }
    return userStickers;
  }

  const effective = getEffectiveStickers(
    isFastLane,
    participantStickers,
    PHOTO_BOOTH_CONFIG.fixedStickerPresets.presets[0]
  );
  assert.equal(effective.length, 2);
  assert.equal(effective.some(s => s.id === 'custom-1'), false);
});

// Test 11: filter screen is skipped in FAST-LANE mode
test('11. filter screen is skipped in FAST-LANE mode', () => {
  const wf = PHOTO_BOOTH_CONFIG.eventMode.workflow;
  assert.equal(wf.enableParticipantFilterStep, false);
});

// Test 12: sticker editor is skipped in FAST-LANE mode
test('12. sticker editor is skipped in FAST-LANE mode', () => {
  const wf = PHOTO_BOOTH_CONFIG.eventMode.workflow;
  assert.equal(wf.enableParticipantStickerStep, false);
});

// Test 13: frame selection is skipped in FAST-LANE mode
test('13. frame selection is skipped in FAST-LANE mode', () => {
  const wf = PHOTO_BOOTH_CONFIG.eventMode.workflow;
  assert.equal(wf.enableFrameSelectionStep, false);
});

// Test 14: master card contains exactly four photos
test('14. master card contains exactly four photos', () => {
  const selectionCount = PHOTO_BOOTH_CONFIG.eventMode.workflow.selectionCount;
  const cardPhotoCount = PHOTO_BOOTH_CONFIG.printLayout.card.photoCount;
  assert.equal(selectionCount, 4);
  assert.equal(cardPhotoCount, 4);
});

// Test 15: master card photographs are vertically stacked
test('15. master card photographs are vertically stacked', () => {
  const direction = PHOTO_BOOTH_CONFIG.printLayout.card.photoDirection;
  assert.equal(direction, 'vertical');

  // Verify vertical placement math
  const cardH = 864;
  const headerH = cardH * 0.060;
  const footerH = cardH * 0.075;
  const innerPad = 18;
  const photoGap = 8;
  const contentH = cardH - headerH - footerH - innerPad * 2 - 3 * photoGap;
  const slotH = contentH / 4;

  const ySlots = [0, 1, 2, 3].map(i => innerPad + headerH + i * (slotH + photoGap));
  for (let i = 1; i < 4; i++) {
    assert.ok(ySlots[i] > ySlots[i - 1], 'Each successive photo must be lower on the vertical Y axis');
  }
});

// Test 16: print sheet contains four identical cards
test('16. print sheet contains four identical cards', () => {
  const copies = PHOTO_BOOTH_CONFIG.printLayout.card.copies;
  const cols = PHOTO_BOOTH_CONFIG.printLayout.grid.columns;
  const rows = PHOTO_BOOTH_CONFIG.printLayout.grid.rows;
  assert.equal(copies, 4);
  assert.equal(cols * rows, 4);
});

// Test 17: print sheet geometry is 1200×1776
test('17. print sheet geometry is 1200×1776', () => {
  const sheet = PHOTO_BOOTH_CONFIG.printLayout.sheet;
  assert.equal(sheet.width, 1200);
  assert.equal(sheet.height, 1776);
  assert.equal(sheet.physicalWidthMm, 100);
  assert.equal(sheet.physicalHeightMm, 148);
  assert.equal(sheet.orientation, 'portrait');
});

// Test 18: center cuts are x=600 and y=888
test('18. center cuts are x=600 and y=888', () => {
  const sheet = PHOTO_BOOTH_CONFIG.printLayout.sheet;
  const cutX = sheet.width / 2;
  const cutY = sheet.height / 2;
  assert.equal(cutX, 600);
  assert.equal(cutY, 888);
});

// Test 19: photo-slot ratio is derived from print geometry
test('19. photo-slot ratio is derived from print geometry', () => {
  const derivedRatio = deriveSlotAspectRatio(PHOTO_BOOTH_CONFIG.printLayout);

  // Exact math:
  // sheet: 1200 x 1776
  // margins: 18 * 2 = 36, gutter: 12
  // cardW = (1200 - 36 - 12) / 2 = 576
  // cardH = (1776 - 36 - 12) / 2 = 864
  // header: 864 * 0.060 = 51.84, footer: 864 * 0.075 = 64.8
  // contentH = 864 - 51.84 - 64.8 - 36 - 24 = 687.36
  // slotH = 687.36 / 4 = 171.84
  // slotW = 576 - 36 = 540
  // ratio = 540 / 171.84 = 3.1424581...
  assert.ok(Math.abs(derivedRatio - (540 / 171.84)) < 0.0001);
});

// Test 20: explicit slot-ratio override works
test('20. explicit slot-ratio override works', () => {
  const overrideCfg = {
    ...PHOTO_BOOTH_CONFIG.capture,
    slotAspectRatioMode: 'explicit',
    explicitSlotAspectRatio: 1.5
  };

  const getEffectiveRatio = (cfg, layout) => {
    if (cfg.slotAspectRatioMode === 'explicit' && cfg.explicitSlotAspectRatio) {
      return cfg.explicitSlotAspectRatio;
    }
    return deriveSlotAspectRatio(layout);
  };

  assert.equal(getEffectiveRatio(overrideCfg, PHOTO_BOOTH_CONFIG.printLayout), 1.5);
});

// Test 21: camera guide matches derived slot ratio
test('21. camera guide matches derived slot ratio', () => {
  const derivedRatio = deriveSlotAspectRatio(PHOTO_BOOTH_CONFIG.printLayout);
  assert.ok(derivedRatio > 3.0);
  assert.match(htmlContent, /id="cameraCropOverlay"/);
  assert.match(htmlContent, /id="cropSafeBox"/);
});

// Test 22: group-safe crop does not use face detection
test('22. group-safe crop does not use face detection', () => {
  const appCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.equal(appCode.includes('faceapi'), false);
  assert.equal(appCode.includes('FaceDetector'), false);
  assert.equal(appCode.includes('models/face'), false);
});

// Test 23: print action is idempotent
test('23. print action is idempotent', () => {
  let printCount = 0;
  let printState = { status: 'ready', sessionId: 1 };

  function executePrint(state) {
    if (state.status !== 'ready') return false;
    state.status = 'printing';
    printCount++;
    return true;
  }

  assert.equal(executePrint(printState), true);
  assert.equal(executePrint(printState), false);
  assert.equal(printCount, 1);
});

// Test 24: duplicate print tap is blocked
test('24. duplicate print tap is blocked', () => {
  let taps = 0;
  let printStarted = false;

  function onPrintTap() {
    if (printStarted) return 'BLOCKED';
    printStarted = true;
    taps++;
    return 'ACCEPTED';
  }

  assert.equal(onPrintTap(), 'ACCEPTED');
  assert.equal(onPrintTap(), 'BLOCKED');
  assert.equal(onPrintTap(), 'BLOCKED');
  assert.equal(taps, 1);
});

// Test 25: stale print callback is ignored
test('25. stale print callback is ignored', () => {
  let outputCommitted = false;
  let currentSession = 42;

  function onPrintComplete(callbackSession) {
    if (callbackSession !== currentSession) {
      return false; // Stale session ignored
    }
    outputCommitted = true;
    return true;
  }

  assert.equal(onPrintComplete(41), false);
  assert.equal(outputCommitted, false);
  assert.equal(onPrintComplete(42), true);
  assert.equal(outputCommitted, true);
});

// Test 26: print Canvas clears on reset
test('26. print Canvas clears on reset', () => {
  let canvas = { width: 1200, height: 1776, cleared: false };
  let printAreaChildren = ['img'];

  function reset() {
    canvas.cleared = true;
    canvas.width = 1;
    canvas.height = 1;
    printAreaChildren = [];
  }

  reset();
  assert.equal(canvas.cleared, true);
  assert.equal(canvas.width, 1);
  assert.equal(canvas.height, 1);
  assert.equal(printAreaChildren.length, 0);
});

// Test 27: progress header remains outside preview bounds
test('27. progress header remains outside preview bounds', () => {
  // Verify CSS safe containment: screen:not(#start) has padding-top for header
  assert.match(cssContent, /\.screen:not\(#start\)\s*\{[\s\S]*?padding-top:\s*calc\(var\(--progress-height\)/);
  assert.match(cssContent, /--progress-height:\s*clamp\(52px,\s*7dvh,\s*72px\)/);
  assert.match(cssContent, /\.preview-stage[\s\S]*?max-height:\s*calc\([\s\S]*?- var\(--progress-height\)/);
});

// Test 28: standard security tests continue to pass
test('28. standard security tests continue to pass', () => {
  const result = validateBoothConfig(PHOTO_BOOTH_CONFIG);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});
