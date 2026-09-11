/**
 * 마음 네컷 포토부스 | MAEUM FOUR CUTS
 * Core Kiosk Application Logic
 */
(() => {
  'use strict';

  // Automatic PWA Cache Buster: Purge stale caches when new version deployed
  const CURRENT_APP_VERSION = 'v4.5.0';
  try {
    const savedVer = localStorage.getItem('maeum_app_version');
    if (savedVer && savedVer !== CURRENT_APP_VERSION) {
      localStorage.setItem('maeum_app_version', CURRENT_APP_VERSION);
      if ('caches' in window) {
        caches.keys().then((names) => {
          names.forEach((name) => caches.delete(name));
        });
      }
    } else {
      localStorage.setItem('maeum_app_version', CURRENT_APP_VERSION);
    }
  } catch (e) {}

  // DOM Query Helpers
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const uid = () => Math.random().toString(36).slice(2, 10);

  // Web Audio Kiosk Beep Cue
  function playBeep(freq = 880, duration = 0.08) {
    try {
      if (typeof window === 'undefined') return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!window.__boothAudioCtx) window.__boothAudioCtx = new AudioCtx();
      const ctx = window.__boothAudioCtx;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {}
  }

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
    photoFilters: new Map(), // photoId -> FilterState { filterId, intensity, adjustments, customLUT }
    photoSketch: new Map(), // photoId -> SketchState { effectId, lineStrength, colorStrength, paperStrength, backgroundWashStrength, forceFullFrame, protectBlueStrength, lastDiagnostics }
    cameraFilterId: 'original',
    activeFilterSlotIndex: 0,
    filterApplyMode: 'all',
    activeFilterCategory: 'recommended',
    activePhotoId: null,
    activeStickerId: null,
    activeCategory: CFG.stickers?.categories?.[0]?.id || 'icheon_20th',
    currentThemeId: 'classic_light',
    currentFilterId: 'original',
    editorMode: 'strip',
    csrf: null,
    runId: 0,
    idleTimer: null,
    completionTimer: null,
    warningTimer: null,
    abortController: null,

    // FAST-LANE State Extensions
    selectionLocked: false,
    autoTransitionTimer: null,
    undoTimer: null,
    showCutGuides: true,
    masterCardCanvas: null,
    printSheetCanvas: null,
    printState: {
      status: 'idle', // 'idle' | 'rendering' | 'ready' | 'printing' | 'printed' | 'failed'
      sessionId: 0,
      lastPrintedAt: null
    }
  };

  const screens = ['start', 'permission', 'camera', 'select', 'filter', 'edit', 'composing', 'preview', 'result'];

  function isFastLaneMode() {
    return (CFG.eventMode?.mode || 'fast-lane') === 'fast-lane';
  }

  // Dynamic Workflow Steps (Section 3: Fast-Lane vs Standard Mode)
  function getWorkflowSteps() {
    if (isFastLaneMode()) {
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
  }

  function renderProgressRail() {
    const container = $('#progressStepsContainer');
    if (!container) return;
    container.replaceChildren();
    const steps = getWorkflowSteps();
    steps.forEach((st, idx) => {
      if (idx > 0) {
        const div = document.createElement('div');
        div.className = 'progress-connector rail-divider';
        container.append(div);
      }
      const stepEl = document.createElement('div');
      stepEl.className = 'progress-step rail-step';
      stepEl.dataset.step = st.id;
      stepEl.innerHTML = `
        <span class="progress-step-dot step-dot">${idx + 1}</span>
        <span class="progress-step-label step-label">${st.label}</span>
      `;
      container.append(stepEl);
    });
  }

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
        renderProgressRail();
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

  // Inactivity / Idle Timer Handler
  function resetInactivityTimer() {
    clearTimeout(state.idleTimer);
    if (state.phase === 'start') return;
    state.idleTimer = setTimeout(() => {
      if (state.phase !== 'start') {
        showNotice('오랫동안 입력이 없어 초기 화면으로 돌아갑니다.');
        resetKiosk();
      }
    }, 90000);
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

  // Live camera feed during shooting: Pure clean camera view with zero pre-filter
  function updateLiveCameraFilter() {
    const video = $('#video');
    if (!video) return;
    video.style.filter = 'none';
  }

  // Pre-shooting filter tray removed - effect selection is performed after shooting
  function renderCameraFilterTray() {
    const tray = $('#cameraFilterTray');
    if (tray) tray.replaceChildren();
  }

  // Camera Ready & Initialization Flow
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

    // Progressive constraint fallback list:
    // 1) High-res wide (ideal 1080p/4:3 native)
    // 2) Standard 720p front
    // 3) Front camera without resolution constraints
    // 4) Any available video device
    const constraintList = [
      {
        video: {
          facingMode: 'user',
          width: { ideal: 1920 },
          height: { ideal: 1440 }
        },
        audio: false
      },
      {
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      },
      {
        video: {
          facingMode: 'user'
        },
        audio: false
      },
      {
        video: true,
        audio: false
      }
    ];

    let stream = null;
    let lastError = null;

    for (const constraints of constraintList) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (stream) break;
      } catch (err) {
        lastError = err;
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          break; // User explicitly denied, no need to cycle further
        }
      }
    }

    if (!stream) {
      console.warn('Camera access denied or failed across all constraints:', lastError);
      const errBox = $('#cameraErrorBox');
      if (errBox) {
        errBox.removeAttribute('hidden');
        errBox.innerHTML = `
          <strong>카메라를 켤 수 없습니다 (${lastError?.name || '오류'})</strong><br>
          ${lastError?.name === 'NotAllowedError'
            ? '브라우저 주소창 좌측 카메라 권한을 허용한 뒤 다시 시도해 주세요.'
            : '카메라 장치 연결 및 브라우저 권한을 확인해 주세요.'}<br>
          <div style="margin-top:14px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
            <button type="button" class="btn-kiosk-primary" id="retryCameraBtn" style="padding:10px 20px;font-size:15px;border-radius:12px;">다시 시도</button>
            <button type="button" class="btn-kiosk-secondary" id="fallbackDemoBtn" style="padding:10px 20px;font-size:15px;border-radius:12px;">샘플 모드로 진행</button>
          </div>
        `;
        $('#retryCameraBtn')?.addEventListener('click', initializeCamera);
        $('#fallbackDemoBtn')?.addEventListener('click', () => {
          showNotice('샘플 사진 모드로 진행합니다.');
          generateDemoShots();
        });
      }
      return;
    }

    if (run !== state.runId) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    state.stream = stream;
    const video = $('#video');
    if (!video) {
      console.error('Video element not found');
      return;
    }

    // Explicit properties for iOS Safari & Chrome autoplay compatibility
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
    video.srcObject = stream;

    // Show camera stage immediately so element has active DOM layout
    show('camera');
    renderCameraFilterTray();
    updateLiveCameraFilter();

    try {
      await video.play();
    } catch (playErr) {
      console.warn('video.play() auto-playback notification:', playErr);
    }

    // Ensure dimensions ready without hanging indefinitely
    if (!video.videoWidth || video.videoWidth === 0) {
      await new Promise((resolve) => {
        if (video.videoWidth > 0) return resolve();
        const tm = setTimeout(resolve, 2500);
        const onReady = () => {
          clearTimeout(tm);
          video.removeEventListener('loadedmetadata', onReady);
          video.removeEventListener('canplay', onReady);
          video.removeEventListener('playing', onReady);
          resolve();
        };
        video.addEventListener('loadedmetadata', onReady);
        video.addEventListener('canplay', onReady);
        video.addEventListener('playing', onReady);
      });
    }

    startShootingSequence();
  }

  // High-Resolution Snapshot Capture: Matches EXACT viewfinder visible FOV (Zero Distortion, Zero Surprises)
  async function captureVideoBlob() {
    let canvas = $('#captureCanvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'captureCanvas';
      canvas.style.display = 'none';
      document.body.appendChild(canvas);
    }
    const ctx = canvas.getContext('2d', { alpha: false });
    const video = $('#video');

    const vw = (video && video.videoWidth > 0) ? video.videoWidth : 1200;
    const vh = (video && video.videoHeight > 0) ? video.videoHeight : 900;
    const dispW = (video && video.clientWidth > 0) ? video.clientWidth : 4;
    const dispH = (video && video.clientHeight > 0) ? video.clientHeight : 3;
    const displayAspect = (dispW && dispH) ? (dispW / dispH) : (vw / vh);

    const w = 1200;
    const h = Math.round(w / (displayAspect || (4 / 3)));
    canvas.width = w;
    canvas.height = h;

    const videoAspect = vw / vh;

    let sx, sy, sw, sh;
    if (videoAspect > displayAspect) {
      sh = vh;
      sw = vh * displayAspect;
      sx = (vw - sw) / 2;
      sy = 0;
    } else {
      sw = vw;
      sh = vw / displayAspect;
      sx = 0;
      sy = (vh - sh) / 2;
    }

    // Guard bounds against NaN or out of bounds
    sx = Math.max(0, Math.min(vw - 1, Math.round(sx)));
    sy = Math.max(0, Math.min(vh - 1, Math.round(sy)));
    sw = Math.max(1, Math.min(vw - sx, Math.round(sw)));
    sh = Math.max(1, Math.min(vh - sy, Math.round(sh)));

    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1); // Natural selfie mirror
    if (video && video.videoWidth > 0 && video.readyState >= 2) {
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
    } else {
      // Clean fallback frame if video feed is momentarily unready
      ctx.fillStyle = '#FFE3EC';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#211C29';
      ctx.font = 'bold 48px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('마음 네컷 사진', w / 2, h / 2);
    }
    ctx.restore();

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('사진 생성 실패'));
      }, 'image/jpeg', 0.95);
    });
  }

  function getDerivedSlotAspectRatio() {
    if (CFG.capture?.slotAspectRatioMode === 'explicit' && CFG.capture?.explicitSlotAspectRatio) {
      return Number(CFG.capture.explicitSlotAspectRatio);
    }
    if (typeof window.deriveSlotAspectRatio === 'function') {
      return window.deriveSlotAspectRatio(CFG.printLayout);
    }
    return 540 / 171.84;
  }

  function updateCameraCropGuide() {
    const cropBox = $('#cropSafeBox');
    if (!cropBox) return;
    const slotRatio = getDerivedSlotAspectRatio();
    cropBox.style.aspectRatio = String(slotRatio);
  }

  // Automated 6-Shot Shooting Sequence with Manual Shutter Support
  async function startShootingSequence() {
    const run = state.runId;
    releaseShots();
    state.selected = [];
    state.stickers.clear();
    state.skipCountdown = false;
    state.selectionLocked = false;
    updateCameraCropGuide();

    const isFast = isFastLaneMode();
    const eventTiming = CFG.eventMode?.timing || {};
    const totalShots = (isFast && CFG.eventMode?.workflow?.captureCount) || CFG.capture?.count || 6;
    const countdownSec = (isFast && eventTiming.countdownSeconds) || CFG.capture?.countdownSeconds || 3;
    const betweenMs = (isFast && eventTiming.betweenShotsMs) || CFG.capture?.betweenShotsMs || 700;

    const cdBox = $('#countdownBox');
    const cdEl = $('#countdown');
    const poseBanner = $('#poseNoticeBanner');
    const poseBadge = $('#poseBadgeTag');
    const poseText = $('#poseNoticeText');
    const poseSub = $('#poseNoticeSub');

    const showPoseBanner = (badge, title, sub) => {
      if (poseBadge) poseBadge.textContent = badge;
      if (poseText) poseText.textContent = title;
      if (poseSub) poseSub.textContent = sub;
      if (poseBanner) poseBanner.hidden = false;
      if (cdBox) cdBox.style.display = 'none';
    };

    const hidePoseBanner = () => {
      if (poseBanner) poseBanner.hidden = true;
    };

    // Ensure countdown box starts hidden
    if (cdBox) cdBox.style.display = 'none';

    try {
      // Gentle initial preparation cue for 1st shot
      showPoseBanner('PHOTO 1 / ' + totalShots, '촬영 준비! 카메라를 봐주세요 📸', `${countdownSec}초 카운트다운 후 첫 번째 사진이 촬영됩니다`);
      playBeep(660, 0.12);
      await sleep(1400);
      if (run !== state.runId) return;
      hidePoseBanner();

      for (let i = 0; i < totalShots; i++) {
        if (run !== state.runId) return;

        hidePoseBanner();

        // Update Progress UI
        const shotCountEl = $('#shotCount');
        if (shotCountEl) shotCountEl.textContent = String(i + 1);
        updateShotTrack(i, totalShots);

        // Countdown: 3, 2, 1
        state.skipCountdown = false;
        if (cdBox) cdBox.style.display = 'flex';
        for (let sec = countdownSec; sec >= 1; sec--) {
          if (run !== state.runId) return;
          if (state.skipCountdown) break;

          if (cdEl) {
            cdEl.textContent = String(sec);
            cdEl.classList.remove('pulse');
            void cdEl.offsetWidth;
            cdEl.classList.add('pulse');
          }
          if (sec <= 3) playBeep(880, 0.08);
          await sleep(1000);
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

        playBeep(1320, 0.18);
        if (cdEl) cdEl.textContent = '찰칵! 📸';

        const blob = await captureVideoBlob();
        state.shots.push({ id: uid(), blob, url: URL.createObjectURL(blob) });

        // Breathing interval for pose change before next shot (total betweenMs = 4000ms)
        if (i < totalShots - 1) {
          await sleep(900);
          if (run !== state.runId) return;

          const nextShotNum = i + 2;
          showPoseBanner(
            `NEXT: ${nextShotNum} / ${totalShots}`,
            '다음 포즈 준비! ✌️✨',
            '자유롭게 포즈와 표정을 바꿔보세요'
          );
          playBeep(700, 0.1);
          await sleep(Math.max(1500, betweenMs - 900));
        } else {
          await sleep(800);
        }
      }

      hidePoseBanner();
      stopCamera();
      renderPhotoSelectionGrid();
      show('select');
    } catch (e) {
      console.error('Shooting error detail:', e);
      if (run === state.runId) {
        showNotice(`촬영 중 문제가 발생하여 처음 화면으로 이동합니다: ${e?.message || '오류'}`);
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
          const canvas = $('#captureCanvas') || document.createElement('canvas');
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
    if (state.selectionLocked) return;

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

    // Fast-Lane Auto Transition Trigger
    if (state.selected.length === 4) {
      if (isFastLaneMode()) {
        handleFastLaneFourthSelection();
      }
    } else {
      clearTimeout(state.autoTransitionTimer);
      const autoBanner = $('#selectionAutoBanner');
      if (autoBanner) autoBanner.hidden = true;
    }
  }

  function handleFastLaneFourthSelection() {
    state.selectionLocked = true;
    const autoBanner = $('#selectionAutoBanner');
    if (autoBanner) autoBanner.hidden = false;

    clearTimeout(state.autoTransitionTimer);
    // Wait 350ms so user clearly perceives the 4th slot fill, then offer 1.2s undo window before auto-composing
    state.autoTransitionTimer = setTimeout(() => {
      if (autoBanner) autoBanner.hidden = true;
      executeCompletionWorkflow();
    }, 1200);
  }

  function undoSelection() {
    clearTimeout(state.autoTransitionTimer);
    state.selectionLocked = false;
    const autoBanner = $('#selectionAutoBanner');
    if (autoBanner) autoBanner.hidden = true;

    if (state.selected.length === 4) {
      state.selected.pop();
      updateSelectionCounter();
      updateSelectionBadges();
      updateDestinationMockup();
    }
  }

  function updateSelectionCounter() {
    const count = state.selected.length;
    const badge = $('#selectionCounterBadge');
    if (badge) badge.textContent = `${count} / 4 선택`;
    const completeBtn = $('#editBtn');
    if (completeBtn) {
      completeBtn.disabled = count !== 4;
      if (isFastLaneMode()) {
        completeBtn.textContent = count === 4 ? '✨ 바로 출력하기 ›' : '4장 선택 완료 ›';
      } else {
        completeBtn.textContent = '4장 선택 완료 (효과·필터 선택) ›';
      }
    }
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
  // FIRST-PARTY CUSTOM CAMERA-FILTER STAGE CONTROLLER (v4.5.0)
  // ===================================================================
  function getPhotoFilter(photoId) {
    if (!state.photoFilters.has(photoId)) {
      state.photoFilters.set(photoId, {
        filterId: 'original',
        intensity: 100,
        adjustments: {
          brightness: 0,
          contrast: 0,
          saturation: 0,
          temperature: 0,
          tint: 0
        },
        customLUT: null
      });
    }
    return state.photoFilters.get(photoId);
  }

  function setPhotoFilter(photoId, filterState) {
    state.photoFilters.set(photoId, filterState);
  }

  function isSketchFilter(filterId) {
    if (!filterId) return false;
    if (typeof filterId === 'string' && filterId.startsWith('group-')) return true;
    return Boolean(
      window.SketchDefinitions &&
      window.SketchDefinitions.SKETCH_PRESETS &&
      window.SketchDefinitions.SKETCH_PRESETS.some((p) => p.id === filterId)
    );
  }

  function getPhotoSketchState(photoId, presetId) {
    if (!state.photoSketch.has(photoId)) {
      const pid = (presetId && isSketchFilter(presetId)) ? presetId : 'group-color-sketch';
      const preset = window.SketchDefinitions ? window.SketchDefinitions.getSketchPreset(pid) : null;
      state.photoSketch.set(photoId, {
        effectId: pid,
        intensity: 1.0,
        lineStrength: preset ? preset.lineStrength : 0.85,
        colorStrength: preset ? preset.colorStrength : 0.80,
        paperStrength: preset ? preset.paperStrength : 0.45,
        backgroundWashStrength: preset ? preset.backgroundWashStrength : 0.25,
        forceFullFrame: false,
        protectBlueStrength: 0.85,
        lastDiagnostics: null
      });
    }
    const ss = state.photoSketch.get(photoId);
    if (presetId && isSketchFilter(presetId) && ss.effectId !== presetId) {
      ss.effectId = presetId;
      const preset = window.SketchDefinitions ? window.SketchDefinitions.getSketchPreset(presetId) : null;
      if (preset) {
        ss.lineStrength = preset.lineStrength;
        ss.colorStrength = preset.colorStrength;
        ss.paperStrength = preset.paperStrength;
        ss.backgroundWashStrength = preset.backgroundWashStrength;
      }
    }
    return ss;
  }

  function setPhotoSketchState(photoId, sketchState) {
    state.photoSketch.set(photoId, sketchState);
  }

  function initFilterStage() {
    state.filterApplyMode = 'all';
    state.activeFilterSlotIndex = 0;
    state.activeFilterCategory = 'recommended';

    // Prepopulate per-photo filter states
    state.selected.forEach((photoId) => {
      getPhotoFilter(photoId);
    });

    renderFilterPhotoTabs();
    renderFilterThemeSelector();
    renderFilterCategoryTabs();
    renderFilterCardsTray();
    updateFilterMockupTheme();
    selectActiveFilterSlot(0);
    renderAllFilterSlots();
  }

  function renderFilterPhotoTabs() {
    const bar = $('#filterPhotoTabBar');
    if (!bar) return;
    bar.querySelectorAll('.filter-photo-tab').forEach((tab) => {
      const target = tab.dataset.target;
      const isActive = (state.filterApplyMode === 'all' && target === 'all') ||
                       (state.filterApplyMode === 'single' && Number(target) === state.activeFilterSlotIndex);
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }

  function setFilterPhotoTarget(target) {
    const badge = $('#filterActiveSlotBadge');
    if (target === 'all') {
      state.filterApplyMode = 'all';
      if (badge) badge.textContent = '✨ 4장 전체 적용 모드';
      $$('#filterQuadSlots .filter-slot-card').forEach((s) => s.classList.add('active'));
    } else {
      state.filterApplyMode = 'single';
      const idx = Number(target);
      selectActiveFilterSlot(idx);
    }
    renderFilterPhotoTabs();
    renderFilterCardsTray();
  }

  function renderFilterThemeSelector() {
    const row = $('#filterThemeSelector');
    if (!row) return;
    row.replaceChildren();

    Object.entries(CFG.themes || {}).forEach(([key, theme]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `theme-chip ${key === state.currentThemeId ? 'selected' : ''}`;
      btn.style.background = theme.backgroundColor || '#FFFDF9';
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', key === state.currentThemeId ? 'true' : 'false');
      btn.setAttribute('title', theme.name || key);
      btn.setAttribute('aria-label', theme.name || key);

      btn.onclick = () => {
        state.currentThemeId = key;
        updateFilterMockupTheme();
        renderFilterThemeSelector();
        renderThemeSelector();
      };
      row.append(btn);
    });
  }

  function updateFilterMockupTheme() {
    const mockup = $('#filterMockupFrame');
    const theme = CFG.themes?.[state.currentThemeId] || CFG.themes?.classic_light || {};
    if (mockup) {
      mockup.style.background = theme.backgroundColor || '#FFFDF9';
      mockup.style.color = theme.textColor || '#211C29';
      const title = mockup.querySelector('.fm-title');
      if (title) title.style.color = theme.textColor || '#211C29';
      const subtitle = mockup.querySelector('.fm-subtitle');
      if (subtitle) subtitle.style.color = theme.accentColor || '#8E72D8';
      const footer = mockup.querySelector('.filter-mockup-footer span');
      if (footer) footer.style.color = theme.textColor || '#211C29';
    }
  }

  function renderFilterCategoryTabs() {
    const track = $('#filterCategoryTrack');
    if (!track) return;
    track.replaceChildren();

    const categories = [
      { id: 'recommended', label: '⭐ 추천' },
      { id: 'natural', label: '🌿 내추럴' },
      { id: 'bright', label: '✨ 화사' },
      { id: 'warm', label: '🌅 웜톤' },
      { id: 'cool', label: '❄️ 쿨톤' },
      { id: 'film', label: '🎞️ 필름' },
      { id: 'monochrome', label: '🖤 모노' },
      { id: 'sketch', label: '🎨 스케치' },
      { id: 'all', label: '전체' }
    ];

    categories.forEach((cat) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `filter-cat-pill ${state.activeFilterCategory === cat.id ? 'active' : ''}`;
      btn.dataset.category = cat.id;
      btn.textContent = cat.label;
      btn.addEventListener('click', () => {
        state.activeFilterCategory = cat.id;
        track.querySelectorAll('.filter-cat-pill').forEach((b) => {
          b.classList.toggle('active', b.dataset.category === cat.id);
        });
        renderFilterCardsTray();
      });
      track.append(btn);
    });
  }

  function renderFilterCardsTray() {
    const scroller = $('#filterCardsScroller');
    if (!scroller) return;
    scroller.replaceChildren();

    const activePhotoId = state.selected[state.activeFilterSlotIndex];
    const currentFilter = activePhotoId ? getPhotoFilter(activePhotoId) : null;
    const currentFilterId = currentFilter ? currentFilter.filterId : 'original';

    const cat = state.activeFilterCategory;
    let presets = [];
    if (cat === 'sketch') {
      presets = (window.SketchDefinitions && window.SketchDefinitions.SKETCH_PRESETS) || [];
    } else if (cat === 'all') {
      const allFilterPresets = (window.FilterDefinitions && window.FilterDefinitions.FILTER_PRESETS) || [];
      const sketchPresets = (window.SketchDefinitions && window.SketchDefinitions.SKETCH_PRESETS) || [];
      presets = [...allFilterPresets, ...sketchPresets];
    } else {
      const allFilterPresets = (window.FilterDefinitions && window.FilterDefinitions.FILTER_PRESETS) || [];
      presets = allFilterPresets.filter((p) => p.category === cat);
    }

    presets.forEach((preset) => {
      const isSketch = isSketchFilter(preset.id);
      const isSelected = preset.id === currentFilterId;
      const card = document.createElement('div');
      card.className = `filter-preset-card ${isSelected ? 'selected' : ''}`;
      card.dataset.filterId = preset.id;
      card.setAttribute('role', 'radio');
      card.setAttribute('aria-checked', isSelected ? 'true' : 'false');
      card.setAttribute('aria-pressed', isSelected ? 'true' : 'false');

      const thumb = document.createElement('div');
      thumb.className = 'preset-thumb-box';

      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = 82;
      thumbCanvas.height = 66;
      const tctx = thumbCanvas.getContext('2d');

      const activeShot = state.shots.find((s) => s.id === activePhotoId);
      if (activeShot && activeShot.url) {
        const img = new Image();
        img.onload = () => {
          drawCover(tctx, img, 0, 0, 82, 66);
          if (isSketch) {
            thumbCanvas.style.filter = 'contrast(1.25) saturate(0.85) sepia(0.25) brightness(1.02)';
          } else if (window.FilterDefinitions && window.FilterDefinitions.generateLiveCSSFilter) {
            thumbCanvas.style.filter = window.FilterDefinitions.generateLiveCSSFilter(preset, 1.0);
          }
        };
        img.src = activeShot.url;
      } else {
        tctx.fillStyle = isSketch ? '#E0F2FE' : '#C4B5FD';
        tctx.fillRect(0, 0, 82, 66);
      }
      thumb.append(thumbCanvas);

      const title = document.createElement('span');
      title.className = 'preset-card-title';
      title.textContent = preset.name;

      const check = document.createElement('div');
      check.className = 'preset-check-tag';
      check.textContent = '✓';

      card.append(thumb, title, check);

      card.addEventListener('click', () => {
        applyFilterToActiveSlot(preset.id);
      });

      scroller.append(card);
    });
  }

  function selectActiveFilterSlot(slotIndex) {
    state.activeFilterSlotIndex = slotIndex;
    const quadSlots = $$('#filterQuadSlots .filter-slot-card');
    quadSlots.forEach((slot, idx) => {
      slot.classList.toggle('active', state.filterApplyMode === 'all' || idx === slotIndex);
    });

    const badge = $('#filterActiveSlotBadge');
    if (badge) {
      badge.textContent = state.filterApplyMode === 'all' ? '✨ 4장 전체 적용 모드' : `${slotIndex + 1}번 사진 선택됨`;
    }
    renderFilterPhotoTabs();

    const photoId = state.selected[slotIndex];
    if (!photoId) return;
    const fs = getPhotoFilter(photoId);
    const isSketch = isSketchFilter(fs.filterId);

    // Sync filter cards scroller
    $('#filterCardsScroller')?.querySelectorAll('.filter-preset-card').forEach((c) => {
      const match = c.dataset.filterId === fs.filterId;
      c.classList.toggle('selected', match);
      c.setAttribute('aria-checked', match ? 'true' : 'false');
      c.setAttribute('aria-pressed', match ? 'true' : 'false');
    });

    // Toggle Sketch Controls Card vs Regular Filter Controls
    const sketchControlsCard = $('#sketchControlsCard');
    const manualAccordion = $('#filterManualAccordion');

    if (isSketch) {
      if (sketchControlsCard) sketchControlsCard.removeAttribute('hidden');
      if (manualAccordion) manualAccordion.setAttribute('hidden', '');

      const ss = getPhotoSketchState(photoId, fs.filterId);
      const lineSlider = $('#sketchLineSlider');
      const lineBadge = $('#sketchLineBadge');
      const colorSlider = $('#sketchColorSlider');
      const colorBadge = $('#sketchColorBadge');
      const paperSlider = $('#sketchPaperSlider');
      const paperBadge = $('#sketchPaperBadge');
      const washSlider = $('#sketchWashSlider');
      const washBadge = $('#sketchWashBadge');

      if (lineSlider) lineSlider.value = Math.round(ss.lineStrength * 100);
      if (lineBadge) lineBadge.textContent = `${Math.round(ss.lineStrength * 100)}%`;
      if (colorSlider) colorSlider.value = Math.round(ss.colorStrength * 100);
      if (colorBadge) colorBadge.textContent = `${Math.round(ss.colorStrength * 100)}%`;
      if (paperSlider) paperSlider.value = Math.round(ss.paperStrength * 100);
      if (paperBadge) paperBadge.textContent = `${Math.round(ss.paperStrength * 100)}%`;
      if (washSlider) washSlider.value = Math.round(ss.backgroundWashStrength * 100);
      if (washBadge) washBadge.textContent = `${Math.round(ss.backgroundWashStrength * 100)}%`;

      if (ss.lastDiagnostics) {
        updateOperatorQualityPanelUI(ss.lastDiagnostics);
      }
    } else {
      if (sketchControlsCard) sketchControlsCard.setAttribute('hidden', '');
      if (manualAccordion) manualAccordion.removeAttribute('hidden');

      // Sync intensity slider & quick preset buttons
      const intensitySlider = $('#filterIntensitySlider');
      const intensityBadge = $('#filterIntensityBadge');
      if (intensitySlider) intensitySlider.value = fs.intensity;
      if (intensityBadge) intensityBadge.textContent = `${fs.intensity}%`;
      $$('.btn-intensity-preset').forEach((btn) => {
        btn.classList.toggle('active', Number(btn.dataset.intensity) === fs.intensity);
      });

      // Sync manual adjustment sliders
      const adj = fs.adjustments || {};
      const setManualInput = (id, val, mult = 100) => {
        const inp = $('#inputManual' + id);
        const lbl = $('#lblManual' + id);
        const roundVal = Math.round((val || 0) * mult);
        if (inp) inp.value = roundVal;
        if (lbl) lbl.textContent = roundVal > 0 ? `+${roundVal}` : String(roundVal);
      };
      setManualInput('Brightness', adj.brightness);
      setManualInput('Contrast', adj.contrast);
      setManualInput('Saturation', adj.saturation);
      setManualInput('Temperature', adj.temperature);
      setManualInput('Tint', adj.tint);
    }
  }

  async function renderFilterSlot(slotIndex) {
    const photoId = state.selected[slotIndex];
    if (!photoId) return;

    const canvas = $('#filterCanvas' + slotIndex);
    if (!canvas) return;

    const shot = state.shots.find((s) => s.id === photoId);
    if (!shot) return;

    const fs = getPhotoFilter(photoId);
    const isSketch = isSketchFilter(fs.filterId);
    const nameTag = $('#filterSlotName' + slotIndex);

    try {
      const img = await loadHtmlImage(shot.url);
      canvas.width = 360;
      canvas.height = 270;

      if (isSketch && window.SketchClient) {
        const ss = getPhotoSketchState(photoId, fs.filterId);
        const sketchPreset = window.SketchDefinitions ? window.SketchDefinitions.getSketchPreset(fs.filterId) : null;
        if (nameTag && sketchPreset) {
          nameTag.textContent = `${sketchPreset.name} (${Math.round(ss.lineStrength * 100)}%)`;
        }

        const t0 = performance.now();
        const res = await window.SketchClient.renderPreviewToCanvas(
          canvas,
          img,
          photoId,
          ss,
          {
            backdropRgb: window.SketchDefinitions ? window.SketchDefinitions.DEFAULT_BACKDROP_RGB : [143, 207, 227],
            protectBlueStrength: ss.protectBlueStrength || 0.85,
            forceFullFrame: ss.forceFullFrame || false
          }
        );
        const elapsed = Math.round(performance.now() - t0);

        if (res && res.confidenceInfo) {
          ss.lastDiagnostics = {
            status: res.confidenceInfo.status || 'good',
            variance: Math.round(res.confidenceInfo.variance || 0),
            coverage: Math.round((res.confidenceInfo.coverage || 0) * 100),
            fallbackLevel: res.confidenceInfo.fallbackLevel || 1,
            fallbackMode: res.confidenceInfo.fallbackMode || 'Level 1 (종이 일러스트)',
            processingTimeMs: elapsed,
            memoryEstimate: '< 48MB'
          };
          if (slotIndex === state.activeFilterSlotIndex) {
            updateOperatorQualityPanelUI(ss.lastDiagnostics);
          }
        }
      } else if (window.filterClient) {
        const preset = window.FilterDefinitions ? window.FilterDefinitions.getFilterPreset(fs.filterId) : null;
        if (nameTag && preset) {
          nameTag.textContent = `${preset.name} (${fs.intensity}%)`;
        }
        await window.filterClient.renderPreviewToCanvas(
          canvas,
          img,
          photoId,
          preset,
          fs.intensity / 100,
          fs.adjustments
        );
      } else {
        const ctx = canvas.getContext('2d');
        drawCover(ctx, img, 0, 0, canvas.width, canvas.height);
      }
    } catch (err) {
      console.warn(`Error rendering filter preview for slot ${slotIndex}:`, err);
    }
  }

  async function renderAllFilterSlots() {
    for (let i = 0; i < state.selected.length; i++) {
      await renderFilterSlot(i);
    }
  }

  function applyFilterToActiveSlot(filterId) {
    if (state.filterApplyMode === 'all') {
      state.selected.forEach((photoId) => {
        const fs = getPhotoFilter(photoId);
        fs.filterId = filterId;
        setPhotoFilter(photoId, fs);
        if (isSketchFilter(filterId)) {
          getPhotoSketchState(photoId, filterId);
        }
      });
      renderAllFilterSlots();
    } else {
      const photoId = state.selected[state.activeFilterSlotIndex];
      if (!photoId) return;

      const fs = getPhotoFilter(photoId);
      fs.filterId = filterId;
      setPhotoFilter(photoId, fs);

      if (isSketchFilter(filterId)) {
        getPhotoSketchState(photoId, filterId);
      }
      renderFilterSlot(state.activeFilterSlotIndex);
    }

    // Update UI
    $('#filterCardsScroller')?.querySelectorAll('.filter-preset-card').forEach((c) => {
      const match = c.dataset.filterId === filterId;
      c.classList.toggle('selected', match);
      c.setAttribute('aria-checked', match ? 'true' : 'false');
      c.setAttribute('aria-pressed', match ? 'true' : 'false');
    });

    selectActiveFilterSlot(state.activeFilterSlotIndex);
  }

  let intensityDebounceTimer = null;
  function updateActiveSlotIntensity(val) {
    const photoId = state.selected[state.activeFilterSlotIndex];
    if (!photoId) return;

    const fs = getPhotoFilter(photoId);
    fs.intensity = Math.max(0, Math.min(100, Number(val)));
    setPhotoFilter(photoId, fs);

    const badge = $('#filterIntensityBadge');
    if (badge) badge.textContent = `${fs.intensity}%`;

    $$('.btn-intensity-preset').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.intensity) === fs.intensity);
    });

    clearTimeout(intensityDebounceTimer);
    intensityDebounceTimer = setTimeout(() => {
      renderFilterSlot(state.activeFilterSlotIndex);
    }, 40);
  }

  let manualDebounceTimer = null;
  function updateActiveSlotManual(param, rawVal, mult = 100) {
    const photoId = state.selected[state.activeFilterSlotIndex];
    if (!photoId) return;

    const fs = getPhotoFilter(photoId);
    if (!fs.adjustments) fs.adjustments = {};
    fs.adjustments[param] = Number(rawVal) / mult;
    setPhotoFilter(photoId, fs);

    clearTimeout(manualDebounceTimer);
    manualDebounceTimer = setTimeout(() => {
      renderFilterSlot(state.activeFilterSlotIndex);
    }, 50);
  }

  let sketchDebounceTimer = null;
  function updateActiveSketchParam(param, rawVal) {
    const photoId = state.selected[state.activeFilterSlotIndex];
    if (!photoId) return;

    const ss = getPhotoSketchState(photoId);
    const numVal = Math.max(0, Math.min(100, Number(rawVal)));
    if (param === 'lineStrength') {
      ss.lineStrength = numVal / 100;
      const b = $('#sketchLineBadge');
      if (b) b.textContent = `${numVal}%`;
    } else if (param === 'colorStrength') {
      ss.colorStrength = numVal / 100;
      const b = $('#sketchColorBadge');
      if (b) b.textContent = `${numVal}%`;
    } else if (param === 'paperStrength') {
      ss.paperStrength = numVal / 100;
      const b = $('#sketchPaperBadge');
      if (b) b.textContent = `${numVal}%`;
    } else if (param === 'backgroundWashStrength') {
      ss.backgroundWashStrength = numVal / 100;
      const b = $('#sketchWashBadge');
      if (b) b.textContent = `${numVal}%`;
    }

    clearTimeout(sketchDebounceTimer);
    sketchDebounceTimer = setTimeout(() => {
      renderFilterSlot(state.activeFilterSlotIndex);
    }, 45);
  }

  function applyActiveFilterToAll() {
    const activePhotoId = state.selected[state.activeFilterSlotIndex];
    if (!activePhotoId) return;

    const sourceFs = getPhotoFilter(activePhotoId);
    const isSketch = isSketchFilter(sourceFs.filterId);
    const sourceSs = isSketch ? getPhotoSketchState(activePhotoId) : null;

    state.selected.forEach((pid) => {
      setPhotoFilter(pid, {
        filterId: sourceFs.filterId,
        intensity: sourceFs.intensity,
        adjustments: Object.assign({}, sourceFs.adjustments),
        customLUT: sourceFs.customLUT
      });
      if (isSketch && sourceSs) {
        setPhotoSketchState(pid, Object.assign({}, sourceSs));
      }
    });

    renderAllFilterSlots();
  }

  function resetActiveFilter() {
    const photoId = state.selected[state.activeFilterSlotIndex];
    if (!photoId) return;

    setPhotoFilter(photoId, {
      filterId: 'original',
      intensity: 100,
      adjustments: { brightness: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0 },
      customLUT: null
    });
    state.photoSketch.delete(photoId);

    selectActiveFilterSlot(state.activeFilterSlotIndex);
    renderFilterSlot(state.activeFilterSlotIndex);
  }

  function resetAllFilters() {
    state.selected.forEach((photoId) => {
      setPhotoFilter(photoId, {
        filterId: 'original',
        intensity: 100,
        adjustments: { brightness: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0 },
        customLUT: null
      });
      state.photoSketch.delete(photoId);
    });

    selectActiveFilterSlot(state.activeFilterSlotIndex);
    renderAllFilterSlots();
  }

  function updateOperatorQualityPanelUI(diag) {
    if (!diag) return;
    const statusEl = $('#lblBackdropStatus');
    const varEl = $('#lblBackdropVariance');
    const covEl = $('#lblForegroundCoverage');
    const fbEl = $('#lblFallbackLevel');
    const timeEl = $('#lblProcessingTime');
    const memEl = $('#lblMemoryEstimate');

    if (statusEl) {
      statusEl.textContent = diag.status === 'good' ? '정상 (good)' : (diag.status === 'uneven' ? '불균일 (uneven)' : '신뢰불가 (unreliable)');
      statusEl.className = `badge-status-pill status-${diag.status}`;
    }
    if (varEl) varEl.textContent = String(diag.variance);
    if (covEl) covEl.textContent = `${diag.coverage}%`;
    if (fbEl) fbEl.textContent = diag.fallbackMode || `Level ${diag.fallbackLevel}`;
    if (timeEl) timeEl.textContent = `${diag.processingTimeMs} ms`;
    if (memEl) memEl.textContent = diag.memoryEstimate || '정상 (< 48MB)';
  }

  function openSketchQualityModal() {
    const modal = $('#sketchQualityModal');
    if (!modal) return;
    const activePhotoId = state.selected[state.activeFilterSlotIndex];
    if (activePhotoId) {
      const ss = getPhotoSketchState(activePhotoId);
      if (ss.lastDiagnostics) {
        updateOperatorQualityPanelUI(ss.lastDiagnostics);
      }
    }
    modal.removeAttribute('hidden');
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeSketchQualityModal() {
    const modal = $('#sketchQualityModal');
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('hidden', '');
    modal.setAttribute('aria-hidden', 'true');
  }

  function openCompareModal() {
    const modal = $('#sketchCompareModal');
    if (!modal) return;
    const activePhotoId = state.selected[state.activeFilterSlotIndex];
    if (!activePhotoId) return;

    const shot = state.shots.find((s) => s.id === activePhotoId);
    if (!shot) return;

    const origImg = $('#compareOriginalImg');
    const sketchCanvas = $('#compareSketchCanvas');
    const activeSlotCanvas = $('#filterCanvas' + state.activeFilterSlotIndex);

    if (origImg) origImg.src = shot.url;
    if (sketchCanvas && activeSlotCanvas) {
      sketchCanvas.width = activeSlotCanvas.width;
      sketchCanvas.height = activeSlotCanvas.height;
      const sctx = sketchCanvas.getContext('2d');
      sctx.drawImage(activeSlotCanvas, 0, 0);
    }

    const slider = $('#compareSliderControl');
    if (slider) {
      slider.value = 50;
      updateCompareSplit(50);
    }

    modal.removeAttribute('hidden');
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
  }

  function updateCompareSplit(val) {
    const clipWrap = $('#compareClipWrap');
    const divider = $('#compareDividerLine');
    if (clipWrap) clipWrap.style.width = `${val}%`;
    if (divider) divider.style.left = `${val}%`;
  }

  function closeCompareModal() {
    const modal = $('#sketchCompareModal');
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('hidden', '');
    modal.setAttribute('aria-hidden', 'true');
  }

  // ===================================================================
  // DECORATION & STICKER EDITOR CONTROLLER
  // ===================================================================
  function ensureStickerList(photoId) {
    if (!state.stickers.has(photoId)) state.stickers.set(photoId, []);
    return state.stickers.get(photoId);
  }

  function renderDecorationEditor() {
    state.editorMode = 'strip'; // Default to full-frame 4-cut live preview
    if (!state.activePhotoId || !state.selected.includes(state.activePhotoId)) {
      state.activePhotoId = state.selected[0];
    }
    state.activeStickerId = null;

    renderEditorWorkspace();
    renderThemeSelector();
    renderStickerCategories();
    renderStickerItems();
  }

  function renderEditorWorkspace() {
    renderPhotoNavRail();
    updateEditorModeUI();
    if (state.editorMode === 'zoomed') {
      renderZoomedPhotoCard();
    } else {
      renderStripPreview();
    }
  }

  function updateEditorModeUI() {
    const isZoomed = state.editorMode === 'zoomed';
    const zoomedContainer = $('#zoomedEditorContainer');
    const stripContainer = $('#stripPreview');
    const label = $('#editorModeLabel');
    const icon = $('#editorModeIcon');

    if (zoomedContainer) zoomedContainer.style.display = isZoomed ? 'flex' : 'none';
    if (stripContainer) stripContainer.style.display = isZoomed ? 'none' : 'flex';

    if (label) label.textContent = isZoomed ? '🖼️ 전체 네컷 보기' : '🔍 1장 크게 꾸미기';
    if (icon) icon.textContent = isZoomed ? '🖼️' : '🔍';
  }

  function toggleEditorMode() {
    state.editorMode = state.editorMode === 'zoomed' ? 'strip' : 'zoomed';
    updateEditorModeUI();
    renderPhotoNavRail();
    if (state.editorMode === 'zoomed') {
      renderZoomedPhotoCard();
    } else {
      renderStripPreview();
    }
  }

  function renderPhotoNavRail() {
    const rail = $('#photoNavRail');
    if (!rail) return;
    rail.replaceChildren();

    // 0. Full Frame Preview Tab
    const fullFrameBtn = document.createElement('button');
    fullFrameBtn.type = 'button';
    const isFullActive = state.editorMode === 'strip';
    fullFrameBtn.className = `photo-tab-chip ${isFullActive ? 'active' : ''}`;
    fullFrameBtn.setAttribute('role', 'tab');
    fullFrameBtn.setAttribute('aria-selected', isFullActive ? 'true' : 'false');
    fullFrameBtn.setAttribute('aria-label', '전체 네컷 프레임 미리보기');
    fullFrameBtn.innerHTML = `<span>🖼️ 전체 프레임 보기</span>`;
    fullFrameBtn.addEventListener('click', () => {
      state.editorMode = 'strip';
      updateEditorModeUI();
      renderStripPreview();
      renderPhotoNavRail();
    });
    rail.append(fullFrameBtn);

    // 1..4 Individual Photo Zoom Tabs
    state.selected.forEach((photoId, idx) => {
      const isActive = state.editorMode === 'zoomed' && photoId === state.activePhotoId;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `photo-tab-chip ${isActive ? 'active' : ''}`;
      chip.setAttribute('role', 'tab');
      chip.setAttribute('aria-selected', isActive ? 'true' : 'false');
      chip.setAttribute('aria-label', `${idx + 1}번 사진 크게 편집하기`);

      const count = (ensureStickerList(photoId) || []).length;
      chip.innerHTML = `
        <span>${idx + 1}번 사진</span>
        ${count > 0 ? `<span class="tab-sticker-badge">${count}</span>` : ''}
      `;

      chip.addEventListener('click', () => {
        state.editorMode = 'zoomed';
        selectActivePhoto(photoId);
      });
      rail.append(chip);
    });

    const counter = $('#zoomedPhotoCounter');
    if (counter) {
      const currIdx = state.selected.indexOf(state.activePhotoId);
      counter.textContent = `${currIdx >= 0 ? currIdx + 1 : 1} / ${state.selected.length}`;
    }
  }

  async function renderZoomedPhotoCard() {
    const card = $('#zoomedPhotoCard');
    const canvas = $('#zoomedCanvas');
    if (!card || !canvas) return;

    const photoId = state.activePhotoId;
    if (!photoId) return;

    // Outer background reflects frame theme
    const theme = CFG.themes?.[state.currentThemeId] || CFG.themes?.classic_light || {};
    const zoomedContainer = $('#zoomedEditorContainer');
    if (zoomedContainer) {
      zoomedContainer.style.background = theme.backgroundColor || '#FFFDF9';
      zoomedContainer.style.padding = '12px';
      zoomedContainer.style.borderRadius = '18px';
      zoomedContainer.style.border = '1px solid var(--color-border)';
    }

    card.dataset.photoId = photoId;
    const shot = state.shots.find((s) => s.id === photoId);
    if (!shot) return;

    const tag = $('#zoomedPhotoTag');
    const idx = state.selected.indexOf(photoId);
    if (tag) tag.textContent = `${idx + 1}번 사진 (크게 꾸미는 중 ✨)`;

    // Crisp 4:3 high-res canvas (640x480)
    canvas.width = 640;
    canvas.height = 480;

    const fs = getPhotoFilter(photoId);
    const isSketch = isSketchFilter(fs.filterId);

    try {
      const imgEl = await loadHtmlImage(shot.url);
      const ctx = canvas.getContext('2d');
      drawCover(ctx, imgEl, 0, 0, canvas.width, canvas.height);

      if (isSketch && window.SketchClient) {
        const ss = getPhotoSketchState(photoId, fs.filterId);
        await window.SketchClient.renderPreviewToCanvas(canvas, imgEl, photoId, ss, {
          backdropRgb: window.SketchDefinitions ? window.SketchDefinitions.DEFAULT_BACKDROP_RGB : [143, 207, 227],
          protectBlueStrength: ss.protectBlueStrength || 0.85,
          forceFullFrame: ss.forceFullFrame || false
        });
      } else if (window.filterClient) {
        const preset = window.FilterDefinitions ? window.FilterDefinitions.getFilterPreset(fs.filterId) : null;
        await window.filterClient.renderPreviewToCanvas(canvas, imgEl, photoId, preset, fs.intensity / 100, fs.adjustments);
      }
    } catch (e) {
      console.warn('Zoomed canvas render error:', e);
    }

    renderPhotoStickers(photoId);
    renderZoomedMiniStrip();
    updateActivePhotoBanner();
  }

  function renderZoomedMiniStrip() {
    const strip = $('#zoomedMiniStrip');
    if (!strip) return;
    strip.replaceChildren();

    const theme = CFG.themes?.[state.currentThemeId] || CFG.themes?.classic_light || {};
    strip.style.background = theme.backgroundColor || '#FFFDF9';
    strip.style.padding = '8px';
    strip.style.borderRadius = '14px';

    state.selected.forEach((photoId, idx) => {
      const isCurrent = photoId === state.activePhotoId;
      const card = document.createElement('div');
      card.className = `zoomed-mini-card ${isCurrent ? 'active' : ''}`;
      card.setAttribute('role', 'tab');
      card.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
      card.setAttribute('title', `${idx + 1}번 사진 편집`);

      const miniCanvas = document.createElement('canvas');
      miniCanvas.width = 160;
      miniCanvas.height = 120;
      const shot = state.shots.find((s) => s.id === photoId);
      if (shot) {
        loadHtmlImage(shot.url).then((imgEl) => {
          const ctx = miniCanvas.getContext('2d');
          drawCover(ctx, imgEl, 0, 0, 160, 120);
        }).catch(() => {});
      }
      card.append(miniCanvas);

      const badge = document.createElement('div');
      badge.className = 'zoomed-mini-card-badge';
      badge.textContent = String(idx + 1);
      card.append(badge);

      const count = (ensureStickerList(photoId) || []).length;
      if (count > 0) {
        const sBadge = document.createElement('div');
        sBadge.className = 'tab-sticker-badge';
        sBadge.style.position = 'absolute';
        sBadge.style.bottom = '4px';
        sBadge.style.right = '4px';
        sBadge.textContent = String(count);
        card.append(sBadge);
      }

      card.addEventListener('click', () => {
        selectActivePhoto(photoId);
      });

      strip.append(card);
    });
  }

  function navigatePhoto(direction) {
    const currIdx = state.selected.indexOf(state.activePhotoId);
    if (currIdx < 0) return;
    const nextIdx = (currIdx + direction + state.selected.length) % state.selected.length;
    selectActivePhoto(state.selected[nextIdx]);
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
          preview.style.color = theme.textColor || '#211C29';
          const title = preview.querySelector('.fm-title');
          if (title) title.style.color = theme.textColor || '#211C29';
          const footer = preview.querySelector('.strip-mockup-footer');
          if (footer) footer.style.color = theme.textColor || '#211C29';
        }
        const zoomedContainer = $('#zoomedEditorContainer');
        if (zoomedContainer) {
          zoomedContainer.style.background = theme.backgroundColor || '#FFFDF9';
        }
        updateFilterMockupTheme();
        renderThemeSelector();
        renderFilterThemeSelector();
        renderZoomedMiniStrip();
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
    preview.style.color = theme.textColor || '#211C29';

    // 1. Frame Header with Neouri Stickers
    const header = document.createElement('div');
    header.className = 'strip-mockup-header strip-fixed-neouri-header';
    header.innerHTML = `
      <img src="/stickers/icheon_20th_01.png" alt="neouri left" />
      <div style="display:flex;flex-direction:column;align-items:center;">
        <span class="fm-title" style="color: ${theme.textColor || '#211C29'}; font-size: 13px; font-weight: 800;">${CFG.branding?.title || '이천시정신건강복지센터 20주년'}</span>
        <span class="fm-subtitle" style="color: ${theme.accentColor || '#8E72D8'}; font-size: 11px; font-weight: 700;">MAEUM FOUR CUTS</span>
      </div>
      <img src="/stickers/icheon_20th_11.png" alt="neouri right" />
    `;
    preview.append(header);

    // 2. Photo Grid (2x2)
    const grid = document.createElement('div');
    grid.className = 'strip-grid-2x2';

    state.selected.forEach((photoId, index) => {
      const cell = document.createElement('div');
      const isActive = photoId === state.activePhotoId;
      cell.className = `strip-slot preview-cell ${isActive ? 'active active-photo' : ''}`;
      cell.dataset.photoId = photoId;
      cell.setAttribute('title', `${index + 1}번 사진 터치하여 스티커 꾸미기`);

      const slotCanvas = document.createElement('canvas');
      slotCanvas.className = 'slot-photo';
      slotCanvas.width = 480;
      slotCanvas.height = 360;
      cell.append(slotCanvas);

      // Slot number badge
      const badge = document.createElement('div');
      badge.className = 'strip-slot-badge';
      badge.textContent = String(index + 1);
      cell.append(badge);

      if (isActive) {
        const pill = document.createElement('div');
        pill.className = 'active-slot-pill';
        pill.textContent = '꾸미는 중 ✨';
        cell.append(pill);
      }

      // Quick Zoom Button on each slot
      const zoomBtn = document.createElement('button');
      zoomBtn.type = 'button';
      zoomBtn.className = 'btn-slot-zoom';
      zoomBtn.textContent = '🔍 크게';
      zoomBtn.setAttribute('title', `${index + 1}번 사진 크게 확대하여 꾸미기`);
      zoomBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectActivePhoto(photoId);
        state.editorMode = 'zoomed';
        updateEditorModeUI();
        renderZoomedPhotoCard();
        renderPhotoNavRail();
      });
      cell.append(zoomBtn);

      const shot = state.shots.find((s) => s.id === photoId);
      if (shot) {
        const fs = getPhotoFilter(photoId);
        const isSketch = isSketchFilter(fs.filterId);
        loadHtmlImage(shot.url).then((imgEl) => {
          const sctx = slotCanvas.getContext('2d');
          drawCover(sctx, imgEl, 0, 0, slotCanvas.width, slotCanvas.height);
          if (isSketch && window.SketchClient) {
            const ss = getPhotoSketchState(photoId, fs.filterId);
            window.SketchClient.renderPreviewToCanvas(slotCanvas, imgEl, photoId, ss, {
              backdropRgb: window.SketchDefinitions ? window.SketchDefinitions.DEFAULT_BACKDROP_RGB : [143, 207, 227],
              protectBlueStrength: ss.protectBlueStrength || 0.85,
              forceFullFrame: ss.forceFullFrame || false
            });
          } else if (window.filterClient) {
            const preset = window.FilterDefinitions ? window.FilterDefinitions.getFilterPreset(fs.filterId) : null;
            window.filterClient.renderPreviewToCanvas(slotCanvas, imgEl, photoId, preset, fs.intensity / 100, fs.adjustments);
          }
        }).catch((err) => {
          console.warn('Strip slot canvas render error:', err);
        });
      }

      // Tap slot: Select active photo and STAY in full frame!
      cell.addEventListener('pointerdown', (e) => {
        if (e.target === cell || e.target === slotCanvas) {
          selectActivePhoto(photoId);
        }
      });
      grid.append(cell);
    });

    preview.append(grid);

    // 3. Frame Footer with Neouri Stickers
    const footer = document.createElement('div');
    footer.className = 'strip-mockup-footer';
    footer.style.color = theme.textColor || '#211C29';
    footer.innerHTML = `
      <img src="/stickers/icheon_20th_04.png" class="strip-fixed-neouri-footer-img" alt="footer sticker" />
      <span>당신의 오늘을 늘 응원합니다 ✨</span>
      <img src="/stickers/icheon_20th_05.png" class="strip-fixed-neouri-footer-img" alt="footer sticker" />
    `;
    preview.append(footer);

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
    renderPhotoNavRail();
    if (state.editorMode === 'zoomed') {
      renderZoomedPhotoCard();
    } else {
      $$('.preview-cell').forEach((c) => {
        const isActive = c.dataset.photoId === photoId;
        c.classList.toggle('active', isActive);
        c.classList.toggle('active-photo', isActive);
        const pill = c.querySelector('.active-slot-pill');
        if (isActive && !pill) {
          const newPill = document.createElement('div');
          newPill.className = 'active-slot-pill';
          newPill.textContent = '꾸미는 중 ✨';
          c.append(newPill);
        } else if (!isActive && pill) {
          pill.remove();
        }
      });
    }
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
    renderPhotoNavRail();
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
    const cells = $$(`.preview-cell[data-photo-id="${photoId}"]`);
    if (!cells.length) return;

    cells.forEach((cell) => {
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
    });
  }

  function applyStickerTransform(node, model) {
    const cell = node.parentElement;
    const baseW = cell ? (cell.clientWidth || 320) : 320;
    const baseH = cell ? (cell.clientHeight || 240) : 240;
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
      renderPhotoNavRail();
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
    const imgW = img.naturalWidth || img.videoWidth || img.width || w;
    const imgH = img.naturalHeight || img.videoHeight || img.height || h;
    const ratio = Math.max(w / imgW, h / imgH);
    const sw = w / ratio;
    const sh = h / ratio;
    ctx.drawImage(img, (imgW - sw) / 2, (imgH - sh) / 2, sw, sh, x, y, w, h);
  }

  // ===================================================================
  // FAST-LANE MASTER CARD & PRINT SHEET ENGINE (SECTIONS 8, 9, 10, 11, 14, 15, 21)
  // ===================================================================
  async function composeMasterCardCanvas() {
    // Master Card: 576 x 864 base dimensions (2:3 aspect ratio), 2x scale (1152 x 1728) for print precision
    const scale = 2;
    const cardW = 576 * scale;
    const cardH = 864 * scale;

    const canvas = document.createElement('canvas');
    canvas.width = cardW;
    canvas.height = cardH;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const framePreset = CFG.frames?.presets?.find((f) => f.id === 'event-black') || {
      colors: {
        background: '#0B0B0D',
        photoBorder: '#2A2A2F',
        primaryText: '#FFFFFF',
        secondaryText: '#CFCFD4',
        accent: '#FF4F87'
      },
      header: { text: '오늘의 마음 네컷', heightRatio: 0.060 },
      footer: { text: '당신의 오늘을 응원합니다', heightRatio: 0.075 },
      photo: { cornerRadiusRatio: 0.012, borderWidthRatio: 0.003, gapRatio: 0.010 }
    };

    // 1. Fill Event-Black Background
    ctx.fillStyle = framePreset.colors?.background || '#0B0B0D';
    ctx.fillRect(0, 0, cardW, cardH);

    const innerPadding = 18 * scale;
    const photoGap = 8 * scale;
    const headerHeight = cardH * (framePreset.header?.heightRatio || 0.060);
    const footerHeight = cardH * (framePreset.footer?.heightRatio || 0.075);
    const photoCount = 4;

    const photoContentH = cardH - headerHeight - footerHeight - (innerPadding * 2) - ((photoCount - 1) * photoGap);
    const slotH = photoContentH / photoCount;
    const slotW = cardW - (innerPadding * 2);
    const cornerRadius = cardH * (framePreset.photo?.cornerRadiusRatio || 0.012);
    const borderWidth = Math.max(1, cardH * (framePreset.photo?.borderWidthRatio || 0.003));

    // 2. Render 4 Vertically Stacked Photos
    const startY = innerPadding + headerHeight;
    for (let i = 0; i < 4; i++) {
      const photoId = state.selected[i];
      const s = state.shots.find((x) => x.id === photoId);
      if (!s) continue;
      const img = await loadHtmlImage(s.url);

      const px = innerPadding;
      const py = startY + i * (slotH + photoGap);

      // Rounded photo slot clipping
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(px, py, slotW, slotH, cornerRadius);
      ctx.clip();
      drawCover(ctx, img, px, py, slotW, slotH);
      ctx.restore();

      // Subtle dark gray / warm white border
      ctx.save();
      ctx.strokeStyle = framePreset.colors?.photoBorder || '#2A2A2F';
      ctx.lineWidth = borderWidth;
      ctx.beginPath();
      ctx.roundRect(px, py, slotW, slotH, cornerRadius);
      ctx.stroke();
      ctx.restore();
    }

    // 3. Header Branding Text
    ctx.fillStyle = framePreset.colors?.primaryText || '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.round(23 * scale)}px "Pretendard Variable", Pretendard, -apple-system, sans-serif`;
    ctx.letterSpacing = '1px';
    const headerCenterY = innerPadding + headerHeight / 2 - (2 * scale);
    ctx.fillText(framePreset.header?.text || '오늘의 마음 네컷', cardW / 2, headerCenterY);

    ctx.font = `700 ${Math.round(11 * scale)}px "Pretendard Variable", Pretendard, -apple-system, sans-serif`;
    ctx.fillStyle = framePreset.colors?.secondaryText || '#CFCFD4';
    ctx.fillText('MAEUM FOUR CUTS', cardW / 2, headerCenterY + (18 * scale));

    // 4. Footer Text and Date
    const now = new Date();
    const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
    const footerCenterY = cardH - innerPadding - footerHeight / 2;

    ctx.fillStyle = framePreset.colors?.secondaryText || '#CFCFD4';
    ctx.font = `700 ${Math.round(15 * scale)}px "Pretendard Variable", Pretendard, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(framePreset.footer?.text || '당신의 오늘을 응원합니다', cardW / 2, footerCenterY - (8 * scale));

    ctx.font = `600 ${Math.round(11 * scale)}px "Pretendard Variable", Pretendard, -apple-system, sans-serif`;
    ctx.fillStyle = framePreset.colors?.accent || '#FF4F87';
    ctx.fillText(`${dateStr} · 20th ANNIVERSARY`, cardW / 2, footerCenterY + (12 * scale));

    // 5. Fixed Event Sticker Preset Decoration (Section 10 & 11)
    const stickerPreset = CFG.fixedStickerPresets?.presets?.find((p) => p.id === 'event-fixed-decoration') || {
      placements: [
        { id: 'top-sparkle', type: 'emoji', value: '✨', target: 'card', x: 0.90, y: 0.045, scale: 0.040, rotation: -0.12, opacity: 0.85 },
        { id: 'bottom-heart', type: 'emoji', value: '💜', target: 'card', x: 0.08, y: 0.952, scale: 0.034, rotation: 0.10, opacity: 0.90 }
      ]
    };

    if (stickerPreset?.placements) {
      for (const pl of stickerPreset.placements) {
        ctx.save();
        const sx = pl.x * cardW;
        const sy = pl.y * cardH;
        const sSize = Math.round(cardW * (pl.scale || 0.040));
        ctx.translate(sx, sy);
        ctx.rotate(pl.rotation || 0);
        ctx.globalAlpha = pl.opacity !== undefined ? pl.opacity : 0.9;
        ctx.font = `${sSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pl.value, 0, 0);
        ctx.restore();
      }
    }

    return canvas;
  }

  function composePrintSheetCanvas(masterCanvas, showCutGuides = true) {
    const pl = CFG.printLayout || {};
    const sheetW = pl.sheet?.width || 1200;
    const sheetH = pl.sheet?.height || 1776;

    const sheetCanvas = document.createElement('canvas');
    sheetCanvas.width = sheetW;
    sheetCanvas.height = sheetH;
    const sCtx = sheetCanvas.getContext('2d', { alpha: false });
    sCtx.imageSmoothingEnabled = true;
    sCtx.imageSmoothingQuality = 'high';

    // 1. Fill White Postcard Background
    sCtx.fillStyle = pl.sheet?.backgroundColor || '#FFFFFF';
    sCtx.fillRect(0, 0, sheetW, sheetH);

    // 2. Draw 4 Identical Master Cards in 2x2 Grid
    // Copy 0: (18, 18)
    // Copy 1: (606, 18)
    // Copy 2: (18, 894)
    // Copy 3: (606, 894)
    const cardW = 576;
    const cardH = 864;
    const positions = [
      { x: 18, y: 18 },
      { x: 606, y: 18 },
      { x: 18, y: 894 },
      { x: 606, y: 894 }
    ];

    positions.forEach((pos) => {
      sCtx.drawImage(masterCanvas, pos.x, pos.y, cardW, cardH);
    });

    // 3. Render Center Cut Guides (x=600, y=888) if Enabled
    if (showCutGuides && pl.cutGuide?.visible !== false) {
      sCtx.save();
      sCtx.strokeStyle = pl.cutGuide?.color || '#B8B8B8';
      sCtx.lineWidth = pl.cutGuide?.width || 1;
      sCtx.globalAlpha = pl.cutGuide?.opacity || 0.55;
      sCtx.setLineDash(pl.cutGuide?.dash || [8, 8]);

      // Vertical center cut
      sCtx.beginPath();
      sCtx.moveTo(sheetW / 2, 0);
      sCtx.lineTo(sheetW / 2, sheetH);
      sCtx.stroke();

      // Horizontal center cut
      sCtx.beginPath();
      sCtx.moveTo(0, sheetH / 2);
      sCtx.lineTo(sheetW, sheetH / 2);
      sCtx.stroke();

      sCtx.restore();
    }

    return sheetCanvas;
  }

  async function composeFinalCanvasBlob() {
    if (isFastLaneMode()) {
      // Clear participant stickers to enforce fixed design
      state.stickers.clear();

      // 1. Compose Single Master Card
      const masterCanvas = await composeMasterCardCanvas();
      state.masterCardCanvas = masterCanvas;

      // 2. Compose 4-Up Print Sheet for Canon SELPHY CP1200
      const sheetCanvas = composePrintSheetCanvas(masterCanvas, state.showCutGuides);
      state.printSheetCanvas = sheetCanvas;

      // 3. Render Digital Master into #finalCanvas
      const finalCanvas = $('#finalCanvas');
      finalCanvas.width = masterCanvas.width;
      finalCanvas.height = masterCanvas.height;
      const fCtx = finalCanvas.getContext('2d', { alpha: false });
      fCtx.drawImage(masterCanvas, 0, 0);

      return new Promise((resolve) => finalCanvas.toBlob(resolve, 'image/jpeg', 0.95));
    }

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

    // [NEW] Draw Official Neouri Stickers on Header
    try {
      const hLeft = await loadHtmlImage('/stickers/icheon_20th_01.png');
      const hRight = await loadHtmlImage('/stickers/icheon_20th_11.png');
      if (hLeft) ctx.drawImage(hLeft, 60, f.headerHeight / 2 - 45, 90, 90);
      if (hRight) ctx.drawImage(hRight, f.width - 150, f.headerHeight / 2 - 45, 90, 90);
    } catch(e) {}

    // 2x2 Grid Layout Math
    const top = f.headerHeight + 20;
    const bottom = f.footerHeight + 20;
    const cellW = (f.width - f.padding * 2 - f.gap) / 2;
    const cellH = (f.height - top - bottom - f.gap) / 2;

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

    // Process each selected photo sequentially to protect iPad Safari memory (no Promise.all for pixel engine)
    for (let i = 0; i < 4; i++) {
      const photoId = state.selected[i];
      const s = state.shots.find((x) => x.id === photoId);
      if (!s) continue;
      const img = await loadHtmlImage(s.url);

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

      // Sequential Offscreen Filter or Sketch Rendering
      const filterState = getPhotoFilter(photoId);
      const isSketch = isSketchFilter(filterState.filterId);

      if (isSketch && window.SketchClient) {
        const ss = getPhotoSketchState(photoId, filterState.filterId);
        const sketchBmp = await window.SketchClient.renderToBitmap(
          s.blob,
          ss,
          Math.round(cellW),
          Math.round(cellH),
          {
            backdropRgb: window.SketchDefinitions ? window.SketchDefinitions.DEFAULT_BACKDROP_RGB : [143, 207, 227],
            protectBlueStrength: ss.protectBlueStrength || 0.85,
            forceFullFrame: ss.forceFullFrame || false
          }
        );
        ctx.drawImage(sketchBmp, x, y, cellW, cellH);
        try { sketchBmp.close(); } catch (e) {}
      } else {
        const offCanvas = document.createElement('canvas');
        offCanvas.width = Math.round(cellW);
        offCanvas.height = Math.round(cellH);
        const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
        drawCover(offCtx, img, 0, 0, offCanvas.width, offCanvas.height);

        const preset = window.FilterDefinitions ? window.FilterDefinitions.getFilterPreset(filterState.filterId) : null;

        if (preset && (preset.id !== 'original' || (filterState.adjustments && Object.values(filterState.adjustments).some((v) => v !== 0)))) {
          const rawData = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height);
          const combinedParams = window.FilterDefinitions
            ? window.FilterDefinitions.interpolateParameters(preset, filterState.intensity / 100, filterState.adjustments)
            : preset;
          if (filterState.customLUT) combinedParams.lut = filterState.customLUT;

          if (window.PixelEngine && window.PixelEngine.processPixelPipeline) {
            window.PixelEngine.processPixelPipeline(rawData, combinedParams, {
              intensity: filterState.intensity / 100,
              grainSeed: photoId,
              photoId
            });
            offCtx.putImageData(rawData, 0, 0);
          }
        }

        ctx.drawImage(offCanvas, x, y);

        // Immediately release offscreen buffer
        offCanvas.width = 1;
        offCanvas.height = 1;
      }

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

    // [NEW] Draw Official Neouri Stickers on Footer
    try {
      const fLeft = await loadHtmlImage('/stickers/icheon_20th_04.png');
      const fRight = await loadHtmlImage('/stickers/icheon_20th_05.png');
      if (fLeft) ctx.drawImage(fLeft, f.width / 2 - 320, footerY - 35, 70, 70);
      if (fRight) ctx.drawImage(fRight, f.width / 2 + 250, footerY - 35, 70, 70);
    } catch(e) {}

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
        // Failover: Try client-side direct CDN upload (Zero-login Android bypass via catbox.moe)
        let clientCdnUrl = null;
        try {
          const cdnForm = new FormData();
          cdnForm.append('reqtype', 'fileupload');
          cdnForm.append('fileToUpload', blob, 'maeum-fourcuts.jpg');
          const cRes = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: cdnForm });
          if (cRes.ok) {
            clientCdnUrl = (await cRes.text()).trim();
          }
        } catch (e) {
          console.warn('Client direct CDN upload error:', e);
        }

        const fallbackPhotoId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `photo-${Date.now()}`;
        // By setting the target directly to the image URL, we bypass Vercel Auth entirely for Android QR scans!
        const targetUrl = clientCdnUrl ? clientCdnUrl : location.origin;

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

      // Fast-Lane: Proceed to Dedicated Print Preview Screen (Section 23)
      if (isFastLaneMode()) {
        showPrintPreview();
      } else {
        show('result');
      }
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

  // ===================================================================
  // FAST-LANE PRINT PREVIEW & PRINT QUEUE PROTECTION (SECTIONS 23 & 24)
  // ===================================================================
  function renderPrintSheetPreview() {
    const canvas = $('#printSheetCanvas');
    if (!canvas || !state.masterCardCanvas) return;

    const sheetCanvas = composePrintSheetCanvas(state.masterCardCanvas, state.showCutGuides);
    state.printSheetCanvas = sheetCanvas;

    canvas.width = sheetCanvas.width;
    canvas.height = sheetCanvas.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(sheetCanvas, 0, 0);
  }

  function showPrintPreview() {
    state.printState = {
      status: 'ready',
      sessionId: state.runId,
      lastPrintedAt: null
    };

    const confirmBtn = $('#printConfirmBtn');
    const confirmBtnText = $('#printConfirmBtnText');
    if (confirmBtn) confirmBtn.disabled = false;
    if (confirmBtnText) confirmBtnText.textContent = '인쇄하기';

    renderPrintSheetPreview();
    show('preview');
  }

  async function handleConfirmPrint() {
    // Print Queue Protection: Guard against double-tap or stale requests
    if (state.printState.status !== 'ready') return;

    state.printState.status = 'printing';
    const confirmBtn = $('#printConfirmBtn');
    const confirmBtnText = $('#printConfirmBtnText');
    if (confirmBtn) confirmBtn.disabled = true;
    if (confirmBtnText) confirmBtnText.textContent = '인쇄 중... 잠시만 기다려주세요 🖨️';

    const currentSession = state.runId;

    try {
      // 1. Prepare dedicated 4-up full-bleed print container
      const printArea = $('#printArea');
      if (printArea && state.printSheetCanvas) {
        printArea.replaceChildren();
        const img = document.createElement('img');
        img.src = state.printSheetCanvas.toDataURL('image/jpeg', 0.98);
        img.alt = 'Canon SELPHY CP1200 인쇄용 4컷 시트';
        printArea.appendChild(img);
      }

      showNotice('🖨️ 포토프린터 인쇄 대화상자를 준비합니다...');

      await sleep(350);
      if (state.runId !== currentSession) return;

      // 2. Trigger browser print
      window.print();

      // 3. Mark printed and proceed to completion
      state.printState.status = 'printed';
      state.printState.lastPrintedAt = Date.now();

      await sleep(600);
      if (state.runId !== currentSession) return;

      show('result');
    } catch (err) {
      console.warn('Print handoff error:', err);
      if (state.runId === currentSession) {
        state.printState.status = 'failed';
        if (confirmBtn) confirmBtn.disabled = false;
        if (confirmBtnText) confirmBtnText.textContent = '인쇄 다시 시도';
        showNotice('인쇄 준비 중 문제가 발생했습니다. 다시 시도해 주세요.');
      }
    }
  }

  // Operator Geometry & Ratio Report Generator (Section 19)
  function getGeometryReport() {
    const pl = CFG.printLayout || {};
    const sheet = pl.sheet || { width: 1200, height: 1776 };
    const grid = pl.grid || { columns: 2, rows: 2, verticalGutter: 12, horizontalGutter: 12, outerSafeMargin: 18 };
    const card = pl.card || { innerPadding: 18, photoGap: 8, headerRatio: 0.060, footerRatio: 0.075 };

    const cardW = (sheet.width - grid.outerSafeMargin * 2 - (grid.columns - 1) * grid.verticalGutter) / grid.columns;
    const cardH = (sheet.height - grid.outerSafeMargin * 2 - (grid.rows - 1) * grid.horizontalGutter) / grid.rows;
    const slotRatio = getDerivedSlotAspectRatio();

    return {
      sheetDimensions: `${sheet.width} × ${sheet.height} px (100mm × 148mm 엽서 규격)`,
      sheetRatio: `${(sheet.width / sheet.height).toFixed(4)}`,
      gridConfiguration: `${grid.columns} 열 × ${grid.rows} 행 (총 4장 인쇄)`,
      masterCardDimensions: `${cardW} × ${cardH} px`,
      masterCardRatio: `${(cardW / cardH).toFixed(4)} (2 : 3 황금비율)`,
      photoSlotAspectRatio: `${slotRatio.toFixed(4)}`,
      safeMargins: `외곽 여백 ${grid.outerSafeMargin}px, 카드간격 ${grid.verticalGutter}px, 내부여백 ${card.innerPadding}px, 사진간격 ${card.photoGap}px`,
      centerCutGuides: `수직 X: ${sheet.width / 2}px, 수평 Y: ${sheet.height / 2}px (2회 재단으로 4등분 분리)`
    };
  }

  function showGeometryReportModal() {
    const modal = $('#ratioReportModal');
    const list = $('#geometryReportList');
    if (!modal || !list) return;

    const report = getGeometryReport();
    list.replaceChildren();

    const rows = [
      { label: '용지 규격', value: report.sheetDimensions },
      { label: '시트 비율', value: report.sheetRatio },
      { label: '그리드 배치', value: report.gridConfiguration },
      { label: '개별 카드 크기', value: report.masterCardDimensions },
      { label: '개별 카드 비율', value: report.masterCardRatio },
      { label: '사진 슬롯 가로세로비', value: report.photoSlotAspectRatio },
      { label: '안전 여백 사양', value: report.safeMargins },
      { label: '십자 재단선 좌표', value: report.centerCutGuides }
    ];

    rows.forEach((r) => {
      const rowDiv = document.createElement('div');
      rowDiv.className = 'diag-status-row';
      rowDiv.innerHTML = `
        <span class="diag-label">${r.label}:</span>
        <span class="diag-val">${r.value}</span>
      `;
      list.appendChild(rowDiv);
    });

    modal.removeAttribute('hidden');
  }

  function setStage(num) {
    for (let i = 1; i <= 3; i++) {
      const el = $(`#stage${i}`);
      if (!el) continue;
      el.classList.toggle('done', i < num);
      el.classList.toggle('current', i === num);
    }
  }

  // Complete Reset of Kiosk State (Privacy & Security Safe Purge)
  function resetKiosk() {
    state.runId++;
    state.abortController?.abort();
    state.abortController = null;
    clearTimeout(state.idleTimer);
    clearTimeout(state.completionTimer);
    clearInterval(state.warningTimer);
    clearTimeout(state.autoTransitionTimer);
    clearTimeout(state.undoTimer);

    stopCamera();
    releaseShots();

    state.selected = [];
    state.stickers.clear();
    state.photoFilters.clear();
    state.cameraFilterId = 'original';
    state.activeFilterSlotIndex = 0;
    state.activePhotoId = null;
    state.activeStickerId = null;
    state.csrf = null;
    state.selectionLocked = false;
    state.masterCardCanvas = null;
    state.printSheetCanvas = null;
    state.printState = { status: 'idle', sessionId: 0, lastPrintedAt: null };

    const autoBanner = $('#selectionAutoBanner');
    if (autoBanner) autoBanner.hidden = true;

    if (window.filterClient) {
      window.filterClient.reset();
    }
    if (window.SketchClient) {
      window.SketchClient.reset();
    }
    state.photoSketch.clear();
    if (window.CurveEngine && window.CurveEngine.clearCurveCache) {
      window.CurveEngine.clearCurveCache();
    }
    if (window.LUTParser && window.LUTParser.clearLUTCache) {
      window.LUTParser.clearLUTCache();
    }

    const video = $('#video');
    if (video) video.style.filter = 'none';

    $('#shotCount').textContent = '1';
    $('#photoGrid')?.replaceChildren();
    $('#stripPreview')?.replaceChildren();
    $('#qr')?.removeAttribute('src');
    $('#directDownload')?.removeAttribute('href');
    $('#cameraErrorBox')?.setAttribute('hidden', 'true');
    $('#uploadErrorBox')?.setAttribute('hidden', 'true');
    $('#resetWarningBanner')?.classList.remove('show');

    const pb = $('#poseNoticeBanner');
    if (pb) pb.hidden = true;
    const cb = $('#countdownBox');
    if (cb) cb.style.display = 'flex';

    // Clear Print Sheet Canvas and Print Area
    const sheetCanvas = $('#printSheetCanvas');
    if (sheetCanvas) {
      sheetCanvas.getContext('2d')?.clearRect(0, 0, sheetCanvas.width, sheetCanvas.height);
      sheetCanvas.width = 1;
      sheetCanvas.height = 1;
    }
    const printArea = $('#printArea');
    if (printArea) printArea.replaceChildren();

    renderProgressRail();

    // Clean quad preview canvases
    for (let i = 0; i < 4; i++) {
      const c = $('#filterCanvas' + i);
      if (c) {
        c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
        c.width = 1;
        c.height = 1;
      }
      const tag = $('#filterSlotName' + i);
      if (tag) tag.textContent = '원본 (Original)';
    }

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
    const zoomedCanvas = $('#zoomedCanvas');
    if (zoomedCanvas) {
      zoomedCanvas.getContext('2d')?.clearRect(0, 0, zoomedCanvas.width, zoomedCanvas.height);
      zoomedCanvas.width = 1;
      zoomedCanvas.height = 1;
    }
    state.editorMode = 'strip';
    state.filterApplyMode = 'all';

    show('start');
  }

  // ===================================================================
  // GLOBAL EVENT BINDINGS
  // ===================================================================
  // Screen 1: Start
  let isStartingAction = false;
  async function handleStartAction() {
    if (isStartingAction) return;
    isStartingAction = true;
    try {
      if (isFastLaneMode()) {
        await initializeCamera();
      } else {
        show('permission');
      }
    } catch (err) {
      console.warn('handleStartAction error:', err);
    } finally {
      setTimeout(() => { isStartingAction = false; }, 1200);
    }
  }

  $('#startBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    handleStartAction();
  });
  $('#visualStartZone')?.addEventListener('click', (e) => {
    e.stopPropagation();
    handleStartAction();
  });
  $('#start')?.addEventListener('click', (e) => {
    if (e.target.closest('#demoBtn') || e.target.closest('a') || e.target.closest('button')) return;
    handleStartAction();
  });
  $('#demoBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    generateDemoShots();
  });

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

  // Screen 4: Selection -> Filter Stage
  $('#retakeBtn')?.addEventListener('click', () => show('permission'));
  $('#editBtn')?.addEventListener('click', () => {
    initFilterStage();
    show('filter');
  });

  // Screen 5: Filter Stage Action Handlers
  $$('#filterQuadSlots .filter-slot-card').forEach((slot) => {
    slot.addEventListener('click', () => {
      const idx = Number(slot.dataset.slot);
      state.filterApplyMode = 'single';
      selectActiveFilterSlot(idx);
    });
  });

  $$('#filterPhotoTabBar .filter-photo-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      setFilterPhotoTarget(tab.dataset.target);
    });
  });

  $('#btnApplyAllFilters')?.addEventListener('click', applyActiveFilterToAll);
  $('#btnResetActiveFilter')?.addEventListener('click', resetActiveFilter);
  $('#btnResetAllFilters')?.addEventListener('click', resetAllFilters);

  $('#filterIntensitySlider')?.addEventListener('input', (e) => {
    updateActiveSlotIntensity(e.target.value);
  });

  $$('.btn-intensity-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = Number(btn.dataset.intensity);
      const slider = $('#filterIntensitySlider');
      if (slider) slider.value = val;
      updateActiveSlotIntensity(val);
    });
  });

  $('#inputManualBrightness')?.addEventListener('input', (e) => {
    const el = $('#lblManualBrightness');
    if (el) el.textContent = Number(e.target.value) > 0 ? `+${e.target.value}` : e.target.value;
    updateActiveSlotManual('brightness', e.target.value);
  });
  $('#inputManualContrast')?.addEventListener('input', (e) => {
    const el = $('#lblManualContrast');
    if (el) el.textContent = Number(e.target.value) > 0 ? `+${e.target.value}` : e.target.value;
    updateActiveSlotManual('contrast', e.target.value);
  });
  $('#inputManualSaturation')?.addEventListener('input', (e) => {
    const el = $('#lblManualSaturation');
    if (el) el.textContent = Number(e.target.value) > 0 ? `+${e.target.value}` : e.target.value;
    updateActiveSlotManual('saturation', e.target.value);
  });
  $('#inputManualTemperature')?.addEventListener('input', (e) => {
    const el = $('#lblManualTemperature');
    if (el) el.textContent = Number(e.target.value) > 0 ? `+${e.target.value}` : e.target.value;
    updateActiveSlotManual('temperature', e.target.value);
  });
  $('#inputManualTint')?.addEventListener('input', (e) => {
    const el = $('#lblManualTint');
    if (el) el.textContent = Number(e.target.value) > 0 ? `+${e.target.value}` : e.target.value;
    updateActiveSlotManual('tint', e.target.value);
  });

  $('#btnResetManualAdjustments')?.addEventListener('click', () => {
    const photoId = state.selected[state.activeFilterSlotIndex];
    if (photoId) {
      const fs = getPhotoFilter(photoId);
      fs.adjustments = { brightness: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0 };
      setPhotoFilter(photoId, fs);
      selectActiveFilterSlot(state.activeFilterSlotIndex);
      renderFilterSlot(state.activeFilterSlotIndex);
    }
  });

  // Sketch Platform Controls (Section 26)
  $('#sketchLineSlider')?.addEventListener('input', (e) => {
    updateActiveSketchParam('lineStrength', e.target.value);
  });
  $('#sketchColorSlider')?.addEventListener('input', (e) => {
    updateActiveSketchParam('colorStrength', e.target.value);
  });
  $('#sketchPaperSlider')?.addEventListener('input', (e) => {
    updateActiveSketchParam('paperStrength', e.target.value);
  });
  $('#sketchWashSlider')?.addEventListener('input', (e) => {
    updateActiveSketchParam('backgroundWashStrength', e.target.value);
  });

  // Before/After Comparison Modal (Section 26)
  $('#btnOpenCompare')?.addEventListener('click', openCompareModal);
  $('#closeCompareModalBtn')?.addEventListener('click', closeCompareModal);
  $('#compareSliderControl')?.addEventListener('input', (e) => {
    updateCompareSplit(e.target.value);
  });
  const compareModal = $('#sketchCompareModal');
  compareModal?.addEventListener('click', (e) => {
    if (e.target === compareModal) closeCompareModal();
  });

  // Operator Quality Panel Modal (Section 27)
  const qualityModal = $('#sketchQualityModal');
  $('#sketchQualityBtn')?.addEventListener('click', openSketchQualityModal);
  $('#closeSketchQualityBtn')?.addEventListener('click', closeSketchQualityModal);
  qualityModal?.addEventListener('click', (e) => {
    if (e.target === qualityModal) closeSketchQualityModal();
  });

  $('#opRecalibrateBg')?.addEventListener('click', async () => {
    const activePhotoId = state.selected[state.activeFilterSlotIndex];
    if (!activePhotoId) return;
    if (window.SketchClient) window.SketchClient.reset();
    showNotice('배경색을 다시 정밀 측정하여 스케치를 갱신합니다.');
    await renderFilterSlot(state.activeFilterSlotIndex);
    const ss = getPhotoSketchState(activePhotoId);
    if (ss.lastDiagnostics) updateOperatorQualityPanelUI(ss.lastDiagnostics);
  });

  $('#opEnhanceBoundary')?.addEventListener('click', async () => {
    const activePhotoId = state.selected[state.activeFilterSlotIndex];
    if (!activePhotoId) return;
    const ss = getPhotoSketchState(activePhotoId);
    ss.lineStrength = Math.min(1.0, ss.lineStrength + 0.10);
    showNotice('인물 경계 라인 표현을 10% 강화했습니다.');
    selectActiveFilterSlot(state.activeFilterSlotIndex);
    await renderFilterSlot(state.activeFilterSlotIndex);
  });

  $('#opProtectBlue')?.addEventListener('click', async () => {
    const activePhotoId = state.selected[state.activeFilterSlotIndex];
    if (!activePhotoId) return;
    const ss = getPhotoSketchState(activePhotoId);
    ss.protectBlueStrength = 0.95;
    showNotice('하늘색/청색 의상 및 소품 영역 보호를 극대화했습니다.');
    await renderFilterSlot(state.activeFilterSlotIndex);
    if (ss.lastDiagnostics) updateOperatorQualityPanelUI(ss.lastDiagnostics);
  });

  $('#opForceFullFrame')?.addEventListener('click', async () => {
    const activePhotoId = state.selected[state.activeFilterSlotIndex];
    if (!activePhotoId) return;
    const ss = getPhotoSketchState(activePhotoId);
    ss.forceFullFrame = !ss.forceFullFrame;
    showNotice(ss.forceFullFrame ? '배경 삭제 없는 전체 프레임 스케치 모드로 전환되었습니다.' : '정밀 배경 분리 모드로 복원되었습니다.');
    await renderFilterSlot(state.activeFilterSlotIndex);
    if (ss.lastDiagnostics) updateOperatorQualityPanelUI(ss.lastDiagnostics);
  });

  $('#btnFilterBack')?.addEventListener('click', () => {
    show('select');
  });

  const handleProceedToEdit = () => {
    renderDecorationEditor();
    show('edit');
  };
  $('#btnFilterNext')?.addEventListener('click', handleProceedToEdit);
  $('#btnPreviewNext')?.addEventListener('click', handleProceedToEdit);

  // Screen 5: Editor (Auto-Zoomed & Strip Modes)
  $('#smaller')?.addEventListener('click', () => modifyActiveSticker('smaller'));
  $('#bigger')?.addEventListener('click', () => modifyActiveSticker('bigger'));
  $('#rotate')?.addEventListener('click', () => modifyActiveSticker('rotate'));
  $('#deleteSticker')?.addEventListener('click', () => modifyActiveSticker('delete'));
  $('#editorModeToggleBtn')?.addEventListener('click', toggleEditorMode);
  $('#prevPhotoBtn')?.addEventListener('click', () => navigatePhoto(-1));
  $('#nextPhotoBtn')?.addEventListener('click', () => navigatePhoto(1));
  $('#zoomedPhotoCard')?.addEventListener('pointerdown', (e) => {
    if (e.target === $('#zoomedPhotoCard') || e.target === $('#zoomedCanvas')) {
      state.activeStickerId = null;
      $$('.sticker-node').forEach((n) => n.classList.remove('selected'));
    }
  });
  $('#backSelectBtn')?.addEventListener('click', () => {
    initFilterStage();
    show('filter');
  });
  $('#finishBtn')?.addEventListener('click', executeCompletionWorkflow);

  // Screen 4: Photo Selection Proceed CTA
  $('#editBtn')?.addEventListener('click', () => {
    if (isFastLaneMode()) {
      executeCompletionWorkflow();
    } else {
      initFilterStage();
      show('filter');
    }
  });

  // Screen 5 (Fast-Lane): Dedicated Print Preview Screen Actions
  $('#printConfirmBtn')?.addEventListener('click', handleConfirmPrint);
  $('#printReselectBtn')?.addEventListener('click', () => {
    undoSelection();
    show('select');
  });
  $('#toggleCutGuidesCheckbox')?.addEventListener('change', (e) => {
    state.showCutGuides = !!e.target.checked;
    renderPrintSheetPreview();
  });
  $('#btnOperatorRatioReport')?.addEventListener('click', showGeometryReportModal);
  $('#closeRatioReportBtn')?.addEventListener('click', () => {
    $('#ratioReportModal')?.setAttribute('hidden', 'true');
  });
  $('#undoSelectionBtn')?.addEventListener('click', undoSelection);

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

  // Camera Ratio Switcher (4:3 Landscape -> Full Screen -> 3:4 Portrait)
  const ratioOrder = ['landscape', 'full', 'portrait'];
  const ratioConfig = {
    landscape: { label: '4:3 스튜디오', icon: '📷', notice: '📷 4:3 스튜디오 모드 (황금비율 와이드)' },
    full: { label: '화면 가득 채움', icon: '🖥️', notice: '🖥️ 화면 가득 채움 모드 (풀스크린 뷰)' },
    portrait: { label: '3:4 인물 (대형)', icon: '📐', notice: '📐 3:4 인물 모드 (세로 대형 뷰)' }
  };
  state.cameraRatio = 'landscape';

  function updateRatioUI() {
    const vf = $('#viewfinderFrame');
    const label = $('#ratioLabel');
    const icon = $('#ratioIcon');
    if (!vf) return;

    vf.classList.remove('ratio-portrait', 'ratio-full', 'ratio-landscape');
    vf.classList.add(`ratio-${state.cameraRatio}`);

    const cfg = ratioConfig[state.cameraRatio] || ratioConfig.portrait;
    if (label) label.textContent = cfg.label;
    if (icon) icon.textContent = cfg.icon;
  }

  $('#ratioToggleBtn')?.addEventListener('click', () => {
    const currIdx = ratioOrder.indexOf(state.cameraRatio);
    const nextIdx = (currIdx + 1) % ratioOrder.length;
    state.cameraRatio = ratioOrder[nextIdx];
    updateRatioUI();
    const cfg = ratioConfig[state.cameraRatio];
    showNotice(cfg.notice);
  });

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

  // Background and Visibility Cleanup (With safe debounce to prevent permission dialog aborts)
  let visibilityTimer = null;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.phase !== 'start') {
      clearTimeout(visibilityTimer);
      visibilityTimer = setTimeout(() => {
        if (document.hidden && state.phase !== 'start') {
          showNotice('화면이 전환되어 촬영을 안전하게 초기화했습니다.');
          resetKiosk();
        }
      }, 10000);
    } else {
      clearTimeout(visibilityTimer);
    }
  });

  window.addEventListener('pagehide', () => {
    resetKiosk();
  });

  // Startup
  applyBranding();
  renderProgressRail();
  loadServerConfig();
})();
