// Module output submissions (students submit, admins grade or return with a comment)
// and projects (admins form teams; students see them in their virtual office).
const { query, one } = require('./db');
const { getPath, getAllPaths } = require('./pathStore');

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
function cleanUrl(v, required) {
  const s = str(v, 500);
  if (!s) return required ? { error: 'Add a link to your output.' } : { value: '' };
  try { const u = new URL(s); if (!/^https?:$/.test(u.protocol)) throw 0; return { value: u.toString() }; }
  catch { return { error: 'Use a full link that starts with https://' }; }
}
const iso = (d) => (d ? new Date(d).toISOString() : null);

function rowToSub(r) {
  return {
    id: r.id, moduleId: r.module_id, pathId: r.path_id, link: r.link, note: r.note, status: r.status,
    score: r.score, feedback: r.feedback, attempt: r.attempt, submittedAt: iso(r.submitted_at), reviewedAt: iso(r.reviewed_at),
  };
}

// latest application per student, for names and paths
const LATEST_APP = `LEFT JOIN LATERAL (SELECT first_name, last_name, assigned_path, status FROM applications ap
                     WHERE ap.email = st.email ORDER BY ap.created_at DESC LIMIT 1) a ON true`;
const nameOf = (r) => (r.first_name ? `${r.first_name} ${r.last_name}` : r.email);

async function submissionsFor(studentId) {
  const rows = await query('SELECT * FROM submissions WHERE student_id = $1', [studentId]);
  return Object.fromEntries(rows.map((r) => {
    const s = rowToSub(r);
    // students see the feedback on returned or graded work, not while a resubmission is waiting
    if (s.status === 'submitted') s.feedback = '';
    return [r.module_id, s];
  }));
}

async function projectsWithMembers(where, params) {
  const projects = await query(`SELECT * FROM projects ${where} ORDER BY status, created_at DESC`, params);
  if (!projects.length) return [];
  const paths = Object.fromEntries((await getAllPaths()).map((p) => [p.id, p]));
  const members = await query(`SELECT pm.*, st.email, a.first_name, a.last_name, a.assigned_path FROM project_members pm
      JOIN students st ON st.id = pm.student_id ${LATEST_APP}
      WHERE pm.project_id = ANY($1::int[]) ORDER BY pm.is_lead DESC, pm.added_at`, [projects.map((p) => p.id)]);
  return projects.map((p) => ({
    id: p.id, name: p.name, client: p.client, description: p.description, meetingUrl: p.meeting_url, repoUrl: p.repo_url,
    status: p.status, createdAt: iso(p.created_at), updatedAt: iso(p.updated_at),
    members: members.filter((m) => m.project_id === p.id).map((m) => {
      const path = paths[m.assigned_path];
      return { studentId: m.student_id, name: nameOf(m), email: m.email, path: m.assigned_path || null, pathName: path?.name || null, accent: path?.accent || null, role: m.role, isLead: m.is_lead, addedAt: iso(m.added_at) };
    }),
  }));
}
const projectsFor = (studentId) => projectsWithMembers('WHERE id IN (SELECT project_id FROM project_members WHERE student_id = $1)', [studentId]);

function register(app, { h, requireAdmin, requireStudent }) {
  /* ---------- student: submit output ---------- */
  async function studentModule(req) {
    const cur = await one(`SELECT assigned_path FROM applications WHERE email = $1 AND status = 'accepted' ORDER BY created_at DESC LIMIT 1`, [req.student.email]);
    const path = cur && (await getPath(cur.assigned_path));
    const mod = path && path.modules.find((m) => m.id === req.params.moduleId);
    return mod ? { path, mod } : null;
  }

  app.put('/api/student/submissions/:moduleId', requireStudent, h(async (req, res) => {
    const found = await studentModule(req);
    if (!found) return res.status(404).json({ error: 'That module isn’t part of your path.' });
    const link = cleanUrl(req.body?.link, true);
    if (link.error) return res.status(400).json({ error: link.error, fields: { link: link.error } });
    const note = str(req.body?.note, 1000);
    const existing = await one('SELECT * FROM submissions WHERE student_id = $1 AND module_id = $2', [req.student.id, found.mod.id]);
    if (existing && existing.status === 'graded') return res.status(409).json({ error: 'This module is already graded.' });
    const row = existing
      ? await one(`UPDATE submissions SET link = $3, note = $4, status = 'submitted', score = NULL, path_id = $5,
                     attempt = attempt + CASE WHEN status = 'returned' THEN 1 ELSE 0 END, submitted_at = now()
                   WHERE student_id = $1 AND module_id = $2 RETURNING *`, [req.student.id, found.mod.id, link.value, note, found.path.id])
      : await one(`INSERT INTO submissions (student_id, path_id, module_id, link, note) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [req.student.id, found.path.id, found.mod.id, link.value, note]);
    const s = rowToSub(row); s.feedback = '';
    res.status(existing ? 200 : 201).json(s);
  }));

  app.delete('/api/student/submissions/:moduleId', requireStudent, h(async (req, res) => {
    const r = await one(`DELETE FROM submissions WHERE student_id = $1 AND module_id = $2 AND status = 'submitted' AND attempt = 1 RETURNING id`, [req.student.id, req.params.moduleId]);
    if (!r) return res.status(409).json({ error: 'Only a first submission that hasn’t been reviewed can be withdrawn.' });
    res.json({ ok: true });
  }));

  /* ---------- admin: review queue ---------- */
  const STATUSES = ['submitted', 'returned', 'graded'];
  app.get('/api/admin/submissions', requireAdmin, h(async (req, res) => {
    const status = STATUSES.includes(req.query.status) ? req.query.status : null;
    const rows = await query(`SELECT s.*, st.email, a.first_name, a.last_name, ad.email AS reviewer
        FROM submissions s JOIN students st ON st.id = s.student_id ${LATEST_APP}
        LEFT JOIN admins ad ON ad.id = s.reviewer_id
        ${status ? 'WHERE s.status = $1' : ''}
        ORDER BY CASE WHEN s.status = 'submitted' THEN 0 ELSE 1 END, ${status === 'submitted' || !status ? 's.submitted_at ASC' : 's.reviewed_at DESC NULLS LAST'} LIMIT 500`, status ? [status] : []);
    const paths = Object.fromEntries((await getAllPaths()).map((p) => [p.id, p]));
    const counts = { submitted: 0, returned: 0, graded: 0 };
    for (const r of await query('SELECT status, COUNT(*)::int AS n FROM submissions GROUP BY status')) counts[r.status] = r.n;
    res.json({
      counts,
      submissions: rows.map((r) => {
        const p = paths[r.path_id]; const m = p?.modules.find((x) => x.id === r.module_id);
        return { ...rowToSub(r), studentId: r.student_id, name: nameOf(r), email: r.email, pathName: p?.name || r.path_id, accent: p?.accent || null,
          module: m ? { title: m.title, week: m.week, deliverable: m.deliverable } : { title: 'Removed module', week: null, deliverable: '' }, reviewer: r.reviewer || null };
      }),
    });
  }));

  app.patch('/api/admin/submissions/:id', requireAdmin, h(async (req, res) => {
    const id = /^\d+$/.test(req.params.id) ? Number(req.params.id) : -1;
    const sub = await one('SELECT * FROM submissions WHERE id = $1', [id]);
    if (!sub) return res.status(404).json({ error: 'Submission not found.' });
    const action = req.body?.action;
    const feedback = str(req.body?.feedback, 2000);
    let row;
    if (action === 'grade') {
      const score = Number(req.body?.score);
      if (!Number.isInteger(score) || score < 0 || score > 100) return res.status(400).json({ error: 'Give a score from 0 to 100.' });
      row = await one(`UPDATE submissions SET status = 'graded', score = $2, feedback = $3, reviewer_id = $4, reviewed_at = now() WHERE id = $1 RETURNING *`, [id, score, feedback, req.admin.id]);
      // a graded module counts as done for the student
      await query('INSERT INTO module_progress (student_id, module_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [sub.student_id, sub.module_id]);
    } else if (action === 'return') {
      if (!feedback) return res.status(400).json({ error: 'Write a comment so the student knows what to fix.' });
      row = await one(`UPDATE submissions SET status = 'returned', score = NULL, feedback = $2, reviewer_id = $3, reviewed_at = now() WHERE id = $1 RETURNING *`, [id, feedback, req.admin.id]);
    } else if (action === 'reopen') {
      row = await one(`UPDATE submissions SET status = 'submitted', score = NULL, reviewed_at = NULL WHERE id = $1 RETURNING *`, [id]);
    } else return res.status(400).json({ error: 'Unknown action.' });
    res.json(rowToSub(row));
  }));

  /* ---------- admin: projects and teams ---------- */
  app.get('/api/admin/students', requireAdmin, h(async (req, res) => {
    const paths = Object.fromEntries((await getAllPaths()).map((p) => [p.id, p]));
    const rows = await query(`SELECT st.id, st.email, a.first_name, a.last_name, a.assigned_path, a.status,
        COALESCE((SELECT json_agg(pm.project_id) FROM project_members pm WHERE pm.student_id = st.id), '[]') AS projects
      FROM students st ${LATEST_APP} WHERE a.status = 'accepted' ORDER BY a.first_name, a.last_name`);
    res.json(rows.map((r) => ({ studentId: r.id, name: nameOf(r), email: r.email, path: r.assigned_path || null, pathName: paths[r.assigned_path]?.name || null, accent: paths[r.assigned_path]?.accent || null,
      projects: typeof r.projects === 'string' ? JSON.parse(r.projects) : r.projects })));
  }));

  app.get('/api/admin/projects', requireAdmin, h(async (req, res) => res.json(await projectsWithMembers('', []))));

  function validateProject(body) {
    const errors = [];
    const name = str(body.name, 100);
    if (!name) errors.push('Give the project a name.');
    const meeting = cleanUrl(body.meetingUrl, false); if (meeting.error) errors.push('Meeting link: ' + meeting.error);
    const repo = cleanUrl(body.repoUrl, false); if (repo.error) errors.push('Repository link: ' + repo.error);
    const seen = new Set();
    const members = (Array.isArray(body.members) ? body.members : []).slice(0, 30).map((m) => ({
      studentId: Number(m && m.studentId), role: str(m && m.role, 60), isLead: !!(m && m.isLead),
    })).filter((m) => Number.isInteger(m.studentId) && !seen.has(m.studentId) && seen.add(m.studentId));
    return { errors, data: { name, client: str(body.client, 100), description: str(body.description, 1500), meetingUrl: meeting.value || '', repoUrl: repo.value || '',
      status: body.status === 'completed' ? 'completed' : 'active', members } };
  }
  async function saveMembers(projectId, members) {
    await query('DELETE FROM project_members WHERE project_id = $1 AND NOT (student_id = ANY($2::int[]))', [projectId, members.map((m) => m.studentId)]);
    for (const m of members) {
      await query(`INSERT INTO project_members (project_id, student_id, role, is_lead) SELECT $1, $2, $3, $4 WHERE EXISTS (SELECT 1 FROM students WHERE id = $2)
                   ON CONFLICT (project_id, student_id) DO UPDATE SET role = EXCLUDED.role, is_lead = EXCLUDED.is_lead`, [projectId, m.studentId, m.role, m.isLead]);
    }
  }
  app.post('/api/admin/projects', requireAdmin, h(async (req, res) => {
    const { errors, data } = validateProject(req.body || {});
    if (errors.length) return res.status(400).json({ error: errors[0], errors });
    const p = await one(`INSERT INTO projects (name, client, description, meeting_url, repo_url, status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [data.name, data.client, data.description, data.meetingUrl, data.repoUrl, data.status]);
    await saveMembers(p.id, data.members);
    res.status(201).json((await projectsWithMembers('WHERE id = $1', [p.id]))[0]);
  }));
  app.put('/api/admin/projects/:id', requireAdmin, h(async (req, res) => {
    const id = /^\d+$/.test(req.params.id) ? Number(req.params.id) : -1;
    const { errors, data } = validateProject(req.body || {});
    if (errors.length) return res.status(400).json({ error: errors[0], errors });
    const p = await one(`UPDATE projects SET name = $2, client = $3, description = $4, meeting_url = $5, repo_url = $6, status = $7, updated_at = now() WHERE id = $1 RETURNING id`,
      [id, data.name, data.client, data.description, data.meetingUrl, data.repoUrl, data.status]);
    if (!p) return res.status(404).json({ error: 'Project not found.' });
    await saveMembers(id, data.members);
    res.json((await projectsWithMembers('WHERE id = $1', [id]))[0]);
  }));
  app.delete('/api/admin/projects/:id', requireAdmin, h(async (req, res) => {
    const r = await one('DELETE FROM projects WHERE id = $1 RETURNING id', [/^\d+$/.test(req.params.id) ? Number(req.params.id) : -1]);
    if (!r) return res.status(404).json({ error: 'Project not found.' });
    res.json({ ok: true });
  }));
}

module.exports = { register, submissionsFor, projectsFor };
