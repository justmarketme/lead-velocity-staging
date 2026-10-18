// WhatsApp phone-sim for the SortMyCover film. Deterministic: chat.update(t) draws the state at scene time t.
// msgs: [{ dir: 'in'|'out', text, at, btns?: [..], list?: 'See times', hdr?: 'img url', tap?: { btn: i } | { sheet: { title, rows, pick } } }]
//  - 'in' messages get a typing indicator for 0.9 s before `at`.
//  - an 'out' message with tap.btn taps button i of the previous 'in' bubble ~0.7 s before it is sent;
//    with tap.sheet a list sheet slides up ~1.8 s before, row `pick` is tapped, then the sheet closes.
window.Chat = function (scr, msgs, opts = {}) {
  const body = scr.querySelector('.wa-body .stack');
  const typing = document.createElement('div');
  typing.className = 'bub in typing'; typing.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
  const els = msgs.map((m) => {
    const d = document.createElement('div');
    d.className = 'bub ' + m.dir;
    let h = '';
    if (m.hdr) h += `<div class="hdr" style="background-image:url('${m.hdr}')"></div>`;
    h += `<div class="tx"></div>`;
    h += `<span class="tm">${m.time || ''}${m.dir === 'out' ? ' <b class="ticks">✓✓</b>' : ''}</span>`;
    if (m.btns) h += `<div class="btns">${m.btns.map((b) => `<div>${b}</div>`).join('')}</div>`;
    if (m.list) h += `<div class="btns"><div>☰ ${m.list}</div></div>`;
    d.innerHTML = h;
    // WhatsApp formatting: *bold*
    const esc = (x) => String(x).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    d.querySelector('.tx').innerHTML = esc(m.text).replace(/\*([^*\n]+)\*/g, '<b>$1</b>');
    d.style.display = 'none';
    body.appendChild(d);
    return d;
  });
  body.appendChild(typing);
  const tap = document.createElement('div'); tap.className = 'tap'; scr.appendChild(tap);
  const sheet = document.createElement('div'); sheet.className = 'sheet';
  sheet.innerHTML = '<div class="grab"></div><div class="st"></div><div class="rows"></div>';
  scr.appendChild(sheet);
  const prevIn = (i) => { for (let k = i - 1; k >= 0; k--) if (msgs[k].dir === 'in') return k; return -1; };
  const rel = (el) => { const a = el.getBoundingClientRect(), b = scr.getBoundingClientRect(); return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2 }; };
  let sheetFor = -1;

  return {
    els,
    update(t) {
      // bubbles
      let typingOn = false;
      msgs.forEach((m, i) => {
        const e = els[i];
        if (t < m.at) { e.style.display = 'none'; if (m.dir === 'in' && t >= m.at - .9 && !m.noTyping) typingOn = true; return; }
        e.style.display = '';
        const p = P(t, m.at, .35, E.out);
        e.style.opacity = p;
        e.style.transform = `translateY(${((1 - p) * 14).toFixed(2)}px) scale(${lerp(.96, 1, p).toFixed(4)})`;
        e.style.transformOrigin = m.dir === 'in' ? 'left bottom' : 'right bottom';
        const tk = e.querySelector('.ticks'); if (tk) tk.style.color = t > m.at + .8 ? '#53bdeb' : '#8696a0';
      });
      typing.style.display = typingOn ? '' : 'none';
      typing.querySelectorAll('i').forEach((d, k) => d.style.opacity = .35 + .65 * Math.max(0, Math.sin(t * 7 - k * .9)));
      // taps (buttons) and list sheets
      let tapOn = 0, tx = 0, ty = 0, sheetP = 0;
      msgs.forEach((m, i) => {
        if (!m.tap) return;
        const pi = prevIn(i);
        if (m.tap.btn != null && pi >= 0) {
          const b = els[pi].querySelectorAll('.btns div')[m.tap.btn];
          const k = clamp((t - (m.at - .75)) / .6);
          if (b) b.style.background = k > 0 && k < 1.2 && t < m.at + .3 ? 'rgba(0,165,244,.12)' : '';
          if (b && k > 0 && k < 1) { const r = rel(b); tx = r.x; ty = r.y; tapOn = Math.sin(Math.PI * k); }
        }
        if (m.tap.sheet) {
          const t0 = m.at - 2.0, t1 = m.at - .25;
          if (t >= t0 && t <= t1 + .35) {
            if (sheetFor !== i) {
              sheetFor = i;
              sheet.querySelector('.st').textContent = m.tap.sheet.title;
              sheet.querySelector('.rows').innerHTML = m.tap.sheet.rows.map((r) => `<div><span>${r}</span><i></i></div>`).join('');
            }
            sheetP = P(t, t0, .4, E.out) * (1 - P(t, t1, .35, E.inOut));
            const row = sheet.querySelectorAll('.rows div')[m.tap.sheet.pick];
            const k = clamp((t - (m.at - 1.05)) / .6);
            sheet.querySelectorAll('.rows div').forEach((r, j) => r.classList.toggle('on', j === m.tap.sheet.pick && t >= m.at - .8));
            if (row && k > 0 && k < 1 && sheetP > .9) { const r = rel(row); tx = r.x; ty = r.y; tapOn = Math.sin(Math.PI * k); }
          }
        }
      });
      sheet.style.transform = `translateY(${((1 - sheetP) * 105).toFixed(2)}%)`;
      sheet.style.opacity = sheetP > 0 ? 1 : 0;
      scr.querySelector('.shade') && (scr.querySelector('.shade').style.opacity = (sheetP * .35).toFixed(3));
      tap.style.opacity = tapOn.toFixed(3);
      tap.style.left = tx + 'px'; tap.style.top = ty + 'px';
      tap.style.transform = `scale(${lerp(1.4, .85, tapOn).toFixed(3)})`;
    },
  };
};
