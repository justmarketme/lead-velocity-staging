// Lead Velocity film: shared deterministic runtime. Every visual is a pure function of
// scene time t (seconds). The renderer calls window.seek(t) per frame; nothing uses
// CSS transitions, animations or wall-clock time, so frames are reproducible.
(function () {
  const body = document.body, id = body.dataset.scene;
  const TM = window.TIMINGS, S = TM.scenes.find(s => s.id === id);
  const idx = TM.scenes.indexOf(S), total = TM.scenes.length;
  window.SCENE = S;
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  // the nth spoken word starting with `word`, at/after scene time `after`
  const find = (word, n = 1, after = 0) => {
    const w = norm(word); let c = 0;
    for (const tk of S.words) if (tk.t >= after && norm(tk.w).startsWith(w) && ++c === n) return tk;
    console.error('cue missing: ' + word + ' #' + n); return { t: 0, e: 0 };
  };
  window.cue = (w, n, a) => find(w, n, a).t;
  window.cueEnd = (w, n, a) => find(w, n, a).e;

  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const E = window.E = {
    lin: x => x,
    out: x => 1 - Math.pow(1 - x, 3),
    out5: x => 1 - Math.pow(1 - x, 5),
    inOut: x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
    back: x => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  };
  window.clamp = clamp;
  window.lerp = (a, b, p) => a + (b - a) * p;
  window.P = (t, t0, d = .9, ease = E.out) => ease(clamp((t - t0) / d));
  const list = el => typeof el === 'string' ? [...document.querySelectorAll(el)] : (el instanceof Element ? [el] : [...el]);
  window.$ = s => document.querySelector(s);
  window.$$ = s => [...document.querySelectorAll(s)];
  // reveal: fade + rise (+ optional scale / blur), staggered across matched elements
  window.rv = (el, t, t0, o = {}) => list(el).forEach((e, i) => {
    const p = P(t, t0 + (o.stagger || 0) * i, o.dur || .9, o.ease || E.out);
    const y = (o.y ?? 26) * (1 - p), x = (o.x || 0) * (1 - p), s = o.scale != null ? lerp(o.scale, 1, p) : 1;
    e.style.opacity = p;
    e.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) scale(${s.toFixed(4)})`;
    if (o.blur) e.style.filter = p < 1 ? `blur(${((1 - p) * o.blur).toFixed(2)}px)` : 'none';
  });

  // ---- chrome: background, top bar, header, subtitles ----
  const stage = document.querySelector('.stage');
  stage.insertAdjacentHTML('afterbegin', '<div class="bg"><i class="b1"></i><i class="b2"></i><div class="grid"></div></div><div class="topbar"></div>');
  if (body.dataset.header !== '0') {
    stage.insertAdjacentHTML('beforeend', `<header class="hd"><div class="brand"><img src="assets/lead-velocity-logo-contract.png" alt="">
      <div><div class="t1">Status update · 7 Oct 2026</div><div class="t2">Where we are</div></div></div>
      <div class="prog"><div class="num"><b>${String(idx + 1).padStart(2, '0')}</b> / ${String(total).padStart(2, '0')}</div>
      <div class="segs">${TM.scenes.map(() => '<span><i></i></span>').join('')}</div></div></header>`);
  }
  stage.insertAdjacentHTML('beforeend', '<div class="subs"><span></span></div>');
  const subWrap = stage.querySelector('.subs'), sub = subWrap.querySelector('span');
  const b1 = stage.querySelector('.b1'), b2 = stage.querySelector('.b2');
  const hd = stage.querySelector('.hd'), segs = stage.querySelectorAll('.hd .segs i');

  function chrome(t) {
    b1.style.transform = `translate3d(${(Math.sin(t * .21 + idx) * 60).toFixed(1)}px,${(Math.cos(t * .17 + idx) * 40).toFixed(1)}px,0)`;
    b2.style.transform = `translate3d(${(Math.cos(t * .15 + idx) * 70).toFixed(1)}px,${(Math.sin(t * .19 + idx) * 50).toFixed(1)}px,0)`;
    if (hd) {
      hd.style.opacity = P(t, .1, .8);
      segs.forEach((s, i) => s.style.transform = `scaleX(${i < idx ? 1 : i > idx ? 0 : clamp(t / S.clip).toFixed(4)})`);
    }
    // subtitles: text swaps on cue boundaries; the bar fades only at the edges of a run
    const cs = S.cues, k = cs.findIndex(c => t >= c.t && t < c.e);
    if (k < 0) { subWrap.style.opacity = 0; return; }
    const c = cs[k], prevAbuts = k > 0 && c.t - cs[k - 1].e < .05, nextAbuts = k < cs.length - 1 && cs[k + 1].t - c.e < .05;
    const fin = prevAbuts ? 1 : clamp((t - c.t) / .18), fout = nextAbuts ? 1 : clamp((c.e - t) / .18);
    if (sub.textContent !== c.text) sub.textContent = c.text;
    subWrap.style.opacity = Math.min(fin, fout);
    subWrap.style.transform = `translateY(${((1 - E.out(fin)) * 8).toFixed(2)}px)`;
  }

  window.seek = t => { chrome(t); if (window.update) window.update(t); return true; };
  window.READY = (async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(i => i.decode().catch(() => {})));
    window.seek(0);
    return true;
  })();

  // Preview in a normal browser: ?t=5 freezes at 5s; otherwise click to play with voice.
  const q = new URLSearchParams(location.search);
  if (q.has('render')) return;
  window.READY.then(() => {
    if (q.has('t')) return window.seek(parseFloat(q.get('t')));
    let t0 = null, started = false;
    const audio = new Audio(`../build/audio/${id}.mp3`);
    document.addEventListener('click', () => { t0 = performance.now(); started = false; audio.pause(); audio.currentTime = 0; });
    const loop = now => {
      if (t0 != null) {
        const t = (now - t0) / 1000;
        if (!started && t >= TM.lead) { started = true; audio.play().catch(() => {}); }
        window.seek(Math.min(t, S.clip));
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
})();
// shared helper: a check mark that draws itself (path with pathLength=1)
window.tick = (el, t, t0) => {
  const p = P(t, t0, .45, E.out);
  el.classList.toggle('on', p > 0);
  const path = el.querySelector('path'); if (path) path.style.strokeDashoffset = (1 - P(t, t0 + .1, .45, E.inOut)).toFixed(3);
  el.style.transform = `scale(${(p > 0 ? lerp(.7, 1, E.back(clamp((t - t0) / .5))) : 1).toFixed(4)})`;
};
