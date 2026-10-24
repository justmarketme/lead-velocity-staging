// Screenshot capture for the SortMyCover redesign build served locally.
// Blocks every non-local request so no pixel / beacon / webhook traffic leaves the machine.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:8737';
const OUT = 'C:/tmp/lv-w07-fix/deliverables/explainer-film/scenes/assets/site';
const CHROME = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
const DIAG = path.join(__dirname, 'diag.json');

const VP = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1.5, isMobile: false, hasTouch: false },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const LEARN = [
  'life-cover-and-a-home-loan',
  'income-protection-vs-disability-cover',
  'cover-for-business-owners-and-directors',
  'questions-to-ask-a-financial-adviser',
];

// shot kinds: viewport | full | section (scroll section top under header, viewport crop) | bottom | chat (open WhatsApp sheet)
const JOBS = [
  { name: 'home-desktop', path: '/', vp: 'desktop', shots: [
    { kind: 'full', file: 'home-desktop-full.png' },
    { kind: 'viewport', file: 'home-desktop-01-hero.jpg' },
    { kind: 'section', sel: 'section[aria-labelledby="h-moments"]', file: 'home-desktop-02-life-moments.jpg' },
    { kind: 'section', sel: 'section[aria-labelledby="h-how"]', file: 'home-desktop-03-how-it-works.jpg' },
    { kind: 'sectionAt', sel: 'section[aria-labelledby="h-how"]', frac: 0.22, file: 'home-desktop-03a-how-it-works-step-2.jpg' },
    { kind: 'sectionAt', sel: 'section[aria-labelledby="h-how"]', frac: 0.5, file: 'home-desktop-03b-how-it-works-step-3.jpg' },
    { kind: 'sectionAt', sel: 'section[aria-labelledby="h-how"]', frac: 1, file: 'home-desktop-03c-how-it-works-step-4.jpg' },
    { kind: 'section', sel: 'section[aria-labelledby="h-choose"]', file: 'home-desktop-04-two-ways-to-start.jpg' },
    { kind: 'section', sel: 'section[aria-labelledby="h-is"]', file: 'home-desktop-05-what-smc-is-how-we-make-money.jpg' },
    { kind: 'heading', text: 'Ready when you are.', file: 'home-desktop-06-whatsapp-cta.jpg' },
    { kind: 'bottom', file: 'home-desktop-07-footer.jpg' },
    { kind: 'chat', file: 'home-desktop-08-whatsapp-consent-sheet.jpg' },
  ] },
  { name: 'home-mobile', path: '/', vp: 'mobile', shots: [
    { kind: 'full', file: 'home-mobile-full.png' },
    { kind: 'viewport', file: 'home-mobile-01-hero.jpg' },
    { kind: 'section', sel: 'section[aria-labelledby="h-how"]', file: 'home-mobile-02-how-it-works.jpg' },
    { kind: 'sectionAt', sel: 'section[aria-labelledby="h-how"]', frac: 0.5, file: 'home-mobile-02b-how-it-works-mid.jpg' },
    { kind: 'sectionAt', sel: 'section[aria-labelledby="h-how"]', frac: 1, file: 'home-mobile-02c-how-it-works-end.jpg' },
    { kind: 'heading', text: 'Ready when you are.', file: 'home-mobile-03-whatsapp-cta.jpg' },
    { kind: 'chat', file: 'home-mobile-04-whatsapp-consent-sheet.jpg' },
    { kind: 'bottom', file: 'home-mobile-05-footer.jpg' },
  ] },
  { name: 'book-desktop', path: '/book/', vp: 'desktop', shots: [{ kind: 'viewport', file: 'book-desktop.jpg' }] },
  { name: 'book-mobile', path: '/book/', vp: 'mobile', shots: [{ kind: 'viewport', file: 'book-mobile.jpg' }] },
  ...LEARN.flatMap((slug) => [
    { name: `learn-${slug}-desktop`, path: `/learn/${slug}/`, vp: 'desktop', shots: [
      { kind: 'viewport', file: `learn-${slug}-desktop-hero.jpg` },
      { kind: 'full', file: `learn-${slug}-desktop-full.png` },
    ] },
    { name: `learn-${slug}-mobile`, path: `/learn/${slug}/`, vp: 'mobile', shots: [
      { kind: 'viewport', file: `learn-${slug}-mobile-hero.jpg` },
    ] },
  ]),
  { name: 'learn-index-desktop', path: '/learn/', vp: 'desktop', shots: [
    { kind: 'viewport', file: 'learn-index-desktop-hero.jpg' },
    { kind: 'full', file: 'learn-index-desktop-full.png' },
  ] },
  { name: 'about-desktop', path: '/about/', vp: 'desktop', shots: [
    { kind: 'viewport', file: 'about-desktop-hero.jpg' },
    { kind: 'textblock', text: '2026-069309', file: 'about-desktop-information-officer.jpg' },
    { kind: 'full', file: 'about-desktop-full.png' },
  ] },
  { name: 'privacy-desktop', path: '/privacy/', vp: 'desktop', shots: [
    { kind: 'viewport', file: 'privacy-desktop-top.jpg' },
    { kind: 'textblock', text: '2026-069309', file: 'privacy-desktop-information-officer.jpg' },
  ] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function slowScroll(page) {
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const step = Math.round(window.innerHeight * 0.45);
    let y = 0;
    for (let guard = 0; guard < 400; guard++) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (y >= max) break;
      y = Math.min(y + step, max);
      window.scrollTo(0, y);
      await wait(140);
    }
    await wait(600);
    for (let guard = 0; guard < 400 && y > 0; guard++) {
      y = Math.max(0, y - step * 2);
      window.scrollTo(0, y);
      await wait(60);
    }
    window.scrollTo(0, 0);
  });
  await sleep(1500);
}

async function headerOffset(page) {
  return page.evaluate(() => {
    const h = document.querySelector('.site-header');
    if (!h) return 0;
    const cs = getComputedStyle(h);
    return cs.position === 'fixed' || cs.position === 'sticky' ? h.getBoundingClientRect().height : 0;
  });
}

async function scrollToY(page, y) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  await sleep(1200);
}

async function diagnostics(page) {
  return page.evaluate(() => {
    const imgs = [...document.images].map((i) => ({ src: i.currentSrc || i.src, ok: i.complete && i.naturalWidth > 0, alt: i.alt, shown: i.getClientRects().length > 0 && i.getBoundingClientRect().width > 0 }));
    const brokenImgs = imgs.filter((i) => !i.ok && i.shown);
    const notLoadedHidden = imgs.filter((i) => !i.ok && !i.shown).length;
    // background images that point at local files
    const doc = document.documentElement;
    const overflowX = doc.scrollWidth > doc.clientWidth + 1 ? { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth } : null;
    const wide = [];
    if (overflowX) {
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.right > doc.clientWidth + 1 && r.width > 0) wide.push(`${el.tagName.toLowerCase()}.${(el.className && el.className.baseVal === undefined ? el.className : '').toString().slice(0, 60)} right=${Math.round(r.right)}`);
        if (wide.length > 8) break;
      }
    }
    // text still invisible after the scroll pass (reveal animations that never fired)
    const hidden = [];
    for (const el of document.querySelectorAll('main h1, main h2, main h3, main p, main a.btn, footer p')) {
      let n = el, op = 1, vis = true;
      while (n && n !== document.body) {
        const cs = getComputedStyle(n);
        op *= parseFloat(cs.opacity);
        if (cs.visibility === 'hidden' || cs.display === 'none') vis = false;
        n = n.parentElement;
      }
      if (vis && op < 0.2 && el.textContent.trim()) hidden.push(el.textContent.trim().slice(0, 70));
    }
    const h1 = document.querySelector('h1');
    let sub = null;
    if (h1) {
      let n = h1.nextElementSibling;
      while (n && !(n.tagName === 'P' && n.textContent.trim())) n = n.nextElementSibling;
      if (!n) { const p = h1.closest('section,header,div')?.querySelector('p'); n = p; }
      sub = n ? n.textContent.trim().replace(/\s+/g, ' ') : null;
    }
    const eyebrow = h1 ? (h1.previousElementSibling && h1.previousElementSibling.textContent.trim().replace(/\s+/g, ' ')) : null;
    return {
      title: document.title,
      h1: h1 ? h1.textContent.trim().replace(/\s+/g, ' ') : null,
      eyebrow,
      sub,
      height: doc.scrollHeight,
      imgCount: imgs.length,
      brokenImgs,
      notLoadedHidden,
      overflowX,
      wide,
      hidden: hidden.slice(0, 15),
    };
  });
}

async function run() {
  const filter = process.argv[2] ? new RegExp(process.argv[2]) : null;
  const diag = fs.existsSync(DIAG) ? JSON.parse(fs.readFileSync(DIAG, 'utf8')) : {};
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--no-first-run', '--no-default-browser-check'] });
  try {
    for (const job of JOBS) {
      if (filter && !filter.test(job.name)) continue;
      const page = await browser.newPage();
      const log = { blocked: [], failed: [], console: [], pageErrors: [], shots: {} };
      await page.setViewport(VP[job.vp]);
      if (job.vp === 'mobile') await page.setUserAgent(MOBILE_UA);
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const u = req.url();
        if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) return req.continue();
        log.blocked.push(u.slice(0, 160));
        return req.abort('blockedbyclient');
      });
      page.on('response', (res) => { if (res.url().startsWith(BASE) && res.status() >= 400) log.failed.push(`${res.status()} ${res.url()}`); });
      page.on('requestfailed', (req) => { if (req.url().startsWith(BASE)) log.failed.push(`FAILED ${req.url()} ${req.failure()?.errorText}`); });
      page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.console.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
      page.on('pageerror', (e) => log.pageErrors.push(String(e).slice(0, 300)));

      await page.goto(BASE + job.path, { waitUntil: 'networkidle0', timeout: 45000 });
      await page.evaluate(() => document.fonts.ready);
      await slowScroll(page);
      log.info = await diagnostics(page);
      const hdr = await headerOffset(page);

      for (const s of job.shots) {
        const file = path.join(OUT, s.file);
        const jpg = s.file.endsWith('.jpg');
        const opts = jpg ? { type: 'jpeg', quality: 90 } : { type: 'png' };
        if (s.kind === 'full') {
          await scrollToY(page, 0);
          await page.screenshot({ ...opts, path: file, fullPage: true, captureBeyondViewport: true });
        } else if (s.kind === 'viewport') {
          await scrollToY(page, 0);
          await page.screenshot({ ...opts, path: file });
        } else if (s.kind === 'section' || s.kind === 'heading' || s.kind === 'textblock') {
          const y = await page.evaluate((shot, hdrH) => {
            let el = null;
            if (shot.sel) el = document.querySelector(shot.sel);
            else if (shot.kind === 'heading') el = [...document.querySelectorAll('h1,h2,h3')].find((h) => h.textContent.trim() === shot.text)?.closest('section,div');
            else {
              const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
              let t; while ((t = walker.nextNode())) { if (t.textContent.includes(shot.text)) { el = t.parentElement; break; } }
              if (el) el = el.closest('section, li, dl, div, p') || el;
            }
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const top = r.top + window.scrollY;
            if (shot.kind === 'textblock') {
              // centre the block in the viewport
              return Math.max(0, top - (window.innerHeight - Math.min(r.height, window.innerHeight)) / 2);
            }
            // full sections that are shorter than the viewport: centre them; taller: top under header
            if (r.height + hdrH < window.innerHeight) return Math.max(0, top - hdrH - (window.innerHeight - hdrH - r.height) / 2);
            return Math.max(0, top - hdrH);
          }, s, hdr);
          if (y === null) { log.shots[s.file] = 'TARGET NOT FOUND'; continue; }
          await scrollToY(page, y);
          await page.screenshot({ ...opts, path: file });
        } else if (s.kind === 'sectionAt') {
          const y = await page.evaluate((shot, hdrH) => {
            const el = document.querySelector(shot.sel);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const top = r.top + window.scrollY - hdrH;
            return Math.max(0, top + shot.frac * Math.max(0, r.height + hdrH - window.innerHeight));
          }, s, hdr);
          if (y === null) { log.shots[s.file] = 'TARGET NOT FOUND'; continue; }
          // approach from above so scroll-linked steps animate in order
          await page.evaluate((yy) => window.scrollTo(0, Math.max(0, yy - 600)), y);
          await sleep(400);
          await scrollToY(page, y);
          await page.screenshot({ ...opts, path: file });
        } else if (s.kind === 'bottom') {
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          await sleep(1200);
          await page.screenshot({ ...opts, path: file });
        } else if (s.kind === 'chat') {
          await scrollToY(page, 0);
          const clicked = await page.evaluate(() => {
            const b = [...document.querySelectorAll('a.btn-wa')].find((a) => a.getBoundingClientRect().width > 0 && !a.closest('[role=dialog]'));
            if (!b) return null;
            b.scrollIntoView({ block: 'center' });
            b.click();
            return b.textContent.trim();
          });
          await sleep(1500);
          if (!clicked) { log.shots[s.file] = 'NO WHATSAPP BUTTON'; continue; }
          log.chat = await page.evaluate(() => {
            const d = document.querySelector('[role=dialog]');
            if (!d) return { dialog: false };
            const go = d.querySelector('a.chat-go');
            return {
              dialog: true,
              text: d.innerText.replace(/\n+/g, ' | ').slice(0, 1500),
              waHref: go ? go.getAttribute('href') : null,
              calButton: !!d.querySelector('.chat-cal'),
            };
          });
          log.chat.clickedButton = clicked;
          await page.screenshot({ ...opts, path: file });
          await page.keyboard.press('Escape');
          await sleep(500);
        }
        log.shots[s.file] = fs.existsSync(file) ? fs.statSync(file).size : 'missing';
        console.log(job.name, s.file, log.shots[s.file]);
      }
      // collect CTA/booking markup facts once per page
      log.ctas = await page.evaluate(() => [...document.querySelectorAll('a.btn-wa, .desk-only, .mob-only, a[href*="wa.me"], a[href*="cal.com"], button')]
        .filter((e) => e.getBoundingClientRect().width > 0)
        .slice(0, 25)
        .map((e) => `${e.tagName.toLowerCase()}.${(e.className || '').toString().slice(0, 50)} "${e.textContent.trim().slice(0, 50)}" ${e.getAttribute('href') ? e.getAttribute('href').slice(0, 120) : ''}`));
      diag[job.name] = log;
      await page.close();
    }
  } finally {
    await browser.close();
    fs.writeFileSync(DIAG, JSON.stringify(diag, null, 2));
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
