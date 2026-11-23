/* Admin: review queue for module outputs, and projects / teams for the students' virtual office.
   Uses window.SBX (api, toast, esc, ROLES, go) from admin/index.html. */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const S = () => window.SBX;
  const esc = (v) => S().esc(v);
  const initials = (n) => String(n || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  const when = (iso) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const linkLabel = (u) => { try { const x = new URL(u); return x.hostname.replace(/^www\./, '') + (x.pathname.length > 1 ? x.pathname.slice(0, 40) : ''); } catch (e) { return u; } };

  /* ================= reviews ================= */
  const rv = { status: 'submitted', data: null };
  async function reviews() {
    const root = $('#reviewsRoot');
    if (!rv.data) root.innerHTML = '<p style="color:var(--muted)">Loading…</p>';
    try { rv.data = await S().api('/api/admin/submissions' + (rv.status ? '?status=' + rv.status : '')); } catch (e) { S().toast(e.message); return; }
    renderReviews();
  }
  function renderReviews() {
    const root = $('#reviewsRoot'); const d = rv.data; const c = d.counts;
    const tabs = [['submitted', 'To review', c.submitted], ['returned', 'Returned', c.returned], ['graded', 'Graded', c.graded], ['', 'All', c.submitted + c.returned + c.graded]];
    root.innerHTML = `
      <div class="page-head"><div><span class="label">Outputs</span><h1>Review submissions</h1><p>Students submit a link to their work for each module. Grade it, or send it back with a comment so they can fix it.</p></div></div>
      <div class="seg-pick" id="rvTabs" style="margin-bottom:1.2rem">${tabs.map(([k, l, n]) => `<button type="button" data-k="${k}" aria-pressed="${rv.status === k}">${l} <b class="mono" style="font-weight:500;margin-left:.25rem">${n}</b></button>`).join('')}</div>
      <div class="rv-list">${d.submissions.length ? d.submissions.map(card).join('') : `<div class="box chat-empty" style="padding:3rem 1rem">${window.Cubit ? `<div class="cubit-inline" style="width:120px">${Cubit.svg(rv.status === 'submitted' ? 'hello' : 'hmm')}</div>` : ''}<strong>${rv.status === 'submitted' ? 'All caught up' : 'Nothing here yet'}</strong><span>${rv.status === 'submitted' ? 'New student submissions show up here.' : 'Reviewed submissions show up here.'}</span></div>`}</div>`;
    $('#rvTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (!b) return; rv.status = b.dataset.k; reviews(); });
    root.querySelectorAll('.rv-card').forEach(bindCard);
  }
  function card(s) {
    const statusPill = { submitted: '<span class="rv-pill p-sub">⏳ To review</span>', returned: '<span class="rv-pill p-ret">🔁 Returned</span>', graded: `<span class="rv-pill p-gr">🏅 ${s.score}/100</span>` }[s.status];
    return `<article class="box rv-card" data-id="${s.id}" style="--pa:${esc(s.accent || 'var(--sand)')}">
      <header class="rv-head"><span class="avatar" style="--av:${esc(s.accent || 'var(--sand)')};grid-row:auto">${esc(initials(s.name))}</span>
        <div class="rv-who"><strong>${esc(s.name)}</strong><span>${esc(s.pathName)} · ${esc(s.email)}</span></div>${statusPill}</header>
      <div class="rv-mod"><span class="label">${s.module.week ? 'Week ' + s.module.week : 'Module'}</span><h3>${esc(s.module.title)}</h3>${s.module.deliverable ? `<span class="rv-deliv">deliverable › ${esc(s.module.deliverable)}</span>` : ''}</div>
      <a class="rv-link" href="${esc(s.link)}" target="_blank" rel="noopener noreferrer">🔗 ${esc(linkLabel(s.link))} ↗</a>
      ${s.note ? `<div class="rv-note"><span class="label">Student's note</span><p>${esc(s.note)}</p></div>` : ''}
      <div class="rv-meta">sent ${when(s.submittedAt)}${s.attempt > 1 ? ` · attempt ${s.attempt}` : ''}${s.reviewedAt && s.status !== 'submitted' ? ` · reviewed ${when(s.reviewedAt)}${s.reviewer ? ' by ' + esc(s.reviewer) : ''}` : ''}</div>
      ${s.status === 'submitted' ? `
        ${s.attempt > 1 && s.feedback ? `<div class="rv-prev"><span class="label">Your last comment</span><p>${esc(s.feedback)}</p></div>` : ''}
        <form class="rv-form" novalidate>
          <div class="rv-row"><div class="field rv-score"><label for="sc${s.id}">Score</label><input id="sc${s.id}" name="score" type="number" min="0" max="100" placeholder="0–100"></div>
            <div class="field" style="flex:1"><label for="fb${s.id}">Comment <span class="opt">(needed to return it)</span></label><textarea id="fb${s.id}" name="feedback" maxlength="2000" placeholder="What's good, what to fix…"></textarea></div></div>
          <div class="rv-acts"><button class="btn btn-primary btn-sm" type="submit" data-act="grade">🏅 Grade</button><button class="btn btn-ghost btn-sm rv-return" type="button" data-act="return">🔁 Return with comment</button><span class="rv-err" role="alert"></span></div>
        </form>`
      : `${s.feedback ? `<div class="rv-prev"><span class="label">${s.status === 'graded' ? 'Feedback' : 'Comment sent'}</span><p>${esc(s.feedback)}</p></div>` : ''}
        <div class="rv-acts"><button class="btn btn-ghost btn-sm" type="button" data-act="reopen">Reopen review</button></div>`}
    </article>`;
  }
  function bindCard(el) {
    const id = el.dataset.id;
    const send = async (body) => {
      const err = el.querySelector('.rv-err'); if (err) err.textContent = '';
      try { await S().api('/api/admin/submissions/' + id, { method: 'PATCH', body: JSON.stringify(body) }); S().toast(body.action === 'grade' ? 'Graded. The student sees it now.' : body.action === 'return' ? 'Sent back with your comment' : 'Moved back to review'); reviews(); if (window.AdminChat) AdminChat.refreshBadge(); }
      catch (e) { if (err) err.textContent = e.message; else S().toast(e.message); }
    };
    const f = el.querySelector('.rv-form');
    if (f) {
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = f.score.value.trim();
        if (v === '' || !/^\d+$/.test(v) || Number(v) > 100) { el.querySelector('.rv-err').textContent = 'Give a score from 0 to 100.'; f.score.focus(); return; }
        send({ action: 'grade', score: Number(v), feedback: f.feedback.value });
      });
      el.querySelector('[data-act="return"]').addEventListener('click', () => {
        if (!f.feedback.value.trim()) { el.querySelector('.rv-err').textContent = 'Write a comment so the student knows what to fix.'; f.feedback.focus(); return; }
        send({ action: 'return', feedback: f.feedback.value });
      });
    }
    const re = el.querySelector('[data-act="reopen"]'); if (re) re.addEventListener('click', () => send({ action: 'reopen' }));
  }

  /* ================= projects ================= */
  const pj = { list: [], students: [], edit: null, confirmDel: false };
  async function projects() {
    const root = $('#projectsRoot');
    if (!pj.list.length) root.innerHTML = '<p style="color:var(--muted)">Loading…</p>';
    try { [pj.list, pj.students] = await Promise.all([S().api('/api/admin/projects'), S().api('/api/admin/students')]); } catch (e) { S().toast(e.message); return; }
    renderProjects();
  }
  const blank = () => ({ id: null, name: '', client: '', description: '', meetingUrl: '', repoUrl: '', status: 'active', members: [] });
  function renderProjects() {
    const root = $('#projectsRoot');
    const byId = Object.fromEntries(pj.students.map((s) => [s.studentId, s]));
    const free = pj.students.filter((s) => !pj.list.some((p) => p.status === 'active' && p.members.some((m) => m.studentId === s.studentId)));
    root.innerHTML = `
      <div class="page-head"><div><span class="label">Teams</span><h1>Projects</h1><p>Create a project, add accepted students, and they'll see it with their teammates in the virtual office of their portal.</p></div>
        ${pj.edit ? '' : '<button class="btn btn-primary btn-sm" type="button" id="pjNew">+ New project</button>'}</div>
      ${pj.edit ? editor(byId) : ''}
      ${!pj.edit && free.length ? `<p class="pj-free">👥 <b>${free.length}</b> accepted student${free.length === 1 ? ' isn’t' : 's aren’t'} on an active project yet: ${free.slice(0, 6).map((s) => esc(s.name)).join(', ')}${free.length > 6 ? '…' : ''}</p>` : ''}
      <div class="pj-grid">${pj.list.length ? pj.list.map((p) => `
        <article class="box pj-card${p.status === 'completed' ? ' done' : ''}">
          <div class="pj-top"><div><h2>${esc(p.name)}</h2>${p.client ? `<span class="pj-client">for ${esc(p.client)}</span>` : ''}</div><span class="rv-pill ${p.status === 'active' ? 'p-gr' : ''}">${p.status === 'active' ? '● active' : 'completed'}</span></div>
          ${p.description ? `<p class="pj-desc">${esc(p.description)}</p>` : ''}
          <div class="pj-team">${p.members.length ? p.members.map((m) => `<span class="pj-mem" title="${esc(m.name)}${m.role ? ' · ' + esc(m.role) : ''}"><span class="avatar" style="--av:${esc(m.accent || 'var(--sand)')};width:30px;height:30px;font-size:.7rem;grid-row:auto">${esc(initials(m.name))}</span><span>${esc(m.name.split(' ')[0])}${m.isLead ? ' ⭐' : ''}<small>${esc(m.role || m.pathName || '')}</small></span></span>`).join('') : '<span class="pj-client">No teammates yet</span>'}</div>
          <div class="pj-foot">${p.meetingUrl ? `<a href="${esc(p.meetingUrl)}" target="_blank" rel="noopener noreferrer">🎧 Meeting room</a>` : ''}${p.repoUrl ? `<a href="${esc(p.repoUrl)}" target="_blank" rel="noopener noreferrer">📁 Files</a>` : ''}<button class="btn btn-ghost btn-sm" type="button" data-edit="${p.id}" style="margin-left:auto">Edit</button></div>
        </article>`).join('') : (pj.edit ? '' : `<div class="box chat-empty" style="padding:3rem 1rem;grid-column:1/-1">${window.Cubit ? `<div class="cubit-inline" style="width:120px">${Cubit.svg('build')}</div>` : ''}<strong>No projects yet</strong><span>Create one to form a team.</span></div>`)}</div>`;
    const nb = $('#pjNew'); if (nb) nb.onclick = () => { pj.edit = blank(); pj.confirmDel = false; renderProjects(); $('#pjName').focus(); };
    root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => { pj.edit = JSON.parse(JSON.stringify(pj.list.find((p) => p.id === Number(b.dataset.edit)))); pj.confirmDel = false; renderProjects(); window.scrollTo(0, 0); }));
    if (pj.edit) bindEditor(byId);
  }
  function editor(byId) {
    const e = pj.edit;
    const inTeam = new Set(e.members.map((m) => m.studentId));
    const options = pj.students.filter((s) => !inTeam.has(s.studentId)).map((s) => {
      const other = pj.list.filter((p) => p.id !== e.id && p.status === 'active' && s.projects.includes(p.id)).map((p) => p.name);
      return `<option value="${s.studentId}">${esc(s.name)} · ${esc(s.pathName || 'no path')}${other.length ? ' · on ' + esc(other.join(', ')) : ''}</option>`;
    }).join('');
    return `<section class="ed-sec pj-editor">
      <h2>${e.id ? 'Edit project' : 'New project'}</h2>
      <div class="row2" style="grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) auto">
        <div class="field"><label for="pjName">Project name</label><input id="pjName" type="text" maxlength="100" value="${esc(e.name)}" placeholder="e.g. Barangay Health Tracker"></div>
        <div class="field"><label for="pjClient">Client <span class="opt">(optional)</span></label><input id="pjClient" type="text" maxlength="100" value="${esc(e.client)}"></div>
        <div class="field"><span class="flabel">Status</span><div class="seg-pick" id="pjStatus">${['active', 'completed'].map((k) => `<button type="button" data-k="${k}" aria-pressed="${e.status === k}">${k}</button>`).join('')}</div></div>
      </div>
      <div class="field"><label for="pjDesc">What the team is building <span class="opt">(optional)</span></label><textarea id="pjDesc" maxlength="1500">${esc(e.description)}</textarea></div>
      <div class="row2" style="grid-template-columns:1fr 1fr">
        <div class="field"><label for="pjMeet">Meeting room link <span class="opt">(Google Meet, Zoom, Discord…)</span></label><input id="pjMeet" type="url" value="${esc(e.meetingUrl)}" placeholder="https://"></div>
        <div class="field"><label for="pjRepo">Project files link <span class="opt">(repo, Drive, Figma…)</span></label><input id="pjRepo" type="url" value="${esc(e.repoUrl)}" placeholder="https://"></div>
      </div>
      <div><span class="flabel">Team</span>
        <div class="rep" id="pjMembers" style="margin-top:.6rem">${e.members.map((m, i) => { const s = byId[m.studentId] || m; return `
          <div class="rep-item pj-row" data-i="${i}" style="grid-template-columns:auto minmax(0,1fr) auto">
            <span class="avatar" style="--av:${esc(s.accent || 'var(--sand)')};grid-row:auto">${esc(initials(s.name))}</span>
            <div class="fields two" style="align-items:center"><div><strong>${esc(s.name)}</strong><div class="rv-meta" style="margin:0">${esc(s.pathName || '')}</div></div>
              <div style="display:flex;gap:.6rem;align-items:center"><input type="text" data-k="role" maxlength="60" value="${esc(m.role)}" placeholder="Role on this project" aria-label="Role for ${esc(s.name)}"><label class="pj-lead"><input type="checkbox" data-k="isLead" ${m.isLead ? 'checked' : ''}> Lead</label></div></div>
            <div class="tools-col" style="flex-direction:row"><button class="icon-btn del" type="button" data-act="del" aria-label="Remove ${esc(s.name)}">✕</button></div>
          </div>`; }).join('') || '<p class="pj-client">No one on this team yet.</p>'}</div>
        ${options ? `<div class="pj-add"><select id="pjPick" aria-label="Add a teammate"><option value="">Add an accepted student…</option>${options}</select><button class="btn btn-ghost btn-sm" type="button" id="pjAdd">Add</button></div>` : `<p class="pj-client" style="margin-top:.6rem">${pj.students.length ? 'Every accepted student is on this team.' : 'Accept students (and they need a portal account) before adding them to a team.'}</p>`}
      </div>
      <div class="rv-acts">${pj.confirmDel
        ? `<span class="confirm-row">Delete this project? Students lose its office.<button class="btn btn-ghost btn-sm" type="button" id="pjDelYes" style="border-color:var(--danger);color:var(--danger)">Yes, delete</button><button class="btn btn-ghost btn-sm" type="button" id="pjDelNo">Keep it</button></span>`
        : `<button class="btn btn-primary btn-sm" type="button" id="pjSave">${e.id ? 'Save project' : 'Create project'}</button><button class="btn btn-ghost btn-sm" type="button" id="pjCancel">Cancel</button>${e.id ? '<button class="btn btn-ghost btn-sm rv-return" type="button" id="pjDel" style="margin-left:auto">Delete project</button>' : ''}`}<span class="rv-err" id="pjErr" role="alert"></span></div>
    </section>`;
  }
  function bindEditor(byId) {
    const e = pj.edit; const root = $('#projectsRoot');
    const bind = (sel, k) => { const el = $(sel, root); if (el) el.addEventListener('input', () => { e[k] = el.value; }); };
    bind('#pjName', 'name'); bind('#pjClient', 'client'); bind('#pjDesc', 'description'); bind('#pjMeet', 'meetingUrl'); bind('#pjRepo', 'repoUrl');
    $('#pjStatus', root).addEventListener('click', (ev) => { const b = ev.target.closest('[data-k]'); if (!b) return; e.status = b.dataset.k; $('#pjStatus').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b)); });
    const list = $('#pjMembers', root);
    list.addEventListener('input', (ev) => { const row = ev.target.closest('.pj-row'); if (!row) return; const m = e.members[Number(row.dataset.i)]; if (ev.target.dataset.k === 'role') m.role = ev.target.value; });
    list.addEventListener('change', (ev) => { const row = ev.target.closest('.pj-row'); if (!row) return; const m = e.members[Number(row.dataset.i)]; if (ev.target.dataset.k === 'isLead') m.isLead = ev.target.checked; });
    list.addEventListener('click', (ev) => { const b = ev.target.closest('[data-act="del"]'); if (!b) return; e.members.splice(Number(b.closest('.pj-row').dataset.i), 1); renderProjects(); });
    const add = $('#pjAdd', root);
    if (add) add.addEventListener('click', () => {
      const id = Number($('#pjPick').value); if (!id) { $('#pjPick').focus(); return; }
      const s = byId[id]; e.members.push({ studentId: id, role: s.pathName || '', isLead: false, name: s.name, accent: s.accent, pathName: s.pathName });
      renderProjects(); const sel = $('#pjPick'); if (sel) sel.focus();
    });
    const cancel = $('#pjCancel', root); if (cancel) cancel.onclick = () => { pj.edit = null; renderProjects(); };
    const del = $('#pjDel', root); if (del) del.onclick = () => { pj.confirmDel = true; renderProjects(); };
    const no = $('#pjDelNo', root); if (no) no.onclick = () => { pj.confirmDel = false; renderProjects(); };
    const yes = $('#pjDelYes', root); if (yes) yes.onclick = async () => {
      try { await S().api('/api/admin/projects/' + e.id, { method: 'DELETE' }); pj.edit = null; S().toast('Project deleted'); projects(); } catch (err) { S().toast(err.message); }
    };
    const save = $('#pjSave', root); if (save) save.onclick = async () => {
      $('#pjErr').textContent = '';
      if (!e.name.trim()) { $('#pjErr').textContent = 'Give the project a name.'; $('#pjName').focus(); return; }
      save.disabled = true;
      try {
        const body = JSON.stringify({ ...e, members: e.members.map((m) => ({ studentId: m.studentId, role: m.role, isLead: m.isLead })) });
        await S().api('/api/admin/projects' + (e.id ? '/' + e.id : ''), { method: e.id ? 'PUT' : 'POST', body });
        S().toast(e.id ? 'Project saved. The team sees it now.' : 'Project created. The team sees it in their virtual office.');
        pj.edit = null; projects();
      } catch (err) { $('#pjErr').textContent = err.message; save.disabled = false; }
    };
  }

  window.AdminWork = { reviews, projects };
})();
