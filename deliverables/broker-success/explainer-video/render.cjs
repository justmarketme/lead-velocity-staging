// Renders stage.html scene by scene to JPEG frames (25 fps), then ffmpeg joins frames + voice-over.
// usage: node render.cjs <vo_dir> <out_dir> [sceneId ...] [--preview t]
const { chromium } = require('/opt/node-tools/node_modules/playwright-core');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const FPS = 25;
(async () => {
  const [vo, out, ...rest] = process.argv.slice(2);
  const timings = JSON.parse(fs.readFileSync(path.join(vo, 'timings.json')));
  const pi = rest.indexOf('--preview'); const preview = pi >= 0 ? parseFloat(rest[pi + 1]) : null;
  const only = rest.filter((x, i) => !x.startsWith('--') && (pi < 0 || i !== pi + 1));
  const todo = timings.filter(s => !only.length || only.includes(s.id));
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const work = async sc => {
    const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
    await p.goto('file://' + path.join(__dirname, 'stage.html'));
    await p.evaluate(() => document.fonts.ready);
    await p.evaluate(([id, t]) => window.show(id, t), [sc.id, sc]);
    if (preview != null) { await p.evaluate(t => window.seek(t), preview); await p.screenshot({ path: path.join(out, `${sc.id}-preview.png`) }); await p.close(); return; }
    const dir = path.join(out, sc.id); fs.mkdirSync(dir, { recursive: true });
    const n = Math.round(sc.dur * FPS);
    for (let i = 0; i < n; i++) {
      await p.evaluate(t => window.seek(t), i / FPS);
      await p.screenshot({ path: path.join(dir, String(i).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 88 });
    }
    await p.close();
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(dir, '%05d.jpg'), '-i', path.join(vo, sc.id + '.wav'),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-shortest', path.join(out, sc.id + '.mp4')]);
    fs.rmSync(dir, { recursive: true, force: true });
    console.log('done', sc.id);
  };
  const q = [...todo]; await Promise.all(Array.from({ length: 4 }, async () => { while (q.length) await work(q.shift()); }));
  await b.close();
})();
