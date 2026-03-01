import sharp from 'sharp';
import { readdirSync, unlinkSync } from 'fs';
import { join, extname, basename } from 'path';

const ASSETS_DIR = new URL('../src/assets', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

const files = readdirSync(ASSETS_DIR);
const images = files.filter(f => /\.(png|jpe?g)$/i.test(f));

console.log(`Converting ${images.length} images to WebP...\n`);

let totalSavedBytes = 0;

for (const file of images) {
    const inputPath = join(ASSETS_DIR, file);
    const outputName = basename(file, extname(file)) + '.webp';
    const outputPath = join(ASSETS_DIR, outputName);

    const inputStat = (await import('fs')).statSync(inputPath);

    await sharp(inputPath)
        .webp({ quality: 85, effort: 6 })
        .toFile(outputPath);

    const outputStat = (await import('fs')).statSync(outputPath);
    const saved = inputStat.size - outputStat.size;
    totalSavedBytes += saved;

    console.log(
        `✓ ${file.padEnd(40)} ${(inputStat.size / 1024).toFixed(0).padStart(6)} KB → ${(outputStat.size / 1024).toFixed(0).padStart(6)} KB  (saved ${(saved / 1024).toFixed(0)} KB)`
    );

    // Remove original after successful conversion
    unlinkSync(inputPath);
}

console.log(`\n✅ Done! Total saved: ${(totalSavedBytes / 1024 / 1024).toFixed(1)} MB`);
