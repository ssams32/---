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

  let currentPhotoBlob = null;
  let token = location.hash.slice(1);
  // Clean fragment from address bar
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
    token = '';
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
      
      // Fetch blob for native mobile sharing/saving
      try {
        const bRes = await fetch(data.previewUrl);
        currentPhotoBlob = await bRes.blob();
      } catch (e) {
        console.warn('Blob fetch fallback', e);
      }

      photoWrap.hidden = false;
      saveBtn.hidden = false;
      statusEl.textContent = '사진이 준비되었습니다 ✨ 아래 버튼을 눌러 저장하세요!';
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
    saveBtn.textContent = '저장 중...';

    try {
      // 1. If Web Share API with files is available (iOS Safari, Android Chrome), open native sheet
      if (currentPhotoBlob && navigator.canShare) {
        const file = new File([currentPhotoBlob], `ichon-fourcuts-${id.slice(0, 8)}.jpg`, { type: 'image/jpeg' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: '이천시 20주년 마음 네컷',
            text: '이천시정신건강복지센터 20주년 마음 네컷 사진이에요 ✨'
          });
          saveBtn.textContent = '저장 완료!';
          setTimeout(() => { saveBtn.textContent = '사진 저장하기'; saveBtn.disabled = false; }, 2000);
          return;
        }
      }

      // 2. Direct browser download fallback
      const data = await requestJson(api('download')).catch(() => null);
      const downloadUrl = data?.downloadUrl || photo.src;

      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `ichon-fourcuts-${id.slice(0, 8)}.jpg`;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      saveBtn.textContent = '저장 시작!';
      setTimeout(() => { saveBtn.textContent = '사진 저장하기'; saveBtn.disabled = false; }, 2000);
    } catch (err) {
      if (err.name !== 'AbortError') {
        alert(err.message || '다운로드 중 오류가 발생했습니다. 사진을 길게 꾹 눌러서 저장해 주세요.');
      }
      saveBtn.disabled = false;
      saveBtn.textContent = '사진 저장하기';
    }
  };

  retryBtn.onclick = loadPreview;
  loadPreview();
})();
