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
        const buffer = fs.readFileSync(filePath);
        // PNG Width is at 16-20, Height at 20-24
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        console.log(`${file}: ${width}x${height}`);
    } else {
        console.log(`${file}: Not found`);
    }
});
