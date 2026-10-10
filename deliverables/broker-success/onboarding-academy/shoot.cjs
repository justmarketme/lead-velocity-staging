// Screenshots of the real broker portal prototypes (fictional adviser renamed to "Sam, Example Financial Planning").
const { chromium } = require('/opt/node-tools/node_modules/playwright-core');
const out = process.argv[2];
const pages = [
  ['start', '/portal/prototype/start.html'], ['profile', '/portal/prototype/profile.html'], ['calendar', '/portal/prototype/calendar.html'],
  ['agreement', '/portal/prototype/agreement.html'], ['im-index', '/portal/intro-media/index.html?mock=1'],
  ['im-interview', '/portal/intro-media/interview.html?mock=1'], ['im-scripts', '/portal/intro-media/scripts.html?mock=1'],
  ['im-record', '/portal/intro-media/record.html?mock=1'], ['im-approve', '/portal/intro-media/approve.html?mock=1']];
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ['camera', 'microphone'] });
  const p = await ctx.newPage();
  await p.route(/^(?!http:\/\/localhost:8777).*/, r => r.abort());
  for (const [n, u] of pages) {
    try {
      await p.goto('http://localhost:8777' + u, { waitUntil: 'load', timeout: 15000 }); await p.waitForTimeout(1500);
      await p.evaluate(() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let t;
        const fix = v => v.replace(/Mark Williams Financial Planning/g, 'Example Financial Planning').replace(/Mark Williams/g, 'Sam Example').replace(/\bMark\b/g, 'Sam').replace(/mark@/g, 'sam@');
        while ((t = w.nextNode())) t.nodeValue = fix(t.nodeValue);
        document.querySelectorAll('input,textarea').forEach(el => { el.value = fix(el.value); el.placeholder && (el.placeholder = fix(el.placeholder)); });
        [...document.body.querySelectorAll('*')].filter(el => el.children.length < 3 && /Design-review mode/.test(el.textContent)).forEach(el => el.style.display = 'none'); });
      await p.screenshot({ path: `${out}/${n}.png` }); console.log('ok', n);
    } catch (e) { console.log('fail', n, e.message.slice(0, 80)); }
  }
  await b.close();
})();
