// The Express app. Used by local.js for local dev and by api/index.js on Vercel.
const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');
const { query, one } = require('./db');
const { seedPaths, getPath, getAllPaths, validatePath, savePath, resetPath, PATH_IDS } = require('./pathStore');
const media = require('./media');
const work = require('./work');

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
  await seedPaths();
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
function setCookie(res, name, token, maxAgeSec) {
  const attrs = [`${name}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSec}`];
  if (IS_PROD) attrs.push('Secure');
  res.append('Set-Cookie', attrs.join('; '));
}
const setSessionCookie = (res, token, maxAgeSec) => setCookie(res, 'sbx_admin', token, maxAgeSec);
const setStudentCookie = (res, token, maxAgeSec) => setCookie(res, 'sbx_student', token, maxAgeSec);
async function startStudentSession(res, studentId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await query('DELETE FROM student_sessions WHERE expires_at < $1', [Date.now()]);
  await query('INSERT INTO student_sessions (token_hash, student_id, expires_at) VALUES ($1,$2,$3)', [sha256(token), studentId, Date.now() + SESSION_DAYS * 864e5]);
  setStudentCookie(res, token, SESSION_DAYS * 86400);
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
    status: r.status, notes: r.notes, assignedPath: r.assigned_path || null,
    hasAccount: r.student_id === undefined ? undefined : r.student_id != null,
    studentId: r.student_id ?? undefined,
    createdAt: new Date(r.created_at).toISOString(), updatedAt: new Date(r.updated_at).toISOString(),
  };
}

// ---------- public API ----------
app.post('/api/applications',
  rateLimit({ name: 'apply', windowMs: 60 * 60 * 1000, max: 10, message: 'Too many applications from this connection. Try again in an hour.' }),
  h(async (req, res) => {
    if (typeof req.body?.website === 'string' && req.body.website) return res.status(201).json({ ref: newRef() }); // honeypot
    const { d, errors } = validateApplication(req.body || {});
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (password && (password.length < 8 || password.length > 200)) errors.password = 'Use at least 8 characters for your password.';
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
      if (row) {
        let account = false;
        const existing = await one('SELECT id FROM students WHERE email = $1', [d.email]);
        if (existing) account = 'existing';
        else if (password) {
          const st = await one('INSERT INTO students (email, password_hash) VALUES ($1,$2) ON CONFLICT (email) DO NOTHING RETURNING id', [d.email, await hashPassword(password)]);
          if (st) { await startStudentSession(res, st.id); account = 'created'; }
        }
        return res.status(201).json({ ref: row.ref, account });
      }
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
  const rows = await query(`SELECT *, (SELECT s.id FROM students s WHERE s.email = applications.email) AS student_id FROM applications ${sql} ORDER BY created_at ${sort}, id ${sort} LIMIT 1000`, params);
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
  const r = await one('SELECT *, (SELECT s.id FROM students s WHERE s.email = applications.email) AS student_id FROM applications WHERE id = $1', [idParam(req)]);
  if (!r) return res.status(404).json({ error: 'Application not found.' });
  res.json(rowToApp(r));
}));

app.patch('/api/admin/applications/:id', requireAdmin, h(async (req, res) => {
  const r = await one('SELECT * FROM applications WHERE id = $1', [idParam(req)]);
  if (!r) return res.status(404).json({ error: 'Application not found.' });
  const status = req.body?.status ?? r.status;
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.slice(0, 2000) : r.notes;
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status.' });
  let path = r.assigned_path;
  if (req.body && 'assignedPath' in req.body) {
    path = req.body.assignedPath || null;
    if (path !== null && !PATH_IDS.includes(path)) return res.status(400).json({ error: 'Unknown path.' });
  }
  const u = await one(`UPDATE applications SET status = $1, notes = $2, assigned_path = $3, updated_at = now() WHERE id = $4 RETURNING *, (SELECT s.id FROM students s WHERE s.email = applications.email) AS student_id`, [status, notes, path, r.id]);
  res.json(rowToApp(u));
}));

app.delete('/api/admin/applications/:id', requireAdmin, h(async (req, res) => {
  const r = await one('DELETE FROM applications WHERE id = $1 RETURNING id', [idParam(req)]);
  if (!r) return res.status(404).json({ error: 'Application not found.' });
  res.json({ ok: true });
}));

// ---------- student portal ----------
const requireStudent = h(async (req, res, next) => {
  const token = getCookie(req, 'sbx_student');
  if (!token) return res.status(401).json({ error: 'Sign in to see your application.' });
  const row = await one('SELECT s.id, s.email, ss.expires_at FROM student_sessions ss JOIN students s ON s.id = ss.student_id WHERE ss.token_hash = $1', [sha256(token)]);
  if (!row || Number(row.expires_at) < Date.now()) {
    if (row) await query('DELETE FROM student_sessions WHERE token_hash = $1', [sha256(token)]);
    return res.status(401).json({ error: 'Your session has ended. Sign in again.' });
  }
  req.student = { id: row.id, email: row.email };
  next();
});

app.post('/api/student/login',
  rateLimit({ name: 'slogin', windowMs: 15 * 60 * 1000, max: 10, message: 'Too many sign-in attempts. Wait 15 minutes and try again.' }),
  h(async (req, res) => {
    const email = str(req.body?.email, 200).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const st = await one('SELECT * FROM students WHERE email = $1', [email]);
    if (!st || !(await verifyPassword(password, st.password_hash))) return res.status(401).json({ error: 'Email or password is incorrect. First time here? Use "Set up my account" with your reference number.' });
    await startStudentSession(res, st.id);
    res.json({ email: st.email });
  }));

// first-time setup for students who applied without a password: prove ownership with email + reference number
app.post('/api/student/claim',
  rateLimit({ name: 'claim', windowMs: 15 * 60 * 1000, max: 10, message: 'Too many attempts. Wait 15 minutes and try again.' }),
  h(async (req, res) => {
    const email = str(req.body?.email, 200).toLowerCase();
    const ref = str(req.body?.ref, 40).toUpperCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (password.length < 8 || password.length > 200) return res.status(400).json({ error: 'Use at least 8 characters for your password.', fields: { password: 'Use at least 8 characters.' } });
    const app_ = await one('SELECT id FROM applications WHERE email = $1 AND ref = $2', [email, ref]);
    if (!app_) return res.status(400).json({ error: 'We couldn’t find an application with that email and reference number. Check your confirmation screen or email.' });
    const st = await one('INSERT INTO students (email, password_hash) VALUES ($1,$2) ON CONFLICT (email) DO NOTHING RETURNING id', [email, await hashPassword(password)]);
    if (!st) return res.status(409).json({ error: 'This email already has an account. Sign in with your password instead.' });
    await startStudentSession(res, st.id);
    res.status(201).json({ email });
  }));

app.post('/api/student/logout', h(async (req, res) => {
  const token = getCookie(req, 'sbx_student');
  if (token) await query('DELETE FROM student_sessions WHERE token_hash = $1', [sha256(token)]);
  setStudentCookie(res, '', 0);
  res.json({ ok: true });
}));

app.get('/api/student/me', requireStudent, h(async (req, res) => {
  const rows = await query('SELECT * FROM applications WHERE email = $1 ORDER BY created_at DESC', [req.student.email]);
  const apps = rows.map((r) => { const a = rowToApp(r); delete a.notes; delete a.hasAccount; delete a.studentId; delete a.id; return a; });
  const current = apps[0] || null;
  const path = current && current.status === 'accepted' && current.assignedPath ? await getPath(current.assignedPath) : null;
  const progress = path ? (await query('SELECT module_id FROM module_progress WHERE student_id = $1', [req.student.id])).map((r) => r.module_id) : [];
  const submissions = path ? await work.submissionsFor(req.student.id) : {};
  const projects = current && current.status === 'accepted' ? await work.projectsFor(req.student.id) : [];
  res.json({ email: req.student.email, studentId: req.student.id, application: current, previous: apps.slice(1).map((a) => ({ ref: a.ref, status: a.status, createdAt: a.createdAt })), path, progress, submissions, projects });
}));

app.put('/api/student/modules/:moduleId', requireStudent, h(async (req, res) => {
  const cur = await one(`SELECT assigned_path FROM applications WHERE email = $1 AND status = 'accepted' ORDER BY created_at DESC LIMIT 1`, [req.student.email]);
  const path = cur && (await getPath(cur.assigned_path));
  if (!path || !path.modules.some((m) => m.id === req.params.moduleId)) return res.status(404).json({ error: 'That module isn’t part of your path.' });
  if (req.body?.done) await query('INSERT INTO module_progress (student_id, module_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.student.id, req.params.moduleId]);
  else await query('DELETE FROM module_progress WHERE student_id = $1 AND module_id = $2', [req.student.id, req.params.moduleId]);
  res.json({ ok: true });
}));

app.get('/api/paths', h(async (req, res) => res.json((await getAllPaths()).map((p) => ({ id: p.id, name: p.name, code: p.code, accent: p.accent })))));

// ---------- admin: dashboard ----------
app.get('/api/admin/overview', requireAdmin, h(async (req, res) => {
  const statusRows = await query('SELECT status, COUNT(*)::int AS n FROM applications GROUP BY status');
  const byStatus = { pending: 0, shortlisted: 0, accepted: 0, rejected: 0 };
  let total = 0;
  for (const r of statusRows) { byStatus[r.status] = r.n; total += r.n; }
  const days = await query(`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
                            FROM applications WHERE created_at >= now() - interval '14 days' GROUP BY 1 ORDER BY 1`);
  const demand = await query(`SELECT role, COUNT(*)::int AS n FROM applications, jsonb_array_elements_text(roles) AS role GROUP BY role`);
  const assigned = await query(`SELECT assigned_path AS path, COUNT(*)::int AS n FROM applications WHERE status = 'accepted' AND assigned_path IS NOT NULL GROUP BY 1`);
  const { n: accounts } = await one('SELECT COUNT(*)::int AS n FROM students');
  const { n: unassigned } = await one(`SELECT COUNT(*)::int AS n FROM applications WHERE status = 'accepted' AND assigned_path IS NULL`);
  const paths = await getAllPaths();
  const completion = [];
  for (const p of paths) {
    const ids = p.modules.map((m) => m.id);
    const r = await one(`SELECT COUNT(DISTINCT st.id)::int AS students, COUNT(mp.module_id)::int AS done
      FROM applications a JOIN students st ON st.email = a.email
      LEFT JOIN module_progress mp ON mp.student_id = st.id AND mp.module_id = ANY($2::text[])
      WHERE a.status = 'accepted' AND a.assigned_path = $1`, [p.id, ids]);
    completion.push({ path: p.id, students: r.students, avg: r.students && ids.length ? Math.round((r.done / (r.students * ids.length)) * 100) : 0 });
  }
  const recent = (await query('SELECT * FROM applications ORDER BY created_at DESC LIMIT 5')).map(rowToApp);
  res.json({ total, byStatus, days, demand: Object.fromEntries(demand.map((d) => [d.role, d.n])), assigned: Object.fromEntries(assigned.map((a) => [a.path, a.n])), accounts, unassigned, completion, recent,
    paths: paths.map((p) => ({ id: p.id, name: p.name, code: p.code, accent: p.accent })) });
}));

// ---------- admin: path content (CMS) ----------
async function pathStats(p) {
  const rows = await query(`SELECT mp.module_id, COUNT(*)::int AS n FROM module_progress mp
      JOIN students st ON st.id = mp.student_id JOIN applications a ON a.email = st.email
      WHERE a.status = 'accepted' AND a.assigned_path = $1 GROUP BY mp.module_id`, [p.id]);
  const { n: students } = await one(`SELECT COUNT(*)::int AS n FROM applications WHERE status = 'accepted' AND assigned_path = $1`, [p.id]);
  return { students, doneByModule: Object.fromEntries(rows.map((r) => [r.module_id, r.n])) };
}
// delete video files a save removed, unless another path still uses them
async function dropUnusedVideos(before, after) {
  const keep = new Set((await getAllPaths()).flatMap(media.fileUrls));
  const gone = media.fileUrls(before).filter((u) => !keep.has(u));
  if (gone.length) await media.removeVideos(gone);
  return after;
}
app.get('/api/admin/paths', requireAdmin, h(async (req, res) => {
  const paths = await getAllPaths();
  res.json(await Promise.all(paths.map(async (p) => ({ ...p, stats: await pathStats(p) }))));
}));
app.put('/api/admin/paths/:id', requireAdmin, h(async (req, res) => {
  const existing = await getPath(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Path not found.' });
  const { data, errors } = validatePath(existing.id, req.body || {}, existing);
  if (errors.length) return res.status(400).json({ error: errors[0], errors });
  const saved = await savePath(existing.id, data);
  await dropUnusedVideos(existing, saved);
  res.json({ ...saved, stats: await pathStats(saved) });
}));
app.post('/api/admin/paths/:id/reset', requireAdmin, h(async (req, res) => {
  const existing = await getPath(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Path not found.' });
  const saved = await resetPath(req.params.id);
  await dropUnusedVideos(existing, saved);
  res.json({ ...saved, stats: await pathStats(saved) });
}));

// ---------- admin: module video uploads ----------
app.get('/api/admin/uploads/config', requireAdmin, (req, res) => res.json({ mode: media.uploadMode(), maxMB: media.MAX_MB, types: Object.keys(media.TYPES) }));

// Vercel Blob: the browser asks for a short-lived upload token, then sends the file straight to Blob.
app.post('/api/admin/uploads/blob', requireAdmin, h(async (req, res) => {
  if (media.uploadMode() !== 'blob') return res.status(400).json({ error: 'Video storage isn’t connected. Add a Blob store to this Vercel project.' });
  if (req.body?.type !== 'blob.generate-client-token') return res.status(400).json({ error: 'Unsupported upload request.' });
  const pathname = req.body?.payload?.pathname;
  if (typeof pathname !== 'string' || !/^module-videos\/[\w\-.]{1,120}$/.test(pathname)) return res.status(400).json({ error: 'Rename the video file using letters, numbers and dashes, then try again.' });
  const { handleUpload } = require('@vercel/blob/client');
  const out = await handleUpload({
    body: req.body,
    request: req,
    onBeforeGenerateToken: async () => {
      return { allowedContentTypes: Object.keys(media.TYPES), maximumSizeInBytes: media.MAX_BYTES, addRandomSuffix: true };
    },
  });
  res.json(out);
}));

// Local dev: the browser sends the raw file body here.
app.post('/api/admin/uploads/local', requireAdmin, h(async (req, res) => {
  if (media.uploadMode() !== 'local') return res.status(400).json({ error: 'Local uploads are only for local development.' });
  try { res.status(201).json(await media.saveLocalUpload(req)); }
  catch (e) { res.status(e.status || 500).json({ error: e.status ? e.message : 'Upload failed. Try again.' }); }
}));

// ---------- chat between admins and students ----------
const MSG_MAX = 2000;
function rowToMsg(r) {
  return { id: r.id, from: r.sender, body: r.body, createdAt: new Date(r.created_at).toISOString(), readAt: r.read_at ? new Date(r.read_at).toISOString() : null, ...(r.admin_email !== undefined ? { by: r.admin_email } : {}) };
}
const afterParam = (req) => (/^\d+$/.test(String(req.query.after || '')) ? Number(req.query.after) : 0);
const msgBody = (req) => (typeof req.body?.body === 'string' ? req.body.body.replace(/\r\n/g, '\n').trim() : '');

// student side
app.get('/api/student/messages', requireStudent, h(async (req, res) => {
  if (req.query.read === '1') await query(`UPDATE messages SET read_at = now() WHERE student_id = $1 AND sender = 'admin' AND read_at IS NULL`, [req.student.id]);
  const rows = await query('SELECT * FROM messages WHERE student_id = $1 AND id > $2 ORDER BY id LIMIT 500', [req.student.id, afterParam(req)]);
  const { n, seen } = await one(`SELECT COUNT(*) FILTER (WHERE sender = 'admin' AND read_at IS NULL)::int AS n,
      COALESCE(MAX(id) FILTER (WHERE sender = 'student' AND read_at IS NOT NULL), 0) AS seen FROM messages WHERE student_id = $1`, [req.student.id]);
  res.json({ messages: rows.map(rowToMsg), unread: n, seenUpTo: Number(seen) });
}));
app.post('/api/student/messages',
  rateLimit({ name: 'smsg', windowMs: 60 * 1000, max: 20, message: 'You’re sending messages too fast. Wait a minute.' }),
  requireStudent, h(async (req, res) => {
    const body = msgBody(req);
    if (!body) return res.status(400).json({ error: 'Write a message first.' });
    if (body.length > MSG_MAX) return res.status(400).json({ error: `Keep messages under ${MSG_MAX} characters.` });
    const r = await one(`INSERT INTO messages (student_id, sender, body) VALUES ($1, 'student', $2) RETURNING *`, [req.student.id, body]);
    res.status(201).json(rowToMsg(r));
  }));

// admin side
app.get('/api/admin/unread', requireAdmin, h(async (req, res) => {
  const { n } = await one(`SELECT COUNT(*)::int AS n FROM messages WHERE sender = 'student' AND read_at IS NULL`);
  const { r } = await one(`SELECT COUNT(*)::int AS r FROM submissions WHERE status = 'submitted'`);
  res.json({ unread: n, toReview: r });
}));
app.get('/api/admin/conversations', requireAdmin, h(async (req, res) => {
  const rows = await query(`
    SELECT s.id, s.email, a.first_name, a.last_name, a.status, a.assigned_path,
           lm.body AS last_body, lm.sender AS last_sender, lm.created_at AS last_at,
           (SELECT COUNT(*)::int FROM messages m WHERE m.student_id = s.id AND m.sender = 'student' AND m.read_at IS NULL) AS unread
    FROM students s
    LEFT JOIN LATERAL (SELECT * FROM applications ap WHERE ap.email = s.email ORDER BY ap.created_at DESC LIMIT 1) a ON true
    LEFT JOIN LATERAL (SELECT * FROM messages m WHERE m.student_id = s.id ORDER BY m.id DESC LIMIT 1) lm ON true
    ORDER BY lm.id DESC NULLS LAST, s.id DESC LIMIT 1000`);
  res.json(rows.map((r) => ({
    studentId: r.id, email: r.email,
    name: r.first_name ? `${r.first_name} ${r.last_name}` : r.email,
    status: r.status || null, path: r.assigned_path || null, unread: r.unread,
    last: r.last_at ? { body: r.last_body.slice(0, 140), from: r.last_sender, createdAt: new Date(r.last_at).toISOString() } : null,
  })));
}));
const studentParam = (req) => (/^\d+$/.test(req.params.studentId) ? Number(req.params.studentId) : -1);
app.get('/api/admin/conversations/:studentId', requireAdmin, h(async (req, res) => {
  const st = await one('SELECT id, email FROM students WHERE id = $1', [studentParam(req)]);
  if (!st) return res.status(404).json({ error: 'Student not found.' });
  await query(`UPDATE messages SET read_at = now() WHERE student_id = $1 AND sender = 'student' AND read_at IS NULL`, [st.id]);
  const rows = await query(`SELECT m.*, ad.email AS admin_email FROM messages m LEFT JOIN admins ad ON ad.id = m.admin_id
                            WHERE m.student_id = $1 AND m.id > $2 ORDER BY m.id LIMIT 500`, [st.id, afterParam(req)]);
  const a = await one('SELECT * FROM applications WHERE email = $1 ORDER BY created_at DESC LIMIT 1', [st.email]);
  const { seen } = await one(`SELECT COALESCE(MAX(id), 0) AS seen FROM messages WHERE student_id = $1 AND sender = 'admin' AND read_at IS NOT NULL`, [st.id]);
  res.json({
    seenUpTo: Number(seen),
    student: { studentId: st.id, email: st.email, name: a ? `${a.first_name} ${a.last_name}` : st.email, status: a?.status || null, path: a?.assigned_path || null, applicationId: a?.id || null, ref: a?.ref || null },
    messages: rows.map(rowToMsg),
  });
}));
app.post('/api/admin/conversations/:studentId', requireAdmin, h(async (req, res) => {
  const st = await one('SELECT id FROM students WHERE id = $1', [studentParam(req)]);
  if (!st) return res.status(404).json({ error: 'Student not found.' });
  const body = msgBody(req);
  if (!body) return res.status(400).json({ error: 'Write a message first.' });
  if (body.length > MSG_MAX) return res.status(400).json({ error: `Keep messages under ${MSG_MAX} characters.` });
  const r = await one(`INSERT INTO messages (student_id, sender, admin_id, body) VALUES ($1, 'admin', $2, $3) RETURNING *, (SELECT email FROM admins WHERE id = $2) AS admin_email`, [st.id, req.admin.id, body]);
  res.status(201).json(rowToMsg(r));
}));

work.register(app, { h, requireAdmin, requireStudent });
require('./office').register(app, { h, requireStudent, rateLimit });

// ---------- pages (local dev; on Vercel, static files are served by the CDN) ----------
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'index.html')));
app.get('/portal', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'portal', 'index.html')));
app.use('/uploads', express.static(media.UPLOAD_DIR, { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request body.' });
  console.error(err);
  const setup = /DATABASE_URL|ADMIN_PASSWORD/.test(err.message);
  res.status(500).json({ error: setup ? `Server setup is incomplete: ${err.message}` : 'Something went wrong on our side. Try again.' });
});

module.exports = app;
