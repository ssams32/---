// Google Drive backup for completed photo composites.
//
// Uploads a copy of each finished photo to the owner's Google Drive
// (folder: "마음네컷 백업/YYYY-MM-DD") using an OAuth refresh token.
//
// Active only when GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and
// GOOGLE_DRIVE_REFRESH_TOKEN are all set. Without them every function is a
// silent no-op, so local/dev/test environments are unaffected. A backup
// failure never fails the photo flow (see backupPhotoQuietly).
const log = require('./logger');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
const ROOT_FOLDER_NAME = '마음네컷 백업';

let cachedToken = null; // { accessToken, expiresAt }
let cachedRootId = null;
const cachedDateFolders = new Map();

function driveConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN || '';
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken };
}

function isDriveBackupEnabled() {
  return !!driveConfig();
}

async function getAccessToken(cfg) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30000) {
    return cachedToken.accessToken;
  }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
      grant_type: 'refresh_token'
    }),
    signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) throw new Error('drive token exchange failed: ' + res.status);
  const data = await res.json();
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000
  };
  return cachedToken.accessToken;
}

async function findFolder(token, name, parentId) {
  const escaped = name.replace(/'/g, "\\'");
  let q = `mimeType='application/vnd.google-apps.folder' and name='${escaped}' and trashed=false`;
  if (parentId) q += ` and '${parentId}' in parents`;
  const url = `${FILES_URL}?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) throw new Error('drive folder search failed: ' + res.status);
  const data = await res.json();
  return data.files && data.files[0] ? data.files[0].id : null;
}

async function createFolder(token, name, parentId) {
  const res = await fetch(FILES_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {})
    }),
    signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) throw new Error('drive folder create failed: ' + res.status);
  const data = await res.json();
  return data.id;
}

async function ensureFolder(token, name, parentId) {
  return (await findFolder(token, name, parentId)) || createFolder(token, name, parentId);
}

async function backupPhotoToDrive(buffer, filename) {
  const cfg = driveConfig();
  if (!cfg) return false;
  const token = await getAccessToken(cfg);
  if (!cachedRootId) {
    cachedRootId = await ensureFolder(token, ROOT_FOLDER_NAME, null);
  }
  const dateName = new Date().toISOString().slice(0, 10);
  if (!cachedDateFolders.has(dateName)) {
    cachedDateFolders.set(dateName, await ensureFolder(token, dateName, cachedRootId));
  }
  const folderId = cachedDateFolders.get(dateName);

  const boundary = 'maeum-' + Date.now().toString(36);
  const meta = JSON.stringify({ name: filename, parents: [folderId] });
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`
    ),
    buffer,
    Buffer.from(`\r\n--${boundary}--`)
  ]);
  const res = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body,
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error('drive upload failed: ' + res.status);
  return true;
}

// Never throws into the photo flow: logs and reports success/failure.
async function backupPhotoQuietly(buffer, filename) {
  try {
    const ok = await backupPhotoToDrive(buffer, filename);
    if (ok) log.info('drive_backup_done', { filename });
    return ok;
  } catch (e) {
    log.warn('drive_backup_failed', { filename, error: String((e && e.message) || e) });
    return false;
  }
}

module.exports = {
  isDriveBackupEnabled,
  backupPhotoToDrive,
  backupPhotoQuietly,
  _resetCacheForTest: () => {
    cachedToken = null;
    cachedRootId = null;
    cachedDateFolders.clear();
  }
};
