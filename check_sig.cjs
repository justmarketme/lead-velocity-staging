const fs = require('fs');
const path = require('path');

const assetsDir = 'c:/Users/Jono/.gemini/antigravity/playground/velocity-neon-web-main/src/assets';
const files = [
    'einstein-genius-neon.png',
    'einstein-pointing.png',
    'einstein-retention.png',
    'einstein-calls.png',
    'einstein-cta.png',
    'einstein-wave.png'
];

files.forEach(file => {
    const filePath = path.join(assetsDir, file);
    if (fs.existsSync(filePath)) {
        const buffer = fs.readFileSync(filePath, { length: 32 });
        console.log(`${file} first 16 bytes: ${buffer.slice(0, 16).toString('hex')}`);
    } else {
        console.log(`${file}: Not found`);
    }
});
