/* Admin views: Overview dashboard and the Paths & modules CMS.
   Uses window.SBX (api, toast, esc, ROLES, openApplicant, go) from admin/index.html. */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const S = () => window.SBX;
  const esc = (v) => S().esc(v);
  const STATUS_COLORS = { pending: 'var(--pending)', shortlisted: 'var(--shortlisted)', accepted: 'var(--accepted)', rejected: 'var(--rejected)' };

  /* ---------------- overview ---------------- */
  async function overview() {
    const root = $('#overviewRoot');
    if (!root.dataset.loaded) root.innerHTML = '<p class="muted" style="color:var(--muted)">Loading…</p>';
    let d;
    try { d = await S().api('/api/admin/overview'); } catch (e) { S().toast(e.message); return; }
    root.dataset.loaded = '1';
    const pathById = Object.fromEntries(d.paths.map((p) => [p.id, p]));

    // last 14 days, filling gaps
    const counts = Object.fromEntries(d.days.map((x) => [x.day, x.n]));
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const dt = new Date(); dt.setUTCHours(0, 0, 0, 0); dt.setUTCDate(dt.getUTCDate() - i);
      const key = dt.toISOString().slice(0, 10);
      days.push({ key, n: counts[key] || 0, label: dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }) });
    }
    const last14 = days.reduce((a, b) => a + b.n, 0);
    const maxDay = Math.max(1, ...days.map((x) => x.n));
    const maxStatus = Math.max(1, ...Object.values(d.byStatus));
    const maxDemand = Math.max(1, ...Object.values(d.demand));

    root.innerHTML = `
      <div class="page-head"><div><span class="label">Overview</span><h1>Dashboard</h1><p>How applications are coming in and how students are moving through their paths.</p></div></div>
      <div class="kpis">
        <div class="kpi"><span class="k">Applicants</span><span class="n">${d.total}</span><span class="s">${last14} in the last 14 days</span></div>
        <div class="kpi ${d.byStatus.pending ? 'attn' : ''}"><span class="k">Waiting for review</span><span class="n">${d.byStatus.pending}</span><button class="link-btn" type="button" data-go="pending">Review now →</button></div>
        <div class="kpi ${d.unassigned ? 'attn' : ''}"><span class="k">Accepted, no path</span><span class="n">${d.unassigned}</span><button class="link-btn" type="button" data-go="accepted">Assign paths →</button></div>
        <div class="kpi"><span class="k">Portal accounts</span><span class="n">${d.accounts}</span><span class="s">students signed up</span></div>
      </div>
      <div class="ov-grid">
        <div class="box"><h2>New applications <span class="label">last 14 days</span></h2>
          <div class="cols" role="img" aria-label="Applications per day for the last 14 days">${days.map((x) => `<div class="c ${x.n ? '' : 'zero'}" title="${esc(x.label)}: ${x.n}">${x.n ? `<b>${x.n}</b>` : ''}<i style="height:${(x.n / maxDay) * 100}%"></i></div>`).join('')}</div>
          <div class="cols-x"><span>${esc(days[0].label)}</span><span>${esc(days[13].label)}</span></div></div>
        <div class="box"><h2>Pipeline <span class="label">by status</span></h2>
          <div class="funnel">${['pending', 'shortlisted', 'accepted', 'rejected'].map((k) => `<div class="row"><span>${k}</span><div class="t"><i style="width:${(d.byStatus[k] / maxStatus) * 100}%;background:${STATUS_COLORS[k]}"></i></div><span class="v mono" style="text-align:right">${d.byStatus[k]}</span></div>`).join('')}</div></div>
        <div class="box"><h2>Roles students want <span class="label">picked on the form</span></h2>
          ${Object.keys(d.demand).length ? `<div class="hbars">${d.paths.map((p) => `<div class="hbar"><span>${esc(p.name)}</span><div class="t"><i style="width:${((d.demand[p.id] || 0) / maxDemand) * 100}%;background:${esc(p.accent)}"></i></div><span class="v">${d.demand[p.id] || 0}</span></div>`).join('')}</div>` : '<p class="empty">No applications yet.</p>'}</div>
        <div class="box"><h2>Path progress <button class="link-btn" type="button" data-go="content">Edit modules →</button></h2>
          <div class="hbars">${d.completion.map((c) => { const p = pathById[c.path]; return `<div class="hbar"><span>${esc(p.name)}<br><small style="color:var(--muted);font-size:.72rem">${c.students} student${c.students === 1 ? '' : 's'}</small></span><div class="t"><i style="width:${c.avg}%;background:${esc(p.accent)}"></i></div><span class="v">${c.students ? c.avg + '%' : '–'}</span></div>`; }).join('')}</div>
          <p class="empty" style="margin-top:.9rem;font-size:.8rem">Average share of modules ticked off by accepted students on each path.</p></div>
      </div>
      <div class="box"><h2>Latest applications <button class="link-btn" type="button" data-go="applicants">See all →</button></h2>
        ${d.recent.length ? `<ul class="recent">${d.recent.map((a) => `<li tabindex="0" data-id="${a.id}"><div><div class="nm">${esc(a.firstName + ' ' + a.lastName)}</div><div class="sub">${esc(a.school)} · ${a.roles.map((r) => esc(pathById[r]?.code || r)).join(', ')}</div></div><div style="text-align:right"><span class="status"><span class="dot ${a.status}"></span>${a.status}</span><div class="sub" style="margin-top:.3rem">${new Date(a.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div></div></li>`).join('')}</ul>` : '<p class="empty">When students apply, they show up here.</p>'}</div>`;

    root.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
      const g = b.dataset.go;
      if (g === 'pending' || g === 'accepted') { sessionStorage.setItem('sbx-status-filter', g); S().go('applicants'); }
      else S().go(g);
    }));
    root.querySelectorAll('.recent li').forEach((li) => {
      const open = () => { S().go('applicants'); setTimeout(() => S().openApplicant(Number(li.dataset.id)), 150); };
      li.addEventListener('click', open);
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    });
  }

  /* ---------------- CMS ---------------- */
  const cms = { paths: [], current: null, draft: null, dirty: false, confirmReset: false };
  const clone = (o) => JSON.parse(JSON.stringify(o));

  async function content() {
    if (cms.dirty && cms.draft) { renderCms(); return; }
    const root = $('#contentRoot');
    if (!cms.paths.length) root.innerHTML = '<p style="color:var(--muted)">Loading…</p>';
    try { cms.paths = await S().api('/api/admin/paths'); } catch (e) { S().toast(e.message); return; }
    if (!cms.current || !cms.paths.some((p) => p.id === cms.current)) cms.current = cms.paths[0].id;
    select(cms.current);
  }
  function select(id) {
    cms.current = id;
    cms.draft = clone(cms.paths.find((p) => p.id === id));
    cms.dirty = false; cms.confirmReset = false;
    renderCms();
  }
  function markDirty() {
    if (!cms.dirty) { cms.dirty = true; const st = $('#edState'); if (st) { st.textContent = '● unsaved changes'; st.classList.add('dirty'); } }
  }

  function renderCms() {
    const root = $('#contentRoot');
    const p = cms.draft;
    const saved = cms.paths.find((x) => x.id === p.id);
    const stats = saved.stats || { students: 0, doneByModule: {} };
    const kind = p.panel.kind;
    root.innerHTML = `
      <div class="page-head"><div><span class="label">Content</span><h1>Paths &amp; modules</h1><p>Edit what students see in their portal for each path. Changes go live as soon as you save.</p></div></div>
      <div class="cms">
        <nav class="path-list" aria-label="Paths">${cms.paths.map((x) => `<button type="button" class="path-item" data-id="${x.id}" aria-current="${x.id === p.id}" style="--pa:${esc(x.id === p.id ? p.accent : x.accent)}"><span class="sw"></span><strong>${esc(x.id === p.id ? p.name : x.name)}</strong><small>${x.modules.length} modules · ${x.stats.students} students</small></button>`).join('')}</nav>
        <div class="editor" style="--pa:${esc(p.accent)}">
          <div class="ed-bar"><span class="state ${cms.dirty ? 'dirty' : ''}" id="edState">${cms.dirty ? '● unsaved changes' : `saved${saved.updatedAt ? ' · ' + new Date(saved.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''}`}</span>
            <div class="acts" id="edActs">${cms.confirmReset
              ? `<span class="confirm-row">Replace this path's content with the defaults?<button class="btn btn-ghost btn-sm" type="button" id="resetYes" style="border-color:var(--danger);color:var(--danger)">Yes, reset</button><button class="btn btn-ghost btn-sm" type="button" id="resetNo">Cancel</button></span>`
              : `<button class="btn btn-ghost btn-sm" type="button" id="resetBtn">Reset to defaults</button><button class="btn btn-ghost btn-sm" type="button" id="discardBtn">Discard</button><button class="btn btn-primary btn-sm" type="button" id="saveBtn">Save changes</button>`}</div></div>

          <section class="ed-sec"><h2>Path details <span class="label">${stats.students} accepted student${stats.students === 1 ? '' : 's'} on this path</span></h2>
            <div class="row2">
              <div class="field"><label for="pName">Name</label><input id="pName" type="text" maxlength="60" value="${esc(p.name)}"></div>
              <div class="field"><label for="pCode">Short code</label><input id="pCode" type="text" maxlength="8" value="${esc(p.code)}"></div>
              <div class="field"><label for="pAccentT">Accent colour</label><div class="color-in"><input type="color" id="pAccent" value="${esc(p.accent)}" aria-label="Pick accent colour"><input id="pAccentT" type="text" maxlength="7" value="${esc(p.accent)}"></div></div>
            </div>
            <div class="field"><label for="pMission">Mission <span class="opt">(one line under the title)</span></label><input id="pMission" type="text" maxlength="200" value="${esc(p.mission)}"></div>
            <div class="preview-strip" aria-hidden="true"><div><div class="t">You're our <em id="pvName">${esc(p.name)}</em></div><p id="pvMission">${esc(p.mission)}</p></div></div>
          </section>

          <section class="ed-sec"><h2>Modules <span class="label">${p.modules.length} module${p.modules.length === 1 ? '' : 's'} · students tick these off</span></h2>
            <div class="rep" id="modList">${p.modules.map((m, i) => `
              <div class="rep-item" data-i="${i}">
                <span class="num">${i + 1}</span>
                <div class="fields">
                  <div class="field"><label for="mw${i}">Week</label><input id="mw${i}" data-k="week" type="number" min="1" max="52" value="${m.week}"></div>
                  <div class="field"><label for="mt${i}">Title</label><input id="mt${i}" data-k="title" type="text" maxlength="100" value="${esc(m.title)}"></div>
                  <div class="field full"><label for="md${i}">Description</label><textarea id="md${i}" data-k="desc" maxlength="300">${esc(m.desc)}</textarea></div>
                  <div class="field full"><label for="mv${i}">Deliverable</label><input id="mv${i}" data-k="deliverable" type="text" maxlength="100" value="${esc(m.deliverable)}"></div>
                  <span class="meta full">${stats.doneByModule[m.id] ? `${stats.doneByModule[m.id]} of ${stats.students} students done` : saved.modules.some((x) => x.id === m.id) ? 'no one has finished this yet' : 'new module, not saved yet'}</span>
                </div>
                <div class="tools-col">
                  <button class="icon-btn" type="button" data-act="up" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
                  <button class="icon-btn" type="button" data-act="down" aria-label="Move down" ${i === p.modules.length - 1 ? 'disabled' : ''}>↓</button>
                  <button class="icon-btn del" type="button" data-act="del" aria-label="Remove module">✕</button>
                </div>
              </div>`).join('')}</div>
            <button class="add-btn" type="button" id="addMod">+ Add module</button>
          </section>

          <section class="ed-sec"><h2>Side panel <span class="label">shown next to the modules</span></h2>
            <div class="row2" style="grid-template-columns:minmax(0,1fr) auto">
              <div class="field"><label for="pnTitle">Panel title</label><input id="pnTitle" type="text" maxlength="80" value="${esc(p.panel.title)}"></div>
              <div class="field"><span class="flabel" style="font-size:.9rem;font-weight:600">Style</span><div class="seg-pick" id="pnKind">${[['checklist', 'Checklist'], ['rituals', 'Rituals'], ['pipeline', 'Pipeline']].map(([k, l]) => `<button type="button" data-k="${k}" aria-pressed="${kind === k}">${l}</button>`).join('')}</div></div>
            </div>
            <div class="rep" id="pnList">${p.panel.items.map((it, i) => `
              <div class="rep-item" data-i="${i}">
                <span class="num">${i + 1}</span>
                <div class="fields ${kind === 'checklist' ? 'one' : 'two'}">
                  <div class="field"><label for="pl${i}">${kind === 'checklist' ? 'Checklist item' : 'Label'}</label><input id="pl${i}" data-k="label" type="text" maxlength="120" value="${esc(it.label)}"></div>
                  ${kind === 'checklist' ? '' : `<div class="field"><label for="pd${i}">Detail</label><input id="pd${i}" data-k="detail" type="text" maxlength="240" value="${esc(it.detail || '')}"></div>`}
                </div>
                <div class="tools-col">
                  <button class="icon-btn" type="button" data-act="up" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
                  <button class="icon-btn" type="button" data-act="down" aria-label="Move down" ${i === p.panel.items.length - 1 ? 'disabled' : ''}>↓</button>
                  <button class="icon-btn del" type="button" data-act="del" aria-label="Remove item">✕</button>
                </div>
              </div>`).join('')}</div>
            <button class="add-btn" type="button" id="addItem">+ Add ${kind === 'checklist' ? 'checklist item' : kind === 'rituals' ? 'ritual' : 'pipeline step'}</button>
          </section>

          <section class="ed-sec"><h2>Toolkit <span class="label">tools students use on this path</span></h2>
            <div class="rep" id="toolList">${p.tools.map((t, i) => `
              <div class="rep-item" data-i="${i}" style="grid-template-columns:minmax(0,1fr) auto">
                <div class="fields one"><input data-k="tool" type="text" maxlength="40" value="${esc(t)}" aria-label="Tool ${i + 1}"></div>
                <div class="tools-col" style="flex-direction:row"><button class="icon-btn del" type="button" data-act="del" aria-label="Remove tool">✕</button></div>
              </div>`).join('')}</div>
            <button class="add-btn" type="button" id="addTool">+ Add tool</button>
          </section>
        </div>
      </div>`;
    bindCms();
  }

  function bindCms() {
    const root = $('#contentRoot'); const p = cms.draft;
    root.querySelectorAll('.path-item').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.id === p.id) return;
      if (cms.dirty) { S().toast('Save or discard your changes first'); return; }
      select(b.dataset.id);
    }));
    const bindText = (sel, fn) => { const el = $(sel, root); if (el) el.addEventListener('input', () => { fn(el.value); markDirty(); }); };
    bindText('#pName', (v) => { p.name = v; $('#pvName').textContent = v; const cur = root.querySelector('.path-item[aria-current="true"] strong'); if (cur) cur.textContent = v; });
    bindText('#pCode', (v) => { p.code = v; });
    bindText('#pMission', (v) => { p.mission = v; $('#pvMission').textContent = v; });
    bindText('#pnTitle', (v) => { p.panel.title = v; });
    const setAccent = (v) => {
      p.accent = v; $('.editor', root).style.setProperty('--pa', v);
      const cur = root.querySelector('.path-item[aria-current="true"]'); if (cur) cur.style.setProperty('--pa', v);
    };
    $('#pAccent', root).addEventListener('input', (e) => { setAccent(e.target.value); $('#pAccentT').value = e.target.value; markDirty(); });
    $('#pAccentT', root).addEventListener('input', (e) => { const v = e.target.value.trim(); if (/^#[0-9a-f]{6}$/i.test(v)) { setAccent(v); $('#pAccent').value = v; } markDirty(); });

    function bindRep(listSel, arr, onField) {
      const list = $(listSel, root);
      list.addEventListener('input', (e) => {
        const item = e.target.closest('.rep-item'); const k = e.target.dataset.k; if (!item || !k) return;
        onField(Number(item.dataset.i), k, e.target.value); markDirty();
      });
      list.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act]'); if (!btn) return;
        const i = Number(btn.closest('.rep-item').dataset.i); const a = arr();
        if (btn.dataset.act === 'del') a.splice(i, 1);
        if (btn.dataset.act === 'up' && i > 0) [a[i - 1], a[i]] = [a[i], a[i - 1]];
        if (btn.dataset.act === 'down' && i < a.length - 1) [a[i + 1], a[i]] = [a[i], a[i + 1]];
        cms.dirty = true; renderCms();
      });
    }
    bindRep('#modList', () => p.modules, (i, k, v) => { p.modules[i][k] = k === 'week' ? v : v; });
    bindRep('#pnList', () => p.panel.items, (i, k, v) => { p.panel.items[i][k] = v; });
    bindRep('#toolList', () => p.tools, (i, k, v) => { p.tools[i] = v; });

    const focusLast = (sel) => { const items = root.querySelectorAll(sel + ' .rep-item'); const last = items[items.length - 1]; const inp = last && last.querySelector('input,textarea'); if (inp) { inp.focus(); last.scrollIntoView({ block: 'center', behavior: 'smooth' }); } };
    $('#addMod', root).addEventListener('click', () => {
      const lastWeek = p.modules.length ? Number(p.modules[p.modules.length - 1].week) || 1 : 0;
      p.modules.push({ week: lastWeek + 1, title: '', desc: '', deliverable: '' }); cms.dirty = true; renderCms(); focusLast('#modList');
    });
    $('#addItem', root).addEventListener('click', () => { p.panel.items.push({ label: '', detail: '' }); cms.dirty = true; renderCms(); focusLast('#pnList'); });
    $('#addTool', root).addEventListener('click', () => { p.tools.push(''); cms.dirty = true; renderCms(); focusLast('#toolList'); });
    $('#pnKind', root).addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (!b || b.dataset.k === p.panel.kind) return; p.panel.kind = b.dataset.k; cms.dirty = true; renderCms(); });

    const save = $('#saveBtn', root), discard = $('#discardBtn', root), reset = $('#resetBtn', root);
    if (save) save.addEventListener('click', async () => {
      save.disabled = true; save.textContent = 'Saving…';
      try {
        const out = await S().api('/api/admin/paths/' + p.id, { method: 'PUT', body: JSON.stringify(p) });
        cms.paths = cms.paths.map((x) => (x.id === out.id ? out : x)); cms.dirty = false; select(out.id); S().toast('Saved. Students see the changes now.');
      } catch (e) { S().toast(e.message); save.disabled = false; save.textContent = 'Save changes'; }
    });
    if (discard) discard.addEventListener('click', () => { select(p.id); S().toast('Changes discarded'); });
    if (reset) reset.addEventListener('click', () => { cms.confirmReset = true; renderCms(); });
    const yes = $('#resetYes', root), no = $('#resetNo', root);
    if (no) no.addEventListener('click', () => { cms.confirmReset = false; renderCms(); });
    if (yes) yes.addEventListener('click', async () => {
      try { const out = await S().api('/api/admin/paths/' + p.id + '/reset', { method: 'POST' }); cms.paths = cms.paths.map((x) => (x.id === out.id ? out : x)); select(out.id); S().toast('Reset to defaults'); }
      catch (e) { S().toast(e.message); }
    });
  }

  function guard(next) {
    if (next !== 'content' && cms.dirty && !$('#contentView').hidden) {
      S().toast('Save or discard your changes first');
      history.replaceState(null, '', '#content');
      return false;
    }
    return true;
  }
  window.addEventListener('beforeunload', (e) => { if (cms.dirty) { e.preventDefault(); e.returnValue = ''; } });

  window.AdminViews = { overview, content, guard };
})();
