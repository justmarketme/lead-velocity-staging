import puppeteer from 'puppeteer';
import fs from 'fs';

(async () => {
    try {
        const browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            dumpio: true
        });
        const page = await browser.newPage();

        // Set viewport to desktop size
        await page.setViewport({ width: 1440, height: 900 });

        console.log('Navigating to onboarding page...');
        await page.goto('https://www.leadvelocity.co.za/onboarding', {
            waitUntil: 'networkidle0'
        });

        console.log('Page loaded. Capturing content...');

        // 1. Screenshot
        await page.screenshot({ path: 'reference_onboarding.png', fullPage: true });
        console.log('Saved screenshot to reference_onboarding.png');

        // 2. Full HTML
        const html = await page.content();
        fs.writeFileSync('reference_onboarding.html', html);
        console.log('Saved HTML to reference_onboarding.html');

        // 3. Extract Text Structure for easier analysis
        const textStructure = await page.evaluate(() => {
            const structuralElements = [];
            const selector = 'h1, h2, h3, h4, p, li, button, input, label, select';
            document.querySelectorAll(selector).forEach(el => {
                if (el.innerText.trim()) {
                    structuralElements.push({
                        tag: el.tagName.toLowerCase(),
                        text: el.innerText.trim(),
                        classes: el.className
                    });
                }
            });
            return JSON.stringify(structuralElements, null, 2);
        });
        fs.writeFileSync('reference_structure.json', textStructure);
        console.log('Saved text structure to reference_structure.json');

        await browser.close();
        console.log('Analysis complete!');
    } catch (error) {
        console.error('Error analyzing page:', error);
        process.exit(1);
    }
})();
