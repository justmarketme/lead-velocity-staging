// Mark's Lead Journey: build script.
// 1. Narration: one mp3 per beat (edge-tts, en-US-AndrewNeural, -5%). Only beats whose
//    text, voice or rate changed are regenerated (sha1 in audio/manifest.json).
// 2. Durations measured with ffprobe and stored in the page.
// 3. index.html = src/template.html + film data + inlined logos.
// Usage: node build.mjs            (audio + page)
//        node build.mjs --page     (page only, reuse manifest)
// Env:   PRACTICE="Oracle Brokers" sets the practice name (Gate C). Unset = visible placeholder.
//        LOGIN_BUTTON="Sign in"     login button label as deployed (Gate A).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const VOICE = 'en-US-AndrewNeural';
const RATE = '-5%';
const EDGE_TTS = process.env.EDGE_TTS || 'C:/Users/Jono/AppData/Local/Programs/Python/Python312/Scripts/edge-tts.exe';
const REPO = 'C:/Users/Jono/lead-velocity-sortmycover';
const PAGE_ONLY = process.argv.includes('--page');

const script = JSON.parse(fs.readFileSync(path.join(ROOT, 'script.json'), 'utf8'));
const audioDir = path.join(ROOT, 'audio');
const txtDir = path.join(ROOT, 'audio-src');
fs.mkdirSync(audioDir, { recursive: true });
fs.mkdirSync(txtDir, { recursive: true });
const manifestPath = path.join(audioDir, 'manifest.json');
let manifest = {};
try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch {}

const beats = [];
for (const c of script.chapters) for (const sc of c.scenes) for (const b of sc.beats) beats.push({ c, sc, b });

// edge-tts occasionally returns a near-empty clip; anything under ~0.22 s a word is retried
const minDur = (say) => say.trim().split(/\s+/).length * 0.22;
const hashOf = (say) => crypto.createHash('sha1').update(`${VOICE}|${RATE}|${say}`).digest('hex').slice(0, 16);

function duration(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' });
  return Math.round(parseFloat(out.trim()) * 1000) / 1000;
}

function tts(id, say) {
  const txt = path.join(txtDir, `${id}.txt`);
  const mp3 = path.join(audioDir, `${id}.mp3`);
  fs.writeFileSync(txt, say, 'utf8');
  return new Promise((resolve, reject) => {
    execFile(EDGE_TTS, ['--voice', VOICE, `--rate=${RATE}`, '--file', txt, '--write-media', mp3], { timeout: 90000 }, (err) => err ? reject(err) : resolve(mp3));
  });
}

async function audio() {
  const todo = beats.filter(({ b }) => {
    const m = manifest[b.id];
    return !m || m.hash !== hashOf(b.say) || m.dur < minDur(b.say) || !fs.existsSync(path.join(audioDir, `${b.id}.mp3`));
  });
  console.log(`audio: ${todo.length} of ${beats.length} clips to generate`);
  let i = 0;
  async function worker() {
    while (i < todo.length) {
      const { b } = todo[i++];
      for (let attempt = 1; ; attempt++) {
        try {
          const mp3 = await tts(b.id, b.say);
          const dur = duration(mp3);
          if (dur < minDur(b.say)) throw new Error(`clip too short (${dur}s)`);
          manifest[b.id] = { hash: hashOf(b.say), dur };
          fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
          console.log(`  ${b.id} ${manifest[b.id].dur}s`);
          break;
        } catch (e) {
          if (attempt >= 4) throw new Error(`${b.id}: ${e.message}`);
          await new Promise(r => setTimeout(r, 1500 * attempt));
        }
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  // drop clips for beats that no longer exist
  const ids = new Set(beats.map(({ b }) => b.id));
  for (const k of Object.keys(manifest)) if (!ids.has(k)) { delete manifest[k]; try { fs.unlinkSync(path.join(audioDir, `${k}.mp3`)); } catch {} }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
}

function page() {
  const tplPath = path.join(ROOT, 'src', 'template.html');
  if (!fs.existsSync(tplPath)) { console.log('page: src/template.html missing, skipped'); return; }
  const film = {
    chapters: script.chapters.map(c => ({ id: c.id, title: c.title })),
    beats: beats.map(({ c, sc, b }) => ({
      id: b.id, ch: c.id, sc: sc.id, scTitle: sc.title, screen: sc.screen,
      cap: b.caption,
      action: b.action,
      ia: b.interactive ? { type: b.interactive.type, prompt: b.interactive.prompt, options: b.interactive.options, branches: b.interactive.branches } : null,
      co: b.callout ? { q: b.callout.mark_asked, a: b.callout.answer, cl: b.callout.clause } : null,
      dur: manifest[b.id] ? manifest[b.id].dur : 4,
    })),
  };
  const lvPng = fs.readFileSync(path.join(REPO, 'src/assets/lead-velocity-logo-contract.png'));
  const lvLogo = `data:image/png;base64,${lvPng.toString('base64')}`;
  const wm = fs.readFileSync(path.join(REPO, 'brand/logo/wordmark-offwhite.svg'), 'utf8');
  // keep the drawn wordmark; recolour through currentColor so one copy serves light and dark grounds
  let svg = wm.slice(wm.indexOf('<svg'));
  svg = svg.replace(/<title>[^<]*<\/title>/, '')
    .replace(/ width="\d+" height="\d+"/, ' class="smc-wm" aria-hidden="true" focusable="false"')
    .replace(/fill="rgb\(251,248,242\)"/g, 'fill="currentColor"')
    .replace(/ role="img" aria-label="SortMyCover"/, '');
  const practice = process.env.PRACTICE || '';
  const practiceHtml = practice;
  const login = process.env.LOGIN_BUTTON || 'Sign in';
  let html = fs.readFileSync(tplPath, 'utf8');
  html = html
    .replace('__FILM_DATA__', JSON.stringify(film).replace(/</g, '\\u003c'))
    .replace('__PRACTICE__', JSON.stringify(practiceHtml))
    .replace('__LOGIN_BUTTON__', JSON.stringify(login))
    .split('__LV_LOGO__').join(lvLogo)
    .split('__SMC_WORDMARK__').join(svg);
  fs.writeFileSync(path.join(ROOT, 'index.html'), html, 'utf8');
  const total = film.beats.reduce((s, b) => s + b.dur, 0);
  console.log(`page: index.html ${(html.length / 1024).toFixed(1)} KB · ${film.beats.length} beats · ${total.toFixed(1)} s narration · practice ${practice ? `"${practice}"` : 'PLACEHOLDER (Gate C)'}`);
}

if (!PAGE_ONLY) await audio();
page();
