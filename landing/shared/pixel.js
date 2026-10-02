/*! SortMyCover pixel.js - vanilla ES2017, no dependencies.
 * Loads the Meta Pixel, makes one event_id per event, persists attribution
 * (utm_*, fbclid, _fbp, _fbc) and returns a context for POST /lead and /book.
 * Browser never sends name/phone/email; hashing is server-side only (capi.js).
 * ASSUMPTION (privacy notice names the Pixel): PageView fires on load unless
 * window.SMC_CONSENT_ANALYTICS === false, in which case the pixel is not loaded
 * and no _fbp/_fbc is read or built (utm/fbclid still stored first-party for the lead record).
 */
(function (w, d) {
  'use strict';
  var EVENTS = ['PageView', 'ViewContent', 'Lead', 'Schedule', 'Contact'];
  var PII = /^(fn|ln|em|ph|name|first_?name|last_?name|phone|mobile|email|msisdn)$/i;
  var KEY = 'smc_attr', UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref'];
  var pixelId = null, last = null, loaded = false;

  function store(k, v) { try { w.localStorage.setItem(k, v); } catch (e) { try { w.sessionStorage.setItem(k, v); } catch (e2) {} } }
  function fetchStored(k) { try { return w.localStorage.getItem(k) || w.sessionStorage.getItem(k); } catch (e) { return null; } }
  function cookie(n) { var m = d.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : null; }
  function consent() { return w.SMC_CONSENT_ANALYTICS !== false; }

  function uuid() {
    var c = w.crypto;
    if (c && c.randomUUID) return c.randomUUID();
    var b = new Uint8Array(16);
    if (c && c.getRandomValues) c.getRandomValues(b); else for (var i = 0; i < 16; i++) b[i] = Math.random() * 256;
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  // Persist first-touch utm/fbclid for the session; a new fbclid replaces the old one.
  function attribution() {
    var saved = {}, q = new URLSearchParams(w.location.search), changed = false;
    try { saved = JSON.parse(fetchStored(KEY) || '{}'); } catch (e) {}
    saved.utm = saved.utm || {};
    UTM.forEach(function (k) { var v = q.get(k); if (v) { saved.utm[k] = v; changed = true; } });
    var f = q.get('fbclid');
    if (f && f !== saved.fbclid) { saved.fbclid = f; saved.fbclid_ts = Date.now(); changed = true; }
    if (changed) store(KEY, JSON.stringify(saved));
    return saved;
  }

  // Meta format: fb.<subdomainIndex>.<creationTime ms>.<fbclid>
  function getFbc(a) {
    var c = cookie('_fbc');
    if (c) return c;
    if (!a.fbclid) return null;
    var v = 'fb.1.' + (a.fbclid_ts || Date.now()) + '.' + a.fbclid;
    try { d.cookie = '_fbc=' + encodeURIComponent(v) + ';max-age=7776000;path=/;SameSite=Lax'; } catch (e) {}
    return v;
  }

  function init() {
    if (loaded) return;
    var m = d.querySelector('meta[name="smc-pixel-id"]');
    pixelId = (m && m.content) || w.SMC_PIXEL_ID || null;
    loaded = true;
    if (!pixelId || !consent() || w.fbq) return;
    // Standard Meta Pixel loader.
    var n = w.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!w._fbq) w._fbq = n;
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    var s = d.createElement('script'); s.async = true; s.src = 'https://connect.facebook.net/en_US/fbevents.js';
    d.head.appendChild(s);
    w.fbq('init', pixelId);
  }

  function context(eventId) {
    var a = attribution(), ok = consent();
    return {
      event_id: eventId || uuid(),
      fbp: ok ? cookie('_fbp') : null,
      fbc: ok ? getFbc(a) : null,
      utm: a.utm || {},
      fbclid: a.fbclid || null,
      page_url: w.location.href.split('#')[0],
      user_agent: w.navigator.userAgent,
      ts: Math.floor(Date.now() / 1000)
    };
  }

  function clean(p) {
    var o = {};
    Object.keys(p || {}).forEach(function (k) { if (!PII.test(k)) o[k] = p[k]; });
    return o;
  }

  // Fires the pixel event (if consented) and returns the context to POST with the form.
  function track(name, params) {
    if (EVENTS.indexOf(name) < 0) return null;
    init();
    var ctx = context();
    if (pixelId && consent() && w.fbq) w.fbq('track', name, clean(params), { eventID: ctx.event_id });
    last = ctx;
    ctx.event_name = name;
    return ctx;
  }

  var smc = w.smc = { track: track, context: function () { return last ? Object.assign({}, last, { ts: Math.floor(Date.now() / 1000) }) : context(); }, events: EVENTS };
  attribution();
  function boot() { if (!w.SMC_NO_AUTO_PAGEVIEW) smc.track('PageView'); }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot); else boot();
})(window, document);
