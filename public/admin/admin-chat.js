/* Admin messages: chat with students who have a portal account.
   Uses window.SBX (api, toast, esc, ROLES, openApplicant, go) from admin/index.html. */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const S = () => window.SBX;
  const esc = (v) => S().esc(v);
  const AV = ['#f4cf82', '#5ee3bc', '#7cc4ff', '#c4a7ff', '#ff8a7a', '#e3a94a'];
  const st = { convs: [], open: null, student: null, msgs: [], lastId: 0, filter: '', timer: null, listTick: 0, sending: false };

  const visible = () => !$('#messagesView').hidden && !document.hidden;
  const initials = (n) => String(n || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  const avColor = (id) => AV[id % AV.length];
  function when(iso) {
    const d = new Date(iso); const now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /* unread badge on the Messages tab, refreshed every 30s while signed in */
  async function refreshBadge() {
    const tab = document.querySelector('#nav a[data-view="messages"]'); if (!tab || $('#nav').hidden) return;
    try {
      const { unread } = await S().api('/api/admin/unread');
      let b = tab.querySelector('.nav-badge');
      if (unread) { if (!b) { b = document.createElement('span'); b.className = 'nav-badge'; tab.appendChild(b); } b.textContent = unread > 99 ? '99+' : unread; b.setAttribute('aria-label', unread + ' unread'); }
      else if (b) b.remove();
    } catch (e) { /* signed out */ }
  }
  setInterval(() => { if (!document.hidden) refreshBadge(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshBadge(); if (visible()) tick(); } });

  async function messages(arg) {
    const root = $('#messagesRoot');
    const want = /^\d+$/.test(arg || '') ? Number(arg) : null;
    if (!root.dataset.ready) {
      root.dataset.ready = '1';
      root.innerHTML = `
        <div class="page-head"><div><span class="label">Messages</span><h1>Chat with students</h1><p>Students with a portal account can message the SandBox team. Replies show up in their portal.</p></div></div>
        <div class="chat" id="chat">
          <div class="convs"><div class="search"><input type="text" id="convQ" placeholder="Search students" aria-label="Search students"></div><ul class="conv-list" id="convList"></ul></div>
          <div class="thread" id="thread"></div>
        </div>`;
      $('#convQ').addEventListener('input', (e) => { st.filter = e.target.value.trim().toLowerCase(); renderList(); });
      $('#convList').addEventListener('click', (e) => { const b = e.target.closest('.conv'); if (b) S().go('messages/' + b.dataset.id); });
    }
    await loadList();
    if (want !== st.open) { st.open = want; st.msgs = []; st.lastId = 0; st.student = null; }
    renderList();
    if (st.open) await loadThread(true); else renderThread();
    clearInterval(st.timer); st.timer = setInterval(tick, 4000);
    refreshBadge();
  }

  async function tick() {
    if (!visible()) return;
    st.listTick++;
    if (st.open) await loadThread(false);
    if (st.listTick % 3 === 0 || !st.open) { await loadList(); renderList(); }
  }

  async function loadList() {
    try { st.convs = await S().api('/api/admin/conversations'); } catch (e) { S().toast(e.message); }
  }

  function renderList() {
    const list = $('#convList'); if (!list) return;
    const f = st.filter;
    const rows = st.convs.filter((c) => !f || c.name.toLowerCase().includes(f) || c.email.toLowerCase().includes(f));
    $('#chat').classList.toggle('has-open', !!st.open);
    if (!st.convs.length) { list.innerHTML = '<li class="chat-empty" style="padding:2rem 1rem"><strong>No student accounts yet</strong><span>Students appear here once they set up a portal account.</span></li>'; return; }
    if (!rows.length) { list.innerHTML = '<li class="chat-empty" style="padding:2rem 1rem"><span>No students match.</span></li>'; return; }
    list.innerHTML = rows.map((c) => `<li><button type="button" class="conv ${c.unread ? 'unread' : ''}" data-id="${c.studentId}" aria-current="${c.studentId === st.open}">
        <span class="avatar" style="--av:${avColor(c.studentId)}">${esc(initials(c.name))}</span>
        <span class="nm">${esc(c.name)}</span>
        <span class="tm">${c.last ? when(c.last.createdAt) : ''}</span>
        <span class="pv">${c.last ? (c.last.from === 'admin' ? 'You: ' : '') + esc(c.last.body) : `<i>${c.path ? esc(S().ROLES[c.path]) : esc(c.status || 'no application')}</i>`}</span>
        <span class="ub">${c.unread ? `<span class="nav-badge" style="margin:0">${c.unread}</span>` : ''}</span>
      </button></li>`).join('');
  }

  async function loadThread(first) {
    const id = st.open;
    try {
      const r = await S().api(`/api/admin/conversations/${id}?after=${first ? 0 : st.lastId}`);
      if (id !== st.open) return;
      st.student = r.student;
      if (first) st.msgs = r.messages; else st.msgs.push(...r.messages.filter((m) => !st.msgs.some((x) => x.id === m.id)));
      if (st.msgs.length) st.lastId = st.msgs[st.msgs.length - 1].id;
      st.seenUpTo = r.seenUpTo || 0;
      if (first) renderThread(); else if (r.messages.length) appendMsgs();
      markSeen();
      if (first || r.messages.some((m) => m.from === 'student')) {
        const c = st.convs.find((x) => x.studentId === id); if (c && c.unread) { c.unread = 0; renderList(); }
        refreshBadge();
      }
    } catch (e) { if (first) { S().toast(e.message); st.open = null; renderThread(); } }
  }

  function msgsHtml(list, prev) {
    let out = ''; let lastDay = prev ? new Date(prev.createdAt).toDateString() : null;
    list.forEach((m) => {
      const day = new Date(m.createdAt).toDateString();
      if (day !== lastDay) { out += `<div class="day-sep">${new Date(m.createdAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>`; lastDay = day; }
      const me = m.from === 'admin';
      out += `<div class="msg ${me ? 'me' : 'them'}" data-id="${m.id}">${esc(m.body)}</div>
        <div class="msg-meta ${me ? 'me' : ''}">${new Date(m.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}${me && m.by ? ' · ' + esc(m.by) : ''}</div>`;
    });
    return out;
  }

  function renderThread() {
    const t = $('#thread'); if (!t) return;
    $('#chat').classList.toggle('has-open', !!st.open);
    if (!st.open || !st.student) {
      t.innerHTML = `<div class="chat-empty">${window.Cubit ? `<div class="cubit-inline" style="width:110px">${Cubit.svg('hello')}</div>` : ''}<strong>Pick a student</strong><span>Choose someone on the left to read and reply to their messages.</span></div>`;
      return;
    }
    const s = st.student;
    t.innerHTML = `
      <div class="th-head">
        <button class="btn btn-ghost btn-sm th-back" type="button" id="thBack">← Back</button>
        <span class="avatar" style="--av:${avColor(s.studentId)};grid-row:auto">${esc(initials(s.name))}</span>
        <div class="who-b"><div class="nm">${esc(s.name)}</div><div class="sub">${esc(s.email)}${s.status ? ' · ' + esc(s.status) : ''}${s.path ? ' · ' + esc(S().ROLES[s.path]) : ''}</div></div>
        ${s.applicationId ? '<button class="btn btn-ghost btn-sm" type="button" id="thApp">View application</button>' : ''}
      </div>
      <div class="msgs" id="msgs" aria-live="polite">${st.msgs.length ? msgsHtml(st.msgs) : `<div class="chat-empty"><strong>No messages yet</strong><span>Say hi to ${esc(s.name.split(' ')[0])}. They'll see it in their portal.</span></div>`}</div>
      <form class="composer" id="composer"><textarea id="msgIn" rows="1" maxlength="2000" placeholder="Write a message…" aria-label="Message"></textarea><button class="btn btn-primary btn-sm" type="submit" style="height:44px">Send</button></form>`;
    const box = $('#msgs'); box.scrollTop = box.scrollHeight;
    $('#thBack').onclick = () => S().go('messages');
    if ($('#thApp')) $('#thApp').onclick = () => { S().go('applicants'); setTimeout(() => S().openApplicant(s.applicationId), 150); };
    const ta = $('#msgIn');
    const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight) + 'px'; };
    ta.addEventListener('input', grow);
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#composer').requestSubmit(); } });
    $('#composer').addEventListener('submit', send);
    if (matchMedia("(min-width: 861px)").matches) ta.focus({ preventScroll: true });
  }

  function appendMsgs() {
    const box = $('#msgs'); if (!box) return;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
    const shown = new Set([...box.querySelectorAll('.msg')].map((el) => Number(el.dataset.id)));
    const fresh = st.msgs.filter((m) => !shown.has(m.id));
    if (!shown.size) { box.innerHTML = msgsHtml(st.msgs); }
    else if (fresh.length) { const prev = st.msgs[st.msgs.indexOf(fresh[0]) - 1]; box.insertAdjacentHTML('beforeend', msgsHtml(fresh, prev)); }
    if (nearBottom) box.scrollTop = box.scrollHeight;
  }

  // "seen" goes under the newest admin message the student has read
  function markSeen() {
    const box = $('#msgs'); if (!box) return;
    box.querySelectorAll('.seen-mark').forEach((el) => el.remove());
    const mine = [...box.querySelectorAll('.msg.me')].filter((el) => Number(el.dataset.id) <= (st.seenUpTo || 0));
    const last = mine[mine.length - 1];
    if (last && last.nextElementSibling) last.nextElementSibling.insertAdjacentHTML('beforeend', '<span class="seen-mark"> · seen</span>');
  }

  async function send(e) {
    e.preventDefault();
    const ta = $('#msgIn'); const body = ta.value.trim();
    if (!body || st.sending) return;
    st.sending = true;
    try {
      const m = await S().api('/api/admin/conversations/' + st.open, { method: 'POST', body: JSON.stringify({ body }) });
      ta.value = ''; ta.style.height = 'auto';
      if (!st.msgs.some((x) => x.id === m.id)) st.msgs.push(m);
      st.lastId = Math.max(st.lastId, m.id);
      appendMsgs(); const box = $('#msgs'); box.scrollTop = box.scrollHeight;
      const c = st.convs.find((x) => x.studentId === st.open);
      if (c) { c.last = { body: m.body.slice(0, 140), from: 'admin', createdAt: m.createdAt }; st.convs = [c, ...st.convs.filter((x) => x !== c)]; renderList(); }
    } catch (err) { S().toast(err.message); }
    st.sending = false; ta.focus({ preventScroll: true });
  }

  window.AdminChat = { messages, refreshBadge };
})();
