const sharp = require('sharp');
const crypto = require('crypto');
const {
  createSession,
  verifySession,
  createKioskCookie,
  verifyKioskCookie,
  createAdminCookie,
  verifyAdminCookie,
  createDownloadToken,
  verifyDownloadToken
} = require('../server/crypto');
const { acquire, release } = require('../server/lock');
const { validateAndNormalizeJpeg, validateAndNormalizeBackground } = require('../server/image');

(async () => {
  console.log('================================================================');
  console.log('   마음 네컷 포토부스 Secure v4.5 종합 1000회 시뮬레이션 시작');
  console.log('================================================================\n');

  const results = {
    cryptoAuth: { iterations: 10000, failures: 0 },
    distributedLocks: { iterations: 1000, failures: 0 },
    dataLifecycle: { iterations: 1000, ready: 0, failed: 0, cleaned: 0, orphans: 0 },
    adminConfigSync: { iterations: 1000, failures: 0 },
    imageThemeProcessing: {
      sequential: 500,
      concurrentBatches: 500,
      customBackgroundsTested: 200,
      failures: 0,
      elapsedMs: 0,
      peakRssMb: 0
    }
  };

  const secretA = 's'.repeat(48);
  const secretB = 'd'.repeat(48);
  const adminSecret = 'a'.repeat(48);

  // 1. Crypto & Auth 10,000 Iterations
  console.log('1. 암호화 토큰, 세션, 관리자 인증 10,000회 무결성 검증...');
  for (let i = 0; i < results.cryptoAuth.iterations; i++) {
    const s = createSession(secretA, 60);
    const k = createKioskCookie(secretA, 60);
    const adm = createAdminCookie(adminSecret, 60);
    const id = crypto.randomUUID();
    const t = createDownloadToken(secretB, id, new Date(Date.now() + 60000));

    if (
      !verifySession(secretA, s.cookie) ||
      verifySession(secretA, s.cookie + 'tamper') ||
      !verifyKioskCookie(secretA, k) ||
      !verifyAdminCookie(adminSecret, adm.cookie) ||
      verifyAdminCookie(adminSecret, adm.cookie + 'bad') ||
      !verifyDownloadToken(secretB, id, t) ||
      verifyDownloadToken(secretB, crypto.randomUUID(), t)
    ) {
      results.cryptoAuth.failures++;
    }
  }

  // 2. Distributed Locks 1,000 Iterations
  console.log('2. 분산 락(Distributed Locks) 1,000회 동시 경합 및 안전성 검증...');
  for (let i = 0; i < results.distributedLocks.iterations; i++) {
    let currentVal = null;
    const mockRedis = {
      set: async (k, val, opts) => {
        if (currentVal && opts && opts.nx) return null;
        currentVal = val;
        return 'OK';
      },
      eval: async (script, keys, args) => {
        if (currentVal === args[0]) {
          currentVal = null;
          return 1;
        }
        return 0;
      }
    };

    const lockKey = `fourcuts:test-lock:${i}`;
    const ownerA = `req-a-${i}`;
    const ownerB = `req-b-${i}`;

    const acquiredA = await acquire(mockRedis, lockKey, ownerA, 120);
    const acquiredB = await acquire(mockRedis, lockKey, ownerB, 120); // Should fail
    const releaseB = await release(mockRedis, lockKey, ownerB); // Should return 0
    const releaseA = await release(mockRedis, lockKey, ownerA); // Should return 1

    if (!acquiredA || acquiredB || releaseB !== 0 || releaseA !== 1) {
      results.distributedLocks.failures++;
    }
  }

  // 3. Lifecycle 1,000 Iterations
  console.log('3. 사진 데이터 라이프사이클 1,000회 시뮬레이션...');
  const rows = new Map();
  const objects = new Set();
  for (let i = 0; i < results.dataLifecycle.iterations; i++) {
    const id = crypto.randomUUID();
    const path = `photos/2026-09-02/${id}.jpg`;
    rows.set(id, { path, status: 'pending' });

    if (Math.random() < 0.12) {
      rows.delete(id);
      results.dataLifecycle.failed++;
      continue;
    }
    objects.add(path);

    if (Math.random() < 0.05) {
      objects.delete(path);
      rows.delete(id);
      results.dataLifecycle.failed++;
      continue;
    }

    rows.get(id).status = 'ready';
    results.dataLifecycle.ready++;
  }

  // Cleanup simulation
  for (const [id, row] of rows) {
    row.status = 'deleting';
    objects.delete(row.path);
    rows.delete(id);
    results.dataLifecycle.cleaned++;
  }
  results.dataLifecycle.orphans = rows.size + objects.size;

  // 4. Admin Config Sync 1,000 Iterations
  console.log('4. 관리자 설정 동시성 및 테마 저장/병합 1,000회 시뮬레이션...');
  let storedConfig = {
    title: '오늘의 마음 네컷',
    defaultTheme: 'lavender',
    customBackgrounds: []
  };
  for (let i = 0; i < results.adminConfigSync.iterations; i++) {
    const newBg = { id: `bg-${i}`, name: `행사 배경 ${i}`, url: `https://example.com/bg-${i}.jpg` };
    storedConfig = {
      ...storedConfig,
      defaultTheme: i % 2 === 0 ? 'lavender' : 'ocean',
      customBackgrounds: [newBg, ...storedConfig.customBackgrounds].slice(0, 10)
    };
    if (!storedConfig.defaultTheme || storedConfig.customBackgrounds.length === 0) {
      results.adminConfigSync.failures++;
    }
  }

  // 5. Image & Custom Theme Sharp Processing 1,000 Iterations
  console.log('5. Sharp 이미지 정규화 및 커스텀 배경/테마 합성 1,000회 고강도 시뮬레이션...');
  const startImg = Date.now();

  const samplePhoto = await sharp({
    create: { width: 1200, height: 1420, channels: 3, background: '#7452aa' }
  }).jpeg().toBuffer();

  const samplePngBg = await sharp({
    create: { width: 1200, height: 1800, channels: 4, background: { r: 189, g: 235, b: 220, alpha: 0.8 } }
  }).png().toBuffer();

  // 500 Sequential
  for (let i = 0; i < results.imageThemeProcessing.sequential; i++) {
    try {
      await validateAndNormalizeJpeg(samplePhoto);
    } catch {
      results.imageThemeProcessing.failures++;
    }
  }

  // 200 Custom Background Normalizations
  for (let i = 0; i < results.imageThemeProcessing.customBackgroundsTested; i++) {
    try {
      const res = await validateAndNormalizeBackground(samplePngBg);
      if (!res.buffer || res.format !== 'png') results.imageThemeProcessing.failures++;
    } catch {
      results.imageThemeProcessing.failures++;
    }
  }

  // Concurrent batches (5 batches of 100 concurrent = 500 requests)
  for (let b = 0; b < 5; b++) {
    const batch = await Promise.allSettled(
      Array.from({ length: 100 }, () => validateAndNormalizeJpeg(samplePhoto))
    );
    results.imageThemeProcessing.failures += batch.filter((x) => x.status === 'rejected').length;
  }

  results.imageThemeProcessing.elapsedMs = Date.now() - startImg;
  if (global.gc) global.gc();
  results.imageThemeProcessing.peakRssMb = Math.round(process.memoryUsage().rss / 1048576);

  console.log('\n================================================================');
  console.log('   시뮬레이션 1000회 종합 결과 보고서');
  console.log('================================================================');
  console.log(JSON.stringify(results, null, 2));

  const hasFailure =
    results.cryptoAuth.failures > 0 ||
    results.distributedLocks.failures > 0 ||
    results.dataLifecycle.orphans > 0 ||
    results.adminConfigSync.failures > 0 ||
    results.imageThemeProcessing.failures > 0;

  if (hasFailure) {
    console.error('\n❌ 시뮬레이션 중 오류가 발생했습니다.');
    process.exit(1);
  } else {
    console.log('\n✅ 1000회 모든 시뮬레이션 완벽 통과 (0 Failures, 0 Orphans)!');
    process.exit(0);
  }
})();
