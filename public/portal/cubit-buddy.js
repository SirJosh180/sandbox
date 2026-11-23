/* Cubit, the student portal buddy.
   A floating Cubit that collects the student's notifications (new messages from the team,
   the next module to do, videos to watch, application status), shows them as an emoji list,
   and pops up with a speech bubble and emoji when something new happens.
   The portal page drives it through window.CubitBuddy and gives it actions through window.Portal. */
(function () {
  'use strict';
  if (!window.Cubit) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return sessionStorage.getItem('sbx-buddy-' + k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem('sbx-buddy-' + k, v); } catch (e) { /* private mode */ } },
  };
  const P = () => window.Portal || {};

  const ctx = { ready: false, first: '', app: null, path: null, progress: [], unread: 0, lastMsg: null, chatOpen: false };
  let mood = null; let open = false; let items = []; let emojiTimer = null; let emojiIdx = 0;

  const wrap = document.createElement('div');
  wrap.className = 'cubit-helper buddy';
  wrap.hidden = true;
  wrap.innerHTML = `
    <div class="cubit-bubble buddy-bubble" id="buddyBubble" role="dialog" aria-labelledby="buddyTitle" hidden>
      <button type="button" class="cubit-close" aria-label="Close Cubit">×</button>
      <strong class="cubit-title" id="buddyTitle"></strong>
      <p class="cubit-text" id="buddyText"></p>
      <ul class="buddy-list" id="buddyList"></ul>
    </div>
    <div class="buddy-stage">
      <span class="buddy-emoji" aria-hidden="true"></span>
      <button type="button" class="cubit-btn" id="buddyBtn" aria-controls="buddyBubble" aria-expanded="false"></button>
      <span class="buddy-badge" hidden></span>
    </div>`;
  document.body.appendChild(wrap);
  const $ = (s) => wrap.querySelector(s);
  const bubble = $('#buddyBubble'); const btn = $('#buddyBtn'); const badge = $('.buddy-badge'); const emojiEl = $('.buddy-emoji');

  function setMood(m) {
    if (m === mood) return; mood = m;
    btn.innerHTML = Cubit.svg(m);
    btn.classList.remove('cubit-swap'); void btn.offsetWidth; btn.classList.add('cubit-swap');
  }

  /* ---------- what Cubit knows ---------- */
  function build() {
    const out = [];
    const a = ctx.app; const p = ctx.path;
    if (ctx.unread) {
      out.push({ emoji: '💬', kind: 'msg', text: ctx.unread === 1 ? '1 new message from the SandBox team' : `${ctx.unread} new messages from the SandBox team`,
        sub: ctx.lastMsg ? `“${ctx.lastMsg.body.slice(0, 80)}${ctx.lastMsg.body.length > 80 ? '…' : ''}”` : '', action: 'Read', run: () => P().openChat && P().openChat() });
    }
    if (!a) {
      out.push({ emoji: '📝', kind: 'task', text: 'You haven’t applied yet', action: 'Apply now', run: () => { location.href = '/#apply'; } });
    } else if (p) {
      const done = new Set(ctx.progress);
      const left = p.modules.filter((m) => !done.has(m.id));
      if (!left.length) out.push({ emoji: '🎉', kind: 'done', text: `All ${p.modules.length} modules done. Amazing work!`, sub: 'Show your team what you built at demo day.' });
      else {
        const next = left[0];
        out.push({ emoji: '📚', kind: 'task', text: `Next up: ${next.title}`, sub: `Week ${next.week} · deliverable: ${next.deliverable}`, action: 'Show me', run: () => P().showModule && P().showModule(next.id) });
        if (next.video) out.push({ emoji: '🎬', kind: 'task', text: 'There’s a video for this module', action: 'Watch', run: () => P().playModule && P().playModule(next.id) });
        if (left.length > 1) out.push({ emoji: '🗂️', kind: 'info', text: `${left.length - 1} more module${left.length - 1 === 1 ? '' : 's'} after that`, sub: `${p.modules.length - left.length} of ${p.modules.length} done so far` });
      }
    } else {
      const s = { pending: ['⏳', 'Your application is in review', 'The team will update you here and by email.'],
        shortlisted: ['⭐', 'You’re on the shortlist!', 'Keep an eye on your messages for next steps.'],
        accepted: ['🚀', 'You’re accepted! Your path is coming', 'Your modules appear here once the team sets your path.'],
        rejected: ['💪', 'Not this cohort, but keep going', 'You can apply again for the next cohort.'] }[a.status];
      if (s) out.push({ emoji: s[0], kind: a.status === 'rejected' ? 'info' : 'status', text: s[1], sub: s[2], ...(a.status === 'rejected' ? { action: 'Apply again', run: () => { location.href = '/#apply'; } } : {}) });
    }
    out.push({ emoji: '🙋', kind: 'help', text: 'Stuck or have a question?', action: 'Ask the team', run: () => P().openChat && P().openChat() });
    return out;
  }

  function pickMood() {
    if (ctx.unread) return 'hello';
    const a = ctx.app;
    if (!a) return 'hmm';
    if (a.status === 'rejected') return 'oops';
    if (ctx.path) return ctx.path.modules.every((m) => ctx.progress.includes(m.id)) ? 'hello' : 'build';
    return a.status === 'pending' ? 'hmm' : 'build';
  }

  function headline() {
    const name = ctx.first ? `, ${ctx.first}` : '';
    if (ctx.unread) return [`Psst${name}! 👋`, 'The team sent you something.'];
    const tasks = items.filter((i) => i.kind === 'task').length;
    if (tasks) return [`Hi${name}! 👋`, 'Here’s what’s next for you.'];
    if (items.some((i) => i.kind === 'done')) return [`Woohoo${name}! 🥳`, 'You’re all caught up.'];
    return [`Hi${name}! 👋`, 'Here’s where things stand.'];
  }

  /* ---------- drawing ---------- */
  function refresh() {
    if (!ctx.ready) return;
    items = build();
    setMood(pickMood());
    const count = ctx.unread + items.filter((i) => i.kind === 'task').length;
    badge.hidden = !count; badge.textContent = count > 9 ? '9+' : count;
    btn.setAttribute('aria-label', `Cubit, your helper. ${count ? count + ' notification' + (count === 1 ? '' : 's') : 'No new notifications'}. Open.`);
    // the little emoji above Cubit's head cycles through what's waiting
    const emojis = items.filter((i) => i.kind !== 'help').map((i) => i.emoji);
    clearInterval(emojiTimer);
    if (emojis.length && !open) {
      emojiIdx = 0; showEmoji(emojis[0]);
      if (emojis.length > 1) emojiTimer = setInterval(() => { emojiIdx = (emojiIdx + 1) % emojis.length; showEmoji(emojis[emojiIdx]); }, 2600);
    } else emojiEl.classList.remove('on');
    if (open) renderBubble();
    wrap.hidden = ctx.chatOpen;
  }
  function showEmoji(e) {
    emojiEl.textContent = e;
    emojiEl.classList.remove('on'); void emojiEl.offsetWidth; emojiEl.classList.add('on');
  }

  function renderBubble(custom) {
    const [t, s] = custom ? [custom.title, custom.text] : headline();
    $('#buddyTitle').textContent = t; $('#buddyText').textContent = s;
    const list = custom ? custom.items : items;
    $('#buddyList').innerHTML = list.map((i, n) => `<li class="buddy-item k-${i.kind}"><span class="bi-emoji" aria-hidden="true">${i.emoji}</span>
      <span class="bi-body"><span class="bi-text">${esc(i.text)}</span>${i.sub ? `<span class="bi-sub">${esc(i.sub)}</span>` : ''}</span>
      ${i.action ? `<button type="button" class="cubit-action" data-n="${n}">${esc(i.action)}</button>` : ''}</li>`).join('');
    $('#buddyList').querySelectorAll('[data-n]').forEach((b) => b.addEventListener('click', () => { const it = list[Number(b.dataset.n)]; close(); it.run(); }));
  }

  function show(custom) {
    open = true; clearInterval(emojiTimer); emojiEl.classList.remove('on');
    renderBubble(custom);
    bubble.hidden = false; btn.setAttribute('aria-expanded', 'true');
    bubble.classList.remove('cubit-pop'); void bubble.offsetWidth; bubble.classList.add('cubit-pop');
  }
  function close() { open = false; bubble.hidden = true; btn.setAttribute('aria-expanded', 'false'); refresh(); }

  // a quick burst of emoji when something new arrives
  function burst(list) {
    const stage = $('.buddy-stage');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    list.forEach((e, i) => {
      const s = document.createElement('span'); s.className = 'buddy-burst'; s.textContent = e;
      s.style.setProperty('--dx', `${(i - (list.length - 1) / 2) * 34}px`); s.style.animationDelay = `${i * 70}ms`;
      stage.appendChild(s); setTimeout(() => s.remove(), 1600 + i * 70);
    });
  }

  btn.addEventListener('click', () => (open ? close() : show()));
  $('.cubit-close').addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) { close(); btn.focus(); } });
  document.addEventListener('click', (e) => { if (open && !wrap.contains(e.target)) close(); });

  /* ---------- API for the portal page ---------- */
  window.CubitBuddy = {
    // called after the dashboard renders
    setContext({ first, application, path, progress }) {
      const firstTime = !ctx.ready;
      Object.assign(ctx, { ready: true, first: first || '', app: application, path, progress: [...(progress || [])] });
      refresh();
      if (firstTime && !store.get('greeted')) {
        store.set('greeted', '1');
        setTimeout(() => { if (!open && !ctx.chatOpen) { show(); burst(items.filter((i) => i.kind !== 'help').map((i) => i.emoji).slice(0, 4)); } }, 900);
      }
    },
    setProgress(progress) { ctx.progress = [...progress]; const wasDone = items.some((i) => i.kind === 'done'); refresh(); if (!wasDone && items.some((i) => i.kind === 'done')) { show(); burst(['🎉', '🥳', '🏆', '✨']); } },
    setUnread(n, last) { ctx.unread = n; if (last) ctx.lastMsg = last; refresh(); },
    // a new message from the team arrived while the chat was closed
    newMessage(m) {
      ctx.lastMsg = m; refresh();
      if (ctx.chatOpen) return;
      show({ title: 'New message! 💬', text: 'The SandBox team wrote to you:', items: [{ emoji: '📨', kind: 'msg', text: m.body.length > 140 ? m.body.slice(0, 140) + '…' : m.body, sub: 'SandBox team · just now', action: 'Reply', run: () => P().openChat && P().openChat() }] });
      burst(['💬', '📨', '👋']);
    },
    chatOpen(v) { ctx.chatOpen = v; if (v && open) close(); refresh(); },
    hide() { ctx.ready = false; wrap.hidden = true; close(); },
  };
})();
