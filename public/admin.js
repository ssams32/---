(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  const state = {
    authenticated: false,
    config: { ...window.PHOTO_BOOTH_CONFIG },
    stats: null,
    selectedFile: null
  };

  function showToast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t.timer);
    t.timer = setTimeout(() => { t.hidden = true; }, 3000);
  }

  async function checkAuth() {
    try {
      const r = await fetch('/api/admin/check', { cache: 'no-store', credentials: 'same-origin' });
      const d = await r.json().catch(() => ({}));
      if (d.authenticated) {
        state.authenticated = true;
        $('#loginModal').hidden = true;
        $('#adminApp').hidden = false;
        await loadConfig();
        await loadStats();
      } else {
        state.authenticated = false;
        $('#loginModal').hidden = false;
        $('#adminApp').hidden = true;
      }
    } catch {
      $('#loginModal').hidden = false;
      $('#adminApp').hidden = true;
    }
  }

  async function login(password) {
    $('#loginError').hidden = true;
    $('#loginBtn').disabled = true;
    try {
      const r = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || '로그인에 실패했습니다.');
      showToast('성공적으로 로그인되었습니다.');
      await checkAuth();
    } catch (e) {
      $('#loginError').textContent = e.message;
      $('#loginError').hidden = false;
    } finally {
      $('#loginBtn').disabled = false;
    }
  }

  async function logout() {
    try {
      await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
    } catch {}
    location.reload();
  }

  async function loadConfig() {
    try {
      const r = await fetch('/api/admin/config', { credentials: 'same-origin' });
      const d = await r.json().catch(() => ({}));
      if (d.config) {
        state.config = { ...state.config, ...d.config };
        renderAll();
      }
    } catch (e) {
      showToast('설정을 불러오지 못했습니다: ' + e.message);
    }
  }

  async function saveConfig(partial) {
    try {
      const updated = { ...state.config, ...partial };
      const r = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ config: updated })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || '설정 저장 실패');
      state.config = d.config;
      showToast('설정이 안전하게 저장되었습니다 ✨');
      renderAll();
    } catch (e) {
      showToast('저장 중 오류 발생: ' + e.message);
    }
  }

  async function loadStats() {
    try {
      const r = await fetch('/api/admin/stats', { credentials: 'same-origin' });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        state.stats = d;
        $('#statReady').textContent = `${d.readyCount} 건`;
        $('#statActive').textContent = `${d.activeCount} 건`;
        $('#statExpired').textContent = `${d.expiredCount} 건`;
      }
    } catch {}
  }

  function renderAll() {
    renderThemes();
    renderCustomBackgrounds();
    populateForms();
  }

  function renderThemes() {
    const grid = $('#themeGrid');
    grid.replaceChildren();
    const themes = window.PHOTO_BOOTH_CONFIG.themes || {};
    const defaultTheme = state.config.defaultTheme || 'lavender';

    Object.entries(themes).forEach(([key, theme]) => {
      const item = document.createElement('div');
      item.className = `theme-item ${key === defaultTheme ? 'active' : ''}`;
      
      const prev = document.createElement('div');
      prev.className = 'theme-preview-box';
      prev.style.background = `linear-gradient(135deg, ${theme.colors.bgStart}, ${theme.colors.bgEnd})`;
      prev.style.color = theme.colors.text;
      prev.textContent = theme.name;

      const name = document.createElement('div');
      name.className = 'theme-name';
      name.textContent = theme.name;

      item.append(prev, name);

      if (key === defaultTheme) {
        const badge = document.createElement('span');
        badge.className = 'theme-badge';
        badge.textContent = '현재 기본 테마';
        item.append(badge);
      }

      item.addEventListener('click', () => {
        saveConfig({ defaultTheme: key });
      });

      grid.append(item);
    });
  }

  function renderCustomBackgrounds() {
    const list = $('#customBgList');
    list.replaceChildren();
    const bgs = state.config.customBackgrounds || [];
    $('#noCustomBg').hidden = bgs.length > 0;

    bgs.forEach((bg) => {
      const card = document.createElement('div');
      card.className = 'bg-card';

      const img = document.createElement('img');
      img.className = 'bg-thumb';
      img.src = bg.url;
      img.alt = bg.name;

      const body = document.createElement('div');
      body.className = 'bg-card-body';

      const name = document.createElement('div');
      name.className = 'bg-card-name';
      name.textContent = bg.name;

      const actions = document.createElement('div');
      actions.className = 'bg-card-actions';

      const isDefault = state.config.defaultTheme === `custom:${bg.id}`;
      const setBtn = document.createElement('button');
      setBtn.className = `btn btn-sm ${isDefault ? 'primary' : 'ghost'}`;
      setBtn.textContent = isDefault ? '기본 적용 중' : '기본으로 설정';
      setBtn.onclick = () => saveConfig({ defaultTheme: `custom:${bg.id}` });

      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-sm ghost danger';
      delBtn.textContent = '삭제';
      delBtn.onclick = () => deleteBackground(bg.id);

      actions.append(setBtn, delBtn);
      body.append(name, actions);
      card.append(img, body);
      list.append(card);
    });
  }

  async function uploadBackground() {
    const file = state.selectedFile;
    if (!file) return showToast('업로드할 이미지 파일을 선택해 주세요.');
    const name = $('#bgNameInput').value.trim() || file.name.replace(/\.[^/.]+$/, '');

    const btn = $('#confirmUploadBtn');
    btn.disabled = true;
    btn.textContent = '업로드 중...';

    try {
      const form = new FormData();
      form.append('background', file);
      form.append('name', name);

      const r = await fetch('/api/admin/backgrounds', {
        method: 'POST',
        body: form,
        credentials: 'same-origin'
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || '업로드 실패');

      showToast('특별 배경이 성공적으로 등록되었습니다 🎨');
      $('#uploadBox').hidden = true;
      state.selectedFile = null;
      $('#bgFileInput').value = '';
      $('#bgNameInput').value = '';
      await loadConfig();
    } catch (e) {
      showToast('업로드 오류: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '업로드 적용';
    }
  }

  async function deleteBackground(id) {
    if (!confirm('정말 이 커스텀 배경을 삭제하시겠습니까?')) return;
    try {
      const r = await fetch(`/api/admin/backgrounds/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin'
      });
      if (!r.ok) throw new Error('삭제 실패');
      showToast('배경이 삭제되었습니다.');
      await loadConfig();
    } catch (e) {
      showToast('오류: ' + e.message);
    }
  }

  function populateForms() {
    const cfg = state.config;
    $('#centerName').value = cfg.centerName || '';
    $('#title').value = cfg.title || '';
    $('#message').value = cfg.message || '';
    $('#privacyNotice').value = cfg.privacyNotice || '';
    $('#defaultLayout').value = cfg.defaultLayout || 'grid-2x2';
    $('#countdownSeconds').value = String(cfg.capture?.countdownSeconds || 3);
    $('#captureCount').value = String(cfg.capture?.count || 6);
    $('#betweenShotsMs').value = String(cfg.capture?.betweenShotsMs || 750);
    $('#stickersInput').value = (cfg.stickers || []).join(', ');
  }

  // Event Listeners
  $('#loginForm').onsubmit = (e) => {
    e.preventDefault();
    login($('#adminPass').value);
  };

  $('#logoutBtn').onclick = logout;

  $$('.tab-btn').forEach((btn) => {
    btn.onclick = () => {
      $$('.tab-btn').forEach((b) => b.classList.remove('active'));
      $$('.tab-pane').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      $(`#tab-${btn.dataset.tab}`).classList.add('active');
      if (btn.dataset.tab === 'stats') loadStats();
    };
  });

  $('#triggerUploadBtn').onclick = () => {
    $('#uploadBox').hidden = !$('#uploadBox').hidden;
  };
  $('#cancelUploadBtn').onclick = () => {
    $('#uploadBox').hidden = true;
    state.selectedFile = null;
  };

  const uploadBox = $('#uploadBox');
  const bgFileInput = $('#bgFileInput');
  uploadBox.ondragover = (e) => { e.preventDefault(); uploadBox.style.borderColor = '#2c1e4a'; };
  uploadBox.ondragleave = () => { uploadBox.style.borderColor = 'var(--primary)'; };
  uploadBox.ondrop = (e) => {
    e.preventDefault();
    uploadBox.style.borderColor = 'var(--primary)';
    if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files[0]);
  };
  uploadBox.querySelector('.dropzone-content').onclick = (e) => {
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') bgFileInput.click();
  };
  bgFileInput.onchange = () => {
    if (bgFileInput.files?.[0]) handleFileSelect(bgFileInput.files[0]);
  };

  function handleFileSelect(file) {
    if (!file.type.startsWith('image/')) return showToast('이미지 파일만 업로드할 수 있습니다.');
    state.selectedFile = file;
    $('#bgNameInput').value = file.name.replace(/\.[^/.]+$/, '');
    showToast(`선택된 파일: ${file.name} (업로드 버튼을 눌러주세요)`);
  }

  $('#confirmUploadBtn').onclick = uploadBackground;

  $('#saveBrandingBtn').onclick = () => {
    saveConfig({
      centerName: $('#centerName').value.trim() || '마음건강복지센터',
      title: $('#title').value.trim() || '오늘의 마음 네컷',
      message: $('#message').value.trim() || '당신의 오늘을 응원합니다 ✨',
      privacyNotice: $('#privacyNotice').value.trim() || '완성 사진은 다운로드를 위해 잠시 보관된 후 자동 삭제됩니다.'
    });
  };

  $('#saveBoothBtn').onclick = () => {
    const rawStickers = $('#stickersInput').value.split(',').map((x) => x.trim()).filter(Boolean);
    saveConfig({
      defaultLayout: $('#defaultLayout').value,
      capture: {
        countdownSeconds: Number($('#countdownSeconds').value),
        count: Number($('#captureCount').value),
        betweenShotsMs: Number($('#betweenShotsMs').value)
      },
      stickers: rawStickers.length > 0 ? rawStickers : window.PHOTO_BOOTH_CONFIG.stickers
    });
  };

  $('#manualCleanupBtn').onclick = async () => {
    const btn = $('#manualCleanupBtn');
    btn.disabled = true;
    btn.textContent = '정리 실행 중...';
    const resBox = $('#cleanupResult');
    try {
      const r = await fetch('/api/admin/cleanup', { method: 'POST', credentials: 'same-origin' });
      const d = await r.json().catch(() => ({}));
      resBox.hidden = false;
      resBox.textContent = `정리 완료: 만료 파일 ${d.removed || 0}건 삭제 성공 (실패 ${d.failures || 0}건)`;
      await loadStats();
      showToast('만료 데이터 정리가 완료되었습니다.');
    } catch (e) {
      resBox.hidden = false;
      resBox.textContent = '정리 실패: ' + e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = '만료 데이터 즉시 정리 실행';
    }
  };

  checkAuth();
})();
