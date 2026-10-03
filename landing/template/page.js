/* SortMyCover landing page logic. Vanilla ES2017, no dependencies.
   Quiz (5 taps) -> result + details -> POST /lead -> slots -> POST /book -> thank-you.
   Pixel calls per landing/shared/pixel.README.md. Never sends name/phone/email to the Pixel. */
(function () {
  'use strict';
  var root = document.getElementById('smc');
  if (!root) return;
  var API = (root.getAttribute('data-api-base') || '').replace(/\/$/, '');
  var ANGLE = root.getAttribute('data-angle') || '';
  var BOOKING = root.getAttribute('data-booking') !== 'false';
  var SITEKEY = root.getAttribute('data-turnstile-sitekey') || '';
  var S = {};
  try { S = JSON.parse(document.getElementById('smc-strings').textContent); } catch (e) {}
  function str(k, vars) {
    var s = S[k] || '';
    if (vars) Object.keys(vars).forEach(function (n) { s = s.replace('{' + n + '}', vars[n]); });
    return s;
  }
  var $ = function (id) { return document.getElementById(id); };
  var card = $('card'), prog = $('prog'), form = $('lead'), live = $('live');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TOTAL = 7;
  var step = 1, answers = {}, lead = null, leadToken = '';
  try { leadToken = sessionStorage.getItem('smc_lt') || ''; } catch (e) {}
  var started = false, leadCtx = null, scheduleCtx = null, sending = false, booking = false;
  var chosenSlot = null, chosenMethod = null, bookable = [];

  /* ---------- pixel helpers (pixel.js may be blocked: never break the page) ---------- */
  function track(name, params) {
    try { if (window.smc && window.smc.track) return window.smc.track(name, params); } catch (e) {}
    return { event_id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random(), event_name: name, utm: {}, fbclid: null, fbp: null, fbc: null, page_url: location.origin + location.pathname, user_agent: navigator.userAgent, ts: Math.floor(Date.now() / 1000) };
  }
  function startQuiz() {
    if (started) return; started = true;
    track('ViewContent', { content_name: 'quiz_start' });
    loadTurnstile();
  }
  /* Turnstile-class challenge: only loads when a site key is configured, and only after the first quiz interaction (keeps LCP clean). */
  var tsToken = '', tsLoaded = false, tsReady = false, tsWidgets = {}, tsWaiters = {};
  function uuid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); }
  var STARTED_AT = new Date().toISOString(); /* page load; server needs fill time >= 3 s and < 1 h (W03-notes B.3 #3) */
  var leadRequestId = uuid(), bookRequestId = null;
  function renderTs(action) {
    var slot = $(action === 'book' ? 'turnstile-slot-book' : 'turnstile-slot');
    if (!slot || tsWidgets[action] != null) return;
    try {
      tsWidgets[action] = window.turnstile.render(slot, { sitekey: SITEKEY, size: 'invisible', action: action, execution: action === 'book' ? 'execute' : 'render',
        callback: function (t) { if (action === 'lead') tsToken = t; if (tsWaiters[action]) { tsWaiters[action](t); tsWaiters[action] = null; } } });
    } catch (e) {}
  }
  function loadTurnstile() {
    if (!SITEKEY || tsLoaded) return; tsLoaded = true;
    window.__smcTs = function () { tsReady = true; renderTs('lead'); };
    var s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__smcTs'; s.async = true;
    document.head.appendChild(s);
  }
  /* Fresh single-use token for /book with action=book. Empty site key (stub) or any failure resolves '' after at most 8 s: the server decides. */
  function bookToken() {
    if (!SITEKEY) return Promise.resolve('');
    loadTurnstile();
    return new Promise(function (resolve) {
      var done = false, to = setTimeout(function () { if (!done) { done = true; resolve(''); } }, 8000);
      tsWaiters.book = function (t) { if (!done) { done = true; clearTimeout(to); resolve(t || ''); } };
      (function go(n) {
        if (!tsReady) { if (n < 40) setTimeout(function () { go(n + 1); }, 200); return; }
        renderTs('book');
        try { if (tsWidgets.book != null) { window.turnstile.reset(tsWidgets.book); window.turnstile.execute(tsWidgets.book); } } catch (e) {}
      })(0);
    });
  }

  /* ---------- step navigation ---------- */
  function show(n, opts) {
    opts = opts || {};
    step = n;
    Array.prototype.forEach.call(card.querySelectorAll('.q'), function (q) { q.classList.toggle('on', +q.getAttribute('data-step') === n); });
    var fill = Math.min(n, TOTAL);
    Array.prototype.forEach.call(prog.querySelectorAll('i'), function (i, idx) { i.classList.toggle('on', idx < fill); });
    prog.setAttribute('aria-valuenow', String(fill));
    prog.style.display = n >= 8 ? 'none' : 'flex';
    $('sticky').style.display = n >= 6 ? 'none' : '';
    var panel = card.querySelector('.q.on');
    var h = panel && panel.querySelector('h3');
    if (n >= 2 && !opts.noScroll) card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    if (h && !opts.noScroll) { try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); } }
  }

  /* ---------- quiz ---------- */
  var viaPointer = false;
  card.addEventListener('pointerdown', function (e) { if (e.target.closest && e.target.closest('.opt')) viaPointer = true; }, true);
  card.addEventListener('keydown', function () { viaPointer = false; }, true);
  card.addEventListener('click', function (e) {
    var inp = e.target;
    if (!(inp.matches && inp.matches('.opts input[type=radio]'))) return;
    startQuiz();
    answers[inp.name] = inp.value;
    Array.prototype.forEach.call(inp.closest('.opts').querySelectorAll('.opt'), function (o) { o.classList.toggle('sel', o.contains(inp)); });
    if (viaPointer) { setTimeout(function () { if (step < 6) advance(); }, 220); }
    else { var nb = inp.closest('.q').querySelector('.js-next'); if (nb) { nb.hidden = false; } }
  });
  Array.prototype.forEach.call(card.querySelectorAll('.js-next'), function (b) { b.addEventListener('click', function () { advance(); }); });
  Array.prototype.forEach.call(card.querySelectorAll('[data-back]'), function (b) { b.addEventListener('click', function () { show(step - 1); }); });
  ['heroCta', 'stickyCta'].forEach(function (id) { var a = $(id); if (a) a.addEventListener('click', function () { startQuiz(); }); });

  function qualifies() {
    var ageOk = answers.age_band === '35_44' || answers.age_band === '45_50';
    var budgetOk = answers.budget_band === '750_1250' || answers.budget_band === '1250plus';
    return ageOk && budgetOk;
  }
  function advance() {
    if (step < 5) { show(step + 1); return; }
    if (step === 5) {
      if (!answers.budget_band) return;
      if (qualifies()) {
        var wc = answers.work_cover;
        $('h6q').textContent = str(wc === 'yes' ? 'result_yes' : wc === 'unsure' ? 'result_unsure' : 'result_no');
        show(6);
      } else { show(9); } /* out of band: friendly exit, nothing is sent or stored */
    }
  }

  /* ---------- details ---------- */
  function toE164(v) {
    var d = String(v || '').replace(/[^\d+]/g, '');
    if (d.indexOf('+') > 0) return null;
    d = d.replace(/^\+/, '');
    if (d.indexOf('0027') === 0) d = d.slice(4); else if (d.indexOf('27') === 0 && d.length === 11) d = d.slice(2); else if (d.charAt(0) === '0') d = d.slice(1); else return null;
    return /^[678]\d{8}$/.test(d) ? '+27' + d : null;
  }
  function pretty(e) { return e.replace(/^\+27(\d{2})(\d{3})(\d{4})$/, '+27 $1 $2 $3'); }
  function setField(id, bad, inputId) {
    var f = $(id); f.classList.toggle('bad', !!bad);
    var i = $(inputId); if (i) { if (bad) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid'); }
  }
  function checkName(show) { var ok = $('name').value.trim().length >= 2; if (show || ok) setField('fName', !ok, 'name'); return ok; }
  function checkPhone(showErr) {
    var e = toE164($('phone').value), f = $('fPhone'), digits = $('phone').value.replace(/\D/g, '').length;
    f.classList.toggle('good', !!e); $('oPhone').textContent = e ? str('ok_mobile') + ' ' + pretty(e) : '';
    if (e) setField('fPhone', false, 'phone');
    else if (showErr || digits >= 10) setField('fPhone', true, 'phone');
    return e;
  }
  $('phone').addEventListener('input', function () { checkPhone(false); });
  $('phone').addEventListener('blur', function () { if ($('phone').value) checkPhone(true); });
  $('name').addEventListener('blur', function () { if ($('name').value) checkName(true); });
  $('consent').addEventListener('change', function () { $('fConsent').classList.toggle('bad', !this.checked); });
  form.noValidate = true;

  function api(path, opt) {
    var ctl = ('AbortController' in window) ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, 15000);
    opt = opt || {}; if (ctl) opt.signal = ctl.signal;
    return fetch(API + path, opt).then(function (r) {
      clearTimeout(t);
      return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, ok: r.ok, json: j || {} }; });
    }, function (err) { clearTimeout(t); throw err; });
  }
  function showErr(id, msg) { var el = $(id); el.textContent = msg; el.hidden = !msg; }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (step !== 6 || sending) return;
    var nameOk = checkName(true), e164 = checkPhone(true), consentOk = $('consent').checked;
    $('fConsent').classList.toggle('bad', !consentOk);
    if (!(nameOk && e164 && consentOk)) {
      (!nameOk ? $('name') : !e164 ? $('phone') : $('consent')).focus(); return;
    }
    if (form.elements.company_website.value) { /* honeypot: pretend success, send nothing */ finish(false); return; }
    sending = true; showErr('formErr', '');
    var btn = $('send'); btn.disabled = true; btn.firstChild.nodeValue = str('sending') + ' ';
    leadCtx = leadCtx || track('Lead', { content_name: ANGLE });
    var body = {
      first_name: $('name').value.trim(), mobile: e164, consent: true,
      consent_text: form.elements.consent_text.value, consent_version: form.elements.consent_version.value, consent_mode: form.elements.consent_mode.value,
      age_band: answers.age_band, bond: answers.bond, dependants: answers.dependants, work_cover: answers.work_cover, budget_band: answers.budget_band,
      angle: ANGLE, lang: root.getAttribute('data-lang'), started_at: STARTED_AT, request_id: leadRequestId, page_url: location.origin + location.pathname,
      company_website: '', turnstile_token: tsToken || (form.elements['cf-turnstile-response'] ? form.elements['cf-turnstile-response'].value : ''),
      context: leadCtx
    };
    api('/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) {
      sending = false; btn.disabled = false; btn.firstChild.nodeValue = str('send') + ' ';
      if (r.ok) {
        var j = r.json;
        leadToken = j.lead_token || ''; try { sessionStorage.setItem('smc_lt', leadToken); } catch (e) {}
        lead = { id: j.lead_id, methods: (j.methods_supported && j.methods_supported.length) ? j.methods_supported : ['whatsapp_call', 'phone'] };
        if (j.out_of_band) { show(9); return; }
        if (BOOKING && leadToken) startBooking(); else finish(false);
      } else if (r.status === 429) showErr('formErr', str('err_rate'));
      else if (r.status === 422 && r.json.error === 'out_of_band') show(9);
      else if (r.status === 422 && /mobile/.test(r.json.error || '')) { setField('fPhone', true, 'phone'); showErr('formErr', str('err_mobile_server')); }
      else showErr('formErr', str('err_send'));
    }, function () { sending = false; btn.disabled = false; btn.firstChild.nodeValue = str('send') + ' '; showErr('formErr', str('err_send')); });
  });

  /* ---------- booking ---------- */
  var NEEDS_EMAIL = { teams: 1, zoom: 1, google_meet: 1 };
  function startBooking() {
    show(7);
    $('slotStatus').textContent = str('loading_slots'); $('slots').textContent = '';
    renderMethods();
    api('/slots?days=5', { method: 'GET', headers: { Accept: 'application/json', 'X-Lead-Token': leadToken } }).then(function (r) {
      var list = r.ok ? normalise(r.json.slots) : [];
      if (!list.length) { $('slotStatus').textContent = str('no_slots'); $('slotStatus').className = 'status warn'; setTimeout(function () { finish(false); }, 2500); return; }
      renderSlots(list, true);
    }, function () { $('slotStatus').textContent = str('no_slots'); setTimeout(function () { finish(false); }, 2500); });
  }
  function normalise(arr) {
    var out = {};
    (arr || []).forEach(function (s) { var v = typeof s === 'string' ? s : (s && (s.start || s.id)); if (v && /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(v)) out[v] = 1; });
    return Object.keys(out).sort();
  }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function dayLabel(iso) { var p = iso.slice(0, 10).split('-'); var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); return DAYS[d.getUTCDay()] + ' ' + (+p[2]) + ' ' + MONTHS[+p[1] - 1]; }
  function renderSlots(list, grouped) {
    bookable = list; var box = $('slots'); box.textContent = ''; chosenSlot = null;
    var byDay = {}, order = [];
    list.forEach(function (s) { var k = s.slice(0, 10); if (!byDay[k]) { byDay[k] = []; order.push(k); } byDay[k].push(s); });
    if (grouped) order = order.slice(0, 5);
    order.forEach(function (k) {
      var h = document.createElement('h4'); h.className = 'day'; h.textContent = dayLabel(k); h.id = 'd' + k; box.appendChild(h);
      var g = document.createElement('div'); g.className = 'slots'; g.setAttribute('role', 'group'); g.setAttribute('aria-labelledby', 'd' + k);
      byDay[k].slice(0, 6).forEach(function (s) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'slot'; b.setAttribute('data-start', s);
        b.setAttribute('aria-pressed', 'false'); b.textContent = s.slice(11, 16); b.setAttribute('aria-label', dayLabel(s) + ' at ' + s.slice(11, 16));
        b.addEventListener('click', function () {
          Array.prototype.forEach.call(box.querySelectorAll('.slot'), function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
          chosenSlot = s; showErr('bookErr', '');
        });
        g.appendChild(b);
      });
      box.appendChild(g);
    });
    $('slotStatus').className = 'status'; $('slotStatus').textContent = str('slots_ready');
  }
  function renderMethods() {
    var box = $('methods'); box.textContent = ''; chosenMethod = null;
    lead.methods.forEach(function (m, idx) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'method'; b.setAttribute('data-m', m);
      b.textContent = (S.methods && S.methods[m]) || m; b.setAttribute('aria-pressed', idx === 0 ? 'true' : 'false');
      b.addEventListener('click', function () { selectMethod(m); });
      box.appendChild(b);
    });
    selectMethod(lead.methods[0]);
  }
  function selectMethod(m) {
    chosenMethod = m;
    Array.prototype.forEach.call($('methods').querySelectorAll('.method'), function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-m') === m ? 'true' : 'false'); });
    $('fEmail').hidden = !NEEDS_EMAIL[m]; /* email is asked ONLY for invite methods (0.1) */
    if (!NEEDS_EMAIL[m]) { $('email').value = ''; $('fEmail').classList.remove('bad'); $('emailFix').hidden = true; }
  }

  /* Mailcheck-style typo suggestion + format check (MX/disposable checks happen server side, W05) */
  var DOMAINS = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'live.com', 'webmail.co.za', 'mweb.co.za', 'telkomsa.net', 'vodamail.co.za', 'outlook.co.za', 'yahoo.co.za'];
  function lev(a, b) { var m = [], i, j; for (i = 0; i <= a.length; i++) m[i] = [i]; for (j = 0; j <= b.length; j++) m[0][j] = j;
    for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return m[a.length][b.length]; }
  function suggest(email) {
    var at = email.lastIndexOf('@'); if (at < 1) return null;
    var dom = email.slice(at + 1).toLowerCase(), best = null, bd = 3;
    if (DOMAINS.indexOf(dom) >= 0) return null;
    DOMAINS.forEach(function (d) { var x = lev(dom, d); if (x < bd) { bd = x; best = d; } });
    return best ? email.slice(0, at + 1) + best : null;
  }
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function checkEmail(showE) {
    var v = $('email').value.trim(), ok = EMAIL_RE.test(v);
    var f = $('fEmail'); f.classList.toggle('bad', !ok && showE);
    if (!ok && showE) $('email').setAttribute('aria-invalid', 'true'); else $('email').removeAttribute('aria-invalid');
    var s = ok ? suggest(v) : null, fix = $('emailFix');
    if (s) { fix.textContent = str('did_you_mean', { x: s }); fix.hidden = false; fix.onclick = function () { $('email').value = s; fix.hidden = true; $('email').focus(); }; } else fix.hidden = true;
    return ok;
  }
  $('email').addEventListener('blur', function () { if ($('email').value) checkEmail(true); });
  $('email').addEventListener('input', function () { if ($('fEmail').classList.contains('bad')) checkEmail(true); });

  $('book').addEventListener('click', function () {
    if (booking) return;
    if (!chosenSlot) { showErr('bookErr', str('err_pick_slot')); return; }
    if (!chosenMethod) { showErr('bookErr', str('err_pick_method')); return; }
    var needs = !!NEEDS_EMAIL[chosenMethod];
    if (needs && !checkEmail(true)) { $('email').focus(); return; }
    showErr('bookErr', ''); booking = true; $('book').disabled = true; $('book').textContent = str('booking');
    scheduleCtx = scheduleCtx || track('Schedule'); /* own event_id, never the Lead id */
    if (!bookRequestId) bookRequestId = uuid(); /* same id on a retry of the same attempt (idempotent), new id after a 409 or success */
    var slotNow = chosenSlot, methodNow = chosenMethod;
    function send() { return bookToken().then(function (tok) {
    var body = { lead_id: lead.id, slot_start: slotNow, method: methodNow, angle: ANGLE, started_at: STARTED_AT, request_id: bookRequestId, turnstile_token: tok, context: scheduleCtx };
    if (needs) body.email = $('email').value.trim();
    return api('/book', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Lead-Token': leadToken }, body: JSON.stringify(body) }); }); }
    /* I-56d: 400 try_again = Turnstile rejected -> fresh token and ONE re-run, then the friendly retry. 429 rate_limited / 503 try_again use the same error UI. */
    send().then(function (r) { return (r.status === 400 && r.json && r.json.error === 'try_again') ? send() : r; }).then(function (r) {
      booking = false; $('book').disabled = false; $('book').textContent = str('book');
      if (r.status === 409 || r.ok) bookRequestId = null;
      if (r.ok && (r.json.booked !== false)) { finish(true, { start: r.json.start || chosenSlot, method: r.json.method || chosenMethod, ics_url: r.json.ics_url }); }
      else if (r.status === 409) { /* collision: slot taken in the last second, show the next 3 */
        var nxt = normalise(r.json.slots).slice(0, 3);
        if (nxt.length) { renderSlots(nxt, false); $('slotStatus').className = 'status warn'; $('slotStatus').textContent = str('taken'); }
        else { showErr('bookErr', str('err_book')); }
      } else if (r.status === 422 && /email/.test(r.json.error || '')) { $('fEmail').classList.add('bad'); $('email').focus(); }
      else showErr('bookErr', str('err_book'));
    }, function () { booking = false; $('book').disabled = false; $('book').textContent = str('book'); showErr('bookErr', str('err_book')); });
  });
  $('skipBook').addEventListener('click', function () {
    /* I-45o: tell the server the lead skipped booking (POST /lead/skip, X-Lead-Token) so the slots card goes to WhatsApp now
       instead of after the 45-s hold. Fire-and-forget: the thank-you never waits on it and a failure changes nothing here. */
    if (lead && lead.id && leadToken) {
      try { api('/lead/skip', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Lead-Token': leadToken }, body: JSON.stringify({ lead_id: lead.id }) }).catch(function () {}); } catch (e) {}
    }
    finish(false);
  });

  /* ---------- thank-you ---------- */
  function row(label, value) { var s = document.createElement('span'); var b = document.createElement('b'); b.textContent = label + ' '; s.appendChild(b); s.appendChild(document.createTextNode(value)); return s; }
  function icsUtc(iso) { var d = new Date(iso); function p(n) { return (n < 10 ? '0' : '') + n; } return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + 'T' + p(d.getUTCHours()) + p(d.getUTCMinutes()) + '00Z'; }
  function makeIcs(start, method) {
    var end = new Date(new Date(start).getTime() + 30 * 60000).toISOString();
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SortMyCover//Landing//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      'UID:' + (lead && lead.id ? lead.id : 'smc') + '-' + icsUtc(start) + '@sortmycover.co.za', 'DTSTAMP:' + icsUtc(new Date().toISOString()),
      'DTSTART:' + icsUtc(start), 'DTEND:' + icsUtc(end), 'SUMMARY:' + str('cal_title'), 'DESCRIPTION:' + str('cal_desc') + ' (' + ((S.methods && S.methods[method]) || method) + ')', 'END:VEVENT', 'END:VCALENDAR'];
    return new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  }
  function finish(booked, info) {
    var name = ($('name').value || '').trim(), sm = $('summary'); sm.textContent = '';
    var cal = $('cal'); cal.hidden = true;
    if (booked) {
      $('doneH').textContent = str('done_booked_h', { name: name }); $('doneP').textContent = str('done_booked_p');
      sm.appendChild(row(str('sum_when'), dayLabel(info.start) + ', ' + info.start.slice(11, 16)));
      sm.appendChild(row(str('sum_how'), (S.methods && S.methods[info.method]) || info.method));
      sm.appendChild(row(str('sum_adviser'), str('sum_adviser_v')));
      try { cal.href = info.ics_url || URL.createObjectURL(makeIcs(info.start, info.method)); cal.hidden = false; } catch (e) {}
    } else {
      $('doneH').textContent = str('done_not_h', { name: name }); $('doneP').textContent = str('done_not_p');
      sm.appendChild(row(str('sum_next'), str('sum_next_v')));
    }
    show(8);
  }

  show(1, { noScroll: true });
})();
