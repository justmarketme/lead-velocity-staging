// Instagram highlight covers: 4 icons, 1080x1920 + a 1080x1080 centre crop each. Run: node scripts/build-highlights.mjs
import fs from 'fs'; import path from 'path'; import { execFileSync } from 'child_process';
import { launch, root, shot, fileUrl, pngSize } from './lib.mjs';
const out = path.join(root, 'exports/instagram-highlights'); fs.mkdirSync(out, { recursive: true });
const set = [['how', 'how-it-works'], ['expect', 'what-to-expect'], ['faq', 'faq'], ['advisers', 'advisers']];
const b = await launch();
for (const [k, n] of set) { const f = path.join(out, `highlight-${n}-1080x1920.png`); await shot(b, { url: fileUrl('templates/highlight-cover.html'), data: { k }, w: 1080, h: 1920, out: f });
  const sq = path.join(out, `highlight-${n}-1080x1080.png`); execFileSync('convert', [f, '-gravity', 'center', '-crop', '1080x1080+0+0', '+repage', sq]);
  for (const x of [f, sq]) execFileSync('convert', [x, '-dither', 'None', '-colors', '16', '-strip', 'PNG8:' + x]); console.log(n, pngSize(f).bytes, pngSize(sq).bytes); }
await b.close();
