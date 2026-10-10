// Test-arm logos (cycle-1 C01 colour test, 4D.4a): same shapes, amber -> teal, tick ink -> cream. Values from tokens.json "experiment".
import fs from 'fs'; import path from 'path'; import { root, T } from './lib.mjs';
const a = T.color.amber.rgb.join(','), ink = T.color.accentText.rgb.join(','), t = T.experiment.tealOnCream, teal = t.teal.rgb.join(','), cream = t.tealInk.rgb.join(',');
for (const [src, dst] of [['tick-mark', 'tick-mark-teal'], ['wordmark-charcoal', 'wordmark-charcoal-teal-tick']]) {
  let s = fs.readFileSync(path.join(root, 'logo', src + '.svg'), 'utf8'); s = s.replaceAll(`rgb(${a})`, `rgb(${teal})`).replaceAll(`rgb(${ink})`, `rgb(${cream})`).replace(/<!-- (\S+) \|/, `<!-- ${dst} | TEST ARM ONLY (C01 colour test) |`);
  fs.writeFileSync(path.join(root, 'logo', dst + '.svg'), s); console.log(dst + '.svg'); }
