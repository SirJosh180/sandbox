// The Express app. Used by local.js for local dev and by api/index.js on Vercel.
const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');
const { query, one } = require('./db');

const IS_PROD = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
const SESSION_DAYS = 7;

const ROLES = ['pm', 'uiux', 'fe', 'be', 'qa', 'devops'];
const LEVELS = ['Beginner', 'Intermediate', 'Experienced'];
const COURSES = ['BS Computer Science', 'BS Information Technology', 'BS Information Systems', 'BS Computer Engineering', 'Multimedia / Digital Arts', 'Other'];
const YEARS = ['1st year', '2nd year', '3rd year', '4th year', '5th year / Graduating'];
const HOURS = ['Under 5 hours', '5–8 hours', '8–12 hours', '12+ hours'];
const STATUSES = ['pending', 'shortlisted', 'accepted', 'rejected'];

// ---------- passwords (scrypt, built into Node) ----------
const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 64, (e, k) => (e ? rej(e) : res(k))));
async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}
async function verifyPassword(pw, stored) {
  const [scheme, saltHex, keyHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const key = await scrypt(pw, Buffer.from(saltHex, 'hex'));
  const expected = Buffer.from(keyHex, 'hex');
  return expected.length === key.length && crypto.timingSafeEqual(key, expected);
}
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------- first admin account (created once, on first request) ----------
let readyPromise;
async function ensureAdmin() {
  const { n } = await one('SELECT COUNT(*)::int AS n FROM admins');
  if (n > 0) return;
  const email = (process.env.ADMIN_EMAIL || 'admin@sandbox.local').trim().toLowerCase();
  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    if (process.env.VERCEL) throw new Error('ADMIN_PASSWORD is not set. Add ADMIN_EMAIL and ADMIN_PASSWORD in Vercel → Settings → Environment Variables, then redeploy.');
    password = crypto.randomBytes(9).toString('base64url');
    console.log(`\n  Created admin account\n  email:    ${email}\n  password: ${password}   (generated, change it after signing in)\n`);
  } else {
    console.log(`Created admin account for ${email}`);
  }
  await query('INSERT INTO admins (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING', [email, await hashPassword(password)]);
}
function ready() {
  if (!readyPromise) readyPromise = ensureAdmin().catch((e) => { readyPromise = null; throw e; });
  return readyPromise;
}

// ---------- app ----------
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '50kb' }));
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  res.set('X-Frame-Options', 'DENY');
  next();
});
app.use('/api', (req, res, next) => ready().then(() => next(), next));

// async route helper so errors reach the error handler
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
function setSessionCookie(res, token, maxAgeSec) {
  const attrs = [`sbx_admin=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSec}`];
  if (IS_PROD) attrs.push('Secure');
  res.set('Set-Cookie', attrs.join('; '));
}

const requireAdmin = h(async (req, res, next) => {
  const token = getCookie(req, 'sbx_admin');
  if (!token) return res.status(401).json({ error: 'Sign in to continue.' });
  const row = await one(`SELECT s.admin_id, s.expires_at, a.email FROM sessions s JOIN admins a ON a.id = s.admin_id WHERE s.token_hash = $1`, [sha256(token)]);
  if (!row || Number(row.expires_at) < Date.now()) {
    if (row) await query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
    return res.status(401).json({ error: 'Your session has ended. Sign in again.' });
  }
  req.admin = { id: row.admin_id, email: row.email };
  next();
});

// rate limiter stored in the database, so it works across serverless instances
function rateLimit({ name, windowMs, max, message }) {
  return h(async (req, res, next) => {
    const key = `${name}:${req.ip}`;
    const now = Date.now();
    const row = await one(
      `INSERT INTO rate_limits (key, hits, reset_at) VALUES ($1, 1, $2)
       ON CONFLICT (key) DO UPDATE SET
         hits = CASE WHEN rate_limits.reset_at < $3 THEN 1 ELSE rate_limits.hits + 1 END,
         reset_at = CASE WHEN rate_limits.reset_at < $3 THEN $2 ELSE rate_limits.reset_at END
       RETURNING hits`,
      [key, now + windowMs, now]
    );
    if (row.hits > max) return res.status(429).json({ error: message });
    next();
  });
}

// ---------- validation ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function validateApplication(body) {
  const errors = {};
  const d = {
    firstName: str(body.firstName, 80),
    lastName: str(body.lastName, 80),
    email: str(body.email, 200).toLowerCase(),
    school: str(body.school, 160),
    course: str(body.course, 80),
    year: str(body.year, 40),
    roles: Array.isArray(body.roles) ? [...new Set(body.roles.filter((r) => ROLES.includes(r)))] : [],
    level: str(body.level, 30),
    skills: Array.isArray(body.skills) ? body.skills.map((s) => str(s, 30)).filter(Boolean).slice(0, 15) : [],
    hours: str(body.hours, 30),
    portfolio: str(body.portfolio, 300),
    motivation: str(body.motivation, 800),
    agree: body.agree === true,
  };
  if (!d.firstName) errors.firstName = 'Enter your first name.';
  if (!d.lastName) errors.lastName = 'Enter your last name.';
  if (!EMAIL_RE.test(d.email)) errors.email = 'Enter a valid email address.';
  if (!d.school) errors.school = 'Enter the name of your school.';
  if (!COURSES.includes(d.course)) errors.course = 'Choose your course.';
  if (!YEARS.includes(d.year)) errors.year = 'Choose your year level.';
  if (d.roles.length < 1 || d.roles.length > 3) errors.roles = 'Pick 1 to 3 roles.';
  if (!LEVELS.includes(d.level)) errors.level = 'Choose your experience level.';
  if (!HOURS.includes(d.hours)) errors.hours = 'Choose your weekly hours.';
  if (d.portfolio) {
    try { const u = new URL(d.portfolio); if (!/^https?:$/.test(u.protocol)) throw 0; }
    catch { errors.portfolio = 'Use a full link that starts with https://'; }
  }
  if (d.motivation.length < 80) errors.motivation = 'Write at least 80 characters about why you want to join.';
  if (!d.agree) errors.agree = 'Please confirm you can attend weekly meetings.';
  return { d, errors };
}

const newRef = () => `SBX-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

function rowToApp(r) {
  return {
    id: r.id, ref: r.ref, firstName: r.first_name, lastName: r.last_name, email: r.email,
    school: r.school, course: r.course, year: r.year, roles: r.roles, level: r.level,
    skills: r.skills, hours: r.hours, portfolio: r.portfolio, motivation: r.motivation,
    status: r.status, notes: r.notes,
    createdAt: new Date(r.created_at).toISOString(), updatedAt: new Date(r.updated_at).toISOString(),
  };
}

// ---------- public API ----------
app.post('/api/applications',
  rateLimit({ name: 'apply', windowMs: 60 * 60 * 1000, max: 10, message: 'Too many applications from this connection. Try again in an hour.' }),
  h(async (req, res) => {
    if (typeof req.body?.website === 'string' && req.body.website) return res.status(201).json({ ref: newRef() }); // honeypot
    const { d, errors } = validateApplication(req.body || {});
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Some fields need attention.', fields: errors });
    const dup = await one(`SELECT ref FROM applications WHERE email = $1 AND status IN ('pending','shortlisted')`, [d.email]);
    if (dup) return res.status(409).json({ error: `An application with this email is already being reviewed (reference ${dup.ref}).`, fields: { email: 'This email already has an application under review.' } });
    for (let attempt = 0; attempt < 5; attempt++) {
      const ref = newRef();
      const row = await one(
        `INSERT INTO applications (ref, first_name, last_name, email, school, course, year, roles, level, skills, hours, portfolio, motivation)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb,$11,$12,$13) ON CONFLICT (ref) DO NOTHING RETURNING ref`,
        [ref, d.firstName, d.lastName, d.email, d.school, d.course, d.year, JSON.stringify(d.roles), d.level, JSON.stringify(d.skills), d.hours, d.portfolio, d.motivation]
      );
      if (row) return res.status(201).json({ ref: row.ref });
    }
    throw new Error('Could not generate a unique reference.');
  }));

// ---------- admin auth ----------
app.post('/api/admin/login',
  rateLimit({ name: 'login', windowMs: 15 * 60 * 1000, max: 10, message: 'Too many sign-in attempts. Wait 15 minutes and try again.' }),
  h(async (req, res) => {
    const email = str(req.body?.email, 200).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const admin = await one('SELECT * FROM admins WHERE email = $1', [email]);
    if (!admin || !(await verifyPassword(password, admin.password_hash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
    const token = crypto.randomBytes(32).toString('base64url');
    await query('DELETE FROM sessions WHERE expires_at < $1', [Date.now()]);
    await query('INSERT INTO sessions (token_hash, admin_id, expires_at) VALUES ($1,$2,$3)', [sha256(token), admin.id, Date.now() + SESSION_DAYS * 864e5]);
    setSessionCookie(res, token, SESSION_DAYS * 86400);
    res.json({ email: admin.email });
  }));

app.post('/api/admin/logout', h(async (req, res) => {
  const token = getCookie(req, 'sbx_admin');
  if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
  setSessionCookie(res, '', 0);
  res.json({ ok: true });
}));

app.get('/api/admin/me', requireAdmin, (req, res) => res.json({ email: req.admin.email }));

app.post('/api/admin/password', requireAdmin, h(async (req, res) => {
  const { current, next } = req.body || {};
  const admin = await one('SELECT * FROM admins WHERE id = $1', [req.admin.id]);
  if (!(await verifyPassword(String(current || ''), admin.password_hash))) return res.status(400).json({ error: 'Your current password is incorrect.' });
  if (typeof next !== 'string' || next.length < 10) return res.status(400).json({ error: 'Use at least 10 characters for the new password.' });
  await query('UPDATE admins SET password_hash = $1 WHERE id = $2', [await hashPassword(next), admin.id]);
  await query('DELETE FROM sessions WHERE admin_id = $1 AND token_hash <> $2', [admin.id, sha256(getCookie(req, 'sbx_admin'))]);
  res.json({ ok: true });
}));

// ---------- admin data ----------
function buildFilter(q) {
  const where = [], params = [];
  const p = (v) => { params.push(v); return `$${params.length}`; };
  if (q.status && STATUSES.includes(q.status)) where.push(`status = ${p(q.status)}`);
  if (q.role && ROLES.includes(q.role)) where.push(`roles @> ${p(JSON.stringify([q.role]))}::jsonb`);
  if (q.q) {
    const like = p(`%${String(q.q).trim().slice(0, 100).replace(/[%_\\]/g, (c) => '\\' + c)}%`);
    where.push(`(first_name || ' ' || last_name ILIKE ${like} OR email ILIKE ${like} OR school ILIKE ${like} OR ref ILIKE ${like} OR skills::text ILIKE ${like})`);
  }
  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

app.get('/api/admin/applications', requireAdmin, h(async (req, res) => {
  const { sql, params } = buildFilter(req.query);
  const sort = req.query.sort === 'oldest' ? 'ASC' : 'DESC';
  const rows = await query(`SELECT * FROM applications ${sql} ORDER BY created_at ${sort}, id ${sort} LIMIT 1000`, params);
  const stats = { total: 0 };
  for (const s of STATUSES) stats[s] = 0;
  for (const r of await query('SELECT status, COUNT(*)::int AS n FROM applications GROUP BY status')) { stats[r.status] = r.n; stats.total += r.n; }
  const roleCounts = {};
  for (const r of await query(`SELECT role, COUNT(*)::int AS n FROM applications, jsonb_array_elements_text(roles) AS role GROUP BY role`)) roleCounts[r.role] = r.n;
  res.json({ applications: rows.map(rowToApp), stats, roleCounts });
}));

app.get('/api/admin/applications.csv', requireAdmin, h(async (req, res) => {
  const { sql, params } = buildFilter(req.query);
  const rows = (await query(`SELECT * FROM applications ${sql} ORDER BY created_at DESC`, params)).map(rowToApp);
  const cols = ['ref', 'status', 'createdAt', 'firstName', 'lastName', 'email', 'school', 'course', 'year', 'roles', 'level', 'skills', 'hours', 'portfolio', 'motivation', 'notes'];
  const cell = (v) => {
    let s = Array.isArray(v) ? v.join('; ') : String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n');
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="sandbox-applications-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + csv);
}));

const idParam = (req) => (/^\d+$/.test(req.params.id) ? Number(req.params.id) : -1);

app.get('/api/admin/applications/:id', requireAdmin, h(async (req, res) => {
  const r = await one('SELECT * FROM applications WHERE id = $1', [idParam(req)]);
  if (!r) return res.status(404).json({ error: 'Application not found.' });
  res.json(rowToApp(r));
}));

app.patch('/api/admin/applications/:id', requireAdmin, h(async (req, res) => {
  const r = await one('SELECT * FROM applications WHERE id = $1', [idParam(req)]);
  if (!r) return res.status(404).json({ error: 'Application not found.' });
  const status = req.body?.status ?? r.status;
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.slice(0, 2000) : r.notes;
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status.' });
  const u = await one(`UPDATE applications SET status = $1, notes = $2, updated_at = now() WHERE id = $3 RETURNING *`, [status, notes, r.id]);
  res.json(rowToApp(u));
}));

app.delete('/api/admin/applications/:id', requireAdmin, h(async (req, res) => {
  const r = await one('DELETE FROM applications WHERE id = $1 RETURNING id', [idParam(req)]);
  if (!r) return res.status(404).json({ error: 'Application not found.' });
  res.json({ ok: true });
}));

// ---------- pages (local dev; on Vercel, static files are served by the CDN) ----------
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'index.html')));
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request body.' });
  console.error(err);
  const setup = /DATABASE_URL|ADMIN_PASSWORD/.test(err.message);
  res.status(500).json({ error: setup ? `Server setup is incomplete: ${err.message}` : 'Something went wrong on our side. Try again.' });
});

module.exports = app;
