// Real-browser physics check. Run with PLAYWRIGHT_MODULE and PLAYWRIGHT_CHROME
// set when Playwright or Chromium is not installed in their usual locations.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const startup = '  initializeGame();';
const originalGame = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
assert.ok(originalGame.includes(startup), 'game startup marker changed');
const instrumentedGame = originalGame.replace(startup, `
  window.__cliffTest = {
    generatedWidths() {
      extremeMode = true;
      nextObstacleX = 200000;
      obstacles = [];
      spawnCliffScene();
      const short = obstacles.find((item) => item.short).width;
      obstacles = [];
      nextObstacleX = 200000;
      spawnGapPillarScene(false);
      const pillar = obstacles.find((item) => item.pillarScene).width;
      return { short, pillar,
        gap: obstacleWidth('gap', 200000),
        collapse: obstacleWidth('collapseGap', 200000) };
    },
    setup(kind, width, phase) {
      const gapX = 200000;
      this.gapEnd = gapX + width;
      extremeMode = true;
      worldX = gapX - 80 + phase * EXTREME_SPEED / 60;
      speed = EXTREME_SPEED;
      elapsed = 0;
      lastFrame = 0;
      nextObstacleX = Infinity;
      player = { feetY: GROUND, vy: 0, jumps: 0, crouch: false, grounded: true, diving: false };
      downKeys.clear(); touchDownHeld = false;
      rescueCount = 0;
      achievementAir = null;
      shieldReady = false; shieldUntil = 0; shieldBufferUntil = 0;
      shieldWarningSpawnAfter = 0; shieldRecoverySpawnPending = false;
      shieldWarningSpawnPending = false; jetpackActive = false;
      const gap = { kind: kind === 'collapse' ? 'collapseGap' : 'gap',
        x: gapX, width, collapsed: true, collapseProgress: 1 };
      obstacles = [gap];
      if (kind === 'pillar') {
        gap.pillarScene = true;
        const pillar = { kind: 'skyPillar',
          x: gapX + Math.round(EXTREME_SPEED * .26),
          width: Math.round(EXTREME_SPEED * .027), sceneGap: gap };
        gap.scenePillar = pillar;
        obstacles.push(pillar);
      }
      setMode('running'); hideOverlay();
      return this.state();
    },
    state() {
      const gap = obstacles.find((item) => item.kind === 'gap' || item.kind === 'collapseGap');
      return { x: worldX, feetY: player.feetY, grounded: player.grounded,
        vy: player.vy, diving: player.diving, jumps: player.jumps, rescues: rescueCount,
        gapEnd: this.gapEnd, gapPresent: Boolean(gap), mode };
    },
    advance(stop, limit = 240) {
      for (let frame = 0; frame < limit; frame++) {
        const state = this.state();
        if (state.rescues || (stop === 'airborne' && !state.grounded)
          || (stop === 'bottom' && state.feetY >= H)
          || (stop === 'apex' && state.jumps === 1 && state.vy >= 0)
          || (stop === 'finish' && state.grounded && state.x > state.gapEnd)) break;
        update(1 / 60);
      }
      return this.state();
    }
  };
  initializeGame();`);

const mime = { '.html': 'text/html', '.js': 'application/javascript',
  '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    const body = pathname === '/game.js' ? instrumentedGame : fs.readFileSync(file);
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    response.end(body);
  } catch { response.writeHead(404).end(); }
});

async function check(page, kind, width, phase, dive, delayFrames = 0, shortDouble = false) {
  await page.evaluate(([name, size, offset]) => window.__cliffTest.setup(name, size, offset),
    [kind, width, phase]);
  const airborne = await page.evaluate(() => window.__cliffTest.advance('airborne'));
  if (airborne.rescues || airborne.grounded) return { ok: false, stage: 'entry', state: airborne };
  if (dive) await page.keyboard.down('s');
  const bottom = await page.evaluate(() => window.__cliffTest.advance('bottom'));
  if (bottom.rescues || bottom.feetY < 430 || bottom.feetY >= 510) {
    if (dive) await page.keyboard.up('s');
    return { ok: false, stage: 'descent', state: bottom };
  }
  if (delayFrames) await page.evaluate((frames) => window.__cliffTest.advance('none', frames), delayFrames);
  await page.keyboard.press('Space');
  if (kind === 'short' && (delayFrames || shortDouble)) {
    const mid = await page.evaluate(() => window.__cliffTest.advance('none', 7));
    if (mid.rescues) {
      if (dive) await page.keyboard.up('s');
      return { ok: false, stage: 'second-jump', bottomY: bottom.feetY, state: mid };
    }
    await page.keyboard.press('Space');
  } else if (kind !== 'short') {
    const apex = await page.evaluate(() => window.__cliffTest.advance('apex'));
    if (apex.rescues || apex.jumps !== 1 || apex.vy < 0) {
      if (dive) await page.keyboard.up('s');
      return { ok: false, stage: 'first-jump', bottomY: bottom.feetY, state: apex };
    }
    await page.keyboard.press('Space');
  }
  const landing = await page.evaluate(() => window.__cliffTest.advance('finish'));
  if (dive) await page.keyboard.up('s');
  return { ok: landing.rescues === 0 && landing.grounded && landing.x > landing.gapEnd,
    stage: 'landing', bottomY: bottom.feetY, state: landing };
}

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true,
      ...(process.env.PLAYWRIGHT_CHROME ? { executablePath: process.env.PLAYWRIGHT_CHROME } : {}) });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForFunction(() => Boolean(window.__cliffTest));
    const widths = await page.evaluate(() => window.__cliffTest.generatedWidths());
    assert.deepEqual(widths, { short: 780, gap: 1084, collapse: 1084, pillar: 920 });
    const phases = Array.from({ length: 12 }, (_, index) => index / 12);
    for (const [kind, width] of Object.entries(widths)) {
      for (const delayFrames of [0, 1]) {
        const failures = [];
        for (const phase of phases) {
          const result = await check(page, kind, width, phase, true, delayFrames);
          if (!result.ok) failures.push({ phase, ...result });
        }
        console.log(`${kind}: dive from bottom with ${delayFrames}-frame delay ${phases.length - failures.length}/${phases.length} at width ${width}`);
        assert.deepEqual(failures, [], `${kind} could not dive and escape: ${JSON.stringify(failures)}`);
      }
    }
    for (const kind of ['gap', 'collapse', 'pillar']) {
      const failures = [];
      for (const phase of phases) {
        const result = await check(page, kind, widths[kind], phase, false);
        if (!result.ok) failures.push({ phase, ...result });
      }
      console.log(`${kind}: natural fall from bottom ${phases.length - failures.length}/${phases.length}`);
      assert.deepEqual(failures, [], `${kind} could not fall and escape: ${JSON.stringify(failures)}`);
    }
    const shortNatural = await Promise.all(phases.map((phase) => check(page, 'short', widths.short, phase, false)));
    const shortNaturalImmediateDouble = await Promise.all(phases.map((phase) =>
      check(page, 'short', widths.short, phase, false, 0, true)));
    const shortNaturalDouble = await Promise.all(phases.map((phase) =>
      check(page, 'short', widths.short, phase, false, 1)));
    console.log(`short: natural fall from bottom, single jump ${shortNatural.filter((item) => item.ok).length}/${phases.length}`);
    console.log(`short: natural fall from bottom, immediate double jump ${shortNaturalImmediateDouble.filter((item) => item.ok).length}/${phases.length}`);
    console.log(`short: natural fall from bottom, delayed double jump ${shortNaturalDouble.filter((item) => item.ok).length}/${phases.length}`);
    assert.ok(shortNaturalImmediateDouble.every((item) => !item.ok),
      'the short cliff should retain a dive-required escape route from screen bottom');
    assert.deepEqual(pageErrors, []);
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
