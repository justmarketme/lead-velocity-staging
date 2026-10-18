// Quick stills for chosen scenes at chosen times: node stills.mjs s01:3,10 s02:5,20
import puppeteer from 'puppeteer-core';
import path from 'node:path'; import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), SC = path.join(path.dirname(HERE), 'scenes'), OUT = path.join(HERE, 'stills');
fs.mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', headless: true, args: ['--allow-file-access-from-files', '--hide-scrollbars'] });
for (const spec of process.argv.slice(2)) {
  const [id, ts] = spec.split(':');
  const p = await b.newPage(); await p.setViewport({ width: 1920, height: 1080 });
  const errs = []; p.on('console', m => m.type() === 'error' && errs.push(m.text())); p.on('pageerror', e => errs.push(String(e)));
  await p.goto(pathToFileURL(path.join(SC, id + '.html')).href + '?render', { waitUntil: 'load' });
  await p.evaluate(() => window.READY);
  for (const t of (ts || '5').split(',').map(Number)) { await p.evaluate(x => window.seek(x), t); await p.screenshot({ path: path.join(OUT, `${id}-${t}.jpg`), type: 'jpeg', quality: 80 }); }
  if (errs.length) console.log(id, 'ERRORS:', errs.join(' | '));
  await p.close();
}
await b.close(); console.log('stills ->', OUT);
