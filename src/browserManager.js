const { chromium } = require('playwright');

let browser;
let page;

async function startBrowser() {
    if (!browser) {
        console.log('[browserManager] Launching browser...');
        browser = await chromium.launch({ headless: true });
        page = await browser.newPage();
        console.log('[browserManager] Browser launched.');
    }
}

async function navigateToPage(url) {
    console.log('[browserManager] Navigating to:', url);
    await page.goto(url);
}

async function closeBrowser() {
    if (browser) {
        await browser.close();
        console.log('[browserManager] Browser closed.');
    }
}

async function getPage() {
    if (!page) {
        await startBrowser();
    }
    return page;
}

module.exports = { startBrowser, closeBrowser, getPage, navigateToPage };