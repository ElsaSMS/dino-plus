// First-generation waiting distance, integrated exactly over item rolls on seeded tracks.
// node tests/powerup-distribution.cjs [track-count=500]
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const count = Number(process.argv[2] || 500);
if (!Number.isInteger(count) || count < 1) throw new Error('Track count must be a positive integer');
const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8').replace(/\r\n/g, '\n');
const models = fs.readFileSync(path.join(root, 'visual-models/models.js'), 'utf8');
const startup = '  updateAudioControls(); updateProfileUI(); fillObstacles(); draw(); requestAnimationFrame(frame);';
const checkedReplace = (text, before, after) => {
  if (!text.includes(before)) throw new Error('Baseline hook changed: ' + before);
  return text.replace(before, after);
};
// Counterfactual parameters immediately before the 4x-speed balance update.
function legacyGenerator(text) {
  for (const [before, after] of [
    ['const MAX_SPEED = BASE_SPEED * 4;', 'const MAX_SPEED = BASE_SPEED * 3;'],
    ['(160 + Math.floor(seed * 1.8)) * .75', '160 + Math.floor(seed * 1.8)'],
    ['roll < .43', 'roll < .44'], ['roll < .55', 'roll < .56'], ['roll < .64', 'roll < .66'],
    ['roll < .72 - movingShift', 'roll < .74 - movingShift'],
    ['roll < .80 - movingShift * 2', 'roll < .82 - movingShift * 2'],
    ['roll < .86 - movingShift', 'roll < .87 - movingShift'],
    ['Math.random() < .08 + pressure * .02', 'Math.random() < .08 + pressure * .08'],
    ['if (nextObstacleX >= ADVANCED_DISTANCE && Math.random() < .05) {\n        if (previous)',
      'if (nextObstacleX >= ADVANCED_DISTANCE && Math.random() < .04 + pressure * .10) {\n        if (previous)'],
    ['Math.random() < .05) { spawnCliffScene();', 'Math.random() < .18 + pressure * .04) { spawnCliffScene();'],
    ['const movingBirdSpeed = (obstacle) => (obstacle.baseFlightSpeed ?? 110) * (speed / BASE_SPEED);',
      'const movingBirdSpeed = (obstacle) => (obstacle.baseFlightSpeed ?? 110) * 3;']
  ]) text = checkedReplace(text, before, after);
  return text;
}
const opportunities = `  function maybeDropPowerup(o) {
    if (jetpackActive || o.kind === 'skyPillar' || (o.kind === 'gap' && o.pillarScene)) return;
    const hard = o.kind === 'duck' || o.kind === 'gap' || (o.kind === 'bramble' && o.height >= 57);
    record((worldX - powerupEpochX) / 10, hard ? .02 : .01);
  }
`;
const hook = `  globalThis.audit = (start, legacy) => {
    mode = 'running'; worldX = start * 10; powerupEpochX = worldX;
    speed = runSpeedAt(worldX); elapsed = 0; obstacles = []; nextObstacleX = 780;
    if (start > 0) triggerBlast(false);
    const travelTime = (from, to) => {
      let total = 0;
      const edges = [from, ...[10000, 100000, 300000].filter((x) => x > from && x < to), to];
      for (let i = 1; i < edges.length; i++) {
        const a = edges[i - 1], b = edges[i], va = runSpeedAt(a), vb = runSpeedAt(b);
        total += Math.abs(vb - va) < 1e-8 ? (b - a) / va : Math.log(vb / va) * (b - a) / (vb - va);
      }
      return total;
    };
    while (!done()) {
      let low = worldX, high = Math.max(worldX + 1, nextObstacleX);
      const ready = (x) => x + W - PLAYER_X + runSpeedAt(x) * HAZARD_WARNING_TIME + 300 > nextObstacleX
        && elapsed + travelTime(worldX, x) >= shieldBufferUntil;
      while (!ready(high)) high += 10000;
      for (let i = 0; i < 30; i++) { const mid = (low + high) / 2; if (ready(mid)) high = mid; else low = mid; }
      const target = high + .0001;
      for (const o of obstacles) if (isMovingBird(o.kind)) {
        const activeFrom = Math.max(worldX, o.x - MOVING_BIRD_ENTRY - MOVING_BIRD_FLIGHT_LEAD);
        if (target > activeFrom) o.x -= legacy
          ? (o.baseFlightSpeed ?? 110) * 3 * travelTime(activeFrom, target)
          : (o.baseFlightSpeed ?? 110) / BASE_SPEED * (target - activeFrom);
      }
      elapsed += travelTime(worldX, target); worldX = target; speed = runSpeedAt(worldX);
      fillObstacles();
      obstacles = obstacles.filter((o) => o.x + o.width > worldX - 300);
      if (worldX - powerupEpochX > 10000000) throw new Error('Tail did not converge within 1000000m');
    }
  };`;
function script(legacy) {
  let text = legacy ? legacyGenerator(source) : source;
  const a = text.indexOf('  function maybeDropPowerup('), b = text.indexOf('  function addObstacles(');
  text = text.slice(0, a) + opportunities + text.slice(b);
  return new vm.Script(checkedReplace(text, startup, hook));
}
const scripts = [script(true), script(false)];
const BIN = 10;
function accumulator(label) { return { label, hist: new Float64Array(100002), means: [], residual: 0 }; }
function oneTrack(seed, start, legacy, aggregates) {
  let rng = seed >>> 0;
  const math = Object.create(Math);
  math.random = () => ((rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 4294967296);
  const element = { getContext: () => ({}), addEventListener() {}, dataset: {},
    classList: { add() {}, remove() {} }, querySelectorAll: () => [], replaceChildren() {}, append() {} };
  const curves = legacy ? ['old-single', 'old-any'] : ['fixed-single', 'fixed-any', 'new-single', 'new-any'];
  const survival = curves.map(() => 1), mean = curves.map(() => 0);
  const sandbox = { Math: math, window: { addEventListener() {} },
    document: { getElementById: () => element, addEventListener() {}, createElement: () => element },
    localStorage: { getItem: () => null },
    done: () => survival.every((s) => s < 1e-10),
    record(distance, q) {
      const k = distance <= 1000 ? 0 : distance >= 8000 ? 3 : Math.log2(distance / 1000);
      const hazards = legacy ? [q, 2 * q] : [q, 2 * q, q * k, 1 - (1 - q * k) ** 2];
      for (let i = 0; i < curves.length; i++) {
        const mass = survival[i] * hazards[i]; survival[i] *= 1 - hazards[i];
        mean[i] += mass * distance;
        aggregates[curves[i]].hist[Math.ceil(distance / BIN)] += mass;
      }
    }
  };
  vm.createContext(sandbox); vm.runInContext(models, sandbox); scripts[legacy ? 0 : 1].runInContext(sandbox);
  sandbox.audit(start, legacy);
  for (let i = 0; i < curves.length; i++) { aggregates[curves[i]].means.push(mean[i]); aggregates[curves[i]].residual = Math.max(aggregates[curves[i]].residual, survival[i]); }
}
function summarize(a) {
  const n = a.means.length, mean = a.means.reduce((s, x) => s + x, 0) / n;
  const variance = n > 1 ? a.means.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1) : 0;
  const quantiles = {}, cdf = {}; let total = 0;
  for (let i = 0; i < a.hist.length; i++) {
    total += a.hist[i] / n;
    for (const q of [.1, .25, .5, .75, .9, .95, .99]) if (quantiles[q] === undefined && total >= q) quantiles[q] = i * BIN;
    if ([1000, 2000, 4000, 8000, 12000, 20000].includes(i * BIN)) cdf[i * BIN] = total;
  }
  return { mean, mean95HalfWidth: 1.96 * Math.sqrt(variance / n), quantiles, cdf, maxResidual: a.residual };
}
const result = { tracks: count, seedBase: 2570927, stepping: 'continuous generation events; analytic travel time and bird motion', quantileBinMeters: BIN,
  interpretation: 'Distance until first generation, not collection; no deaths, no held shield or flights; exact conditional item survival averaged over seeded obstacle tracks.', scenarios: [] };
for (const start of [0, 10000, 100000]) {
  const aggregates = Object.fromEntries(['old-single', 'old-any', 'fixed-single', 'fixed-any', 'new-single', 'new-any'].map((key) => [key, accumulator(key)]));
  for (let seed = 0; seed < count; seed++) {
    oneTrack(result.seedBase + seed, start, true, aggregates);
    oneTrack(result.seedBase + seed, start, false, aggregates);
  }
  const summary = Object.fromEntries(Object.entries(aggregates).map(([key, value]) => [key, summarize(value)]));
  result.scenarios.push({ resetAtMeters: start, ...summary });
  console.log(JSON.stringify({ resetAtMeters: start, ...summary }));
}
const output = path.join(root, 'balance-results.json');
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(output);
