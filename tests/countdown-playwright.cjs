// Browser check for the visible P-key resume countdown.
// Use PLAYWRIGHT_MODULE and PLAYWRIGHT_CHROME if they are not on the default path.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html', '.js': 'application/javascript',
  '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    const body = fs.readFileSync(file);
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    response.end(body);
  } catch { response.writeHead(404).end(); }
});

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true,
      ...(process.env.PLAYWRIGHT_CHROME ? { executablePath: process.env.PLAYWRIGHT_CHROME } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.locator('#start-button').click();
    await page.keyboard.press('p');
    await page.waitForFunction(() => document.querySelector('#status-text')?.textContent === '已暂停');
    const distance = await page.locator('#distance').textContent();
    await page.keyboard.press('p');
    const countdown = page.locator('#resume-countdown');
    await countdown.waitFor({ state: 'visible' });
    assert.equal(await page.locator('#resume-countdown-number').textContent(), '3');
    const canvas = await page.locator('.canvas-wrap').boundingBox();
    const number = await page.locator('#resume-countdown-number').boundingBox();
    assert.ok(canvas && number);
    assert.ok(Math.abs(number.x + number.width / 2 - canvas.x - canvas.width / 2) < 2);
    assert.ok(Math.abs(number.y + number.height / 2 - canvas.y - canvas.height / 2) < 2);
    await page.waitForTimeout(1100);
    assert.equal(await page.locator('#distance').textContent(), distance);
    assert.equal(await page.locator('#resume-countdown-number').textContent(), '2');
    await page.waitForTimeout(1000);
    assert.equal(await page.locator('#distance').textContent(), distance);
    assert.equal(await page.locator('#resume-countdown-number').textContent(), '1');
    await countdown.waitFor({ state: 'hidden', timeout: 3000 });
    await page.waitForFunction((before) => document.querySelector('#distance')?.textContent !== before,
      distance, { timeout: 3000 });
    assert.deepEqual(pageErrors, []);
    console.log('P countdown: centered 3 → 2 → 1; distance frozen until resume');
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
