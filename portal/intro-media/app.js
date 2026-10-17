/* Step 5 "Record your intro" - vanilla JS, no framework, no build step.
   One file, five pages (body[data-page]). API contract in README.md.
   Browser-side checks are HEURISTICS to coach the broker; the authoritative checks run in W23 (automation/media/check.js). */
(function () {
  'use strict';

  // ---------------------------------------------------------------- config
  var QS = new URLSearchParams(location.search);
  // I-37a: every endpoint now exists in W23, so the real API is the default. Mock is for design review only and is NOT sticky
  // (a leftover localStorage flag used to hide the real server); it lasts for the tab session and ?mock=0 ends it.
  if (QS.get('mock') === '1') sessionStorage.setItem('smc_intro_mock', '1');
  if (QS.get('mock') === '0') { sessionStorage.removeItem('smc_intro_mock'); localStorage.removeItem('smc_intro_mock'); }
  var API = document.documentElement.getAttribute('data-api') || '/intro';
  var MOCK = sessionStorage.getItem('smc_intro_mock') === '1';
  var LIMITS = { minSec: 15, maxSec: 40, wordsMin: 60, wordsMax: 90, wps: 2.6, maxTakes: 3 };
  var DEMO_BROKER = { first_name: 'Mark', name: 'Mark Williams', practice: 'Mark Williams Financial Planning', fsp: '00000', pronoun: 'him' }; // fictional
  var WA_NUMBER_DEMO = '27000000000'; // fictional

  var QUESTIONS = [
    { id: 'who', q: 'Who do you help most, and what do they usually come to you worried about?', ex: "e.g. families in their 30s and 40s with a bond and kids, who aren't sure the cover they have through work is enough" },
    { id: 'first10', q: 'What happens in the first 10 minutes of a call with you?', ex: "e.g. I ask a few questions about their family and what they already have, then tell them plainly where they stand" },
    { id: 'liked', q: 'What do people say they liked after meeting you?', ex: 'e.g. that I explained things without jargon, and nobody felt pushed' },
    { id: 'myth', q: "What's a misconception about life cover you keep correcting?", ex: 'e.g. that what you get through work is always enough' },
    { id: 'not', q: 'What do you not do? (no hard sell, no jargon)', ex: "e.g. I don't pressure anyone, and nobody has to decide on the call" },
    { id: 'where', q: "Where are you from or based, and which languages do you speak?", ex: 'e.g. Pretoria; English and Afrikaans' },
    { id: 'why', q: 'How many years have you been advising, why did you get into it, and what is one personal detail you are happy to share?', ex: 'e.g. 12 years, started after my own family was caught out; I coach my daughter’s netball team' },
    { id: 'prepare', q: 'How should someone prepare for the call, or not?', ex: "e.g. nothing special; it helps to have a recent payslip nearby, but it isn't needed" }
  ];

  var CHECKLIST = [
    { id: 'light', t: 'Face a window or lamp; no window behind you', why: 'Front light shows your face; backlight makes you a silhouette and reads as untrustworthy', auto: 'light' },
    { id: 'eye', t: 'Phone at eye level, 60–80 cm away, upright (9:16)', why: 'Eye-level = equal footing; looking down at the lens reads as distant; portrait fills a phone screen', auto: 'face' },
    { id: 'lens', t: 'Look at the lens, not at yourself', why: 'Eye contact is the trust signal the whole thing exists for' },
    { id: 'quiet', t: 'Quiet room, door closed, no fan or aircon hum', why: 'Bad audio is the #1 reason people stop watching; your voice matters more than the picture', auto: 'quiet' },
    { id: 'bg', t: 'Plain background with some depth (a room, not a wall 20 cm behind you)', why: 'Depth looks natural; a blank wall looks like a passport photo' },
    { id: 'wear', t: "What you'd wear to a client meeting", why: "Match what they'll see on the call" },
    { id: 'smile', t: "Smile before you press record; speak like you're on the phone with one person", why: "One person, not an audience — that is who's watching" },
    { id: 'len', t: '20–30 seconds, one take is fine', why: 'Short is watched to the end; the teleprompter paces you', auto: 'len' }
  ];

  // ---------------------------------------------------------------- tiny helpers
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k];
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function toast(msg, ms) { var t = el('div', { class: 'toast', role: 'status', text: msg }); document.body.appendChild(t); setTimeout(function () { t.remove(); }, ms || 3500); }
  function fmt(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function words(t) { return (t.trim().match(/\S+/g) || []); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ---------------------------------------------------------------- state (localStorage for text, IndexedDB for blobs)
  var KEY = 'smc_intro_v1';
  var S = (function () { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })();
  S.answers = S.answers || {}; S.takes = S.takes || []; S.lang = QS.get('lang') || S.lang || 'en';
  function save() { localStorage.setItem(KEY, JSON.stringify(S)); }

  var idb = {
    db: null,
    open: function () {
      var self = this;
      if (self.db) return Promise.resolve(self.db);
      return new Promise(function (res, rej) {
        var r = indexedDB.open('smc_intro', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('blobs'); };
        r.onsuccess = function () { self.db = r.result; res(self.db); };
        r.onerror = function () { rej(r.error); };
      });
    },
    tx: function (mode, fn) {
      return this.open().then(function (db) { return new Promise(function (res, rej) { var q = fn(db.transaction('blobs', mode).objectStore('blobs')); q.onsuccess = function () { res(q.result); }; q.onerror = function () { rej(q.error); }; }); });
    },
    put: function (k, b) { return this.tx('readwrite', function (s) { return s.put(b, k); }); },
    get: function (k) { return this.tx('readonly', function (s) { return s.get(k); }); },
    del: function (k) { return this.tx('readwrite', function (s) { return s.delete(k); }); }
  };

  // ---------------------------------------------------------------- API (real, with a clearly-labelled offline mock for design review)
  // The page is served from the portal's own origin (/portal/intro-media/), so the Supabase session the React app stored
  // (localStorage 'sb-<project-ref>-auth-token') is readable here. Nothing is passed in the URL. Expired -> sign in again in the portal.
  function accessToken() {
    var want = document.documentElement.getAttribute('data-sb-key') || '';
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (want ? k !== want : !/^sb-.+-auth-token$/.test(k)) continue;
        var j = JSON.parse(localStorage.getItem(k));
        var sess = Array.isArray(j) ? { access_token: j[0] } : (j && j.currentSession) || j;
        if (!sess || typeof sess.access_token !== 'string') continue;
        if (sess.expires_at && sess.expires_at * 1000 < Date.now() + 5000) return null;
        return sess.access_token;
      }
    } catch (e) { /* unreadable storage = signed out */ }
    return null;
  }
  function api(method, path, body) {
    if (MOCK) return mockApi(method, path, body);
    var tok = accessToken();
    if (!tok) { var ne = new Error('Your portal sign-in has expired. Open the portal, then come back to this step.'); ne.status = 401; return Promise.reject(ne); }
    // I-32a: static hosting cannot proxy same-origin /intro/*, so no cookie. The broker's Supabase access token goes in a Bearer
    // header and n8n (W23 "Verify broker JWT") derives the broker from brokers.user_id = sub. The page never sends a broker id.
    var opt = { method: method, credentials: 'omit', headers: { Accept: 'application/json', Authorization: 'Bearer ' + tok } };
    if (body instanceof FormData) opt.body = body;
    else if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    return fetch(API + path, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.message || ('HTTP ' + r.status)); e.status = r.status; e.data = j; throw e; } return j; });
    });
  }
  function mockBar() { if (MOCK && !$('.mockbar')) document.body.insertBefore(el('div', { class: 'mockbar', text: 'Design-review mode: no server, nothing is sent. Fictional adviser. Add ?mock=0 to leave.' }), document.body.firstChild); }

  var MOCK_SCRIPTS = [
    { id: 's1', label: 'Option 1 · plain', text: "Hi, I'm {first} from {practice}, FSP {fsp}. I work with families who've got a bond and people depending on them, and want to know whether the cover they have through work actually matches their life. On our call I'll ask a few questions and tell you plainly where you stand — there's nothing to buy and no pressure. Thirty minutes is usually all it takes. Looking forward to speaking with you." },
    { id: 's2', label: 'Option 2 · warmer', text: "Hi, {first} here from {practice}, FSP {fsp}. Most people I meet have something through work and have never checked whether it covers the bond and the kids. That's what I help with. When we speak, I'll listen first, ask a few simple questions, and give you a straight picture of where you stand. No jargon, no pressure, nothing to sign. Half an hour of your time is all I ask. I'm looking forward to meeting you." },
    { id: 's3', label: 'Option 3 · direct', text: "I'm {first} from {practice}, FSP {fsp}. I help people who have others depending on them find out where they stand. Here's what happens on our call: I ask a few questions, you ask me anything, and I give you a straight answer — no selling, no pressure, nothing to decide on the day. It takes thirty minutes. Nothing to prepare. I'm looking forward to talking, and I'll see you on the call." }
  ];
  function mockApi(method, path, body) {
    var p = path.split('?')[0];
    return sleep(150).then(function () {
      if (p === '/status') return {
        step: S.chosen ? 'record' : 'interview', explainer_url: null, example_url: null, broker: DEMO_BROKER,
        scripts: S.scripts || [], generating: false, takes: S.takes.map(function (t) { return { take_id: t.id, state: 'ready', kind: t.kind, ai_check: { ok: !t.checks.some(function (c) { return c.level === 'bad'; }), issues: t.checks } }; }),
        approved: S.approved || null, show_rate: null, whatsapp_capture: { number: WA_NUMBER_DEMO, link: 'https://wa.me/' + WA_NUMBER_DEMO + '?text=Intro%20video', qr_url: null }
      };
      if (p === '/interview') { if (body && body.complete) { S.scripts = MOCK_SCRIPTS.map(function (s) { return { id: s.id, label: s.label, text: s.text.replace('{first}', DEMO_BROKER.first_name).replace('{practice}', DEMO_BROKER.practice).replace('{fsp}', DEMO_BROKER.fsp) }; }); save(); } return { ok: true, text: body instanceof FormData ? '' : undefined }; }
      if (p === '/script-generate') return { variants: MOCK_SCRIPTS.map(function (x, i) { return { id: 'v' + (i + 1), label: x.label, angle: 'x', text: x.text.replace('{first}', DEMO_BROKER.first_name).replace('{practice}', DEMO_BROKER.practice).replace('{fsp}', DEMO_BROKER.fsp), gate_pass: true, rule: null, issues: [] }; }) };
      if (p === '/script-recheck') { var rc = lintScript(body.text, DEMO_BROKER); return { pass: rc.pass, rule: rc.pass ? null : 'lint', issues: rc.failing ? rc.failing.map(function (c) { return c.msg; }) : [], warnings: [], verdict: rc.pass ? 'pass' : 'block' }; }
      if (p === '/script-select') { var g = lintScript(body.text, DEMO_BROKER); return { pass: g.pass, checks: g.checks }; }
      if (p === '/upload-confirm') return { ok: true };
      if (p === '/upload') return body && body.confirm ? { ok: true } : { take_id: 'mock-' + Date.now(), object_key: 'mock', upload_url: null };
      if (p === '/approve') { S.approved = { at: new Date().toISOString(), take_id: body.take_id }; save(); return { ok: true, compliance_spot_check: 'pending' }; }
      throw new Error('unknown mock path ' + p);
    });
  }

  // ---------------------------------------------------------------- script lint (mirrors deliverables/intro-media/rubric.md; server gate is authoritative)
  var BANNED = [
    ['product', /\b(product|products|policy|policies|plan|plans|fund|funds|investment|invest|funeral cover|income protection)\b/i, 'names a product'],
    ['premium', /\b(premium|premiums|per month|a month|monthly|r\s?\d|rand|%|percent)\b/i, 'talks about money or premiums'],
    ['insurer', /\b(insurer|insurers|insurance compan(y|ies)|old mutual|sanlam|discovery|liberty|momentum|outsurance|hollard|assupol|metropolitan|clientele)\b/i, 'names an insurer'],
    ['return', /\b(return|returns|yield|growth|performance)\b/i, 'talks about returns'],
    ['guarantee', /\b(guarantee|guaranteed|guarantees|promise|promised|assured|risk[- ]free)\b/i, 'promises or guarantees something'],
    ['best', /\b(best|cheapest|cheap|lowest|top|number one|#1|leading|affordable|great deal|bargain)\b/i, 'uses "best/cheapest" style claims'],
    ['advice', /\b(you should|you need to|you must|i recommend|i advise|i suggest|my advice|you ought|make sure you|switch to|take out)\b/i, 'sounds like advice or a sales push'],
    ['urgency', /\b(limited|today only|hurry|don't miss|last chance|act now|before it'?s too late|spots? left|only \d+|expires?|deadline|urgent|now or never)\b/i, 'creates urgency']
  ];
  // Rules I-1 to I-5 (compliance-qa phase4-review-2 section 5d). I-2 cannot be verified here: any credential, years or award claim fails closed
  // until the server gate confirms it against the FSCA register / designation body (brokers.verified_credentials).
  var BANNED_I = [
    ['health_promise', /\b(even if you smoke|no medicals?|no medical (exam|test)s?|no health (questions|checks?)|anyone can (get|qualify)|everyone (qualifies|is accepted)|guaranteed acceptance|regardless of (your )?health|pre-?existing)\b/i, 'promises acceptance or talks about health'],
    ['credentials', /\b(\d+\+?\s*(years?|yrs)|(years?|decades?) of experience|award[- ]winning|awards?|top performer|cfp|chartered|certified|accredited|qualified as|mdrt|fellow of|designation)\b/i, 'is a credential, years or award claim (only verified ones can be said)'],
    ['client_story', /\b(my clients?|one (of my )?clients?|a client of mine|testimonials?|thousands of|hundreds of|\d[\d,. ]*\s*(clients|families|people|policyholders)|(helped|helping) (over |more than )?\d+|i (helped|worked with|met|sat with) (a|an|one) (family|couple|client|man|woman|lady|gentleman|young)|mr\.?\s+[A-Z]\w+|mrs\.?\s+[A-Z]\w+|ms\.?\s+[A-Z]\w+)\b/i, 'tells a client story or gives client numbers'],
    ['endorsement', /\b(sortmycover|sort my cover|lead velocity|selected me|chose me|chosen me|matched (me )?(you|with)|(recommended|endorsed|vetted|approved|hand-?picked) (by|me)|they (picked|chose|matched))\b/i, 'says SortMyCover or Lead Velocity chose, matched or endorses you'],
    ['tax', /\b(tax[- ]free|tax[- ]efficient|tax deduct\w*|tax benefits?|tax saving\w*|tax break|save on tax|sars)\b/i, 'makes a tax claim']
  ];
  // Rule I-6: Afrikaans word lists for rules 5-12 and I-1 to I-5 (the gate must work in the language recorded). Applied to every script, any language.
  var BANNED_AF = [
    ['product', /\b(produk|produkte|polis|polisse|beleggings?|begrafnisdekking|inkomstebeskerming|fonds)\b/i, 'names a product'],
    ['premium', /\b(premie|premies|per maand|'n maand|maandeliks|rand|persent|prosent)\b/i, 'talks about money or premiums'],
    ['insurer', /\b(versekeraar|versekeraars|versekeringsmaatskappy)\b/i, 'names an insurer'],
    ['return', /\b(opbrengs|rendement|groei|prestasie)\b/i, 'talks about returns'],
    ['guarantee', /\b(waarborg|gewaarborg|waarborge|belofte|beloof|risikovry|verseker dat)\b/i, 'promises or guarantees something'],
    ['best', /\b(beste|goedkoopste|goedkoop|laagste|voorste|nommer een|bekostigbaar)\b/i, 'uses "best/cheapest" style claims'],
    ['advice', /\b(jy moet|u moet|ek beveel aan|ek raai aan|ek stel voor|my raad|oorskakel na|neem 'n)\b/i, 'sounds like advice or a sales push'],
    ['urgency', /\b(beperk|net vandag|haas|laaste kans|voor dit te laat is|net \d+ plekke|dringend|moet nie mis nie)\b/i, 'creates urgency'],
    ['health_promise', /\b(selfs al rook|geen mediese|enigiemand kan dekking kry|ongeag jou gesondheid)\b/i, 'promises acceptance or talks about health'],
    ['credentials', /\b(\d+\+?\s*jaar|jare ervaring|bekroon|toekenning|gesertifiseer|geakkrediteer)\b/i, 'is a credential, years or award claim'],
    ['client_story', /\b(my kliente?|getuigskrif|duisende|honderde)\b/i, 'tells a client story or gives client numbers'],
    ['endorsement', /\b(het my gekies|aanbeveel deur|goedgekeur deur)\b/i, 'says SortMyCover or Lead Velocity chose or endorses you'],
    ['tax', /\b(belastingvry|belastingvoordeel|belastingaftrekking)\b/i, 'makes a tax claim']
  ];
  function lintScript(text, broker) {
    var n = words(text).length, checks = [];
    function add(id, ok, msg, fix) { checks.push({ id: id, ok: ok, msg: msg, fix: fix || null }); }
    add('length', n >= LIMITS.wordsMin && n <= LIMITS.wordsMax, n + ' words (needs ' + LIMITS.wordsMin + '–' + LIMITS.wordsMax + ', about 20–30 seconds)', n < LIMITS.wordsMin ? 'Add a sentence about what the call is like.' : 'Trim a sentence so it stays short.');
    var pr = broker && broker.practice ? text.split(broker.practice).length - 1 : 0;
    add('practice', pr === 1, pr === 1 ? 'Practice name included once' : (pr === 0 ? 'Practice name "' + (broker && broker.practice) + '" is missing' : 'Practice name appears ' + pr + ' times; say it once'));
    var fspRe = broker && broker.fsp ? new RegExp('\\bFSP\\s*(no\\.?|number)?\\s*' + broker.fsp + '\\b', 'gi') : null;
    var fc = fspRe ? (text.match(fspRe) || []).length : 0;
    add('fsp', fc === 1, fc === 1 ? 'FSP number included once' : (fc === 0 ? 'FSP number "FSP ' + (broker && broker.fsp) + '" is missing' : 'FSP number appears ' + fc + ' times; say it once'));
    add('first_person', /\b(I|I'm|I'll|I've|my|me)\b/.test(text), /\b(I|I'm|I'll|I've|my|me)\b/.test(text) ? 'First person' : 'Speak as yourself: use "I" and "my"');
    BANNED.forEach(function (b) { var m = text.match(b[1]); add(b[0], !m, m ? 'Remove "' + m[0] + '": it ' + b[2] : 'No ' + b[0] + ' wording'); });
    BANNED_I.forEach(function (b) { var m = text.match(b[1]); add(b[0], !m, m ? 'Remove "' + m[0] + '": it ' + b[2] : 'No ' + b[0] + ' wording'); });
    var af = null;
    BANNED_AF.forEach(function (b) { var m = text.match(b[1]); if (m && !af) af = [b, m]; });
    add('afrikaans', !af, af ? 'Remove "' + af[1][0] + '": it ' + af[0][2] : 'No Afrikaans banned wording');
    var bad = checks.filter(function (c) { return !c.ok; });
    return { pass: bad.length === 0, checks: checks, failing: bad };
  }

  // ---------------------------------------------------------------- page: index
  function pageIndex() {
    var vid = $('#explainer');
    if (vid) {
      // 1080x1080 is the in-page default; the 9:16 file (data-src-tall) is for full-screen phone play and the WhatsApp send
      vid.addEventListener('fullscreenchange', function () { var t = vid.dataset.srcTall; if (!t) return; var full = !!document.fullscreenElement, want = full ? t : vid.getAttribute('src'); if (full && vid.src.indexOf('9x16') < 0) { var at = vid.currentTime, pl = !vid.paused; vid.dataset.srcSquare = vid.getAttribute('src'); vid.src = t; vid.currentTime = at; if (pl) vid.play(); } else if (!full && vid.dataset.srcSquare && vid.src.indexOf('9x16') > -1) { var at2 = vid.currentTime, pl2 = !vid.paused; vid.src = vid.dataset.srcSquare; vid.currentTime = at2; if (pl2) vid.play(); } });
      vid.addEventListener('error', function () { $('#explainer-fallback').hidden = false; vid.hidden = true; });
    }
    var ex = $('#example');
    if (ex) ex.addEventListener('error', function () { $('#example-fallback').hidden = false; ex.hidden = true; });
    api('GET', '/status').then(function (s) {
      if (s.explainer_url && vid) vid.src = s.explainer_url;
      if (s.example_url && ex) ex.src = s.example_url;
      if (s.show_rate && s.show_rate.n >= 20) {
        $('#showrate').hidden = false;
        $('#showrate').textContent = 'Your show rate with your intro: ' + Math.round(s.show_rate.with * 100) + '%, without: ' + Math.round(s.show_rate.without * 100) + '% (' + s.show_rate.n + ' bookings).';
      }
    }).catch(function () { /* static page still works */ });
    $('#audio-start') && $('#audio-start').addEventListener('click', function () { S.mode = 'audio'; save(); });
    $('#video-start') && $('#video-start').addEventListener('click', function () { S.mode = 'video'; save(); });
  }

  // ---------------------------------------------------------------- page: interview
  function pageInterview() {
    var i = Math.min(Math.max(parseInt(QS.get('q') || S.qi || '0', 10) || 0, 0), QUESTIONS.length - 1);
    var Q = QUESTIONS[i], ta = $('#answer');
    $('#qk').textContent = 'Question ' + (i + 1) + ' of ' + QUESTIONS.length + ' · type or talk';
    $('#qh').textContent = ['Who do you help most?', 'Your first 10 minutes', 'What people say', 'A misconception', 'What you don’t do', 'Where you’re from', 'Years, why, one personal detail', 'How to prepare'][i];
    $('#qtext').textContent = Q.q; $('#qex').textContent = Q.ex;
    ta.value = S.answers[Q.id] || '';
    $('#next').textContent = i === QUESTIONS.length - 1 ? 'Write my three scripts' : 'Next';
    $$('.steps i', $('.ph')).forEach(function (b, k) { b.classList.toggle('on', k < 5); });
    $('#progress').textContent = QUESTIONS.length - i - 1 > 0 ? (QUESTIONS.length - i - 1) + ' more after this one, about a minute each.' : 'Last one. Then we write your three scripts.';
    ta.addEventListener('input', function () { S.answers[Q.id] = ta.value; save(); });
    $('#back').hidden = i === 0;
    $('#back').addEventListener('click', function () { S.qi = i - 1; save(); location.search = '?q=' + (i - 1) + (MOCK ? '&mock=1' : ''); });

    // voice answer: tap to start, tap to stop (hold-to-talk is unreliable on iOS Safari)
    var mic = $('#mic'), note = $('#micnote'), rec = null, chunks = [], stream = null;
    if (!window.MediaRecorder || !navigator.mediaDevices) { mic.disabled = true; note.textContent = 'Voice answers are not supported in this browser. Please type.'; }
    mic.addEventListener('click', function () {
      if (rec && rec.state === 'recording') { rec.stop(); return; }
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (st) {
        stream = st; chunks = [];
        var mt = pickMime(false); rec = new MediaRecorder(st, mt ? { mimeType: mt } : {});
        rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onstop = function () {
          stream.getTracks().forEach(function (t) { t.stop(); }); mic.classList.remove('rec'); mic.textContent = '●'; mic.setAttribute('aria-label', 'Answer by voice');
          var blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' }); note.textContent = 'Transcribing…';
          var fd = new FormData(); fd.append('question_id', Q.id); fd.append('audio', blob, 'answer.' + (blob.type.indexOf('mp4') > -1 ? 'm4a' : 'webm'));
          api('POST', '/interview', fd).then(function (r) {
            if (r && r.text) { ta.value = (ta.value ? ta.value + ' ' : '') + r.text; S.answers[Q.id] = ta.value; save(); note.textContent = 'Transcribed. Fix anything we got wrong.'; }
            else note.textContent = MOCK ? 'Design-review mode: the server would transcribe this. Please type.' : 'We could not hear that clearly. Try again or type.';
          }).catch(function () { note.textContent = 'Could not transcribe. Please type your answer.'; });
        };
        rec.start(); mic.classList.add('rec'); mic.textContent = '■'; mic.setAttribute('aria-label', 'Stop'); note.textContent = 'Listening… tap again when you are done.';
      }).catch(function () { note.textContent = 'Microphone blocked. Allow it in your browser, or type.'; });
    });

    $('#next').addEventListener('click', function () {
      var text = ta.value.trim();
      if (!text) { toast('Even a few words help. Type or talk, or skip this one.'); }
      var btn = $('#next'); btn.setAttribute('aria-disabled', 'true');
      api('POST', '/interview', { question_id: Q.id, text: text }).then(function () {
        if (i < QUESTIONS.length - 1) { S.qi = i + 1; save(); location.search = '?q=' + (i + 1) + (MOCK ? '&mock=1' : ''); return; }
        return api('POST', '/interview', { complete: true, language: S.lang, languages_spoken: S.answers.where || '' }).then(function () { location.href = 'scripts.html' + (MOCK ? '?mock=1' : ''); });
      }).catch(function () { btn.removeAttribute('aria-disabled'); toast('Could not save. Check your connection and try again.'); });
    });
  }

  // ---------------------------------------------------------------- page: scripts
  function pageScripts() {
    var list = $('#list'), broker = DEMO_BROKER, sel = null, gates = {}, timers = {};
    function render(scripts) {
      list.textContent = '';
      scripts.forEach(function (s, k) {
        var ta = el('textarea', { 'aria-label': 'Script ' + (k + 1), rows: 8 }); ta.value = s.text;
        var meta = el('span', { class: 'lbl' }), gate = el('div', { class: 'gate wait', 'aria-live': 'polite' });
        var card = el('div', { class: 'script', 'data-id': s.id }, [el('small', { text: s.label || ('Option ' + (k + 1)) }), ta, el('div', { class: 'row' }, [meta]), gate]);
        function update() {
          var n = words(ta.value).length; meta.textContent = n + ' words · about ' + Math.round(n / LIMITS.wps) + ' s';
          var g = lintScript(ta.value, broker); gates[s.id] = g; paintGate(gate, g, false); sync();
          clearTimeout(timers[s.id]); timers[s.id] = setTimeout(function () { serverGate(s.id, ta.value, gate); }, 700);
        }
        ta.addEventListener('input', update);
        ta.addEventListener('focus', function () { choose(s.id); });
        card.addEventListener('click', function () { choose(s.id); });
        list.appendChild(card); update();
      });
      choose(S.chosen && scripts.some(function (x) { return x.id === S.chosen.id; }) ? S.chosen.id : scripts[0].id);
    }
    function paintGate(box, g, fromServer) {
      box.className = 'gate ' + (g.pass ? 'ok' : 'bad'); box.textContent = '';
      if (g.pass) { box.appendChild(document.createTextNode('✓ Compliance check passed — no products, premiums or advice; practice and FSP included' + (fromServer ? '' : ' (quick check; final check runs when you pick it)'))); return; }
      box.appendChild(document.createTextNode('Fix before recording:'));
      var ul = el('ul'); g.failing.forEach(function (c) { ul.appendChild(el('li', { text: c.msg })); }); box.appendChild(ul);
    }
    // I-40i: W23 script-recheck returns { pass, rule, issues }; a failed check is a normal answer, an error keeps the local quick check.
    function recheckToGate(r) {
      var msg = r.rule === 'gate_unavailable' ? "We couldn't check this script right now, try again in a minute." : r.rule === 'review' ? 'This language needs a human check before you can record. We will look at it.' : (r.issues && r.issues[0]) || 'The compliance check did not pass this wording.';
      return { pass: !!r.pass, checks: [], failing: r.pass ? [] : [{ msg: msg }] };
    }
    function serverGate(id, text, box) {
      api('POST', '/script-recheck', { text: text, lang: S.lang }).then(function (r) {
        var g = recheckToGate(r);
        gates[id] = Object.assign({ server: true }, g); paintGate(box, g, true); sync();
      }).catch(function () { /* keep the quick local check; the pick below re-checks on the server */ });
    }
    function choose(id) { sel = id; $$('.script', list).forEach(function (c) { c.classList.toggle('sel', c.getAttribute('data-id') === id); }); sync(); }
    function sync() { var g = gates[sel]; var b = $('#use'); if (!b) return; if (g && g.pass) b.removeAttribute('aria-disabled'); else b.setAttribute('aria-disabled', 'true'); }
    $('#use').addEventListener('click', function () {
      var card = $('.script.sel', list); if (!card || $('#use').getAttribute('aria-disabled') === 'true') return;
      var text = $('textarea', card).value, id = card.getAttribute('data-id'), orig = (S.scripts || []).filter(function (x) { return x.id === id; })[0];
      var edited = !orig || orig.text !== text;
      (edited ? api('POST', '/script-recheck', { text: text, lang: S.lang, choose: true }).then(function (r) { var g = recheckToGate(r); r.checks = g.failing.map(function (f) { return { ok: false, msg: f.msg }; }); return r; })
        : api('POST', '/script-select', { script_id: id, text: text, edited: false, language: S.lang })).then(function (r) {
        if (!r.pass) { gates[id] = { pass: false, failing: (r.checks || []).filter(function (c) { return !c.ok; }) }; paintGate($('.gate', card), gates[id], true); sync(); toast('The compliance check did not pass this wording. Fix the points shown.'); return; }
        S.chosen = { id: id, text: text }; save(); location.href = 'record.html' + (MOCK ? '?mock=1' : '');
      }).catch(function () { toast('Could not check the script. Try again.'); });
    });
    // load or wait for generation (Sonnet + gate run in n8n)
    var tries = 0, started = false;
    (function load() {
      api('GET', '/status').then(function (s) {
        broker = s.broker || broker; S.scripts = s.scripts && s.scripts.length ? s.scripts : (S.scripts || []); save();
        if (S.scripts.length) { $('#wait').hidden = true; render(S.scripts); return; }
        if (!started && !(s.scripts && s.scripts.length)) { started = true; api('POST', '/script-generate', { lang: S.lang }).then(function (g) { var ok = (g.variants || []).filter(function (v) { return v.gate_pass; }).map(function (v) { return { id: v.id, label: v.label, text: v.text }; }); if (ok.length && !S.scripts.length) { S.scripts = ok; save(); $('#wait').hidden = true; render(S.scripts); } }).catch(function (e) { if (e.status === 429) return; /* already generated within the hour: status will list them */ }); }
        if (++tries > 40) { $('#wait').textContent = 'This is taking longer than usual. Refresh in a minute, or message us.'; return; }
        $('#wait').hidden = false; setTimeout(load, 1500);
      }).catch(function () { $('#wait').textContent = 'Could not load your scripts. Check your connection and refresh.'; });
    })();
  }

  // ---------------------------------------------------------------- media helpers
  function pickMime(video) {
    if (!window.MediaRecorder) return '';
    var c = video ? ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
                  : ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
    for (var i = 0; i < c.length; i++) if (MediaRecorder.isTypeSupported(c[i])) return c[i];
    return '';
  }
  function dbOf(x) { return x > 0 ? 20 * Math.log10(x) : -100; }
  function pct(arr, p) { if (!arr.length) return -100; var a = arr.slice().sort(function (x, y) { return x - y; }); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; }

  // Heuristics. Thresholds are deliberately forgiving; each returns a plain-English note.
  function judgeLight(face, bg) {
    if (face > 205) return { level: 'warn', key: 'bright', note: 'Quite bright on your face. Step back from the lamp or window a little.' };
    if (bg - face > 45 && face < 140) return { level: 'warn', key: 'backlit', note: 'Looks like a window or light is behind you. Turn around to face it so your face is lit.' };
    if (face < 70) return { level: 'warn', key: 'dark', note: 'A bit dark — turn to face the window or put a lamp in front of you.' };
    return { level: 'ok', key: 'light', note: 'Light on your face looks good' };
  }
  function judgeFace(f) {
    if (!f.found) return { level: 'warn', key: 'noface', note: 'We can’t see your face. Step into the frame and put your face inside the dashed guide.' };
    if (f.cx < 0.3 || f.cx > 0.7) return { level: 'warn', key: 'offcentre', note: 'Move a little ' + (f.cx < 0.5 ? 'right' : 'left') + ' so you are in the middle.' };
    if (f.w && f.w < 0.17) return { level: 'warn', key: 'far', note: 'A bit far away. Aim for 60–80 cm, about an arm and a half.' };
    if (f.w && f.w > 0.55) return { level: 'warn', key: 'close', note: 'A bit close. Move the phone back a little (60–80 cm).' };
    if (f.cy < 0.2 || f.cy > 0.62) return { level: 'warn', key: 'height', note: 'Raise or lower the phone so your face sits in the dashed guide, at eye level.' };
    return { level: 'ok', key: 'face', note: 'Face in frame, eye level' };
  }
  function judgeAudio(a) {
    var out = [];
    if (a.speechDb <= -60) out.push({ level: 'bad', key: 'silent', note: 'We could not hear you. Check the microphone is not covered.' });
    else if (a.speechDb < -38) out.push({ level: 'bad', key: 'tooquiet', note: 'Your voice is very quiet. Move closer (60–80 cm) and speak up a little.' });
    else if (a.speechDb < -32) out.push({ level: 'warn', key: 'quiet', note: 'A bit quiet. A little closer to the phone will help.' });
    else if (a.speechDb > -9 || a.peak >= 0.98) out.push({ level: 'warn', key: 'loud', note: 'Your voice is distorting at the loud parts. Step back a little.' });
    if (a.noiseDb > -50 && a.speechDb > -60) out.push({ level: 'warn', key: 'noise', note: 'Background noise detected — fan or aircon? Switch it off or close the door. Your voice matters more than the picture.' });
    if (!out.length) out.push({ level: 'ok', key: 'audio', note: 'Sound is clear' });
    return out;
  }
  function judgeDuration(sec) {
    if (sec < LIMITS.minSec) return { level: 'bad', key: 'short', note: 'That was ' + Math.round(sec) + ' seconds. Aim for 20–30. Read the whole script and go again.' };
    if (sec > LIMITS.maxSec) return { level: 'bad', key: 'long', note: 'That was ' + Math.round(sec) + ' seconds. Short gets watched to the end — keep it under 40, ideally 20–30.' };
    return { level: 'ok', key: 'dur', note: Math.round(sec) + ' seconds — good length' };
  }
  function verdict(checks) {
    var bad = checks.filter(function (c) { return c.level === 'bad'; })[0], warn = checks.filter(function (c) { return c.level === 'warn'; })[0];
    var labels = { dark: 'Dark', backlit: 'Backlit', bright: 'Bright', noface: 'No face', noise: 'Noisy', tooquiet: 'Quiet', silent: 'Silent', short: 'Short', long: 'Long', loud: 'Loud', far: 'Far', close: 'Close', offcentre: 'Off-centre', height: 'Height', quiet: 'Quiet' };
    if (bad) return { cls: 'bad', label: labels[bad.key] || 'Check' };
    if (warn) return { cls: 'w', label: labels[warn.key] || 'Check' };
    return { cls: '', label: 'Good' };
  }
  var SIGNED = { audioOnly: false };

  // ---------------------------------------------------------------- takes (shared by record + approve)
  function newTake(blob, o) {
    var t = { id: 't' + Date.now().toString(36), kind: o.kind, mime: blob.type || o.mime, dur: o.dur, checks: o.checks || [], lang: S.lang, uploaded: false, size: blob.size, n: S.takes.length + 1 };
    S.takes.push(t); save();
    return idb.put(t.id, blob).then(function () { return t; });
  }
  function renderTakes(box, onPick) {
    box.textContent = '';
    for (var k = 0; k < LIMITS.maxTakes; k++) {
      var t = S.takes[k];
      if (!t) { box.appendChild(el('div', { class: 'take empty', text: 'Take ' + (k + 1) })); continue; }
      (function (t) {
        var v = verdict(t.checks);
        var b = el('button', { class: 'take' + (S.selected === t.id ? ' sel' : ''), type: 'button', 'aria-label': 'Take ' + t.n + ', ' + v.label, 'aria-pressed': S.selected === t.id ? 'true' : 'false' }, [
          el('div', { class: 'ai ' + v.cls, text: v.label }), el('span', { text: 'Take ' + t.n + ' · ' + fmt(t.dur) })
        ]);
        idb.get(t.id).then(function (blob) {
          if (!blob) return;
          if (t.kind === 'video') { var vid = el('video', { muted: '', playsinline: '', preload: 'metadata' }); vid.muted = true; vid.src = URL.createObjectURL(blob) + '#t=0.5'; b.insertBefore(vid, b.firstChild); }
          else b.insertBefore(el('div', { class: 'au', text: 'Audio' }), b.firstChild);
        });
        b.addEventListener('click', function () { S.selected = t.id; save(); renderTakes(box, onPick); onPick && onPick(t); });
        box.appendChild(b);
      })(t);
    }
  }
  function uploadTake(t) {
    if (t.uploaded) return Promise.resolve();
    return idb.get(t.id).then(function (blob) {
      return api('POST', '/upload', { filename: 'take' + t.n + (t.mime.indexOf('mp4') > -1 ? (t.kind === 'video' ? '.mp4' : '.m4a') : '.webm'), mime: t.mime, size: blob.size, kind: t.kind, language: t.lang, take_no: t.n, duration_s: Math.round(t.dur * 10) / 10, client_checks: t.checks, script_text: S.chosen && S.chosen.text })
        .then(function (sig) {
          t.server_id = sig.take_id;
          var put = sig.upload_url ? fetch(sig.upload_url, { method: sig.method || 'PUT', headers: sig.headers || { 'Content-Type': t.mime }, body: blob }).then(function (r) { if (!r.ok) throw new Error('upload ' + r.status); }) : Promise.resolve();
          return put.then(function () { return api('POST', '/upload-confirm', { take_id: sig.take_id, object_key: sig.object_key, kind: t.kind, language: t.lang, mime: t.mime, duration_s: Math.round(t.dur * 10) / 10, script_text: S.chosen && S.chosen.text }); });
        }).then(function () { t.uploaded = true; save(); });
    });
  }

  // ---------------------------------------------------------------- page: record
  function pageRecord() {
    if (!S.chosen) { $('#noscript').hidden = false; $('#recorder').hidden = true; return; }
    var cam = $('#cam'), prev = $('#preview'), tp = $('#tp'), tpIn = $('#tpin'), tm = $('#tm'), recBtn = $('#recbtn'), count = $('#count'), notes = $('#notes'), meter = $('#meterbar');
    var chkBox = $('#chk'), overlay = $('#overlay'), ovChk = $('#ovchk'), takesBox = $('#takes');
    var audioOnly = S.mode === 'audio', stream = null, rec = null, chunks = [], phase = 'setup', t0 = 0, timer = null;
    var auto = { light: null, face: null, quiet: null, len: null }, manual = {}, noiseWin = [], levels = [], analyser, actx, buf, lastLoop = 0, faceDet = null;
    var scriptWords = words(S.chosen.text), estSec = scriptWords.length / LIMITS.wps;
    var canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 114; var cx = canvas.getContext('2d', { willReadFrequently: true });

    // teleprompter
    tpIn.textContent = ''; scriptWords.forEach(function (w, i) { tpIn.appendChild(el('span', { class: 'w', 'data-i': i, text: w + ' ' })); });
    function tpUpdate(sec) {
      var i = Math.min(scriptWords.length - 1, Math.floor(sec * LIMITS.wps)), spans = tpIn.children;
      for (var k = 0; k < spans.length; k++) spans[k].className = 'w' + (k < i ? ' done' : k === i ? ' now' : '');
      var cur = spans[i]; if (cur) tpIn.style.transform = 'translateY(' + (-Math.max(0, cur.offsetTop - 24)) + 'px)';
    }
    tpUpdate(-1);
    auto.len = estSec >= 18 && estSec <= 32 ? { level: 'ok', note: 'Your script reads in about ' + Math.round(estSec) + ' s' } : { level: 'warn', note: 'Your script reads in about ' + Math.round(estSec) + ' s. 20–30 works best' };

    // checklist: manual taps + automatic ticks where detectable
    function renderChecklist() {
      [chkBox, ovChk].forEach(function (box) {
        box.textContent = '';
        CHECKLIST.forEach(function (c) {
          var a = c.auto ? auto[c.auto] : null, st = a ? (a.level === 'ok' ? 'ok' : 'w') : (manual[c.id] ? 'ok' : '');
          var b = el('button', { class: 'it ' + st, type: 'button', 'aria-pressed': st === 'ok' ? 'true' : 'false' }, [el('i'), el('div', {}, [el('span', { text: a && a.level !== 'ok' ? a.note : c.t }), el('small', { text: c.why })])]);
          if (!c.auto) b.addEventListener('click', function () { manual[c.id] = !manual[c.id]; renderChecklist(); });
          box.appendChild(b);
        });
      });
    }
    renderChecklist();

    // camera / mic
    function startMedia() {
      if (!navigator.mediaDevices || !window.MediaRecorder) return fallback('This browser can’t record in the page.');
      var constraints = { audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false }, video: audioOnly ? false : { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1920 }, aspectRatio: { ideal: 9 / 16 }, frameRate: { ideal: 30 } } };
      return navigator.mediaDevices.getUserMedia(constraints).then(function (st) {
        stream = st; overlay.hidden = true; phase = 'ready';
        if (!audioOnly) { prev.srcObject = st; prev.muted = true; prev.className = 'mirror'; prev.hidden = false; prev.play().catch(function () {}); $('#audioonly').hidden = true; }
        else { prev.hidden = true; $('#audioonly').hidden = false; }
        var AC = window.AudioContext || window.webkitAudioContext; actx = new AC(); if (actx.state === 'suspended') actx.resume();
        analyser = actx.createAnalyser(); analyser.fftSize = 2048; actx.createMediaStreamSource(st).connect(analyser); buf = new Float32Array(analyser.fftSize);
        if (!audioOnly && 'FaceDetector' in window) { try { faceDet = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 }); } catch (e) { faceDet = null; } }
        recBtn.disabled = S.takes.length >= LIMITS.maxTakes; loop();
      }).catch(function (e) { fallback(e && e.name === 'NotAllowedError' ? 'Camera or microphone is blocked. Allow it in your browser settings, or upload a video instead.' : 'We could not start the camera. You can upload a video instead.'); });
    }
    function fallback(msg) { notes.textContent = ''; notes.appendChild(el('div', { class: 'bad', text: msg })); $('#upload-wrap').hidden = false; }

    // live loop (about 5 times a second): audio level always, picture checks when video
    function loop(ts) {
      if (!stream) return; requestAnimationFrame(loop);
      if (ts && ts - lastLoop < 200) return; lastLoop = ts || 0;
      analyser.getFloatTimeDomainData(buf); var s = 0, pk = 0; for (var i = 0; i < buf.length; i++) { s += buf[i] * buf[i]; pk = Math.max(pk, Math.abs(buf[i])); }
      var db = dbOf(Math.sqrt(s / buf.length)); meter.style.width = Math.max(0, Math.min(100, (db + 60) * 100 / 50)) + '%';
      if (phase === 'recording') levels.push({ db: db, pk: pk });
      else { noiseWin.push(db); if (noiseWin.length > 15) noiseWin.shift(); if (noiseWin.length >= 10) { var q = pct(noiseWin, 0.1); auto.quiet = q > -50 ? { level: 'warn', note: 'Background noise detected — fan or aircon? Close the door and switch it off if you can.' } : { level: 'ok' }; } }
      if (!audioOnly && phase !== 'recording' && phase !== 'countdown' && prev.videoWidth) pictureCheck();
      else if (audioOnly) { auto.light = { level: 'ok' }; auto.face = { level: 'ok' }; }
      if (phase !== 'recording') renderChecklist();
    }
    function pictureCheck() {
      cx.drawImage(prev, 0, 0, canvas.width, canvas.height); var d = cx.getImageData(0, 0, canvas.width, canvas.height).data, W = canvas.width, H = canvas.height;
      var fs = 0, fn = 0, bs = 0, bn = 0, skin = 0, skinX = 0, skinN = 0;
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
        var o = (y * W + x) * 4, r = d[o], g = d[o + 1], b = d[o + 2], l = 0.299 * r + 0.587 * g + 0.114 * b;
        var inFace = x > W * 0.3 && x < W * 0.7 && y > H * 0.2 && y < H * 0.55, inBg = x < W * 0.15 || x > W * 0.85 || y < H * 0.08;
        if (inFace) { fs += l; fn++; } else if (inBg) { bs += l; bn++; }
        var cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b, cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
        if (cb > 77 && cb < 127 && cr > 133 && cr < 173 && l > 40) { skin++; skinX += x; skinN++; }
      }
      auto.light = judgeLight(fs / fn, bs / bn);
      var portrait = prev.videoHeight >= prev.videoWidth;
      if (!portrait) { auto.face = { level: 'warn', note: 'Turn your phone upright (portrait).' }; return; }
      if (faceDet) {
        faceDet.detect(prev).then(function (fz) {
          var f = fz && fz[0] ? { found: true, cx: (fz[0].boundingBox.x + fz[0].boundingBox.width / 2) / prev.videoWidth, cy: (fz[0].boundingBox.y + fz[0].boundingBox.height / 2) / prev.videoHeight, w: fz[0].boundingBox.width / prev.videoWidth } : { found: false };
          auto.face = judgeFace(f);
        }).catch(function () { faceDet = null; });
      } else {
        // fallback when the browser has no FaceDetector (iOS Safari today): skin-tone mass in the middle of the picture. Cruder; says "likely".
        var frac = skin / (W * H), found = frac > 0.05;
        auto.face = judgeFace({ found: found, cx: skinN ? skinX / skinN / W : 0.5, cy: 0.38, w: null });
      }
    }

    // record
    function begin() {
      if (phase !== 'ready' || S.takes.length >= LIMITS.maxTakes) return;
      phase = 'countdown'; recBtn.disabled = true; var n = 3; count.hidden = false; count.textContent = n;
      var iv = setInterval(function () { n--; if (n > 0) count.textContent = n; else { clearInterval(iv); count.hidden = true; startRec(); } }, 1000);
    }
    function startRec() {
      chunks = []; levels = []; var mt = pickMime(!audioOnly);
      try { rec = new MediaRecorder(stream, Object.assign(mt ? { mimeType: mt } : {}, audioOnly ? { audioBitsPerSecond: 96000 } : { videoBitsPerSecond: 3500000, audioBitsPerSecond: 128000 })); }
      catch (e) { return fallback('Recording failed to start. Upload a video instead.'); }
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = onStopped; rec.start(); phase = 'recording'; t0 = performance.now(); recBtn.disabled = false; recBtn.classList.add('on'); recBtn.setAttribute('aria-label', 'Stop recording');
      timer = setInterval(function () { var s = (performance.now() - t0) / 1000; tm.textContent = fmt(s); tpUpdate(s); if (s >= LIMITS.maxSec) stop(); }, 150);
    }
    function stop() { if (rec && rec.state === 'recording') { clearInterval(timer); rec.stop(); } }
    function onStopped() {
      var dur = (performance.now() - t0) / 1000; phase = 'review'; recBtn.classList.remove('on'); recBtn.disabled = true; recBtn.setAttribute('aria-label', 'Record');
      var blob = new Blob(chunks, { type: rec.mimeType || (audioOnly ? 'audio/webm' : 'video/webm') });
      var db = levels.map(function (l) { return l.db; }), noise = pct(db, 0.1), loud = db.filter(function (v) { return v > noise + 10; }), speech = loud.length ? loud.reduce(function (a, b) { return a + b; }, 0) / loud.length : pct(db, 0.9);
      var peak = levels.reduce(function (m, l) { return Math.max(m, l.pk); }, 0);
      var checks = [judgeDuration(dur)].concat(judgeAudio({ speechDb: speech, noiseDb: noise, peak: peak }));
      if (!audioOnly) { if (auto.light) checks.push(auto.light.key ? auto.light : { level: 'ok', key: 'light', note: 'Light on your face looks good' }); if (auto.face && auto.face.level) checks.push(auto.face.key ? auto.face : { level: 'ok', key: 'face', note: 'Face in frame, eye level' }); }
      showReview(blob, dur, checks);
    }
    function showReview(blob, dur, checks) {
      var url = URL.createObjectURL(blob); tp.hidden = true;
      if (!audioOnly) { prev.srcObject = null; prev.src = url; prev.muted = false; prev.controls = true; prev.className = ''; prev.play().catch(function () {}); }
      else { var a = el('audio', { controls: '', src: url }); $('#audioonly').textContent = ''; $('#audioonly').appendChild(a); }
      notes.textContent = ''; checks.forEach(function (c) { notes.appendChild(el('div', { class: c.level === 'ok' ? 'ok' : c.level === 'bad' ? 'bad' : '', text: c.note })); });
      $('#actions').hidden = false; $('#recordbox').hidden = true;
      $('#keep').onclick = function () { newTake(blob, { kind: audioOnly ? 'audio' : 'video', dur: dur, checks: checks, mime: blob.type }).then(function (t) { S.selected = t.id; save(); renderTakes(takesBox); uploadTake(t).catch(function () { toast('Upload will retry when you continue.'); }); resetForNext(); }); };
      $('#redo').onclick = function () { resetForNext(); };
    }
    function resetForNext() {
      URL.revokeObjectURL(prev.src); phase = 'ready'; tp.hidden = false; tpUpdate(-1); tm.textContent = '0:00'; notes.textContent = ''; $('#actions').hidden = true; $('#recordbox').hidden = false;
      if (!audioOnly) { prev.removeAttribute('src'); prev.controls = false; prev.srcObject = stream; prev.className = 'mirror'; prev.play().catch(function () {}); }
      else { $('#audioonly').textContent = 'Audio only. Same script, no camera.'; }
      var full = S.takes.length >= LIMITS.maxTakes; recBtn.disabled = full; $('#cont').removeAttribute('aria-disabled');
      if (full) notes.appendChild(el('div', { class: 'ok', text: 'That’s three takes. Pick the one you like and continue.' }));
      $('#takeno').textContent = 'Take ' + Math.min(S.takes.length + 1, LIMITS.maxTakes) + ' of ' + LIMITS.maxTakes;
    }
    recBtn.addEventListener('click', function () { if (phase === 'ready') begin(); else if (phase === 'recording') stop(); });
    $('#startcam').addEventListener('click', startMedia);
    $('#audiotoggle').addEventListener('click', function () { audioOnly = !audioOnly; S.mode = audioOnly ? 'audio' : 'video'; save(); if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; } overlay.hidden = false; phase = 'setup'; paintMode(); });
    function paintMode() { $('#audiotoggle').textContent = audioOnly ? 'Use the camera instead' : 'Audio only instead'; $('#startcam').textContent = audioOnly ? 'Start microphone' : 'Start camera'; $('#h2').textContent = audioOnly ? 'Quiet room. Speak to one person.' : 'Face the window. Look at the lens.'; }
    paintMode();

    // file upload fallback (also: no MediaRecorder, camera blocked, or the broker prefers their phone camera app)
    $('#file').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      if (f.size > 200 * 1024 * 1024) { toast('That file is very large. Keep it under 40 seconds.'); return; }
      var isVid = /^video\//.test(f.type), m = el(isVid ? 'video' : 'audio', { preload: 'metadata' }), url = URL.createObjectURL(f);
      m.onloadedmetadata = function () {
        var dur = m.duration || 0, checks = [judgeDuration(dur)];
        newTake(f, { kind: isVid ? 'video' : 'audio', dur: dur, checks: checks, mime: f.type }).then(function (t) { S.selected = t.id; save(); renderTakes(takesBox); uploadTake(t).catch(function () {}); notes.textContent = ''; checks.forEach(function (c) { notes.appendChild(el('div', { class: c.level === 'ok' ? 'ok' : 'bad', text: c.note + (c.level === 'ok' ? '. We run the full sound and picture check after upload.' : '') })); }); URL.revokeObjectURL(url); });
      };
      m.onerror = function () { toast('We could not read that file. Try an MP4 or MOV from your phone.'); };
      m.src = url;
    });
    if (!window.MediaRecorder || !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) $('#upload-wrap').hidden = false;

    // WhatsApp capture slot
    api('GET', '/status').then(function (s) {
      var w = s.whatsapp_capture; if (!w) return;
      var qr = $('#qr'); qr.textContent = ''; if (w.qr_url) qr.appendChild(el('img', { src: w.qr_url, alt: 'QR code to open WhatsApp' })); else qr.textContent = 'QR here';
      $('#walink').href = w.link; $('#walink').hidden = false;
    }).catch(function () {});

    $('#cont').addEventListener('click', function () {
      var t = S.takes.filter(function (x) { return x.id === S.selected; })[0] || S.takes[S.takes.length - 1];
      if (!t) { toast('Record a take first, or upload one.'); return; }
      Promise.all(S.takes.map(uploadTake)).catch(function () {}).then(function () { location.href = 'approve.html' + (MOCK ? '?mock=1' : ''); });
    });
    renderTakes(takesBox);
    $('#takeno').textContent = 'Take ' + Math.min(S.takes.length + 1, LIMITS.maxTakes) + ' of ' + LIMITS.maxTakes;
    window.addEventListener('pagehide', function () { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); });
  }

  // ---------------------------------------------------------------- page: approve
  function pageApprove() {
    var takesBox = $('#takes'), box = $('#wa'), broker = DEMO_BROKER, serverTakes = {};
    function personal(kind) {
      var lead = 'Lerato', day = 'Tue 7 Oct', time = '10:00'; // fictional example lead and slot
      return kind === 'audio'
        ? 'Hi ' + lead + ', ' + broker.name + ' recorded a short voice note (about 25 seconds) so you know who you will be speaking to. Tap Play to hear it. Your call is on *' + day + ' at ' + time + '*. Reply STOP to opt out.'
        : 'Hi ' + lead + ', ' + broker.name + ' recorded this short video so you know who you will be speaking to. Your call is on *' + day + ' at ' + time + '*. Reply STOP to opt out.';
    }
    function boldWa(txt) { var d = el('div'); txt.split('*').forEach(function (p, i) { d.appendChild(i % 2 ? el('b', { text: p }) : document.createTextNode(p)); }); return d; }
    function paint() {
      var t = S.takes.filter(function (x) { return x.id === S.selected; })[0] || S.takes[S.takes.length - 1];
      box.textContent = ''; $('#approve').toggleAttribute('aria-disabled', !t);
      if (!t) { box.appendChild(el('div', { class: 'lbl', text: 'No take yet. Go back and record one.' })); return; }
      S.selected = t.id; save();
      var st = serverTakes[t.server_id], processed = st && st.preview_url;
      var vid = el('div', { class: 'vid' });
      if (t.kind === 'video') {
        if (processed) { vid.appendChild(el('video', { src: st.preview_url, controls: '', playsinline: '', poster: st.thumbnail_url || '' })); }
        else { idb.get(t.id).then(function (b) { if (!b) return; var v = el('video', { controls: '', playsinline: '' }); v.src = URL.createObjectURL(b); vid.insertBefore(v, vid.firstChild); }); vid.appendChild(el('div', { class: 'lt', text: broker.name + ' · ' + broker.practice + ' · FSP ' + broker.fsp })); }
      } else { idb.get(t.id).then(function (b) { if (b) vid.appendChild(el('audio', { controls: '', src: URL.createObjectURL(b), style: 'position:absolute;left:4px;right:4px;bottom:8px;width:calc(100% - 8px)' })); }); }
      var msg = el('div', { class: 'msg' }, [t.kind === 'video' ? vid : el('b', { text: 'A voice note from ' + broker.name }), boldWa(personal(t.kind)), el('span', { class: 'lbl', text: 'SortMyCover' }), el('span', { class: 'qr', text: t.kind === 'video' ? 'Looking forward to it' : 'Play voice note' }), el('span', { class: 'qr', text: 'Reschedule' }), el('span', { class: 'ts', text: 'Example lead and time' })]);
      box.appendChild(el('div', { class: 'preview' }, [msg]));
      $('#procnote').textContent = processed ? 'This is the processed file: captions, your name and FSP, and the SortMyCover end-frame are part of the video.' : 'Preview of your raw take. Captions, your name and FSP number, and the SortMyCover end-frame are added automatically; the finished video appears here in a minute or two.';
      var v = verdict(t.checks); $('#verdict').textContent = 'Quick check: ' + (v.label === 'Good' ? 'good' : v.label.toLowerCase()) + '. ' + t.checks.filter(function (c) { return c.level !== 'ok'; }).map(function (c) { return c.note; }).join(' ');
    }
    renderTakes(takesBox, paint);
    function poll() {
      api('GET', '/status').then(function (s) {
        broker = s.broker || broker; (s.takes || []).forEach(function (x) { serverTakes[x.take_id] = x; });
        var t = S.takes.filter(function (x) { return x.id === S.selected; })[0];
        var st = t && serverTakes[t.server_id];
        if (st && st.state === 'rejected') { $('#reject').hidden = false; $('#reject').textContent = st.reason || 'This take did not pass our check. Please record another.'; $('#approve').setAttribute('aria-disabled', 'true'); }
        paint(); if (st && st.state === 'processing') setTimeout(poll, 3000);
        if (s.approved) done(s.approved);
      }).catch(function () { paint(); });
    }
    function done() { $('#approve').hidden = true; $('#lang').hidden = true; $('#done').hidden = false; }
    $('#approve').addEventListener('click', function () {
      var t = S.takes.filter(function (x) { return x.id === S.selected; })[0]; if (!t || $('#approve').getAttribute('aria-disabled') === 'true') return;
      $('#approve').setAttribute('aria-disabled', 'true');
      api('POST', '/approve', { take_id: t.server_id || t.id, language: S.lang, script_text: S.chosen && S.chosen.text }).then(done).catch(function () { $('#approve').removeAttribute('aria-disabled'); toast('Could not approve yet. Wait for processing to finish and try again.'); });
    });
    $('#lang').addEventListener('click', function () { var l = prompt('Which language? Use a two-letter code, for example af, zu, xh, st, tn.', 'af'); if (l && /^[a-z]{2,3}$/.test(l)) { S.lang = l; S.chosen = null; S.takes = []; S.selected = null; save(); location.href = 'scripts.html?lang=' + l + (MOCK ? '&mock=1' : ''); } });
    paint(); poll();
  }

  // ---------------------------------------------------------------- boot
  window.IntroMedia = { lintScript: lintScript, judgeLight: judgeLight, judgeAudio: judgeAudio, judgeDuration: judgeDuration, judgeFace: judgeFace, QUESTIONS: QUESTIONS, LIMITS: LIMITS };
  if (typeof document !== 'undefined' && document.body) {
    mockBar();
    var page = document.body.getAttribute('data-page');
    ({ index: pageIndex, interview: pageInterview, scripts: pageScripts, record: pageRecord, approve: pageApprove }[page] || function () {})();
    if (page === 'index') api('GET', '/status').catch(function () { if (!MOCK) { /* offline: leave the static page as is */ } });
  }
})();
