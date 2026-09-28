// Optional batch exporter. Requires Node.js + the Playwright package and Chromium/Edge.
// For manual export without tools, double-click index.html and use each clip's export button.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.DINO_BROWSER_PATH ? { executablePath: process.env.DINO_BROWSER_PATH } : {}) });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.join(__dirname, 'index.html')).href);
    const catalog = await page.evaluate(() => window.DinoAudio.clips);
    const requested = process.argv.slice(2);
    for (const id of requested) if (!catalog.some((clip) => clip.id === id)) throw new Error('Unknown audio clip: ' + id);
    const clips = requested.length ? catalog.filter((clip) => requested.includes(clip.id)) : catalog;
    for (const clip of clips) {
      const base64 = await page.evaluate(async (id) => {
        const bytes = await window.DinoAudio.renderWav(id);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return btoa(binary);
      }, clip.id);
      const data = Buffer.from(base64, 'base64');
      fs.writeFileSync(path.join(__dirname, clip.id + '.wav'), data);
      let sum = 0, peak = 0;
      for (let offset = 44; offset < data.length; offset += 2) {
        const sample = data.readInt16LE(offset) / 32768; sum += sample * sample; peak = Math.max(peak, Math.abs(sample));
      }
      if (!peak || peak >= 1) throw new Error('Silent or clipped render: ' + clip.id);
      console.log(`${clip.id}.wav | ${clip.seconds}s | peak ${peak.toFixed(3)} | RMS ${Math.sqrt(sum / ((data.length - 44) / 2)).toFixed(4)}`);
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
