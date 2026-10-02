/* Tiny data binder. Data arrives as ?d=<urlencoded JSON> (the render pipeline) or window.SM_DEFAULTS (opening the file by hand).
   data-b="key"   -> textContent (hidden if empty)
   data-bh="key"  -> text with **emphasis** -> <em class="hl"> and \n -> <br> (HTML-escaped first)
   data-src="key" -> img src (hidden if empty)   data-if="key" -> hidden unless truthy   data-hide-if="key" -> hidden when truthy
   d.layout       -> class added to <body> (e.g. "wide", "r4x5") */
(function () {
  const q = new URLSearchParams(location.search);
  const d = Object.assign({}, window.SM_DEFAULTS || {});
  try { if (q.get('d')) Object.assign(d, JSON.parse(q.get('d'))); } catch (e) { console.error('bad data', e); }
  window.SM = d;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<em class="hl">$1</em>').replace(/\n/g, '<br>');
  const run = () => {
    if (d.layout) document.body.classList.add(...String(d.layout).split(' '));
    document.querySelectorAll('[data-b]').forEach(el => { const v = d[el.dataset.b]; if (v == null || v === '') el.hidden = true; else el.textContent = v; });
    document.querySelectorAll('[data-bh]').forEach(el => { const v = d[el.dataset.bh]; if (v == null || v === '') el.hidden = true; else el.innerHTML = fmt(v); });
    document.querySelectorAll('[data-src]').forEach(el => { const v = d[el.dataset.src]; if (!v) el.hidden = true; else el.src = v; });
    document.querySelectorAll('[data-if]').forEach(el => { if (!d[el.dataset.if]) el.hidden = true; });
    document.querySelectorAll('[data-hide-if]').forEach(el => { if (d[el.dataset.hideIf]) el.hidden = true; });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
