/* Cubit, the SandBox helper buddy.
   Cubit.svg(mood) returns an inline SVG string for one of four moods:
     hello  - welcomes and intros (waves)
     build  - progress and hands-on moments (holds a wrench)
     hmm    - tips and questions (hand on chin, question mark)
     oops   - errors and bugs (X eyes, arms up, sweat drop)
   Cubit.helper() mounts the floating buddy that reacts to the application form. */
(function (root) {
  'use strict';
  var C = {
    mint: '#5ee3bc', mintTop: '#a8f0d8', mintSide: '#2fbf93', ink: '#10141b',
    sand: '#f4cf82', gold: '#e3a94a', coral: '#ff8a7a', steel: '#8b95a5', drop: '#7cc4ff', shadow: 'rgba(0,0,0,.18)'
  };
  var MOODS = ['hello', 'build', 'hmm', 'oops'];

  function face(mood) {
    switch (mood) {
      case 'build':
        return '<g class="cb-eyes" fill="none" stroke="' + C.mint + '" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M70 103 l8 -9 l8 9"/><path d="M104 103 l8 -9 l8 9"/></g>' +
          '<path d="M76 114 h38 a19 15 0 0 1 -38 0z" fill="' + C.mint + '"/>';
      case 'hmm':
        return '<g class="cb-eyes" fill="' + C.mint + '"><rect x="74" y="92" width="8" height="12" rx="3"/><rect x="108" y="92" width="8" height="12" rx="3"/></g>' +
          '<path d="M84 124 l22 -4" stroke="' + C.mint + '" stroke-width="5" stroke-linecap="round"/>';
      case 'oops':
        return '<g stroke="' + C.coral + '" stroke-width="5" stroke-linecap="round">' +
          '<path d="M70 90 l13 13 M83 90 l-13 13"/><path d="M107 90 l13 13 M120 90 l-13 13"/></g>' +
          '<path d="M76 122 q5 -7 9.5 0 t9.5 0 t9.5 0 t9.5 0" fill="none" stroke="' + C.coral + '" stroke-width="4.5" stroke-linecap="round"/>';
      default: // hello
        return '<g class="cb-eyes" fill="' + C.mint + '"><rect x="72" y="88" width="10" height="18" rx="5"/><rect x="108" y="88" width="10" height="18" rx="5"/></g>' +
          '<path d="M79 117 q16 12 32 0" fill="none" stroke="' + C.mint + '" stroke-width="5" stroke-linecap="round"/>';
    }
  }

  function hand(x, y) { return '<circle cx="' + x + '" cy="' + y + '" r="8" fill="' + C.sand + '"/>'; }
  function arm(d) { return '<path class="cb-limb" d="' + d + '" fill="none" stroke="' + C.ink + '" stroke-width="6" stroke-linecap="round"/>'; }

  function arms(mood) {
    var leftDown = '<g class="cb-arm-l">' + arm('M40 112 q-18 6 -20 30') + hand(20, 146) + '</g>';
    var rightDown = '<g class="cb-arm-r">' + arm('M170 112 q18 6 20 30') + hand(190, 146) + '</g>';
    switch (mood) {
      case 'build':
        return leftDown +
          '<g class="cb-arm-r cb-hammer">' + arm('M170 116 q20 -4 22 -36') +
          '<g transform="translate(192 80) rotate(8)"><rect x="-3" y="-34" width="6" height="30" rx="3" fill="' + C.steel + '"/>' +
          '<path d="M-10 -40 a10 10 0 1 1 20 0 l-5 0 l0 -7 l-10 0 l0 7z" fill="' + C.steel + '"/></g>' + hand(192, 80) + '</g>';
      case 'hmm':
        return '<g class="cb-arm-l">' + arm('M40 104 q-20 10 -8 34 q8 12 26 10') + hand(60, 148) + '</g>' + rightDown;
      case 'oops':
        return '<g class="cb-arm-l cb-panic">' + arm('M40 112 q-18 -6 -22 -34') + hand(18, 74) + '</g>' +
          '<g class="cb-arm-r cb-panic">' + arm('M170 112 q18 -6 22 -34') + hand(192, 74) + '</g>' +
          '<path class="cb-drop" d="M30 92 q-4 7 0 10 q4 -3 0 -10z" fill="' + C.drop + '"/>';
      default: // hello: right arm up, waving
        return leftDown + '<g class="cb-arm-r cb-wave">' + arm('M170 116 q20 -4 22 -36') + hand(192, 76) + '</g>';
    }
  }

  function prop(mood) {
    if (mood === 'hmm') {
      return '<text class="cb-prop" x="104" y="22" text-anchor="middle" font-family="Schibsted Grotesk, Arial, sans-serif" font-weight="900" font-size="34" fill="' + C.gold + '">?</text>';
    }
    var tilt = mood === 'oops' ? ' transform="rotate(25 104 12)"' : '';
    return '<g class="cb-prop"' + tilt + '><polygon points="104,0 116,6 104,12 92,6" fill="#fbe3ad"/>' +
      '<polygon points="92,6 104,12 104,26 92,20" fill="' + C.sand + '"/>' +
      '<polygon points="116,6 104,12 104,26 116,20" fill="' + C.gold + '"/></g>';
  }

  function svg(mood, opts) {
    mood = MOODS.indexOf(mood) > -1 ? mood : 'hello';
    opts = opts || {};
    var title = opts.title || ({ hello: 'Cubit says hello', build: "Cubit: let's build", hmm: 'Cubit is thinking', oops: 'Cubit found a bug' })[mood];
    return '<svg class="cubit cubit--' + mood + '" viewBox="-8 -10 228 234" role="img" aria-label="' + title + '" xmlns="http://www.w3.org/2000/svg">' +
      '<ellipse class="cb-shadow" cx="102" cy="212" rx="56" ry="7" fill="' + C.shadow + '"/>' +
      prop(mood) +
      '<g class="cb-body">' +
        '<g class="cb-legs"><path class="cb-limb" d="M80 168 v24 M124 168 v24" stroke="' + C.ink + '" stroke-width="7" stroke-linecap="round"/>' +
        '<ellipse cx="80" cy="198" rx="15" ry="7" fill="' + C.gold + '"/><ellipse cx="126" cy="198" rx="15" ry="7" fill="' + C.gold + '"/></g>' +
        arms(mood) +
        '<polygon points="52,46 74,30 176,30 154,46" fill="' + C.mintTop + '"/>' +
        '<polygon points="154,46 176,30 176,148 154,172" fill="' + C.mintSide + '"/>' +
        '<rect x="40" y="44" width="118" height="128" rx="14" fill="' + C.mint + '"/>' +
        '<rect x="54" y="62" width="90" height="72" rx="11" fill="' + C.ink + '"/>' +
        '<g class="cb-face">' + face(mood) + '</g>' +
        '<text x="99" y="158" text-anchor="middle" font-family="JetBrains Mono, monospace" font-weight="700" font-size="12" fill="' + C.ink + '">&gt;_</text>' +
      '</g></svg>';
  }

  /* ---------------- floating helper ---------------- */
  function helper(options) {
    options = options || {};
    if (typeof document === 'undefined' || document.getElementById('cubit-helper')) return;
    var wrap = document.createElement('div');
    wrap.id = 'cubit-helper';
    wrap.className = 'cubit-helper';
    wrap.innerHTML =
      '<div class="cubit-bubble" id="cubitBubble" role="status" aria-live="polite">' +
        '<button type="button" class="cubit-close" aria-label="Hide Cubit\'s message">×</button>' +
        '<strong class="cubit-title"></strong><p class="cubit-text"></p><div class="cubit-actions"></div>' +
      '</div>' +
      '<button type="button" class="cubit-btn" aria-label="Cubit, your helper buddy. Show a tip." aria-controls="cubitBubble"></button>';
    document.body.appendChild(wrap);

    var bubble = wrap.querySelector('.cubit-bubble');
    var btn = wrap.querySelector('.cubit-btn');
    var titleEl = wrap.querySelector('.cubit-title');
    var textEl = wrap.querySelector('.cubit-text');
    var actionsEl = wrap.querySelector('.cubit-actions');
    var current = { mood: null, key: null };
    var dismissed = false;
    var tipIndex = 0;
    var TIPS = [
      'Not sure which role fits? Pick up to 3. You can switch roles in your next cohort.',
      'No experience yet? That\'s fine. Beginners are on every team.',
      'In the motivation box, tell us what you want to learn, not what you already know.',
      'Your answers save in this browser, so you can come back and finish later.'
    ];

    function say(mood, key, title, text, actions, force) {
      if (dismissed && !force) { setMood(mood); return; }
      if (current.key === key && !force) return;
      current.key = key;
      setMood(mood);
      titleEl.textContent = title;
      textEl.textContent = text;
      actionsEl.innerHTML = '';
      (actions || []).forEach(function (a) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'cubit-action'; b.textContent = a.label;
        b.addEventListener('click', a.run);
        actionsEl.appendChild(b);
      });
      bubble.hidden = false;
      bubble.classList.remove('cubit-pop'); void bubble.offsetWidth; bubble.classList.add('cubit-pop');
    }
    function setMood(mood) {
      if (current.mood === mood) return;
      current.mood = mood;
      btn.innerHTML = svg(mood);
      btn.classList.remove('cubit-swap'); void btn.offsetWidth; btn.classList.add('cubit-swap');
    }
    function hide() { bubble.hidden = true; dismissed = true; }

    wrap.querySelector('.cubit-close').addEventListener('click', hide);
    btn.addEventListener('click', function () {
      dismissed = false;
      say('hmm', 'tip-' + tipIndex, 'Hmm… here\'s a tip', TIPS[tipIndex % TIPS.length], [
        { label: 'Another tip', run: function () { tipIndex++; btn.click(); } }
      ], true);
      tipIndex++;
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !bubble.hidden) hide(); });

    var goApply = { label: 'Start my application', run: function () { var a = document.getElementById('apply'); if (a) a.scrollIntoView({ behavior: 'smooth' }); var f = document.getElementById('firstName'); if (f) setTimeout(function () { f.focus({ preventScroll: true }); }, 500); } };
    say('hello', 'hello', 'Hi, I\'m Cubit!', 'I\'ll help you apply to SandBox. It takes about 10 minutes.', [goApply]);

    // ---- react to the application form ----
    var form = document.getElementById('appForm');
    var note = document.getElementById('formNote');
    var pct = document.getElementById('pct');
    if (!form) return;

    function progress() { return pct ? parseInt(pct.textContent, 10) || 0 : 0; }
    function errorCount() { return form.querySelectorAll('.field.invalid').length; }

    var inForm = false;
    if ('IntersectionObserver' in root) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          inForm = e.isIntersecting;
          if (inForm && progress() === 0) say('build', 'form-start', 'Let\'s build your application!', 'Start with your name. I\'ll keep an eye on the details.');
        });
      }, { threshold: 0.15 }).observe(form);
    }

    var lastMilestone = 0;
    form.addEventListener('input', function () {
      if (errorCount() > 0) return;
      var p = progress();
      var m = p >= 100 ? 100 : p >= 50 ? 50 : 0;
      if (m > lastMilestone) {
        lastMilestone = m;
        if (m === 50) say('build', 'half', 'Halfway there!', 'You\'re ' + p + '% done. Keep going.');
        if (m === 100) say('build', 'ready', 'Ready to ship!', 'Everything looks good. Hit Submit application when you\'re ready.');
      }
    });
    form.addEventListener('focusin', function (e) {
      if (e.target.id === 'motivation' && errorCount() === 0) say('hmm', 'motivation', 'Hmm… what to write?', 'Share what you want to learn or build. At least 80 characters, and honesty beats buzzwords.');
      if (e.target.closest && e.target.closest('#roleChips') && errorCount() === 0) say('hmm', 'roles', 'Can\'t decide?', 'Pick up to 3 roles. Trying one is how you find out if it fits.');
    });

    function checkErrors() {
      var n = errorCount();
      if (n > 0) {
        say('oops', 'err-' + n, 'Oops! Found ' + (n === 1 ? 'a bug' : n + ' bugs'), (n === 1 ? 'One field needs' : n + ' fields need') + ' a quick fix. They\'re marked in red. Bugs happen to everyone.', [
          { label: 'Show me', run: function () { var f = form.querySelector('.field.invalid input, .field.invalid select, .field.invalid textarea'); if (f) { f.scrollIntoView({ behavior: 'smooth', block: 'center' }); f.focus({ preventScroll: true }); } } }
        ], true);
      } else if (current.mood === 'oops') {
        say('build', 'fixed', 'Bug squashed!', 'Nice fix. Back to building.', null, true);
      }
    }
    new MutationObserver(checkErrors).observe(form, { subtree: true, attributes: true, attributeFilter: ['class'] });
    if (note) new MutationObserver(function () {
      if (/couldn't reach|went wrong/i.test(note.textContent)) say('oops', 'net', 'Oops! Connection bug', note.textContent, null, true);
      else if (/already/i.test(note.textContent)) say('hmm', 'dup', 'Hmm… already applied?', note.textContent, null, true);
    }).observe(note, { childList: true, characterData: true, subtree: true });

    // success: the form area is replaced with the confirmation
    var area = document.getElementById('formArea');
    if (area) new MutationObserver(function () {
      if (document.getElementById('done')) say('hello', 'done', 'You did it!', 'Application received. See you at kickoff, teammate.', null, true);
    }).observe(area, { childList: true });
  }

  var api = { svg: svg, helper: helper, moods: MOODS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Cubit = api;
})(typeof window !== 'undefined' ? window : globalThis);
