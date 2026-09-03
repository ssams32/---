const crypto = require('crypto');

function optional(name, fallback = '') {
  return process.env[name] || fallback;
}

function secret(name, fallback, min = 32) {
  const value = process.env[name] || fallback;
  if (!value || Buffer.byteLength(value, 'utf8') < min) {
    return crypto.randomBytes(32).toString('hex');
  }
  return value;
}

function integer(name, fallback, min, max) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    return fallback;
  }
  return value;
}

function config() {
  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.trim()}` : '';
  const publicUrl = (process.env.PUBLIC_URL || vercelUrl || 'http://localhost:3000').trim().replace(/\/$/, '');
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || publicUrl)
    .split(',').map((x) => x.trim().replace(/\/$/, '')).filter(Boolean);

  const fromStr = process.env.EVENT_ACTIVE_FROM || '2026-01-01T00:00:00+09:00';
  const untilStr = process.env.EVENT_ACTIVE_UNTIL || '2030-12-31T23:59:59+09:00';
  let from = new Date(fromStr);
  let until = new Date(untilStr);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(until.getTime()) || from >= until) {
    from = new Date('2026-01-01T00:00:00+09:00');
    until = new Date('2030-12-31T23:59:59+09:00');
  }

  const defaultSecret = 'maeum-fourcuts-default-secure-secret-key-32chars';

  return Object.freeze({
    supabaseUrl: optional('SUPABASE_URL', 'https://dummy.supabase.co'),
    supabaseKey: optional('SUPABASE_SERVICE_ROLE_KEY', 'dummy-service-role-key-dummy-service-role-key'),
    bucket: process.env.SUPABASE_STORAGE_BUCKET || 'photo-booth-private',
    redisUrl: optional('UPSTASH_REDIS_REST_URL', 'https://dummy.upstash.io'),
    redisToken: optional('UPSTASH_REDIS_REST_TOKEN', 'dummy-token'),
    photoTtlMinutes: integer('PHOTO_TTL_MINUTES', 60, 5, 1440),
    signedUrlTtlSeconds: integer('SIGNED_URL_TTL_SECONDS', 180, 30, 600),
    publicUrl,
    sessionSecret: secret('SESSION_SECRET', defaultSecret + '-session'),
    downloadSecret: secret('DOWNLOAD_TOKEN_SECRET', defaultSecret + '-download'),
    kioskActivationSecret: secret('KIOSK_ACTIVATION_SECRET', 'kiosk-secret-key-2026', 8),
    rateLimitHashSecret: secret('RATE_LIMIT_HASH_SECRET', defaultSecret + '-ratelimit'),
    eventActiveFrom: from,
    eventActiveUntil: until,
    cronSecret: secret('CRON_SECRET', 'cron-cleanup-secret-key-16', 16),
    allowedOrigins,
    adminSecret: process.env.ADMIN_SECRET ? secret('ADMIN_SECRET', defaultSecret + '-admin', 16) : secret('KIOSK_ACTIVATION_SECRET', 'kiosk-secret-key-2026', 16),
    adminPassword: process.env.ADMIN_PASSWORD || 'admin2026!',
    production: publicUrl.startsWith('https://'),
    maxUploadBytes: 4 * 1024 * 1024,
    maxBackgroundUploadBytes: 8 * 1024 * 1024
  });
}

let cached;
module.exports = { getConfig: () => cached || (cached = config()) };
