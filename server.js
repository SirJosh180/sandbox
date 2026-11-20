const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');
const db = require('./db');

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const SESSION_DAYS = 7;

const ROLES = ['pm', 'uiux', 'fe', 'be', 'qa', 'devops'];
const LEVELS = ['Beginner', 'Intermediate', 'Experienced'];
const COURSES = ['BS Computer Science', 'BS Information Technology', 'BS Information Systems', 'BS Computer Engineering', 'Multimedia / Digital Arts', 'Other'];
const YEARS = ['1st year', '2nd year', '3rd year', '4th year', '5th year / Graduating'];
const HOURS = ['Under 5 hours', '5–8 hours', '8–12 hours', '12+ hours'];
const STATUSES = ['pending', 'shortlisted', 'accepted', 'rejected'];

// ---------- passwords (scrypt, built into Node) ----------
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}
function verifyPassword(pw, stored) {
  const [scheme, saltHex, keyHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const key = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(keyHex, 'hex');
  return expected.length === key.length && crypto.timingSafeEqual(key, expected);
}
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------- first admin account ----------
(function seedAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM admins').get().n;
  if (count > 0) return;
  const email = (process.env.ADMIN_EMAIL || 'admin@sandbox.local').trim().toLowerCase();
  let password = process.env.ADMIN_PASSWORD;
  let generated = false;
  if (!password) { password = crypto.randomBytes(9).toString('base64url'); generated = true; }
  db.prepare('INSERT INTO admins (email, password_hash) VALUES (?, ?)').run(email, hashPassword(password));
  console.log('\n  Created admin account');
  console.log(`  email:    ${email}`);
  if (generated) console.log(`  password: ${password}   (generated, change it after signing in)`);
  else console.log('  password: (from ADMIN_PASSWORD)');
  console.log('');
})();

// ---------- app ----------
const app = express();
app.disable('x-powered-by');
if (IS_PROD) app.set('trust proxy', 1);
app.use(express.json({ limit: '50kb' }));
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  res.set('X-Frame-Options', 'DENY');
  next();
});

// cookies (tiny parser, so we don't need another dependency)
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

function requireAdmin(req, res, next) {
  const token = getCookie(req, 'sbx_admin');
  if (!token) return res.status(401).json({ error: 'Sign in to continue.' });
  const row = db.prepare(`SELECT s.admin_id, s.expires_at, a.email FROM sessions s JOIN admins a ON a.id = s.admin_id WHERE s.token_hash = ?`).get(sha256(token));
  if (!row || row.expires_at < Date.now()) {
    if (row) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    return res.status(401).json({ error: 'Your session has ended. Sign in again.' });
  }
  req.admin = { id: row.admin_id, email: row.email };
  next();
}

// simple in-memory rate limiter
function rateLimit({ windowMs, max, message }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    const rec = hits.get(key);
    if (!rec || now > rec.reset) hits.set(key, { n: 1, reset: now + windowMs });
    else if (++rec.n > max) return res.status(429).json({ error: message });
    next();
  };
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

function newRef() {
  const year = new Date().getFullYear();
  for (;;) {
    const ref = `SBX-${year}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    if (!db.prepare('SELECT 1 FROM applications WHERE ref = ?').get(ref)) return ref;
  }
}

function rowToApp(r) {
  return {
    id: r.id, ref: r.ref, firstName: r.first_name, lastName: r.last_name, email: r.email,
    school: r.school, course: r.course, year: r.year, roles: JSON.parse(r.roles), level: r.level,
    skills: JSON.parse(r.skills), hours: r.hours, portfolio: r.portfolio, motivation: r.motivation,
    status: r.status, notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

// ---------- public API ----------
app.post('/api/applications',
  rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: 'Too many applications from this connection. Try again in an hour.' }),
  (req, res) => {
    if (typeof req.body.website === 'string' && req.body.website) return res.status(201).json({ ref: newRef() }); // honeypot
    const { d, errors } = validateApplication(req.body || {});
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Some fields need attention.', fields: errors });
    const dup = db.prepare(`SELECT ref FROM applications WHERE email = ? AND status IN ('pending','shortlisted')`).get(d.email);
    if (dup) return res.status(409).json({ error: `An application with this email is already being reviewed (reference ${dup.ref}).`, fields: { email: 'This email already has an application under review.' } });
    const ref = newRef();
    db.prepare(`INSERT INTO applications (ref, first_name, last_name, email, school, course, year, roles, level, skills, hours, portfolio, motivation)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(ref, d.firstName, d.lastName, d.email, d.school, d.course, d.year, JSON.stringify(d.roles), d.level, JSON.stringify(d.skills), d.hours, d.portfolio, d.motivation);
    res.status(201).json({ ref });
  });

// ---------- admin auth ----------
app.post('/api/admin/login',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many sign-in attempts. Wait 15 minutes and try again.' }),
  (req, res) => {
    const email = str(req.body?.email, 200).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
    if (!admin || !verifyPassword(password, admin.password_hash)) return res.status(401).json({ error: 'Email or password is incorrect.' });
    const token = crypto.randomBytes(32).toString('base64url');
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    db.prepare('INSERT INTO sessions (token_hash, admin_id, expires_at) VALUES (?,?,?)').run(sha256(token), admin.id, Date.now() + SESSION_DAYS * 864e5);
    setSessionCookie(res, token, SESSION_DAYS * 86400);
    res.json({ email: admin.email });
  });

app.post('/api/admin/logout', (req, res) => {
  const token = getCookie(req, 'sbx_admin');
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  setSessionCookie(res, '', 0);
  res.json({ ok: true });
});

app.get('/api/admin/me', requireAdmin, (req, res) => res.json({ email: req.admin.email }));

app.post('/api/admin/password', requireAdmin, (req, res) => {
  const { current, next } = req.body || {};
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
  if (!verifyPassword(String(current || ''), admin.password_hash)) return res.status(400).json({ error: 'Your current password is incorrect.' });
  if (typeof next !== 'string' || next.length < 10) return res.status(400).json({ error: 'Use at least 10 characters for the new password.' });
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hashPassword(next), admin.id);
  const token = getCookie(req, 'sbx_admin');
  db.prepare('DELETE FROM sessions WHERE admin_id = ? AND token_hash != ?').run(admin.id, sha256(token));
  res.json({ ok: true });
});

// ---------- admin data ----------
function buildFilter(q) {
  const where = [], params = [];
  if (q.status && STATUSES.includes(q.status)) { where.push('status = ?'); params.push(q.status); }
  if (q.role && ROLES.includes(q.role)) { where.push(`EXISTS (SELECT 1 FROM json_each(applications.roles) WHERE value = ?)`); params.push(q.role); }
  if (q.q) {
    const like = `%${String(q.q).trim().slice(0, 100).replace(/[%_\\]/g, (c) => '\\' + c)}%`;
    where.push(`(first_name || ' ' || last_name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR school LIKE ? ESCAPE '\\' OR ref LIKE ? ESCAPE '\\' OR skills LIKE ? ESCAPE '\\')`);
    params.push(like, like, like, like, like);
  }
  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

app.get('/api/admin/applications', requireAdmin, (req, res) => {
  const { sql, params } = buildFilter(req.query);
  const sort = req.query.sort === 'oldest' ? 'ASC' : 'DESC';
  const rows = db.prepare(`SELECT * FROM applications ${sql} ORDER BY created_at ${sort}, id ${sort} LIMIT 1000`).all(...params);
  const stats = { total: 0 };
  for (const s of STATUSES) stats[s] = 0;
  for (const r of db.prepare('SELECT status, COUNT(*) AS n FROM applications GROUP BY status').all()) { stats[r.status] = r.n; stats.total += r.n; }
  const roleCounts = {};
  for (const r of db.prepare(`SELECT value AS role, COUNT(*) AS n FROM applications, json_each(applications.roles) GROUP BY value`).all()) roleCounts[r.role] = r.n;
  res.json({ applications: rows.map(rowToApp), stats, roleCounts });
});

app.get('/api/admin/applications.csv', requireAdmin, (req, res) => {
  const { sql, params } = buildFilter(req.query);
  const rows = db.prepare(`SELECT * FROM applications ${sql} ORDER BY created_at DESC`).all(...params).map(rowToApp);
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
});

app.get('/api/admin/applications/:id', requireAdmin, (req, res) => {
  const r = db.prepare('SELECT * FROM applications WHERE id = ?').get(Number(req.params.id));
  if (!r) return res.status(404).json({ error: 'Application not found.' });
  res.json(rowToApp(r));
});

app.patch('/api/admin/applications/:id', requireAdmin, (req, res) => {
  const r = db.prepare('SELECT * FROM applications WHERE id = ?').get(Number(req.params.id));
  if (!r) return res.status(404).json({ error: 'Application not found.' });
  const status = req.body?.status ?? r.status;
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.slice(0, 2000) : r.notes;
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status.' });
  db.prepare(`UPDATE applications SET status = ?, notes = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(status, notes, r.id);
  res.json(rowToApp(db.prepare('SELECT * FROM applications WHERE id = ?').get(r.id)));
});

app.delete('/api/admin/applications/:id', requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM applications WHERE id = ?').run(Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'Application not found.' });
  res.json({ ok: true });
});

// ---------- pages ----------
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request body.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Try again.' });
});

app.listen(PORT, () => console.log(`SandBox running at http://localhost:${PORT}  (admin: http://localhost:${PORT}/admin)`));
