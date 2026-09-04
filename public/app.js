/**
 * 마음 네컷 포토부스 | MAEUM FOUR CUTS
 * Core Kiosk Application Logic
 */
(() => {
  'use strict';

  // DOM Query Helpers
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const uid = () => Math.random().toString(36).slice(2, 10);

  // Load and validate config
  let CFG = window.PHOTO_BOOTH_CONFIG || {};
  const validation = window.validateBoothConfig ? window.validateBoothConfig(CFG) : { valid: true };
  if (!validation.valid) {
    console.error('Photo Booth Config Validation Failed:', validation.errors);
    alert('부스 설정 오류:\n' + validation.errors.join('\n'));
  }

  // Application State
  const state = {
    phase: 'start',
    stream: null,
    shots: [],
    selected: [],
    stickers: new Map(), // photoId -> Array<StickerModel>
    activePhotoId: null,
    activeStickerId: null,
    activeCategory: CFG.stickers?.categories?.[0]?.id || 'icheon_20th',
    currentThemeId: 'classic_light',
    currentFilterId: 'normal',
    csrf: null,
    runId: 0,
    idleTimer: null,
    completionTimer: null,
    warningTimer: null,
    abortController: null
  };

  const screens = ['start', 'permission', 'camera', 'select', 'edit', 'composing', 'result'];

  // Apply Brand Strings to DOM
  function applyBranding() {
    const b = CFG.brand || {};
    const centerChips = $$('.center-chip');
    centerChips.forEach((el) => { el.textContent = b.centerName || '마음건강복지센터와 함께'; });
    
    const landingTitle = $('#landingTitle');
    if (landingTitle) {
      landingTitle.innerHTML = (b.title || '오늘의 마음을\n네 컷에 담아요')
        .replace('\n', '<br>')
        .replace('네 컷', '<span class="highlight">네 컷</span>');
    }

    const landingSub = $('.landing-subtitle');
    if (landingSub) landingSub.innerHTML = (b.subtitle || '').replace('\n', '<br>');

    const resultHeading = $('#resultHeading');
    if (resultHeading) resultHeading.textContent = b.completionTitle || '마음 네컷 완성!';
  }

  // Sync Server Config if Available
  async function loadServerConfig() {
    try {
      const res = await fetch('/api/public-config', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (data.config) {
        CFG = {
          ...CFG,
          ...data.config,
          customBackgrounds: data.config.customBackgrounds || []
        };
        applyBranding();
      }
    } catch {}
  }

  // Screen Navigation Controller
  function show(screenId) {
    screens.forEach((id) => {
      const el = $('#' + id);
      if (el) el.classList.toggle('active', id === screenId);
    });
    state.phase = screenId;

    // Manage Top Progress Rail Visibility and State
    const header = $('#kioskHeader');
    if (screenId === 'start') {
      header?.classList.add('hidden-header');
    } else {
      header?.classList.remove('hidden-header');
      header?.classList.toggle('shooting-mode', screenId === 'camera');
      updateProgressRail(screenId);
    }

    resetInactivityTimer();
  }

  // Update Top Progress Rail
  function updateProgressRail(currentScreen) {
    const stepMapping = {
      permission: 'camera',
      camera: 'camera',
      select: 'select',
      edit: 'edit',
      composing: 'result',
      result: 'result'
    };
    const activeStep = stepMapping[currentScreen] || 'camera';
    const stepOrder = ['camera', 'select', 'edit', 'result'];
    const activeIdx = stepOrder.indexOf(activeStep);

    $$('.rail-step').forEach((stepEl) => {
      const stepName = stepEl.dataset.step;
      const stepIdx = stepOrder.indexOf(stepName);
      stepEl.classList.toggle('active', stepIdx === activeIdx);
      stepEl.classList.toggle('completed', stepIdx < activeIdx);
      const dot = stepEl.querySelector('.step-dot');
      if (dot) {
        dot.textContent = stepIdx < activeIdx ? '✓' : String(stepIdx + 1);
      }
    });
  }

  // Inactivity & Auto-Reset Controller
  function resetInactivityTimer() {
    clearTimeout(state.idleTimer);
    clearTimeout(state.completionTimer);
    clearInterval(state.warningTimer);
    $('#resetWarningBanner')?.classList.remove('show');

    if (state.phase === 'start') return;

    if (state.phase === 'result') {
      // Completion Screen Auto-Reset with 15s warning banner
      const totalMs = CFG.timeouts?.completionResetMs || 90000;
      const warningSec = CFG.timeouts?.finalWarningSeconds || 15;
      const warningStartMs = Math.max(0, totalMs - warningSec * 1000);

      state.idleTimer = setTimeout(() => {
        let remaining = warningSec;
        const banner = $('#resetWarningBanner');
        const text = $('#resetSecondsText');
        if (banner) banner.classList.add('show');
        if (text) text.textContent = `${remaining}초`;

        state.warningTimer = setInterval(() => {
          remaining--;
          if (text) text.textContent = `${remaining}초`;
          if (remaining <= 0) {
            clearInterval(state.warningTimer);
            resetKiosk();
          }
        }, 1000);
      }, warningStartMs);
    } else {
      // Normal In-session Inactivity Reset (2 minutes)
      const idleMs = CFG.timeouts?.idleResetMs || 120000;
      state.idleTimer = setTimeout(() => {
        showNotice('장시간 입력이 없어 안전을 위해 처음 화면으로 이동합니다.');
        resetKiosk();
      }, idleMs);
    }
  }

  // Touch listener to refresh idle timer
  ['pointerdown', 'keydown', 'touchstart'].forEach((evt) => {
    document.addEventListener(evt, resetInactivityTimer, { passive: true });
  });

  // MediaStream Management
  function stopCamera() {
    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop());
      state.stream = null;
    }
    const video = $('#video');
    if (video) video.srcObject = null;
  }

  function releaseShots() {
    state.shots.forEach((s) => URL.revokeObjectURL(s.url));
    state.shots = [];
  }

  // Toast Notice Message
  function showNotice(msg) {
    let node = $('.notice');
    if (!node) {
      node = document.createElement('div');
      node.className = 'notice';
      document.body.append(node);
    }
    node.textContent = msg;
    node.classList.add('show');
    clearTimeout(showNotice.timer);
    showNotice.timer = setTimeout(() => node.classList.remove('show'), 3500);
  }

  // Camera Ready & Initialization Flow
  async function initializeCamera() {
    $('#cameraErrorBox')?.setAttribute('hidden', 'true');
    stopCamera();
    const run = ++state.runId;

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      showNotice('카메라를 사용할 수 없어 샘플 사진 모드로 시작합니다.');
      await sleep(500);
      generateDemoShots();
      return;
    }

    try {
      // Request native wide field-of-view (4:3 sensor native for iPad cameras)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1440, min: 720 }
        },
        audio: false
      });
      if (run !== state.runId) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      state.stream = stream;
      const video = $('#video');
      video.srcObject = stream;
      await video.play();

      // Ensure dimensions ready
      if (!video.videoWidth) {
        await new Promise((resolve, reject) => {
          const tm = setTimeout(() => reject(new Error('카메라 응답 시간 초과')), 8000);
          video.addEventListener('loadedmetadata', () => { clearTimeout(tm); resolve(); }, { once: true });
        });
      }

      // Synchronize viewfinder aspect ratio with actual camera stream to eliminate ALL cropping
      const vfFrame = $('.camera-viewfinder-frame');
      if (vfFrame && video.videoWidth && video.videoHeight) {
        const streamAspect = video.videoWidth / video.videoHeight;
        if (streamAspect >= 1) {
          vfFrame.style.aspectRatio = '4 / 3';
        } else {
          vfFrame.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
        }
      }

      show('camera');
      startShootingSequence();
    } catch (err) {
      console.warn('Camera access denied or failed:', err);
      const errBox = $('#cameraErrorBox');
      if (errBox) {
        errBox.removeAttribute('hidden');
      }
    }
  }

  // High-Resolution Snapshot Capture from Video with Zero-Distortion Math
  async function captureVideoBlob() {
    const video = $('#video');
    const canvas = $('#captureCanvas');
    const ctx = canvas.getContext('2d', { alpha: false });
    const w = 1200, h = 900;
    canvas.width = w;
    canvas.height = h;

    const vw = video.videoWidth || 1200;
    const vh = video.videoHeight || 900;

    const targetRatio = w / h; // 4/3 = 1.333
    const videoRatio = vw / vh;

    let sx, sy, sw, sh;
    if (videoRatio > targetRatio) {
      sh = vh;
      sw = vh * targetRatio;
      sx = (vw - sw) / 2;
      sy = 0;
    } else {
      sw = vw;
      sh = vw / targetRatio;
      sx = 0;
      sy = (vh - sh) / 2;
    }

    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1); // Mirror for natural selfie camera
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
    ctx.restore();

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('사진 생성 실패'));
      }, 'image/jpeg', 0.95);
    });
  }

  // Automated 6-Shot Shooting Sequence with Manual Shutter Support
  async function startShootingSequence() {
    const run = state.runId;
    releaseShots();
    state.selected = [];
    state.stickers.clear();
    state.skipCountdown = false;

    const totalShots = CFG.capture?.count || 6;
    const countdownSec = CFG.capture?.countdownSeconds || 3;
    const betweenMs = CFG.capture?.betweenShotsMs || 750;

    try {
      for (let i = 0; i < totalShots; i++) {
        if (run !== state.runId) return;

        // Update Progress UI
        const shotCountEl = $('#shotCount');
        if (shotCountEl) shotCountEl.textContent = String(i + 1);
        updateShotTrack(i, totalShots);

        // Countdown 3, 2, 1
        state.skipCountdown = false;
        for (let sec = countdownSec; sec >= 1; sec--) {
          if (run !== state.runId) return;
          if (state.skipCountdown) break;

          const cd = $('#countdown');
          if (cd) cd.textContent = String(sec);
          await sleep(650);
        }

        if (run !== state.runId) return;

        // Snapshot & Flash
        const flash = $('#flash');
        if (flash) {
          flash.classList.remove('active', 'flash');
          void flash.offsetWidth;
          flash.classList.add('active', 'flash');
          setTimeout(() => flash.classList.remove('active', 'flash'), 180);
        }

        const cd = $('#countdown');
        if (cd) cd.textContent = '찰칵!';

        const blob = await captureVideoBlob();
        state.shots.push({ id: uid(), blob, url: URL.createObjectURL(blob) });

        // Breathing interval
        await sleep(betweenMs);
      }

      stopCamera();
      renderPhotoSelectionGrid();
      show('select');
    } catch (e) {
      if (run === state.runId) {
        showNotice('촬영 중 문제가 발생하여 처음 화면으로 이동합니다.');
        resetKiosk();
      }
    }
  }

  function updateShotTrack(currentIdx, total) {
    const track = $('#shotTrack');
    if (!track) return;
    track.replaceChildren();
    for (let i = 0; i < total; i++) {
      const node = document.createElement('div');
      node.className = 'node-dot shot-node' + (i < currentIdx ? ' done' : i === currentIdx ? ' current' : '');
      node.textContent = String(i + 1);
      track.append(node);
    }
  }

  // Demo Shots Generator (Loads 6 realistic photobooth sample portraits)
  async function generateDemoShots() {
    stopCamera();
    releaseShots();
    state.selected = [];
    state.stickers.clear();

    const sampleUrls = [
      '/samples/shot_1.jpg',
      '/samples/shot_2.jpg',
      '/samples/shot_3.jpg',
      '/samples/shot_4.jpg',
      '/samples/shot_5.jpg',
      '/samples/shot_6.jpg'
    ];

    try {
      for (let i = 0; i < sampleUrls.length; i++) {
        const url = sampleUrls[i];
        let blob = null;
        try {
          const res = await fetch(url);
          if (res.ok) blob = await res.blob();
        } catch {}

        if (!blob) {
          // Fallback canvas if offline or path unavailable
          const canvas = $('#captureCanvas');
          const ctx = canvas.getContext('2d', { alpha: false });
          canvas.width = 1200;
          canvas.height = 900;
          ctx.fillStyle = '#FFE3EC';
          ctx.fillRect(0, 0, 1200, 900);
          ctx.font = '900 120px -apple-system, sans-serif';
          ctx.fillStyle = '#211C29';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`포토 샘플 0${i + 1}`, 600, 450);
          blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
        }

        state.shots.push({ id: uid(), blob, url: URL.createObjectURL(blob) });
      }
    } catch (e) {
      console.warn('Demo shots loading error:', e);
    }

    renderPhotoSelectionGrid();
    show('select');
  }

  // ===================================================================
  // FOUR-PHOTO SELECTION CONTROLLER
  // ===================================================================
  function renderPhotoSelectionGrid() {
    const grid = $('#photoGrid');
    if (!grid) return;
    grid.replaceChildren();
    state.selected = [];
    updateSelectionCounter();

    state.shots.forEach((shot, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'photo-card-item';
      btn.dataset.photoId = shot.id;
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('aria-label', `사진 ${index + 1}번 선택`);

      const img = document.createElement('img');
      img.src = shot.url;
      img.alt = `촬영 사진 ${index + 1}`;

      const badge = document.createElement('div');
      badge.className = 'selection-order-badge photo-order-badge';
      badge.hidden = true;

      btn.append(img, badge);
      btn.addEventListener('click', () => togglePhotoSelection(shot.id));
      grid.append(btn);
    });

    updateDestinationMockup();
  }

  function togglePhotoSelection(photoId) {
    const idx = state.selected.indexOf(photoId);
    if (idx >= 0) {
      // Deselect and compact sequence
      state.selected.splice(idx, 1);
    } else {
      if (state.selected.length >= 4) return;
      state.selected.push(photoId);
    }

    updateSelectionCounter();
    updateSelectionBadges();
    updateDestinationMockup();
  }

  function updateSelectionCounter() {
    const count = state.selected.length;
    const badge = $('#selectionCounterBadge');
    if (badge) badge.textContent = `${count} / 4 선택`;
    const completeBtn = $('#editBtn');
    if (completeBtn) completeBtn.disabled = count !== 4;
  }

  function updateSelectionBadges() {
    $$('#photoGrid .photo-card-item').forEach((card) => {
      const pid = card.dataset.photoId;
      const selIdx = state.selected.indexOf(pid);
      const badge = card.querySelector('.selection-order-badge') || card.querySelector('.photo-order-badge');
      if (selIdx >= 0) {
        card.setAttribute('aria-pressed', 'true');
        card.classList.add('selected');
        if (badge) {
          badge.hidden = false;
          badge.textContent = String(selIdx + 1);
        }
      } else {
        card.setAttribute('aria-pressed', 'false');
        card.classList.remove('selected');
        if (badge) {
          badge.hidden = true;
          badge.textContent = '';
        }
      }
    });
  }

  function updateDestinationMockup() {
    const mockup = $('#destinationMockup');
    if (!mockup) return;
    const slots = mockup.querySelectorAll('.dest-slot');
    slots.forEach((slot, i) => {
      const pid = state.selected[i];
      slot.replaceChildren();
      if (pid) {
        slot.classList.add('filled');
        const img = document.createElement('img');
        const s = state.shots.find((x) => x.id === pid);
        if (s) img.src = s.url;
        slot.append(img);
      } else {
        slot.classList.remove('filled');
        const num = document.createElement('span');
        num.className = 'slot-number-tag';
        num.textContent = String(i + 1);
        slot.append(num);
      }
    });
  }

  // ===================================================================
  // DECORATION & STICKER EDITOR CONTROLLER
  // ===================================================================
  function ensureStickerList(photoId) {
    if (!state.stickers.has(photoId)) state.stickers.set(photoId, []);
    return state.stickers.get(photoId);
  }

  function renderDecorationEditor() {
    renderStripPreview();
    renderThemeSelector();
    renderStickerCategories();
    renderStickerItems();
  }

  function renderThemeSelector() {
    const row = $('#themeSelector');
    if (!row) return;
    row.replaceChildren();

    Object.entries(CFG.themes || {}).forEach(([key, theme]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `theme-chip ${state.currentThemeId === key ? 'active' : ''}`;
      btn.style.backgroundColor = theme.swatch || theme.backgroundColor || '#FFFDF9';
      btn.title = theme.name || key;
      btn.setAttribute('aria-label', theme.name || key);

      btn.onclick = () => {
        state.currentThemeId = key;
        const preview = $('#stripPreview');
        if (preview) {
          preview.style.background = theme.backgroundColor || '#FFFDF9';
        }
        renderThemeSelector();
      };
      row.append(btn);
    });
  }

  function renderStripPreview() {
    const preview = $('#stripPreview');
    if (!preview) return;
    preview.replaceChildren();

    if (!state.activePhotoId || !state.selected.includes(state.activePhotoId)) {
      state.activePhotoId = state.selected[0];
    }
    state.activeStickerId = null;

    const theme = CFG.themes?.[state.currentThemeId] || CFG.themes?.classic_light || {};
    preview.style.background = theme.backgroundColor || '#FFFDF9';

    const grid = document.createElement('div');
    grid.className = 'strip-grid-2x2';

    state.selected.forEach((photoId, index) => {
      const cell = document.createElement('div');
      const isActive = photoId === state.activePhotoId;
      cell.className = `strip-slot preview-cell ${isActive ? 'active active-photo' : ''}`;
      cell.dataset.photoId = photoId;

      const img = document.createElement('img');
      img.className = 'slot-photo';
      const shot = state.shots.find((s) => s.id === photoId);
      if (shot) img.src = shot.url;
      img.alt = `사진 ${index + 1}`;

      if (isActive) {
        const pill = document.createElement('div');
        pill.className = 'active-slot-pill';
        pill.textContent = '꾸미는 중';
        cell.append(pill);
      }

      cell.append(img);
      cell.addEventListener('pointerdown', (e) => {
        if (e.target === cell || e.target === img) {
          selectActivePhoto(photoId);
        }
      });
      grid.append(cell);
    });

    preview.append(grid);
    state.selected.forEach((photoId) => renderPhotoStickers(photoId));
    updateActivePhotoBanner();
  }

  function updateActivePhotoBanner() {
    const banner = $('#activePhotoLabel');
    if (!banner) return;
    const idx = state.selected.indexOf(state.activePhotoId);
    banner.textContent = idx >= 0 ? `사진 #${idx + 1} 편집 중 (스티커를 터치하여 추가)` : '사진을 터치하여 스티커를 부착하세요';
  }

  function selectActivePhoto(photoId) {
    state.activePhotoId = photoId;
    state.activeStickerId = null;
    $$('.preview-cell').forEach((c) => {
      const isActive = c.dataset.photoId === photoId;
      c.classList.toggle('active', isActive);
      c.classList.toggle('active-photo', isActive);
      const pill = c.querySelector('.active-slot-pill');
      if (isActive && !pill) {
        const newPill = document.createElement('div');
        newPill.className = 'active-slot-pill';
        newPill.textContent = '꾸미는 중';
        c.append(newPill);
      } else if (!isActive && pill) {
        pill.remove();
      }
    });
    $$('.sticker-node').forEach((n) => n.classList.remove('selected'));
    updateActivePhotoBanner();
  }

  function renderStickerCategories() {
    const tabContainer = $('#stickerCategoryTabs');
    if (!tabContainer) return;
    tabContainer.replaceChildren();

    const cats = CFG.stickers?.categories || [
      { id: 'icheon_20th', label: '🎉 이천 20주년' },
      { id: 'cloud_emotion', label: '너우리 표정' },
      { id: 'cloud_costume', label: '너우리 코스튬' },
      { id: 'cloud_action', label: '너우리 응원' },
      { id: 'cloud_special', label: '너우리 스페셜' },
      { id: 'decorations', label: '러블리 데코' }
    ];

    cats.forEach((cat) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `cat-tab-btn ${state.activeCategory === cat.id ? 'active' : ''}`;
      btn.textContent = cat.label;
      btn.onclick = () => {
        state.activeCategory = cat.id;
        renderStickerCategories();
        renderStickerItems();
      };
      tabContainer.append(btn);
    });
  }

  function renderStickerItems() {
    const tray = $('#stickers');
    if (!tray) return;
    tray.replaceChildren();

    const items = (CFG.stickers?.items || []).filter((it) => it.category === state.activeCategory);

    items.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sticker-item-btn';
      btn.title = item.label || '스티커';
      btn.setAttribute('aria-label', item.label || '스티커');

      if (item.type === 'image') {
        const img = document.createElement('img');
        img.src = item.value;
        img.alt = item.label || '스티커';
        btn.append(img);
      } else {
        btn.textContent = item.value;
      }

      btn.onclick = () => addStickerToActivePhoto(item);
      tray.append(btn);
    });
  }

  function addStickerToActivePhoto(item) {
    if (!state.activePhotoId) state.activePhotoId = state.selected[0];
    const list = ensureStickerList(state.activePhotoId);
    const newSticker = {
      id: uid(),
      type: item.type || 'emoji',
      value: item.value || item,
      label: item.label || '스티커',
      x: 0.5,
      y: 0.5,
      scale: 0.38,
      rotation: 0
    };
    list.push(newSticker);
    renderPhotoStickers(state.activePhotoId);
    selectSticker(state.activePhotoId, newSticker.id);
  }

  function selectSticker(photoId, stickerId) {
    state.activePhotoId = photoId;
    state.activeStickerId = stickerId;
    $$('.preview-cell').forEach((c) => c.classList.toggle('active-photo', c.dataset.photoId === photoId));
    $$('.sticker-node').forEach((n) => {
      n.classList.toggle('selected', n.dataset.photoId === photoId && n.dataset.stickerId === stickerId);
    });
    updateActivePhotoBanner();
  }

  function renderPhotoStickers(photoId) {
    const cell = $(`.preview-cell[data-photo-id="${photoId}"]`);
    if (!cell) return;
    cell.querySelectorAll('.sticker-node').forEach((n) => n.remove());

    ensureStickerList(photoId).forEach((model) => {
      const node = document.createElement('div');
      node.className = `sticker-node ${state.activeStickerId === model.id ? 'selected' : ''}`;
      node.dataset.photoId = photoId;
      node.dataset.stickerId = model.id;

      let contentHtml = '';
      if (model.type === 'image') {
        contentHtml = `<img class="sticker-img-asset" src="${model.value}" alt="${model.label || '스티커'}">`;
      } else {
        contentHtml = `<span class="sticker-emoji">${model.value || model.emoji}</span>`;
      }

      node.innerHTML = `
        <button type="button" class="sticker-handle sticker-delete-handle" aria-label="스티커 삭제">✕</button>
        ${contentHtml}
        <button type="button" class="sticker-handle sticker-resize" aria-label="크기 조절">⤡</button>
        <button type="button" class="sticker-handle sticker-rotate" aria-label="회전">↻</button>
      `;
      applyStickerTransform(node, model);
      bindStickerEvents(node, model);
      cell.append(node);
    });
  }

  function applyStickerTransform(node, model) {
    const cell = node.parentElement;
    const baseW = cell ? (cell.clientWidth || 180) : 180;
    const baseH = cell ? (cell.clientHeight || 135) : 135;
    const base = Math.max(150, Math.min(baseW, baseH));
    const size = Math.max(36, Math.round(base * (model.scale || 0.35)));

    const imgAsset = node.querySelector('.sticker-img-asset');
    let width = size;
    let height = size;

    if (imgAsset && imgAsset.naturalWidth && imgAsset.naturalHeight) {
      const aspect = imgAsset.naturalWidth / imgAsset.naturalHeight;
      if (aspect >= 1) {
        width = Math.round(size * aspect);
        height = size;
      } else {
        width = size;
        height = Math.round(size / aspect);
      }
    }

    node.style.width = `${width}px`;
    node.style.height = `${height}px`;
    node.style.left = `${model.x * 100}%`;
    node.style.top = `${model.y * 100}%`;
    node.style.transform = `translate(-50%, -50%) rotate(${model.rotation}rad)`;

    const emojiSpan = node.querySelector('.sticker-emoji');
    if (emojiSpan) emojiSpan.style.fontSize = `${size}px`;
  }

  function bindStickerEvents(node, model) {
    // Delete Handle
    const delBtn = node.querySelector('.sticker-delete-handle');
    delBtn?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      modifyActiveSticker('delete');
    });

    // Node Drag Move
    node.addEventListener('pointerdown', (e) => {
      if (e.target.classList.contains('sticker-handle')) return;
      e.preventDefault();
      e.stopPropagation();
      selectSticker(node.dataset.photoId, model.id);
      node.setPointerCapture(e.pointerId);

      const cell = node.parentElement;
      const rect = cell.getBoundingClientRect();
      const shiftX = e.clientX - (rect.left + model.x * rect.width);
      const shiftY = e.clientY - (rect.top + model.y * rect.height);

      const onMove = (ev) => {
        model.x = Math.max(0.06, Math.min(0.94, (ev.clientX - rect.left - shiftX) / rect.width));
        model.y = Math.max(0.06, Math.min(0.94, (ev.clientY - rect.top - shiftY) / rect.height));
        applyStickerTransform(node, model);
      };
      node.addEventListener('pointermove', onMove);
      node.addEventListener('pointerup', () => node.removeEventListener('pointermove', onMove), { once: true });
    });

    // Resize Handle
    const resizeHandle = node.querySelector('.sticker-resize');
    resizeHandle?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectSticker(node.dataset.photoId, model.id);
      resizeHandle.setPointerCapture(e.pointerId);

      const cell = node.parentElement;
      const startY = e.clientY;
      const startScale = model.scale || 0.35;

      const onResize = (ev) => {
        const delta = (ev.clientY - startY) / (cell.clientHeight || 200);
        model.scale = Math.max(0.12, Math.min(0.65, startScale + delta));
        applyStickerTransform(node, model);
      };
      resizeHandle.addEventListener('pointermove', onResize);
      resizeHandle.addEventListener('pointerup', () => resizeHandle.removeEventListener('pointermove', onResize), { once: true });
    });

    // Rotate Handle
    const rotateHandle = node.querySelector('.sticker-rotate');
    rotateHandle?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectSticker(node.dataset.photoId, model.id);
      rotateHandle.setPointerCapture(e.pointerId);

      const rect = node.parentElement.getBoundingClientRect();
      const cx = rect.left + model.x * rect.width;
      const cy = rect.top + model.y * rect.height;
      const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx) - model.rotation;

      const onRotate = (ev) => {
        model.rotation = Math.atan2(ev.clientY - cy, ev.clientX - cx) - startAngle;
        applyStickerTransform(node, model);
      };
      rotateHandle.addEventListener('pointermove', onRotate);
      rotateHandle.addEventListener('pointerup', () => rotateHandle.removeEventListener('pointermove', onRotate), { once: true });
    });
  }

  function modifyActiveSticker(action) {
    if (!state.activePhotoId || !state.activeStickerId) return;
    const list = ensureStickerList(state.activePhotoId);
    const model = list.find((x) => x.id === state.activeStickerId);
    if (!model) return;

    if (action === 'bigger') model.scale = Math.min(0.65, (model.scale || 0.35) + 0.05);
    if (action === 'smaller') model.scale = Math.max(0.12, (model.scale || 0.35) - 0.05);
    if (action === 'rotate') model.rotation += Math.PI / 12;
    if (action === 'delete') {
      const idx = list.indexOf(model);
      if (idx >= 0) list.splice(idx, 1);
      state.activeStickerId = null;
    }

    renderPhotoStickers(state.activePhotoId);
    if (action !== 'delete') selectSticker(state.activePhotoId, model.id);
  }

  // ===================================================================
  // FINAL CANVAS COMPOSITION & UPLOAD FLOW
  // ===================================================================
  function loadHtmlImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  function drawCover(ctx, img, x, y, w, h) {
    const ratio = Math.max(w / img.width, h / img.height);
    const sw = w / ratio;
    const sh = h / ratio;
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
  }

  async function composeFinalCanvasBlob() {
    const f = CFG.frame || { width: 1200, height: 1420, headerHeight: 120, footerHeight: 100, padding: 40, gap: 20 };
    const canvas = $('#finalCanvas');
    const ctx = canvas.getContext('2d', { alpha: false });

    canvas.width = f.width;
    canvas.height = f.height;

    // High quality canvas smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const theme = CFG.themes?.[state.currentThemeId] || CFG.themes?.classic_light || {};

    // Background Canvas Fill
    ctx.fillStyle = theme.backgroundColor || '#FAF7F2';
    ctx.fillRect(0, 0, f.width, f.height);

    // Header Branding Text (Clean Studio Typography)
    ctx.fillStyle = theme.headerColor || '#1F1B24';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 32px "Pretendard Variable", Pretendard, -apple-system, sans-serif';
    ctx.letterSpacing = '1px';
    ctx.fillText(CFG.brand?.centerName || '이천시정신건강복지센터 20주년', f.width / 2, f.headerHeight / 2 - 6);

    ctx.font = '600 18px "Pretendard Variable", Pretendard, -apple-system, sans-serif';
    ctx.fillStyle = theme.footerColor || '#726A7C';
    ctx.fillText('MAEUM FOUR CUTS PHOTO BOOTH', f.width / 2, f.headerHeight / 2 + 24);

    // 2x2 Grid Layout Math
    const top = f.headerHeight + 20;
    const bottom = f.footerHeight + 20;
    const cellW = (f.width - f.padding * 2 - f.gap) / 2;
    const cellH = (f.height - top - bottom - f.gap) / 2;

    const loadedImages = await Promise.all(state.selected.map((id) => {
      const s = state.shots.find((x) => x.id === id);
      return s ? loadHtmlImage(s.url) : null;
    }));

    // Preload image stickers across all selected photos
    const stickerImageMap = new Map();
    for (const pid of state.selected) {
      for (const st of ensureStickerList(pid)) {
        if (st.type === 'image' && !stickerImageMap.has(st.value)) {
          const img = await loadHtmlImage(st.value).catch(() => null);
          if (img) stickerImageMap.set(st.value, img);
        }
      }
    }

    for (let i = 0; i < 4; i++) {
      const photoId = state.selected[i];
      const img = loadedImages[i];
      if (!img) continue;

      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = f.padding + col * (cellW + f.gap);
      const y = top + row * (cellH + f.gap);

      // White Photo Frame Card with subtle inner crispness
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(x, y, cellW, cellH);

      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, cellW, cellH);
      ctx.clip();

      drawCover(ctx, img, x, y, cellW, cellH);

      // Render Stickers on Photo with Aspect Ratio Preserved
      for (const st of ensureStickerList(photoId)) {
        const baseSize = Math.min(cellW, cellH) * (st.scale || 0.35);
        ctx.save();
        ctx.translate(x + st.x * cellW, y + st.y * cellH);
        ctx.rotate(st.rotation);

        if (st.type === 'image') {
          const stImg = stickerImageMap.get(st.value);
          if (stImg) {
            const aspect = (stImg.naturalWidth && stImg.naturalHeight)
              ? (stImg.naturalWidth / stImg.naturalHeight)
              : 1;
            let drawW = baseSize;
            let drawH = baseSize;
            if (aspect >= 1) {
              drawW = baseSize * aspect;
              drawH = baseSize;
            } else {
              drawW = baseSize;
              drawH = baseSize / aspect;
            }
            ctx.drawImage(stImg, -drawW / 2, -drawH / 2, drawW, drawH);
          }
        } else {
          ctx.font = `${baseSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(st.value || st.emoji, 0, 0);
        }

        ctx.restore();
      }

      ctx.restore();
    }

    // Footer Message and Date Stamp (Authentic studio photostrip style)
    const now = new Date();
    const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
    const footerY = f.height - f.footerHeight / 2;

    ctx.fillStyle = theme.footerColor || '#726A7C';
    ctx.font = '700 20px "Pretendard Variable", Pretendard, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${dateStr}  ·  ${CFG.brand?.completionMessage || '이천시민의 마음건강 20년, 언제나 함께합니다 ✨'}`, f.width / 2, footerY);

    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.94));
  }

  async function getSecuritySession() {
    const res = await fetch('/api/session', { cache: 'no-store', credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '보안 세션을 생성할 수 없습니다.');
    state.csrf = data.csrfToken;
  }

  // Execution of Composing & Upload
  async function executeCompletionWorkflow() {
    if (state.selected.length !== 4) return;
    show('composing');
    $('#uploadErrorBox')?.setAttribute('hidden', 'true');

    // Stage 1: Composing
    setStage(1);
    state.abortController?.abort();
    state.abortController = new AbortController();
    const run = state.runId;

    try {
      const blob = await composeFinalCanvasBlob();
      if (!blob) throw new Error('최종 사진을 합성할 수 없습니다.');

      // Stage 2: Uploading
      setStage(2);

      let data = null;
      try {
        await getSecuritySession();
        const form = new FormData();
        form.append('photo', blob, 'maeum-fourcuts.jpg');

        const res = await fetch('/api/photos', {
          method: 'POST',
          body: form,
          headers: { 'X-CSRF-Token': state.csrf },
          credentials: 'same-origin',
          signal: state.abortController.signal
        });

        if (res.ok) {
          data = await res.json().catch(() => null);
        }
      } catch (e) {
        console.warn('Cloud upload failed, using local canvas preview:', e);
      }

      if (run !== state.runId) return;

      // Stage 3: QR Preparation & Direct Download
      setStage(3);
      await sleep(300);

      const localBlobUrl = URL.createObjectURL(blob);
      state.completedBlob = blob;
      state.localBlobUrl = localBlobUrl;

      const qrImg = $('#qr');
      const directDl = $('#directDownload');

      if (data && data.qr) {
        if (qrImg) qrImg.src = data.qr;
        if (directDl) {
          directDl.href = localBlobUrl;
          directDl.setAttribute('download', `ichon-20th-fourcuts-${Date.now()}.jpg`);
        }
      } else {
        // Failover: Try client-side direct CDN upload
        let clientCdnUrl = null;
        try {
          const reader = new FileReader();
          const base64Promise = new Promise((resolve) => {
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(blob);
          });
          const b64 = await base64Promise;
          const cdnForm = new FormData();
          cdnForm.append('key', '6d207e02198a847aa98d0a2a901485a5');
          cdnForm.append('action', 'upload');
          cdnForm.append('source', b64);
          cdnForm.append('format', 'json');
          const cRes = await fetch('https://freeimage.host/api/1/upload', { method: 'POST', body: cdnForm });
          if (cRes.ok) {
            const cData = await cRes.json();
            clientCdnUrl = cData?.image?.url || null;
          }
        } catch (e) {
          console.warn('Client direct CDN upload error:', e);
        }

        const fallbackPhotoId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `photo-${Date.now()}`;
        const targetUrl = clientCdnUrl
          ? `${location.origin}/d/${fallbackPhotoId}#img=${encodeURIComponent(clientCdnUrl)}`
          : location.origin;

        if (window.QRCode && qrImg) {
          try {
            const qrDataUrl = await window.QRCode.toDataURL(targetUrl, {
              width: 440,
              margin: 2,
              color: { dark: '#121016', light: '#FFFFFF' }
            });
            qrImg.src = qrDataUrl;
          } catch {
            qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(targetUrl)}`;
          }
        }
        if (directDl) {
          directDl.href = localBlobUrl;
          directDl.setAttribute('download', `ichon-20th-fourcuts-${Date.now()}.jpg`);
        }
      }

      show('result');
    } catch (err) {
      if (err.name !== 'AbortError' && run === state.runId) {
        console.error('Upload flow error:', err);
        const errBox = $('#uploadErrorBox');
        const errMsg = $('#uploadErrorMsg');
        if (errBox) errBox.removeAttribute('hidden');
        if (errMsg) errMsg.textContent = err.message || '저장 중 오류가 발생했습니다.';
      }
    }
  }

  function setStage(num) {
    for (let i = 1; i <= 3; i++) {
      const el = $(`#stage${i}`);
      if (!el) continue;
      el.classList.toggle('done', i < num);
      el.classList.toggle('current', i === num);
    }
  }

  // Complete Reset of Kiosk State
  function resetKiosk() {
    state.runId++;
    state.abortController?.abort();
    state.abortController = null;
    clearTimeout(state.idleTimer);
    clearTimeout(state.completionTimer);
    clearInterval(state.warningTimer);

    stopCamera();
    releaseShots();

    state.selected = [];
    state.stickers.clear();
    state.activePhotoId = null;
    state.activeStickerId = null;
    state.csrf = null;

    $('#shotCount').textContent = '1';
    $('#photoGrid')?.replaceChildren();
    $('#stripPreview')?.replaceChildren();
    $('#qr')?.removeAttribute('src');
    $('#directDownload')?.removeAttribute('href');
    $('#cameraErrorBox')?.setAttribute('hidden', 'true');
    $('#uploadErrorBox')?.setAttribute('hidden', 'true');
    $('#resetWarningBanner')?.classList.remove('show');

    const canvas = $('#finalCanvas');
    if (canvas) {
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 1;
      canvas.height = 1;
    }
    const capCanvas = $('#captureCanvas');
    if (capCanvas) {
      capCanvas.width = 1;
      capCanvas.height = 1;
    }

    show('start');
  }

  // ===================================================================
  // GLOBAL EVENT BINDINGS
  // ===================================================================
  // Screen 1: Start
  $('#startBtn')?.addEventListener('click', () => show('permission'));
  $('#visualStartZone')?.addEventListener('click', () => show('permission'));
  $('#demoBtn')?.addEventListener('click', generateDemoShots);

  // Screen 2: Permission
  $('#permissionStartBtn')?.addEventListener('click', initializeCamera);
  $('#permissionCancelBtn')?.addEventListener('click', () => show('start'));

  // Screen 3: Camera
  $('#manualShutterBtn')?.addEventListener('click', () => {
    state.skipCountdown = true;
  });
  $('#cancelShootBtn')?.addEventListener('click', () => {
    stopCamera();
    show('start');
  });

  // Screen 4: Selection
  $('#retakeBtn')?.addEventListener('click', () => show('permission'));
  $('#editBtn')?.addEventListener('click', () => {
    renderDecorationEditor();
    show('edit');
  });

  // Screen 5: Editor
  $('#smaller')?.addEventListener('click', () => modifyActiveSticker('smaller'));
  $('#bigger')?.addEventListener('click', () => modifyActiveSticker('bigger'));
  $('#rotate')?.addEventListener('click', () => modifyActiveSticker('rotate'));
  $('#deleteSticker')?.addEventListener('click', () => modifyActiveSticker('delete'));
  $('#backSelectBtn')?.addEventListener('click', () => show('select'));
  $('#finishBtn')?.addEventListener('click', executeCompletionWorkflow);

  // Screen 6: Composing / Upload retry
  $('#uploadRetryBtn')?.addEventListener('click', executeCompletionWorkflow);
  $('#uploadCancelBtn')?.addEventListener('click', resetKiosk);

  // Screen 7: Result
  $('#restartBtn')?.addEventListener('click', resetKiosk);

  // Photo Printer AirPrint Handler
  $('#printBtn')?.addEventListener('click', () => {
    const printArea = $('#printArea');
    const canvas = $('#finalCanvas');
    if (!printArea || !canvas) return;

    printArea.replaceChildren();
    const img = document.createElement('img');
    img.src = canvas.toDataURL('image/jpeg', 0.98);
    img.alt = '인쇄용 네컷 사진';
    printArea.appendChild(img);

    showNotice('🖨️ 포토프린터 인쇄 대화상자를 준비합니다...');
    setTimeout(() => {
      window.print();
    }, 250);
  });

  // Native AirDrop / Device Sharing Handler
  $('#shareBtn')?.addEventListener('click', async () => {
    const blob = state.completedBlob;
    if (!blob) {
      showNotice('공유할 사진이 없습니다.');
      return;
    }

    try {
      const file = new File([blob], `ichon-20th-fourcuts-${Date.now()}.jpg`, { type: 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: '이천시정신건강복지센터 20주년 마음 네컷',
          text: '이천시정신건강복지센터 20주년 기념 마음 네컷 사진이에요 ✨'
        });
        showNotice('사진이 성공적으로 공유되었습니다 🎉');
      } else if (navigator.share) {
        await navigator.share({
          title: '이천시정신건강복지센터 20주년 마음 네컷',
          url: location.href
        });
      } else {
        $('#directDownload')?.click();
        showNotice('기기에 직접 사진을 저장했습니다 💾');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('Share error:', err);
        $('#directDownload')?.click();
      }
    }
  });

  // Fullscreen Toggle Handler
  function toggleFullScreen() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else if (document.documentElement.webkitRequestFullscreen) {
        document.documentElement.webkitRequestFullscreen();
      }
      showNotice('⛶ 전체화면 모드로 전환되었습니다');
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  }
  $('#fullscreenBtn')?.addEventListener('click', toggleFullScreen);

  // PWA / App Mode Guide Modal Handlers
  const pwaModal = $('#pwaGuideModal');
  $('#appModeGuideBtn')?.addEventListener('click', () => {
    pwaModal?.classList.add('show');
    pwaModal?.setAttribute('aria-hidden', 'false');
  });
  const closePwaModal = () => {
    pwaModal?.classList.remove('show');
    pwaModal?.setAttribute('aria-hidden', 'true');
  };
  $('#closePwaModalBtn')?.addEventListener('click', closePwaModal);
  $('#confirmPwaModalBtn')?.addEventListener('click', closePwaModal);
  pwaModal?.addEventListener('click', (e) => {
    if (e.target === pwaModal) closePwaModal();
  });

  // Admin secret gesture on logo (press & hold for 2.8 seconds)
  let logoTimer = null;
  const logoBadge = $('#logoBadge');
  logoBadge?.addEventListener('pointerdown', () => {
    logoTimer = setTimeout(() => { location.assign('/admin'); }, 2800);
  });
  const clearLogoTimer = () => { clearTimeout(logoTimer); };
  logoBadge?.addEventListener('pointerup', clearLogoTimer);
  logoBadge?.addEventListener('pointerleave', clearLogoTimer);

  // Background and Visibility Cleanup
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.phase !== 'start') {
      showNotice('화면이 전환되어 촬영을 안전하게 초기화했습니다.');
      resetKiosk();
    }
  });

  window.addEventListener('pagehide', () => {
    resetKiosk();
  });

  // Startup
  applyBranding();
  loadServerConfig();
})();
