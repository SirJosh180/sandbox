// Path content lives in the database so admins can edit it from the CMS.
// lib/paths.js holds the defaults used to seed each path the first time
// and when an admin clicks "Reset to defaults".
const crypto = require('node:crypto');
const { query, one } = require('./db');
const { PATHS: DEFAULTS, PATH_IDS } = require('./paths');
const { cleanVideo } = require('./media');

const PANEL_KINDS = ['checklist', 'rituals', 'pipeline'];
const HEX = /^#[0-9a-f]{6}$/i;

async function seedPaths() {
  for (const id of PATH_IDS) {
    await query('INSERT INTO paths (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO NOTHING', [id, JSON.stringify(DEFAULTS[id])]);
  }
}

function hydrate(row) {
  if (!row) return null;
  const d = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
  return { ...d, id: row.id, updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null };
}

async function getPath(id) {
  if (!PATH_IDS.includes(id)) return null;
  return hydrate(await one('SELECT * FROM paths WHERE id = $1', [id]));
}

async function getAllPaths() {
  const rows = await query('SELECT * FROM paths');
  const byId = Object.fromEntries(rows.map((r) => [r.id, hydrate(r)]));
  return PATH_IDS.map((id) => byId[id]).filter(Boolean);
}

const s = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Validate and normalise what the CMS sends. Returns { data, errors }.
function validatePath(id, input, existing) {
  const errors = [];
  const name = s(input.name, 60);
  const code = s(input.code, 8);
  const accent = s(input.accent, 7);
  const mission = s(input.mission, 200);
  if (!name) errors.push('Give the path a name.');
  if (!code) errors.push('Give the path a short code, like PM or FE.');
  if (!HEX.test(accent)) errors.push('Pick an accent colour.');
  if (!mission) errors.push('Write a one-line mission for the path.');

  const tools = (Array.isArray(input.tools) ? input.tools : []).map((t) => s(t, 40)).filter(Boolean).slice(0, 20);

  const p = input.panel || {};
  const kind = PANEL_KINDS.includes(p.kind) ? p.kind : 'checklist';
  const panel = {
    title: s(p.title, 80) || 'Checklist',
    kind,
    items: (Array.isArray(p.items) ? p.items : []).map((i) => ({ label: s(i && i.label, 120), detail: s(i && i.detail, 240) }))
      .filter((i) => i.label).slice(0, 12)
      .map((i) => (kind === 'checklist' ? { label: i.label } : i)),
  };

  const known = new Set((existing?.modules || []).map((m) => m.id));
  const modules = [];
  (Array.isArray(input.modules) ? input.modules : []).slice(0, 40).forEach((m, i) => {
    const title = s(m && m.title, 100);
    if (!title) { errors.push(`Module ${i + 1} needs a title.`); return; }
    const week = Math.max(1, Math.min(52, parseInt(m.week, 10) || 1));
    // keep ids the students' progress is attached to; give new modules a fresh one
    const mid = typeof m.id === 'string' && known.has(m.id) ? m.id : `${id}-${crypto.randomBytes(4).toString('hex')}`;
    let video = null;
    try { video = cleanVideo(m.video); } catch (e) { errors.push(`Module ${i + 1}: ${e.message}`); }
    modules.push({ id: mid, week, title, desc: s(m.desc, 300), deliverable: s(m.deliverable, 100), video });
  });
  if (!modules.length) errors.push('A path needs at least one module.');

  const accentInk = luminance(accent) > 0.45 ? '#10141b' : '#f3efe6';
  return { errors, data: { id, code, name, accent, accentInk, mission, tools, panel, modules } };
}

function luminance(hex) {
  if (!HEX.test(hex)) return 1;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function savePath(id, data) {
  const row = await one('UPDATE paths SET data = $2::jsonb, updated_at = now() WHERE id = $1 RETURNING *', [id, JSON.stringify(data)]);
  return hydrate(row);
}

async function resetPath(id) {
  return savePath(id, DEFAULTS[id]);
}

module.exports = { seedPaths, getPath, getAllPaths, validatePath, savePath, resetPath, PATH_IDS, PANEL_KINDS };
