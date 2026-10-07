/* End-to-end test of the built landing page with mocked n8n endpoints.
   Run:  node landing/build.mjs && node --test landing/tests/quiz.spec.ts
   (Node >= 22.18 strips types natively; uses the `playwright` library + node:test because @playwright/test is not installed here.
   If you have @playwright/test, the test bodies port 1:1 to test()/expect().) */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let pw: any;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const chromium = pw.chromium;
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const EXEC = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const API = 'https://REPLACE-N8N-HOST/webhook/smc';
const PAGE = (slug = 'employer-gap') => `${base}/${slug}/`;

let server: http.Server, base = '', browser: any;
const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff' };

before(async () => {
  server = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(dist, p);
    if (!f.startsWith(dist) || !fs.existsSync(f)) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  browser = await chromium.launch({ headless: true, executablePath: EXEC, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); server?.close(); });

const STUB = `window.SMC_PIXEL_ID='TEST123';window.__fbq=[];window.fbq=function(){window.__fbq.push([].slice.call(arguments))};`;
const slotsFor = (n: number) => {
  const out: { start: string }[] = [];
  for (let d = 0; d < n; d++) for (const t of ['09:30', '11:00', '14:00']) out.push({ start: `2026-10-${String(5 + d).padStart(2, '0')}T${t}:00+02:00` });
  return out;
};

async function newPage(opts: { js?: boolean } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: opts.js !== false, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const calls: { method: string; url: string; body: any; token?: string }[] = [];
  const beacons: any[] = []; /* I-32b: first-party visit beacons are kept apart from the lead-path calls */
  const state = { bookCount: 0, bookFirst409: true, bookSeq: [] as number[], methods: ['teams', 'phone'] as string[], slots: slotsFor(7) as any[] };
  await page.addInitScript(STUB);
  await page.route('**/connect.facebook.net/**', (r: any) => r.abort());
  await page.route(`${API}/**`, async (route: any) => {
    const req = route.request(); const u = new URL(req.url());
    if (u.pathname.endsWith('/beacon')) { let b: any = null; try { b = JSON.parse(req.postData() || ''); } catch { b = req.postData(); } beacons.push({ method: req.method(), body: b, ct: req.headers()['content-type'], cookie: req.headers()['cookie'] }); return route.fulfill({ status: 204 }); }
    let body: any = null; try { body = req.postDataJSON(); } catch { body = req.postData(); }
    calls.push({ method: req.method(), url: u.pathname + u.search, body, token: req.headers()['x-lead-token'] });
    const json = (status: number, o: any) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type,x-lead-token', 'access-control-allow-methods': 'GET,POST' } });
    if (u.pathname.endsWith('/lead')) return json(200, { ok: true, lead_id: 'ld_test1', lead_token: 'lt1.test', methods_supported: state.methods });
    if (u.pathname.endsWith('/slots')) return json(200, { slots: state.slots, tz: 'Africa/Johannesburg' });
    if (u.pathname.endsWith('/lead/skip')) return json(202, { ok: true });
    if (u.pathname.endsWith('/book')) {
      state.bookCount++;
      if (state.bookSeq.length) { const st = state.bookSeq.shift()!; if (st !== 200) return json(st, { error: st === 429 ? 'rate_limited' : 'try_again' }); return json(200, { booked: true, start: body.slot_start, method: body.method }); }
      if (state.bookFirst409 && state.bookCount === 1) return json(409, { error: 'slot_taken', slots: [{ start: '2026-10-12T09:30:00+02:00' }, { start: '2026-10-12T11:00:00+02:00' }, { start: '2026-10-13T09:30:00+02:00' }, { start: '2026-10-13T11:00:00+02:00' }] });
      return json(200, { booked: true, start: body.slot_start, method: body.method });
    }
    return json(404, {});
  });
  return { ctx, page, calls, state, beacons };
}
const tap = async (page: any, name: string, value: string) => { await page.locator(`input[name="${name}"][value="${value}"]`).click(); };
async function quiz(page: any, a: Record<string, string>) {
  await tap(page, 'age_band', a.age); await page.locator('.q.on[data-step="2"]').waitFor();
  await tap(page, 'bond', a.bond ?? 'yes'); await page.locator('.q.on[data-step="3"]').waitFor();
  await tap(page, 'dependants', a.deps ?? 'kids'); await page.locator('.q.on[data-step="4"]').waitFor();
  await tap(page, 'work_cover', a.work ?? 'yes'); await page.locator('.q.on[data-step="5"]').waitFor();
  await tap(page, 'budget_band', a.budget);
}
const fbq = (page: any) => page.evaluate(() => (window as any).__fbq.map((c: any[]) => ({ cmd: c[0], name: c[1], params: c[2], opt: c[3] })).filter((c: any) => c.cmd === 'track'));

test('every age x budget band: only 35-44/45-50 with R750+ qualify (3 bands, CP 1.4), others exit with no capture', async () => {
  const ages = ['lt35', '35_44', '45_50', '51plus'], budgets = ['lt750', '750_1499', '1500_plus'];
  const { ctx, page, calls } = await newPage();
  await page.goto(PAGE());
  for (const age of ages) for (const budget of budgets) {
    await page.reload();
    await quiz(page, { age, budget });
    const ok = (age === '35_44' || age === '45_50') && (budget === '750_1499' || budget === '1500_plus');
    await page.locator(`.q.on[data-step="${ok ? 6 : 9}"]`).waitFor({ timeout: 3000 });
    if (!ok) assert.match(await page.locator('.q.on').innerText(), /not the right fit right now/);
    else assert.match(await page.locator('#h6q').innerText(), /licensed adviser/i);
  }
  assert.equal(calls.length, 0, 'no API call may be made during the quiz or on the exit screen');
  await ctx.close();
});

test('qualified path: validation, consent, /lead payload, Teams booking with email, collision, Pixel calls', async () => {
  const { ctx, page, calls } = await newPage();
  await page.goto(PAGE('new-bond'));
  await quiz(page, { age: '45_50', bond: 'soon', deps: 'extended', work: 'unsure', budget: '1500_plus' });
  await page.locator('.q.on[data-step="6"]').waitFor();

  // consent is unticked by default and the label carries the named line + ads sentence
  assert.equal(await page.locator('#consent').isChecked(), false);
  const consentText = await page.locator('#consentText').innerText();
  assert.match(consentText, /I agree that SortMyCover may share my details with \[PRACTICE NAME\] \(FSP \[FSP NUMBER\]\), an authorised financial services provider/);
  assert.match(consentText, /We also use your details in coded \(hashed\) form to measure and improve our ads on Facebook and Instagram\./);

  // empty submit -> errors, nothing sent
  await page.click('#send');
  assert.equal(await page.locator('#fName.bad').count(), 1);
  assert.equal(await page.locator('#fPhone.bad').count(), 1);
  assert.equal(await page.locator('#fConsent.bad').count(), 1);
  // live mobile validation
  await page.fill('#name', 'Thabo');
  await page.fill('#phone', '12345');
  await page.locator('#phone').blur();
  assert.equal(await page.locator('#fPhone.bad').count(), 1);
  await page.fill('#phone', '082 123 4567');
  assert.equal(await page.locator('#fPhone.good').count(), 1);
  assert.match(await page.locator('#oPhone').innerText(), /\+27 82 123 4567/);
  assert.equal(await page.locator('#phone').getAttribute('inputmode'), 'tel');
  assert.equal(calls.length, 0);

  await page.check('#consent');
  await page.click('#send');
  await page.locator('.q.on[data-step="7"]').waitFor();
  const lead = calls.find((c) => c.url.endsWith('/lead'))!;
  assert.deepEqual(
    Object.keys(lead.body).sort(),
    ['age_band', 'angle', 'bond', 'budget_band', 'company_website', 'consent', 'consent_mode', 'consent_text', 'consent_version', 'context', 'dependants', 'first_name', 'lang', 'mobile', 'page_url', 'request_id', 'started_at', 'turnstile_token', 'work_cover'].sort());
  assert.match(lead.body.request_id, /^[0-9a-f-]{36}$/); assert.ok(!isNaN(Date.parse(lead.body.started_at)));
  assert.equal(lead.body.mobile, '+27821234567');
  assert.equal(lead.body.consent, true);
  assert.equal(lead.body.consent_mode, 'named');
  assert.equal(lead.body.consent_version, 'CONSENT-NAMED-v1+CONSENT-ADS-v1');
  assert.equal(lead.body.angle, 'new-bond');
  assert.equal(lead.body.company_website, '');
  assert.deepEqual([lead.body.age_band, lead.body.bond, lead.body.dependants, lead.body.work_cover, lead.body.budget_band], ['45_50', 'soon', 'extended', 'unsure', '1500_plus']);
  assert.match(lead.body.consent_text, /^I agree that SortMyCover may share my details with/);
  assert.equal(lead.body.context.event_name, 'Lead');
  assert.ok(lead.body.context.event_id);
  assert.ok(!Object.keys(lead.body.context).some((k) => /^(fn|ln|em|ph|first_?name|phone|mobile|email)$/i.test(k)), 'context carries no PII keys');

  // slots: GET /slots with X-Lead-Token and no broker/lead_id params, 7 days offered -> only 5 shown, grouped
  await page.locator('.slot').first().waitFor();
  const slotCall = calls.find((c) => c.url.includes('/slots'))!;
  assert.equal(slotCall.token, 'lt1.test'); assert.doesNotMatch(slotCall.url, /broker=|lead_id=/);
  assert.ok(calls.filter((c) => c.url.endsWith('/book')).length === 0 || calls.filter((c) => c.url.endsWith('/book')).every((c) => c.token === 'lt1.test'));
  assert.equal(await page.locator('h4.day').count(), 5);
  // only the routed broker's methods; Teams first -> email shown
  assert.deepEqual(await page.locator('.method').allInnerTexts(), ['Video (Teams)', 'Phone']);
  assert.equal(await page.locator('#fEmail').isVisible(), true);
  // phone hides email
  await page.click('.method[data-m="phone"]');
  assert.equal(await page.locator('#fEmail').isVisible(), false);
  await page.click('.method[data-m="teams"]');

  // must pick a time first
  await page.click('#book');
  assert.match(await page.locator('#bookErr').innerText(), /pick a time/i);
  await page.locator('.slot').nth(1).click();
  // bad email, then typo suggestion
  await page.fill('#email', 'nope');
  await page.click('#book');
  assert.equal(await page.locator('#fEmail.bad').count(), 1);
  await page.fill('#email', 'thabo@gmial.com');
  await page.locator('#email').blur();
  assert.match(await page.locator('#emailFix').innerText(), /thabo@gmail\.com/);
  await page.click('#emailFix');
  assert.equal(await page.inputValue('#email'), 'thabo@gmail.com');

  // first /book collides -> next 3 shown
  await page.click('#book');
  await page.locator('#slotStatus.warn').waitFor();
  assert.match(await page.locator('#slotStatus').innerText(), /just taken/);
  assert.equal(await page.locator('.slot').count(), 3);
  await page.locator('.slot').first().click();
  await page.click('#book');
  await page.locator('.q.on[data-step="8"]').waitFor();
  assert.match(await page.locator('#doneH').innerText(), /^Booked\. Check your WhatsApp, Thabo\./);
  assert.match(await page.locator('#summary').innerText(), /Mon 12 Oct, 09:30/);
  assert.match(await page.locator('#summary').innerText(), /Video \(Teams\)/);
  assert.equal(await page.locator('#cal').isVisible(), true);
  assert.match((await page.locator('#cal').getAttribute('href'))!, /^blob:/);

  const books = calls.filter((c) => c.url.endsWith('/book'));
  assert.equal(books.length, 2);
  const b = books[1].body;
  assert.deepEqual(Object.keys(b).sort(), ['angle', 'context', 'email', 'lead_id', 'method', 'request_id', 'slot_start', 'started_at', 'turnstile_token'].sort());
  assert.match(b.request_id, /^[0-9a-f-]{36}$/); assert.equal(b.request_id !== lead.body.request_id, true); assert.equal(b.started_at, lead.body.started_at); assert.equal(b.turnstile_token, '', 'stubbed Turnstile (empty site key) sends an empty token');
  assert.notEqual(books[0].body.request_id, b.request_id, 'new request_id after a 409');
  assert.equal(b.lead_id, 'ld_test1'); assert.equal(b.method, 'teams');
  assert.equal(b.email, 'thabo@gmail.com'); assert.equal(b.slot_start, '2026-10-12T09:30:00+02:00');
  assert.equal(b.context.event_name, 'Schedule');
  assert.notEqual(b.context.event_id, lead.body.context.event_id, 'Schedule never reuses the Lead event_id');

  // Pixel: PageView, ViewContent once, Lead (same event_id as posted), Schedule (same as /book)
  const ev = await fbq(page);
  assert.deepEqual(ev.map((e: any) => e.name), ['PageView', 'ViewContent', 'Lead', 'Schedule']);
  assert.equal(ev[1].params.content_name, 'quiz_start');
  assert.equal(ev[2].opt.eventID, lead.body.context.event_id);
  assert.equal(ev[2].params.content_name, 'new-bond');
  assert.equal(ev[3].opt.eventID, b.context.event_id);
  assert.ok(!JSON.stringify(ev).match(/Thabo|8212|gmail/), 'no PII reaches the Pixel');
  await ctx.close();
});

async function toBook(slug: string, seq: number[]) {
  const t = await newPage(); t.state.bookFirst409 = false; t.state.bookSeq = seq;
  await t.page.goto(PAGE(slug));
  await quiz(t.page, { age: '35_44', budget: '750_1499' });
  await t.page.fill('#name', 'Lerato'); await t.page.fill('#phone', '+27 71 234 5678'); await t.page.check('#consent'); await t.page.click('#send');
  await t.page.locator('.slot').first().waitFor();
  await t.page.click('.method[data-m="phone"]'); await t.page.locator('.slot').first().click();
  return t;
}

test('I-56d: /book 400 try_again re-runs the widget once, then books', async () => {
  const { ctx, page, calls } = await toBook('virtual', [400, 200]);
  await page.click('#book'); await page.locator('.q.on[data-step="8"]').waitFor();
  const books = calls.filter((c) => c.url.endsWith('/book'));
  assert.equal(books.length, 2); assert.ok('turnstile_token' in books[1].body);
  await ctx.close();
});

test('I-56d: 400 twice, 429 and 503 show the friendly retry, no thank-you', async () => {
  for (const [seq, n] of [[[400, 400], 2], [[429], 1], [[503], 1]] as [number[], number][]) {
    const { ctx, page, calls } = await toBook('virtual', seq);
    await page.click('#book'); await page.locator('#bookErr:not([hidden])').waitFor();
    assert.equal(calls.filter((c) => c.url.endsWith('/book')).length, n);
    assert.equal(await page.locator('.q.on[data-step="8"]').count(), 0);
    await ctx.close();
  }
});

test('phone method: no email asked, email absent from /book', async () => {
  const { ctx, page, calls } = await newPage();
  await page.goto(PAGE('virtual'));
  await quiz(page, { age: '35_44', budget: '750_1499' });
  await page.fill('#name', 'Lerato'); await page.fill('#phone', '+27 71 234 5678'); await page.check('#consent'); await page.click('#send');
  await page.locator('.slot').first().waitFor();
  await page.click('.method[data-m="phone"]');
  assert.equal(await page.locator('#fEmail').isVisible(), false);
  await page.locator('.slot').first().click();
  // first /book is a 409 in the mock; second succeeds
  await page.click('#book'); await page.locator('#slotStatus.warn').waitFor();
  await page.locator('.slot').first().click(); await page.click('#book');
  await page.locator('.q.on[data-step="8"]').waitFor();
  const b = calls.filter((c) => c.url.endsWith('/book')).pop()!.body;
  assert.equal(b.method, 'phone'); assert.ok(!('email' in b));
  await ctx.close();
});

test('skip link keeps the lead: not-booked thank-you, Lead fired, no Schedule, no /book', async () => {
  const { ctx, page, calls } = await newPage();
  await page.goto(PAGE('turned-40'));
  await quiz(page, { age: '45_50', budget: '1500_plus', work: 'no' });
  await page.fill('#name', 'Sipho'); await page.fill('#phone', '0831234567'); await page.check('#consent'); await page.click('#send');
  await page.locator('#skipBook').click();
  await page.locator('.q.on[data-step="8"]').waitFor();
  assert.match(await page.locator('#doneH').innerText(), /^Thanks, Sipho\. Check your WhatsApp\./);
  assert.match(await page.locator('#doneP').innerText(), /adviser’s details and a few times/);
  assert.equal(await page.locator('#cal').isVisible(), false);
  assert.equal(calls.filter((c) => c.url.endsWith('/book')).length, 0);
  // I-45o: the skip tells W01 (POST /lead/skip with the lead token) so the slots card goes to WhatsApp now
  const skips = calls.filter((c) => c.method === 'POST' && c.url.endsWith('/lead/skip'));
  assert.equal(skips.length, 1); assert.equal(skips[0].token, 'lt1.test'); assert.equal(skips[0].body.lead_id, 'ld_test1');
  assert.deepEqual((await fbq(page)).map((e: any) => e.name), ['PageView', 'ViewContent', 'Lead']);
  await ctx.close();
});

test('slots failure falls back to the not-booked thank-you (lead is kept)', async () => {
  const { ctx, page, state } = await newPage();
  state.slots = [];
  await page.goto(PAGE());
  await quiz(page, { age: '35_44', budget: '1500_plus' });
  await page.fill('#name', 'Ayesha'); await page.fill('#phone', '0721112233'); await page.check('#consent'); await page.click('#send');
  await page.locator('.q.on[data-step="8"]').waitFor({ timeout: 6000 });
  assert.match(await page.locator('#doneH').innerText(), /^Thanks, Ayesha/);
  await ctx.close();
});

test('honeypot filled: nothing is sent', async () => {
  const { ctx, page, calls } = await newPage();
  await page.goto(PAGE());
  await quiz(page, { age: '35_44', budget: '1500_plus' });
  await page.fill('#name', 'Bot'); await page.fill('#phone', '0721112233'); await page.check('#consent');
  await page.evaluate(() => { (document.querySelector('input[name=company_website]') as HTMLInputElement).value = 'spam'; });
  await page.click('#send');
  await page.locator('.q.on[data-step="8"]').waitFor();
  assert.equal(calls.length, 0);
  await ctx.close();
});

test('keyboard: arrow-key selection does not auto-advance; Next appears', async () => {
  const { ctx, page } = await newPage();
  await page.goto(PAGE());
  await page.locator('input[name="age_band"][value="lt35"]').focus();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.q.on').getAttribute('data-step'), '1');
  await page.locator('.q.on .js-next').waitFor({ state: 'visible' });
  await page.locator('.q.on .js-next').click();
  assert.equal(await page.locator('.q.on').getAttribute('data-step'), '2');
  await page.locator('.q.on [data-back]').click();
  assert.equal(await page.locator('.q.on').getAttribute('data-step'), '1');
  await ctx.close();
});

test('no-JS: capture step is a real POST form with every field named', async () => {
  const { ctx, page } = await newPage({ js: false });
  let posted: string | null = null;
  await page.route(`${API}/lead`, (r: any) => { posted = r.request().postData(); return r.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }); });
  await page.goto(PAGE());
  const form = page.locator('form#lead');
  assert.equal((await form.getAttribute('method')).toLowerCase(), 'post');
  assert.equal(await form.getAttribute('action'), `${API}/lead`);
  await page.locator('input[name=age_band][value="35_44"]').check();
  await page.locator('input[name=bond][value=yes]').check();
  await page.locator('input[name=dependants][value=kids]').check();
  await page.locator('input[name=work_cover][value=yes]').check();
  await page.locator('input[name=budget_band][value="750_1499"]').check();
  await page.fill('#name', 'Naledi'); await page.fill('#phone', '082 123 4567'); await page.check('#consent');
  await page.click('#send');
  await page.waitForTimeout(500);
  assert.ok(posted, 'form posted without JS');
  const p = new URLSearchParams(posted!);
  for (const k of ['first_name', 'mobile', 'consent', 'consent_text', 'consent_version', 'consent_mode', 'angle', 'lang', 'age_band', 'bond', 'dependants', 'work_cover', 'budget_band', 'company_website']) assert.ok(p.has(k), 'missing field ' + k);
  assert.equal(p.get('consent'), 'yes');
  await ctx.close();
});

test('layout rules: no horizontal scroll, 44px targets, no third-party requests, one CTA wording, no nav, no phone number', async () => {
  const { ctx, page } = await newPage();
  const reqs: string[] = [];
  page.on('request', (r: any) => { const u = new URL(r.url()); if (!u.hostname.match(/^(127\.0\.0\.1|REPLACE-N8N-HOST|sortmycover\.co\.za)$/i)) reqs.push(u.hostname); });
  await page.goto(PAGE());
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  const small = await page.evaluate(() => Array.from(document.querySelectorAll('.opt,.btn,.slot,.method,.link,input:not([type=hidden]):not([type=radio]),summary,footer a')).filter((e: any) => e.offsetParent !== null && !e.closest('.hp')).map((e: any) => { const r = e.getBoundingClientRect(); return { cls: e.className || e.tagName, w: r.width, h: r.height }; }).filter((r) => r.h < 44 || r.w < 44));
  assert.deepEqual(small, []);
  assert.deepEqual(reqs.filter((h) => !/facebook/.test(h)), [], 'only the Pixel may call third parties');
  const ctas = await page.locator('a.btn[href="#quiz"]').allInnerTexts();
  assert.ok(ctas.every((t: string) => /^Check my cover in 60 seconds/.test(t.trim())));
  assert.equal(await page.locator('nav:not(footer nav)').count(), 0, 'no nav above the footer');
  assert.equal(await page.locator('a[href^="tel:"]').count(), 0, 'no phone number');
  await ctx.close();
});

/* ---------- I-32b: first-party visit beacon ---------- */
test('I-32b beacon: view on load, step 1 on first tap, then steps reached; payload is anonymous and cookie-less', async () => {
  const { ctx, page, beacons, calls } = await newPage();
  await page.goto(PAGE('new-bond'));
  await page.waitForTimeout(150);
  assert.equal(beacons.length, 1);
  assert.deepEqual(Object.keys(beacons[0].body).sort(), ['a', 'e', 'sid', 'v']);
  assert.equal(beacons[0].body.v, 1); assert.equal(beacons[0].body.a, 'new-bond'); assert.equal(beacons[0].body.e, 'view');
  assert.match(beacons[0].body.sid, /^[A-Za-z0-9-]{8,64}$/);
  assert.match(beacons[0].ct, /^text\/plain/); /* simple request: no CORS preflight */
  assert.ok(!beacons[0].cookie, 'no cookie sent');
  await tap(page, 'age_band', '35_44'); await page.locator('.q.on[data-step="2"]').waitFor();
  await tap(page, 'bond', 'yes'); await page.locator('.q.on[data-step="3"]').waitFor();
  await page.waitForTimeout(150);
  const steps = beacons.filter((b) => b.body.e === 'step').map((b) => b.body.s);
  assert.deepEqual(steps, [1, 2, 3]);
  assert.equal(new Set(beacons.map((b) => b.body.sid)).size, 1, 'one anonymous session id');
  const raw = JSON.stringify(beacons.map((b) => b.body));
  assert.doesNotMatch(raw, /35_44|"yes"|name|phone|email|mobile/i, 'no answers or contact data');
  assert.equal(calls.length, 0, 'the beacon is not a lead-path call');
  const store = await page.evaluate(() => ({ s: Object.keys(sessionStorage), l: Object.keys(localStorage), c: document.cookie }));
  assert.ok(store.s.includes('smc_sid')); assert.ok(!store.l.includes('smc_sid')); assert.equal(store.c, '');
  /* going back does not count a step twice */
  await page.locator('.q.on [data-back]').click(); await page.locator('.q.on[data-step="2"]').waitFor();
  await tap(page, 'bond', 'yes'); await page.locator('.q.on[data-step="3"]').waitFor(); await page.waitForTimeout(100);
  assert.equal(beacons.filter((b) => b.body.e === 'step' && b.body.s === 3).length, 1);
  await ctx.close();
});

test('I-32b beacon: Do Not Track, Global Privacy Control and the smc_ads_off opt-out send nothing', async () => {
  for (const mode of ['dnt', 'gpc', 'optout']) {
    const { ctx, page, beacons } = await newPage();
    if (mode === 'dnt') await page.addInitScript(() => Object.defineProperty(navigator, 'doNotTrack', { get: () => '1' }));
    if (mode === 'gpc') await page.addInitScript(() => Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true }));
    if (mode === 'optout') await page.addInitScript(() => localStorage.setItem('smc_ads_off', '1'));
    await page.goto(PAGE());
    await tap(page, 'age_band', '35_44'); await page.locator('.q.on[data-step="2"]').waitFor();
    await page.waitForTimeout(200);
    assert.equal(beacons.length, 0, `${mode}: no beacon`);
    await ctx.close();
  }
});
