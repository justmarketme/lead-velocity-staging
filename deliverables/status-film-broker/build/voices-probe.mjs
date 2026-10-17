import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true,
  args: ['--no-first-run'] });
const p = await b.newPage();
await p.goto('about:blank');
const r = await p.evaluate(async () => {
  const get = () => speechSynthesis.getVoices();
  let v = get(); if (!v.length) await new Promise(r => { speechSynthesis.onvoiceschanged = r; setTimeout(r, 4000); }); v = get();
  return v.map(x => x.name + ' | ' + x.lang + ' | local=' + x.localService);
});
console.log(r.length, r.filter(x => /Andrew|Natural|Online/.test(x)).slice(0, 15).join('\n'));
await b.close();
