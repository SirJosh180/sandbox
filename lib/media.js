// Module videos.
// - On Vercel, admins upload straight from the browser to Vercel Blob (BLOB_READ_WRITE_TOKEN),
//   so large videos never pass through the 4.5 MB serverless request limit.
// - Locally (no token, not on Vercel), uploads stream to ./data/uploads and are served at /uploads.
// Admins can also paste a YouTube or Vimeo link instead of uploading.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_MB = Number(process.env.VIDEO_MAX_MB) || 500;
const MAX_BYTES = MAX_MB * 1024 * 1024;
const TYPES = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/x-m4v': 'm4v' };
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'data', 'uploads');

const BLOB_URL = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/[\w\-./%]+$/i;
const LOCAL_URL = /^\/uploads\/[a-f0-9]{24}\.(mp4|webm|mov|m4v)$/;

function uploadMode() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return 'blob';
  if (process.env.VERCEL) return 'none';
  return 'local';
}

// Turn a pasted YouTube or Vimeo link into { kind, id, url }, or null.
function parseVideoLink(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.replace(/^(www|m)\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else { const m = u.pathname.match(/^\/(embed|shorts|live)\/([\w-]+)/); if (m) id = m[2]; }
  }
  if (id && /^[\w-]{11}$/.test(id)) return { kind: 'youtube', id, url: `https://www.youtube.com/watch?v=${id}` };
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const m = u.pathname.match(/(?:^|\/)(\d{6,12})(?:\/|$)/);
    if (m) return { kind: 'vimeo', id: m[1], url: `https://vimeo.com/${m[1]}` };
  }
  return null;
}

// Validate a module's video as sent by the CMS. Returns the cleaned value, null, or throws a message.
function cleanVideo(v) {
  if (!v || typeof v !== 'object') return null;
  if (v.kind === 'file') {
    const url = typeof v.url === 'string' ? v.url.trim() : '';
    if (!BLOB_URL.test(url) && !LOCAL_URL.test(url)) throw new Error('One of the uploaded videos has an unexpected address. Upload it again.');
    const name = typeof v.name === 'string' ? v.name.trim().slice(0, 120) : '';
    const size = Number.isFinite(Number(v.size)) ? Math.max(0, Math.round(Number(v.size))) : 0;
    return { kind: 'file', url, name, size };
  }
  if (v.kind === 'youtube' || v.kind === 'vimeo') {
    const parsed = parseVideoLink(v.url || '');
    if (!parsed) throw new Error('One of the video links isn’t a YouTube or Vimeo link.');
    return parsed;
  }
  return null;
}

// Local uploads: stream the raw request body to disk with a size cap.
function saveLocalUpload(req) {
  return new Promise((resolve, reject) => {
    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const ext = TYPES[type];
    if (!ext) return reject(Object.assign(new Error('Upload an MP4, WebM or MOV video.'), { status: 415 }));
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > MAX_BYTES) return reject(Object.assign(new Error(`Videos can be up to ${MAX_MB} MB.`), { status: 413 }));
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const file = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
    const dest = path.join(UPLOAD_DIR, file);
    const out = fs.createWriteStream(dest);
    let bytes = 0; let failed = false;
    const fail = (err) => { if (failed) return; failed = true; out.destroy(); fs.rm(dest, { force: true }, () => {}); reject(err); };
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BYTES) { fail(Object.assign(new Error(`Videos can be up to ${MAX_MB} MB.`), { status: 413 })); req.destroy(); }
    });
    req.on('error', fail);
    out.on('error', fail);
    out.on('finish', () => { if (!failed) resolve({ url: `/uploads/${file}`, size: bytes }); });
    req.pipe(out);
  });
}

// Delete videos that are no longer used by any module (best effort).
async function removeVideos(urls) {
  const blobs = urls.filter((u) => BLOB_URL.test(u));
  const locals = urls.filter((u) => LOCAL_URL.test(u));
  for (const u of locals) fs.rm(path.join(UPLOAD_DIR, path.basename(u)), { force: true }, () => {});
  if (blobs.length && process.env.BLOB_READ_WRITE_TOKEN) {
    try { await require('@vercel/blob').del(blobs); } catch (e) { console.warn('Could not delete old videos from Blob:', e.message); }
  }
}

const fileUrls = (p) => (p?.modules || []).map((m) => m.video).filter((v) => v && v.kind === 'file').map((v) => v.url);

module.exports = { MAX_MB, MAX_BYTES, TYPES, UPLOAD_DIR, uploadMode, parseVideoLink, cleanVideo, saveLocalUpload, removeVideos, fileUrls };
