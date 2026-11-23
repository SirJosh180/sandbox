// Interactive virtual office for accepted students.
// Students walk between rooms (meeting, idea, coffee, their own office, their department).
// Presence is a heartbeat: a student counts as online while their portal pings every ~25s.
// The idea board and coffee chat belong to the student's project, or to their department
// (everyone on the same path) when they aren't on a project yet.
const { query, one } = require('./db');
const { getAllPaths } = require('./pathStore');
const { projectsFor, LATEST_APP, nameOf } = require('./work');

const ROOMS = ['meeting', 'idea', 'coffee', 'own', 'dept'];
const EMOTES = ['👋', '🎉', '☕', '👍', '💡', '😂', '🙌', '🔥'];
const ONLINE_MS = 75 * 1000;
const EMOTE_MS = 10 * 1000;
const NOTE_MAX = { idea: 280, coffee: 300 };
const iso = (d) => (d ? new Date(d).toISOString() : null);
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max + 1) : '');
const likesOf = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? JSON.parse(v) : []);

// Who is asking, which project they're looking at, and which board/chat scopes they may use.
async function context(req) {
  const app = await one(`SELECT first_name, last_name, assigned_path FROM applications WHERE email = $1 AND status = 'accepted' ORDER BY created_at DESC LIMIT 1`, [req.student.email]);
  if (!app || !app.assigned_path) return null;
  const projects = await projectsFor(req.student.id);
  const want = Number(req.query.project ?? req.body?.project);
  const project = projects.find((p) => p.id === want) || projects.find((p) => p.status === 'active') || projects[0] || null;
  const scopes = new Set([`d:${app.assigned_path}`, ...projects.map((p) => `p:${p.id}`)]);
  return { app, projects, project, scope: project ? `p:${project.id}` : `d:${app.assigned_path}`, scopes };
}

function register(app, { h, requireStudent, rateLimit }) {
  app.get('/api/student/office', requireStudent, h(async (req, res) => {
    const ctx = await context(req);
    if (!ctx) return res.status(403).json({ error: 'The office opens once you’re accepted and your path is set.' });
    const { project } = ctx;
    const paths = await getAllPaths();
    const byPath = Object.fromEntries(paths.map((p) => [p.id, p]));

    // teammates on this project, plus everyone on the same path (the department)
    const dept = await query(`SELECT st.id, st.email, a.first_name, a.last_name, a.assigned_path FROM students st ${LATEST_APP}
        WHERE a.status = 'accepted' AND a.assigned_path = $1 ORDER BY a.first_name LIMIT 60`, [ctx.app.assigned_path]);
    const people = new Map();
    for (const m of project ? project.members : []) {
      people.set(m.studentId, { studentId: m.studentId, name: m.name, email: m.email, path: m.path, role: m.role, isLead: m.isLead, teammate: true, dept: m.path === ctx.app.assigned_path });
    }
    for (const d of dept) {
      const p = people.get(d.id);
      if (p) p.dept = true;
      else people.set(d.id, { studentId: d.id, name: nameOf(d), path: d.assigned_path, role: '', isLead: false, teammate: false, dept: true });
    }
    if (!people.has(req.student.id)) {
      people.set(req.student.id, { studentId: req.student.id, name: nameOf({ ...ctx.app, email: req.student.email }), path: ctx.app.assigned_path, role: '', isLead: false, teammate: false, dept: true });
    }
    const ids = [...people.keys()];
    const pres = await query('SELECT * FROM office_presence WHERE student_id = ANY($1::int[])', [ids]);
    const now = Date.now();
    for (const r of pres) {
      const p = people.get(r.student_id);
      p.room = r.room;
      p.online = now - new Date(r.updated_at).getTime() < ONLINE_MS;
      p.lastSeen = iso(r.updated_at);
      if (r.emote && r.emote_at && now - new Date(r.emote_at).getTime() < EMOTE_MS) { p.emote = r.emote; p.emoteAt = iso(r.emote_at); }
    }
    const list = [...people.values()].map((p) => {
      const path = byPath[p.path];
      const out = { ...p, you: p.studentId === req.student.id, pathName: path?.name || null, pathCode: path?.code || null, accent: path?.accent || null, room: p.room || 'own', online: !!p.online };
      if (!p.teammate || out.you) delete out.email;
      return out;
    });

    const notes = await query(`SELECT * FROM (SELECT n.*, st.email, a.first_name, a.last_name, a.assigned_path FROM office_notes n
        JOIN students st ON st.id = n.student_id ${LATEST_APP} WHERE n.scope = $1 AND n.kind = $2 ORDER BY n.id DESC LIMIT 50) t ORDER BY id`, [ctx.scope, 'idea']);
    const coffee = await query(`SELECT * FROM (SELECT n.*, st.email, a.first_name, a.last_name FROM office_notes n
        JOIN students st ON st.id = n.student_id ${LATEST_APP} WHERE n.scope = $1 AND n.kind = 'coffee' ORDER BY n.id DESC LIMIT 40) t ORDER BY id`, [ctx.scope]);
    const myPath = byPath[ctx.app.assigned_path];

    res.json({
      now: new Date().toISOString(),
      me: { studentId: req.student.id, path: ctx.app.assigned_path, pathName: myPath?.name || null },
      projects: ctx.projects.map((p) => ({ id: p.id, name: p.name, status: p.status })),
      project: project && { id: project.id, name: project.name, client: project.client, description: project.description, meetingUrl: project.meetingUrl, repoUrl: project.repoUrl, status: project.status },
      scopeLabel: project ? project.name : `${myPath?.name || 'Your'} department`,
      paths: paths.map((p) => ({ id: p.id, name: p.name, code: p.code, accent: p.accent })),
      people: list,
      emotes: EMOTES,
      ideas: notes.map((n) => {
        const likes = likesOf(n.likes);
        return { id: n.id, body: n.body, authorId: n.student_id, author: nameOf(n), path: n.assigned_path, accent: byPath[n.assigned_path]?.accent || null,
          likes: likes.length, liked: likes.includes(req.student.id), mine: n.student_id === req.student.id, createdAt: iso(n.created_at) };
      }),
      coffee: coffee.map((n) => ({ id: n.id, body: n.body, authorId: n.student_id, author: nameOf(n), mine: n.student_id === req.student.id, createdAt: iso(n.created_at) })),
    });
  }));

  app.put('/api/student/office/presence', requireStudent, h(async (req, res) => {
    const room = ROOMS.includes(req.body?.room) ? req.body.room : null;
    if (!room) return res.status(400).json({ error: 'Unknown room.' });
    const emote = EMOTES.includes(req.body?.emote) ? req.body.emote : null;
    await query(`INSERT INTO office_presence (student_id, room, emote, emote_at, updated_at) VALUES ($1, $2, COALESCE($3, ''), CASE WHEN $3::text IS NULL THEN NULL ELSE now() END, now())
      ON CONFLICT (student_id) DO UPDATE SET room = EXCLUDED.room, updated_at = now(),
        emote = CASE WHEN $3::text IS NULL THEN office_presence.emote ELSE EXCLUDED.emote END,
        emote_at = CASE WHEN $3::text IS NULL THEN office_presence.emote_at ELSE now() END`, [req.student.id, room, emote]);
    res.json({ ok: true });
  }));

  // leaving the portal: mark offline right away instead of waiting for the heartbeat to expire
  app.post('/api/student/office/leave', requireStudent, h(async (req, res) => {
    await query(`UPDATE office_presence SET updated_at = now() - interval '1 hour' WHERE student_id = $1`, [req.student.id]);
    res.json({ ok: true });
  }));

  app.post('/api/student/office/notes',
    rateLimit({ name: 'onote', windowMs: 60 * 1000, max: 20, message: 'Slow down a little. Try again in a minute.' }),
    requireStudent, h(async (req, res) => {
      const ctx = await context(req);
      if (!ctx) return res.status(403).json({ error: 'The office opens once you’re accepted and your path is set.' });
      const kind = req.body?.kind === 'idea' ? 'idea' : req.body?.kind === 'coffee' ? 'coffee' : null;
      if (!kind) return res.status(400).json({ error: 'Unknown note type.' });
      const body = str(req.body?.body, NOTE_MAX[kind]);
      if (!body) return res.status(400).json({ error: kind === 'idea' ? 'Write your idea first.' : 'Write a message first.' });
      if (body.length > NOTE_MAX[kind]) return res.status(400).json({ error: `Keep it under ${NOTE_MAX[kind]} characters.` });
      if (kind === 'coffee') await query(`DELETE FROM office_notes WHERE kind = 'coffee' AND created_at < now() - interval '7 days'`);
      const r = await one('INSERT INTO office_notes (scope, kind, student_id, body) VALUES ($1, $2, $3, $4) RETURNING id', [ctx.scope, kind, req.student.id, body]);
      res.status(201).json({ id: r.id });
    }));

  async function ownNoteScope(req) {
    const id = /^\d+$/.test(req.params.id) ? Number(req.params.id) : -1;
    const note = await one('SELECT * FROM office_notes WHERE id = $1', [id]);
    if (!note) return null;
    const ctx = await context(req);
    return ctx && ctx.scopes.has(note.scope) ? note : null;
  }

  app.post('/api/student/office/notes/:id/like', requireStudent, h(async (req, res) => {
    const note = await ownNoteScope(req);
    if (!note || note.kind !== 'idea') return res.status(404).json({ error: 'Idea not found.' });
    const likes = likesOf(note.likes);
    const next = likes.includes(req.student.id) ? likes.filter((x) => x !== req.student.id) : [...likes, req.student.id];
    await query('UPDATE office_notes SET likes = $2::jsonb WHERE id = $1', [note.id, JSON.stringify(next)]);
    res.json({ likes: next.length, liked: next.includes(req.student.id) });
  }));

  app.delete('/api/student/office/notes/:id', requireStudent, h(async (req, res) => {
    const id = /^\d+$/.test(req.params.id) ? Number(req.params.id) : -1;
    const r = await one('DELETE FROM office_notes WHERE id = $1 AND student_id = $2 RETURNING id', [id, req.student.id]);
    if (!r) return res.status(404).json({ error: 'You can only remove your own notes.' });
    res.json({ ok: true });
  }));
}

module.exports = { register, ROOMS };
