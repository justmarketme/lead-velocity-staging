const fs = require('fs');
const path = require('path');

function getJpegDimensions(buffer) {
    let offset = 2; // Skip SOI (FF D8)
    while (offset < buffer.length) {
        if (buffer[offset] !== 0xFF) return null;
        let marker = buffer[offset + 1];
        if (marker === 0xC0 || marker === 0xC2) { // SOF0 or SOF2
            const height = buffer.readUInt16BE(offset + 5);
            const width = buffer.readUInt16BE(offset + 7);
            return { width, height };
        }
        offset += 2 + buffer.readUInt16BE(offset + 2);
    }
    return null;
}

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
        const dims = getJpegDimensions(buffer);
        if (dims) {
            console.log(`${file}: ${dims.width}x${dims.height}`);
        } else {
            console.log(`${file}: Dimensions not found`);
        }
    } else {
        console.log(`${file}: Not found`);
    }
});
