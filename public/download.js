(() => {
  'use strict';
  const card = document.querySelector('.download-card');
  const id = card.dataset.photoId;
  const statusEl = document.getElementById('status');
  const photo = document.getElementById('photo');
  const photoWrap = document.getElementById('photoWrap');
  const saveBtn = document.getElementById('save');
  const retryBtn = document.getElementById('retry');
  const expiredBox = document.getElementById('expiredBox');

  let token = location.hash.slice(1);
  // Immediately clean fragment from address bar
  history.replaceState(null, '', `/d/${encodeURIComponent(id)}`);

  const api = (kind) => `/api/photo/${encodeURIComponent(id)}/${kind}`;

  async function requestJson(url, options = {}) {
    const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...options });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || '사진을 불러올 수 없습니다.');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function exchangeToken() {
    if (!token) return;
    await requestJson(api('exchange'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    token = ''; // Clear secret token from memory immediately
  }

  async function loadPreview() {
    retryBtn.hidden = true;
    if (expiredBox) expiredBox.hidden = true;

    try {
      statusEl.textContent = '사진을 안전하게 불러오는 중입니다...';
      await exchangeToken();
      const data = await requestJson(api('preview'));
      photo.src = data.previewUrl;
      await photo.decode().catch(() => {});
      photoWrap.hidden = false;
      saveBtn.hidden = false;
      statusEl.textContent = '만료 전까지 안전하게 저장할 수 있습니다.';
    } catch (err) {
      photoWrap.hidden = true;
      saveBtn.hidden = true;
      if (err.status === 410 || err.message.includes('만료')) {
        statusEl.hidden = true;
        if (expiredBox) expiredBox.hidden = false;
      } else {
        statusEl.textContent = err.message || '사진을 불러오지 못했습니다.';
        retryBtn.hidden = false;
      }
    }
  }

  saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    try {
      const data = await requestJson(api('download'));
      location.assign(data.downloadUrl);
    } catch (err) {
      alert(err.message || '다운로드 중 오류가 발생했습니다.');
    } finally {
      saveBtn.disabled = false;
    }
  };

  retryBtn.onclick = loadPreview;
  loadPreview();
})();
