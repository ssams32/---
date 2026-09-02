function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
function secret(name, min=32) { const value=required(name); if(Buffer.byteLength(value,'utf8')<min) throw new Error(`${name} must contain at least ${min} bytes`); return value; }
function integer(name, fallback, min, max) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}
function config() {
  const publicUrl = required('PUBLIC_URL').replace(/\/$/, '');
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || publicUrl)
    .split(',').map((x) => x.trim().replace(/\/$/, '')).filter(Boolean);
  const from=new Date(required('EVENT_ACTIVE_FROM')), until=new Date(required('EVENT_ACTIVE_UNTIL'));
  if(!Number.isFinite(from.getTime())||!Number.isFinite(until.getTime())||from>=until) throw new Error('Invalid event active window');
  return Object.freeze({
    supabaseUrl: required('SUPABASE_URL'),
    supabaseKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    bucket: process.env.SUPABASE_STORAGE_BUCKET || 'photo-booth-private',
    redisUrl: required('UPSTASH_REDIS_REST_URL'),
    redisToken: required('UPSTASH_REDIS_REST_TOKEN'),
    photoTtlMinutes: integer('PHOTO_TTL_MINUTES', 60, 5, 1440),
    signedUrlTtlSeconds: integer('SIGNED_URL_TTL_SECONDS', 180, 30, 600),
    publicUrl,
    sessionSecret: secret('SESSION_SECRET'),
    downloadSecret: secret('DOWNLOAD_TOKEN_SECRET'),
    kioskActivationSecret: secret('KIOSK_ACTIVATION_SECRET', 8),
    rateLimitHashSecret: secret('RATE_LIMIT_HASH_SECRET'),
    eventActiveFrom: from,
    eventActiveUntil: until,
    cronSecret: secret('CRON_SECRET',16),
    allowedOrigins,
    adminSecret: process.env.ADMIN_SECRET ? secret('ADMIN_SECRET', 16) : secret('KIOSK_ACTIVATION_SECRET', 16),
    adminPassword: process.env.ADMIN_PASSWORD || secret('KIOSK_ACTIVATION_SECRET', 16),
    production: publicUrl.startsWith('https://'),
    maxUploadBytes: 4 * 1024 * 1024,
    maxBackgroundUploadBytes: 8 * 1024 * 1024
  });
}
let cached;
module.exports = { getConfig: () => cached || (cached = config()) };
