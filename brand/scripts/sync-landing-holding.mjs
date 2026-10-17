// Copies the finished favicon set + OG image into landing/holding/ (the holding site root).
import fs from 'fs'; import path from 'path'; import { root } from './lib.mjs';
const dest = path.resolve(root, '..', 'landing/holding');
const pick = ['favicon.svg', 'favicon.ico', 'favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'mask-icon.svg', 'mstile-150x150.png', 'browserconfig.xml'];
for (const f of pick) fs.copyFileSync(path.join(root, 'favicon', f), path.join(dest, f));
fs.copyFileSync(path.join(root, 'exports/og/og-image-1200x630.png'), path.join(dest, 'og-image.png'));
console.log('synced to', dest);
