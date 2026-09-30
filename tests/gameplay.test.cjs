const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
const startup = '  updateAudioControls(); updateProfileUI(); fillObstacles(); draw(); requestAnimationFrame(frame);';
assert.ok(source.includes(startup), 'game test hook location changed');

function createGame(randomValues = [], store = {}, trainingKinds = null, trainingMultiplier = 3.2, overflowPreview = false) {
  const drawCalls = [];
  const canvasContext = new Proxy({}, {
    get: (_, key) => key === 'createLinearGradient' || key === 'createRadialGradient'
      ? () => ({ addColorStop() {} })
      : key === 'ellipse' || key === 'quadraticCurveTo' || key === 'arc' || key === 'scale'
        ? (...args) => drawCalls.push({ key, args }) : () => {},
    set: (_, key, value) => { if (key === 'fillStyle') drawCalls.push({ key, value }); return true; }
  });
  const element = {
    addEventListener() {}, getContext: () => canvasContext, dataset: {},
    classList: { add() {}, remove() {} }, querySelectorAll: () => [],
    replaceChildren() {}, append() {}, setAttribute() {}
  };
  const elements = new Map();
  const getElement = (id) => {
    if (!elements.has(id)) {
      const listeners = {};
      const node = { ...element, value: '', textContent: '', hidden: false, dataset: {},
        addEventListener(type, callback) { listeners[type] = callback; },
        click() { listeners.click?.({ target: node }); },
        blur() { documentMock.activeElement = { tagName: 'BODY' }; }
      };
      elements.set(id, node);
    }
    return elements.get(id);
  };
  const documentMock = {
    activeElement: { tagName: 'BODY' },
    getElementById: getElement, addEventListener() {}, createElement: () => ({ ...element })
  };
  element.blur = () => { documentMock.activeElement = { tagName: 'BODY' }; };
  const windowListeners = {};
  const randomMath = Object.create(Math);
  randomMath.random = () => typeof randomValues === 'function'
    ? randomValues()
    : randomValues.length ? randomValues.shift() : .5;
  const sandbox = {
    Math: randomMath,
    document: documentMock,
    window: { addEventListener: (type, listener) => { windowListeners[type] = listener; },
      ...(overflowPreview ? { DinoOverflowDemo: true } : {}),
      ...(trainingKinds ? { DinoTraining: { selectedKinds: () => trainingKinds,
        speedMultiplier: () => trainingMultiplier } } : {}) },
    localStorage: { getItem: (key) => store[key] ?? null, setItem: (key, value) => { store[key] = value; },
      removeItem: (key) => { delete store[key]; } }
  };
  const hook = `  globalThis.gameTest = {
    sound, powerupMultiplier, movingBirdSpeed, triggerBlast,
    powerupEpoch: () => powerupEpochX,
    setPowerupDistance: (meters) => { powerupEpochX = worldX - meters * 10; },
    speedAt, runSpeedAt, runPressure, latePressure, obstacleKind, trainingObstacleKind, obstacleWidth, cliffNeighborKind, makeObstacle, thornModules,
    sceneTallThornSide, spawnObstacle, spawnObstacleGroup, spawnCliffScene, spawnGapPillarScene, spawnRhythmScene,
    startJetpack, updateJetpack, resetGame, consumeShield,
    jetpackActive: () => jetpackActive,
    jetpackPickups: () => jetpackPickups,
    setJetpackPickups: (items) => { jetpackPickups = items; },
    blastColorful: () => blastColorful,
    drawGiantBird: (...args) => { renderer.setState(visualState()); return renderer.drawGiantBird(...args); }, drawCactus: (...args) => { renderer.setState(visualState()); return renderer.drawCactus(...args); }, drawBramble: (...args) => { renderer.setState(visualState()); return renderer.drawBramble(...args); }, drawBird: (...args) => { renderer.setState(visualState()); return renderer.drawBird(...args); }, drawSkyPillar: (...args) => { renderer.setState(visualState()); return renderer.drawSkyPillar(...args); },
    addObstacles, drawShieldPickups: (...args) => { renderer.setState(visualState()); return renderer.drawShieldPickups(...args); }, drawShieldBreak: (...args) => { renderer.setState(visualState()); return renderer.drawShieldBreak(...args); }, drawShieldDebris: (...args) => { renderer.setState(visualState()); return renderer.drawShieldDebris(...args); }, drawDino: (...args) => { renderer.setState(visualState()); return renderer.drawDino(...args); },
    hasGroundSupport, hitRightCliffWall, solidGroundSegments: (...args) => { renderer.setState(visualState()); return renderer.solidGroundSegments(...args); },
    obstacles: () => obstacles,
    setObstacles: (items) => { obstacles = items; },
    shieldPickups: () => shieldPickups,
    setShieldPickups: (items) => { shieldPickups = items; },
    shieldReady: () => shieldReady,
    setShieldReady: (ready) => { shieldReady = ready; },
    shieldBufferUntil: () => shieldBufferUntil,
    shieldWarningSpawnAfter: () => shieldWarningSpawnAfter,
    shieldBreakAt: () => shieldBreakAt,
    shieldDebris: () => shieldDebris,
    elapsed: () => elapsed,
    setElapsed: (value) => { elapsed = value; },
    next: (x) => { nextObstacleX = x; },
    nextPosition: () => nextObstacleX,
    rescueCount: () => rescueCount,
    trainingMode: () => trainingMode,
    setExtreme: (enabled) => { extremeMode = enabled; },
    warningTarget, timeUntilVisible, extremeMode: () => extremeMode,
    startForInputTest: () => { mode = 'running'; obstacles = []; nextObstacleX = Infinity; },
    startGame, endGame, overlayInert: () => ui.overlay.inert,
    finishExtreme, profileState: () => JSON.parse(JSON.stringify(profile)), activeName: () => activeName,
    setRescues: (value) => { rescueCount = value; },
    tick: update,
    mode: () => mode,
    worldPosition: () => worldX,
    playerState: () => ({ ...player }),
    playerBoxes: () => playerHitboxes(),
    player: (x, feetY, crouch) => {
      worldX = x; player.feetY = feetY; player.crouch = crouch;
    },
    setPlayerState: (values) => Object.assign(player, values),
    hit: (obstacle) => hitObstacle(obstacle, playerHitboxes()),
    hitBoxes: (obstacle, boxes) => hitObstacle(obstacle, boxes)
  };`;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../visual-models/models.js'), 'utf8'), sandbox);
  vm.runInContext(source.replace(startup, hook), sandbox, { filename: 'game.js' });
  return {
    ...sandbox.gameTest,
    store, element: getElement,
    drawCalls,
    resetTraining: () => sandbox.window.DinoTraining?.resetRun(),
    setTrainingMultiplier: (value) => { trainingMultiplier = value; },
    keyDown: (code, repeat = false, target = documentMock.activeElement) => {
      const event = { code, repeat, target, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; } };
      windowListeners.keydown(event);
      return event;
    },
    keyUp: (code) => windowListeners.keyup({ code }),
    blur: () => windowListeners.blur(),
    focus: (tagName) => { documentMock.activeElement = tagName === 'start-button'
      ? getElement('start-button') : { tagName }; },
    activeTag: () => documentMock.activeElement.tagName
  };
}

test('local training generates only selected singleton hazards at renormalized original shares', () => {
  const selected = ['cactus', 'movingHigh'];
  const game = createGame([], {}, selected);
  assert.equal(game.trainingMode(), true);
  game.resetTraining();
  assert.ok(game.obstacles().length > 0);
  assert.ok(game.obstacles().every((obstacle) => selected.includes(obstacle.kind)));
  assert.equal(game.shieldPickups().length, 0);
  assert.equal(game.jetpackPickups().length, 0);
  for (let index = 0; index < 100; index++) {
    game.next(30000 + index * 500);
    game.spawnObstacleGroup();
  }
  assert.ok(game.obstacles().every((obstacle) => selected.includes(obstacle.kind)),
    'scene branches never add an unselected obstacle');
  for (const x of [20000, 1000000]) {
    const expected = Array.from({ length: 10000 }, (_, index) => game.obstacleKind(x, (index + .5) / 10000))
      .filter((kind) => selected.includes(kind));
    const actualCactus = Array.from({ length: 10000 }, (_, index) => game.trainingObstacleKind(x, (index + .5) / 10000))
      .filter((kind) => kind === 'cactus').length;
    const expectedCactus = expected.filter((kind) => kind === 'cactus').length / expected.length * 10000;
    assert.ok(Math.abs(actualCactus - expectedCactus) <= 2);
  }
  assert.equal(createGame().trainingMode(), false);
});

test('pillar cliff is one selectable training obstacle with its original relative share', () => {
  const pillarOnly = createGame([], {}, ['gapPillar']);
  pillarOnly.resetTraining();
  for (let index = 0; index < 30; index++) {
    pillarOnly.next(30000 + index * 3000);
    pillarOnly.spawnObstacleGroup();
  }
  const obstacles = pillarOnly.obstacles();
  assert.ok(obstacles.length > 0 && obstacles.length % 2 === 0);
  for (let index = 0; index < obstacles.length; index += 2) {
    assert.equal(obstacles[index].kind, 'gap');
    assert.equal(obstacles[index].pillarScene, true);
    assert.equal(obstacles[index + 1].kind, 'skyPillar');
  }

  const mixed = createGame([], {}, ['gapPillar', 'cactus']);
  const x = 1000000;
  const pillarChance = .08 + .02 * mixed.runPressure(x);
  const ordinaryChance = (1 - pillarChance) * .95 ** 2 * .18;
  const expectedShare = pillarChance / (pillarChance + ordinaryChance);
  const count = Array.from({ length: 10000 }, (_, index) =>
    mixed.trainingObstacleKind(x, (index + .5) / 10000))
    .filter((kind) => kind === 'gapPillar').length;
  assert.ok(Math.abs(count / 10000 - expectedShare) < .0002);
});

test('local training holds the selected 3.2x or 3.6x speed throughout each run', () => {
  const game = createGame([], {}, ['cactus'], 3.2);
  for (const x of [0, 10000, 100000, 1000000]) assert.equal(game.runSpeedAt(x), 1120);
  game.resetTraining();
  game.startForInputTest(); game.tick(.016);
  assert.equal(game.element('status-text').textContent, '训练 ×3.2');
  game.setTrainingMultiplier(3.6);
  game.resetTraining();
  for (const x of [0, 10000, 100000, 1000000]) assert.equal(game.runSpeedAt(x), 1260);
  game.startForInputTest(); game.tick(.016);
  assert.equal(game.element('status-text').textContent, '训练 ×3.6');
  assert.equal(createGame().runSpeedAt(0), 350, 'the formal game keeps its speed curve');
});

test('local training rescues without changing formal records and resets to the ready state', () => {
  const game = createGame([], {}, ['cactus']);
  game.startForInputTest();
  game.setObstacles([{ kind: 'cactus', x: 0, width: 42, height: 46, seed: 0 }]);
  game.tick(.016);
  assert.equal(game.mode(), 'running');
  assert.equal(game.rescueCount(), 1);
  assert.equal(game.element('best').textContent, '1');
  assert.ok(game.shieldBufferUntil() > game.elapsed());
  assert.equal(game.profileState().best, 0);
  game.resetTraining();
  assert.equal(game.mode(), 'ready');
  assert.equal(game.worldPosition(), 0);
  assert.equal(game.rescueCount(), 0);
  assert.ok(game.obstacles().every((obstacle) => obstacle.kind === 'cactus'));
});

test('local training keeps moving-bird-only selections after a rescue warning delay', () => {
  const game = createGame([], {}, ['movingHigh']);
  game.startForInputTest();
  game.setObstacles([{ kind: 'cactus', x: 0, width: 42, height: 46, seed: 0 }]);
  game.tick(.016);
  assert.equal(game.rescueCount(), 1);
  game.next(850);
  game.tick(3.75);
  assert.equal(game.obstacles().length, 0, 'nothing spawns while warning sounds are delayed');
  game.tick(.1);
  assert.ok(game.obstacles().length > 0);
  assert.ok(game.obstacles().every((obstacle) => obstacle.kind === 'movingHigh'));
});

test('extreme: mode controls reset the run and record HUD; normal records remain intact', () => {
  const game = createGame();
  game.element('extreme-mode').click();
  assert.equal(game.extremeMode(), true);
  assert.equal(game.element('best-label').textContent, '最佳 · 续命次数');
  assert.equal(game.element('distance-label').textContent, '进度 · 共 100000 米');
  assert.equal(game.element('best').textContent, '—');
  game.element('start-button').click();
  game.setRescues(9); game.player(500000, 320, false);
  game.element('extreme-mode').click();
  assert.equal(game.worldPosition(), 500000, 'selecting the active mode preserves progress');
  assert.equal(game.rescueCount(), 9);
  assert.equal(game.mode(), 'running');
  game.element('mode-reset').click();
  assert.equal(game.worldPosition(), 0);
  assert.equal(game.rescueCount(), 0);
  assert.equal(game.element('distance').textContent, '0000');
  assert.equal(game.mode(), 'paused');
  assert.equal(game.overlayInert(), false, 'the reset run waits at its 0m overlay');
  assert.equal(game.profileState().extremeBest, null);
  game.element('start-button').click();
  assert.equal(game.mode(), 'running');
  assert.equal(game.worldPosition(), 0);
  game.element('classic-mode').click();
  assert.equal(game.extremeMode(), false);
  assert.equal(game.mode(), 'ready');
  assert.equal(game.runSpeedAt(0), 350);
  assert.equal(game.element('best-label').textContent, '历史最佳');
  assert.equal(game.profileState().best, 0);
  assert.equal(game.element('mode-reset').hidden, true);
  game.startGame(); game.player(1000, 320, false);
  game.endGame();
  assert.equal(game.profileState().best, 100, 'classic records still save after switching back');
  assert.equal(game.profileState().extremeBest, null);
});

test('extreme: complete runs persist the minimum rescue count, including zero, under one renameable profile', () => {
  const key = 'elsasms.dino-plus.v1.profile';
  const store = { [key]: JSON.stringify({ best: 678, recent: [678], outfit: 'explorer' }) };
  const game = createGame([], store);
  game.element('extreme-mode').click();
  for (const rescues of [8, 4, 6, 0, 2, 7]) {
    game.startGame(); game.setObstacles([]); game.next(Infinity);
    game.setRescues(rescues); game.player(999999, 320, false);
    game.tick(.032);
    assert.equal(game.mode(), 'over');
    assert.equal(game.worldPosition(), 1000000);
    assert.equal(game.element('distance').textContent, '100000');
    const before = store[key];
    game.finishExtreme(); game.tick(.032); game.keyDown('Space');
    assert.equal(game.mode(), 'over', 'space cannot dismiss the result or restart');
    assert.equal(store[key], before, 'finish is recorded once only');
  }
  assert.deepEqual(Array.from(game.profileState().extremeRecent), [7, 2, 0, 6, 4]);
  assert.equal(game.profileState().extremeBest, 0);
  assert.equal(game.profileState().best, 678);
  assert.deepEqual(Array.from(game.profileState().recent), [678]);
  const reloaded = createGame([], store);
  assert.equal(reloaded.profileState().extremeBest, 0);
  reloaded.element('extreme-mode').click();
  reloaded.element('name-input').value = '另一只恐龙';
  reloaded.element('save-name').click();
  assert.equal(reloaded.profileState().extremeBest, 0);
  assert.equal(reloaded.profileState().best, 678);
  reloaded.startGame(); reloaded.player(1000000, 320, false); reloaded.setRescues(3);
  reloaded.finishExtreme();
  assert.equal(reloaded.profileState().extremeBest, 0);
  reloaded.element('name-input').value = '小小冒险家';
  reloaded.element('save-name').click();
  assert.equal(reloaded.profileState().extremeBest, 0);
  reloaded.startGame(); reloaded.player(800000, 320, false); reloaded.setRescues(1);
  reloaded.element('classic-mode').click();
  assert.deepEqual(Array.from(reloaded.profileState().extremeRecent), [3, 7, 2, 0, 6], 'an abandoned run never records');
});

test('one browser profile migrates the active legacy nickname and keeps both records while renaming mid-run', () => {
  const prefix = 'elsasms.dino-plus.v1.';
  const store = {
    [prefix + 'active-name']: JSON.stringify('晚霞骑士'),
    [prefix + 'profiles']: JSON.stringify({
      '其他恐龙': { best: 9999, recent: [9999], outfit: 'explorer', extremeBest: 0, extremeRecent: [0] },
      '晚霞骑士': { best: 420, recent: [420, 310], outfit: 'sunrider', extremeBest: 4, extremeRecent: [4, 6] }
    })
  };
  const game = createGame([], store);
  assert.equal(game.activeName(), '晚霞骑士');
  assert.equal(game.profileState().best, 420);
  assert.equal(game.profileState().outfit, 'sunrider');
  assert.equal(game.profileState().extremeBest, 4);
  assert.equal(store[prefix + 'profiles'], undefined, 'the old multi-account key is removed after migration');
  assert.equal(JSON.parse(store[prefix + 'profile']).best, 420);
  game.startGame(); game.player(2500, 320, false);
  game.element('name-input').value = '新名字'; game.element('save-name').click();
  assert.equal(game.mode(), 'running', 'renaming does not interrupt the current run');
  assert.equal(game.worldPosition(), 2500);
  assert.equal(game.profileState().best, 420);
  assert.equal(game.profileState().extremeBest, 4);
  assert.equal(game.profileState().outfit, 'sunrider');
  assert.equal(JSON.parse(store[prefix + 'active-name']), '新名字');
  game.player(5000, 320, false); game.endGame();
  assert.equal(game.profileState().best, 500);
  const reloaded = createGame([], store);
  assert.equal(reloaded.activeName(), '新名字');
  assert.equal(reloaded.profileState().best, 500);
  assert.equal(reloaded.profileState().extremeBest, 4);
  assert.equal(reloaded.profileState().outfit, 'sunrider');
  assert.equal(store[prefix + 'profiles'], undefined);
});

test('extreme: no powerups even at maximum drop multiplier, early and late speed/pressure are constant', () => {
  const game = createGame(() => 0);
  game.setShieldPickups([{ x: 100, y: 250 }]);
  game.setJetpackPickups([{ x: 100, y: 250 }]);
  game.element('extreme-mode').click();
  for (const x of [0, 10000, 100000, 500000, 1000000]) {
    assert.equal(game.runSpeedAt(x), 1260);
    assert.equal(game.runPressure(x), 1);
  }
  game.setPowerupDistance(8000);
  for (const kind of ['cactus', 'bramble', 'tallThorn', 'gap', 'collapseGap', 'duck', 'jump', 'movingLow', 'movingHigh', 'giantGround', 'giantHover']) {
    game.addObstacles(game.makeObstacle(kind, 30000, 100));
  }
  assert.equal(game.shieldPickups().length, 0);
  assert.equal(game.jetpackPickups().length, 0);
  assert.equal(game.shieldReady(), false);
  assert.equal(game.jetpackActive(), false);
  game.startForInputTest(); game.tick(0);
  assert.equal(game.movingBirdSpeed({ baseFlightSpeed: 100 }), 360);
  assert.equal(game.movingBirdSpeed({ baseFlightSpeed: 120 }), 432);
  const normal = createGame();
  for (const x of [780, 1200, 19999]) for (const r of [.1, .4, .6, .8, .95]) {
    assert.equal(game.obstacleKind(x, r), normal.obstacleKind(x, r), 'same adaptation pool');
  }
  assert.equal(game.obstacleKind(25000, .68), 'jump', 'moving-bird share uses p=1 even near the start');
  assert.equal(game.obstacleKind(25000, .74), 'movingLow');
});

test('extreme: complete the 100000m course with automatic rescues and no input', () => {
  let seed = 9282026;
  const game = createGame(() => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32));
  game.element('extreme-mode').click(); game.startGame();
  let frames = 0;
  while (game.mode() === 'running' && frames++ < 26000) game.tick(.032);
  assert.equal(game.mode(), 'over');
  assert.equal(game.worldPosition(), 1000000);
  assert.ok(game.rescueCount() > 0);
  assert.equal(game.profileState().extremeBest, game.rescueCount());
  assert.equal(game.profileState().extremeRecent.length, 1);
  assert.equal(game.profileState().recent.length, 0);
  assert.equal(game.shieldPickups().length + game.jetpackPickups().length, 0);
  game.keyDown('Enter');
  assert.equal(game.mode(), 'running');
  assert.equal(game.worldPosition(), 0);
  assert.equal(game.rescueCount(), 0);
});

test('update: giant bird collision covers the beak, tail, feet and current wings', () => {
  const game = createGame();
  for (const kind of ['giantGround', 'giantHover']) {
    const bird = { kind, x: 1000, width: 400, seed: 0 };
    const cy = kind === 'giantGround' ? 276 : 234;
    const probe = (x, y) => game.hitBoxes(bird, [{ left: x - 1, right: x + 1, top: y - 1, bottom: y + 1 }]);
    assert.equal(probe(1388, cy + 4), true, 'beak tip interior is covered');
    assert.equal(probe(1024, cy - 12), true, 'tail tip interior is covered');
    assert.equal(probe(1388, cy - 15), false, 'space above the beak stays safe');
    assert.equal(probe(1204, cy + (kind === 'giantGround' ? 41 : 27)), true, 'visible body edge is covered');
    game.drawGiantBird(100, 320, bird);
  }
});

test('update: tall thorns reuse ordinary modules and take shares from thorns and cliffs', () => {
  const game = createGame();
  const width = game.obstacleWidth('tallThorn', 100000);
  assert.equal(width, 84);
  const singleJumpHeight = 650 ** 2 / (2 * 1700);
  for (const seed of [0, 5, 9.99]) {
    const thorn = game.makeObstacle('tallThorn', 1000, width);
    assert.ok(thorn.height >= 119 && thorn.height <= 123);
    const modules = game.thornModules({ ...thorn, seed });
    assert.equal(modules.length, 2);
    assert.ok(modules.every((module) => module.height <= thorn.height && module.height >= thorn.height * .86));
    assert.ok(thorn.height < singleJumpHeight * 2);
    game.drawCactus(100, 320, thorn);
  }
  const counts = {};
  for (let i = 0; i < 10000; i++) {
    const kind = game.obstacleKind(200000, i / 10000);
    counts[kind] = (counts[kind] || 0) + 1;
  }
  assert.equal(counts.tallThorn, 1200);
  assert.equal(counts.cactus, 1800);
  assert.equal(counts.bramble, 1800);
  assert.equal(counts.gap, 700);
  assert.notEqual(game.obstacleKind(15000, .5), 'tallThorn', 'adaptation period is preserved');
});

test('update: cliff and collapse spacing is reduced by exactly twenty percent after 10000m', () => {
  for (const x of [50000, 100000, 500000, 1100000]) {
    for (const previousKind of ['cactus', 'gap', 'collapseGap']) {
      const normal = createGame(() => .4);
      const compact = createGame(() => .4);
      for (const game of [normal, compact]) {
        game.setObstacles([{ kind: previousKind, x, width: 100 }]);
        game.next(x + 700);
      }
      normal.spawnObstacleGroup(); compact.spawnObstacle();
      const a = normal.obstacles()[1]; const b = compact.obstacles()[1];
      assert.equal(b.width, a.width);
      assert.ok(Math.abs((b.x - x - 100) / (a.x - x - 100) - (x >= 100000 ? .8 : 1)) < 1e-9);
    }
  }
  const normal = createGame([.99, .99, .01]);
  const compact = createGame([.99, .99, .01]);
  for (const game of [normal, compact]) game.next(500000);
  normal.spawnObstacleGroup(); compact.spawnObstacle();
  const a = normal.obstacles(); const b = compact.obstacles();
  assert.equal(b[1].kind, 'gap');
  for (let i = 1; i <= 2; i++) {
    assert.ok(Math.abs((b[i].x - b[i - 1].x - b[i - 1].width)
      / (a[i].x - a[i - 1].x - a[i - 1].width) - .8) < 1e-9);
  }
});

test('balance: each powerup rolls independently, including simultaneous drops', () => {
  for (const [kind, rate] of [['duck', .02], ['cactus', .01]]) {
    let rolls = [];
    const game = createGame(() => rolls.shift() ?? .99);
    game.setPowerupDistance(2000);
    for (let i = 0; i < 100; i++) for (let j = 0; j < 100; j++) {
      rolls = [(i + .5) / 100, (j + .5) / 100];
      game.addObstacles({ kind, x: (i * 100 + j) * 3000 + 1000, width: 68, height: 50 });
    }
    assert.equal(game.shieldPickups().length, rate * 10000);
    assert.equal(game.jetpackPickups().length, rate * 10000);
    const jets = new Map(game.jetpackPickups().map((o) => [o.x, o]));
    const pairs = game.shieldPickups().filter((o) => jets.has(o.x));
    assert.equal(pairs.length, rate * rate * 10000);
    for (const shield of pairs) assert.equal(Math.abs(shield.y - jets.get(shield.x).y), 48);
  }
  const equipped = createGame(() => .015);
  equipped.setPowerupDistance(2000); equipped.setShieldReady(true);
  equipped.addObstacles({ kind: 'duck', x: 1000, width: 68 });
  assert.equal(equipped.shieldPickups().length, 0);
  assert.equal(equipped.jetpackPickups().length, 1);
});

test('balance: item multiplier has exact boundaries and resets only at start or blast', () => {
  const game = createGame(() => 0);
  for (const [meters, k] of [[-1,0],[0,0],[1000,0],[2000,1],[4000,2],[8000,3],[100000,3]]) {
    assert.equal(game.powerupMultiplier(meters * 10), k);
  }
  game.player(10000,320,false);
  game.addObstacles({ kind: 'duck', x: 11000, width: 68 });
  assert.equal(game.shieldPickups().length, 0, 'no drops during the first 1000m');
  game.player(20000,320,false);
  game.addObstacles({ kind: 'duck', x: 21000, width: 68 });
  assert.equal(game.shieldPickups().length, 1);
  assert.equal(game.powerupEpoch(), 0, 'generating an item does not reset the multiplier');
  game.triggerBlast(false); assert.equal(game.powerupEpoch(), 20000);
  game.addObstacles({ kind: 'duck', x: 26000, width: 68 });
  assert.equal(game.shieldPickups().length, 0);
  game.player(70000,320,false); game.triggerBlast(true);
  assert.equal(game.powerupEpoch(), 70000, 'landing blast resets both item processes');
  game.resetGame(); assert.equal(game.powerupEpoch(), 0);
});

test('update: jetpack grants 800m flight then a colored blast and the shield recovery window', () => {
  const game = createGame();
  game.startForInputTest();
  game.setJetpackPickups([{ kind: 'jetpack', x: 0, y: 285 }]);
  game.setObstacles([{ kind: 'skyPillar', x: -10, width: 100 }]);
  game.tick(0);
  assert.equal(game.jetpackActive(), true);
  assert.equal(game.mode(), 'running', 'pickup protects against a same-frame pillar collision');
  game.keyDown('Space'); game.keyDown('KeyS');
  assert.equal(game.playerState().vy, 0);
  assert.equal(game.playerState().diving, false);
  game.player(7999, 150, false); game.tick(0);
  assert.equal(game.jetpackActive(), true);
  game.setObstacles([
    { kind: 'gap', x: 7900, width: 300 },
    { kind: 'cactus', x: 8400, width: 42, height: 50 }
  ]);
  game.player(8000, 150, false); game.tick(0);
  assert.equal(game.jetpackActive(), false);
  assert.equal(game.playerState().feetY, 320);
  assert.equal(game.blastColorful(), true);
  assert.equal(game.obstacles().some((o) => o.kind === 'gap'), false, 'landing cliff is filled');
  assert.equal(game.obstacles().some((o) => o.kind === 'cactus'), true, 'distant obstacle awaits explosion fragments');
  assert.equal(game.shieldBufferUntil() - game.elapsed(), 3);
  assert.equal(game.shieldWarningSpawnAfter() - game.elapsed(), 3.8);
  game.tick(.2);
  assert.equal(game.obstacles().length, 0, 'blast reaches and shatters the obstacle');
  game.drawShieldBreak(); game.drawShieldDebris();
  game.resetGame();
  assert.equal(game.jetpackActive(), false);
  assert.equal(game.jetpackPickups().length, 0);
});

test('update: normal obstacle generation continues during jetpack flight', () => {
  const game = createGame();
  game.startForInputTest(); game.player(100000, 320, false);
  game.setShieldReady(true); game.startJetpack(); game.next(100100);
  game.tick(.02);
  assert.ok(game.obstacles().length > 0);
  assert.equal(game.shieldReady(), true, 'invulnerable flight does not consume a held shield');
  assert.equal(game.jetpackPickups().length, 0);
  assert.equal(game.shieldPickups().length, 0);
  game.drawDino();
  assert.ok(game.drawCalls.some((call) => call.key === 'scale' && call.args[1] === .57));
  game.consumeShield();
  assert.equal(game.blastColorful(), false);
});

test('game start releases the hidden button, and shortcuts stay out of focused controls', () => {
  const game = createGame();
  game.focus('start-button');
  game.startGame();
  assert.equal(game.mode(), 'running');
  assert.equal(game.overlayInert(), true, 'the hidden overlay cannot receive keyboard focus');
  assert.equal(game.activeTag(), 'BODY', 'the former start button loses focus');
  const x = game.worldPosition();
  assert.equal(game.keyDown('Enter').defaultPrevented, true);
  assert.equal(game.keyDown('NumpadEnter').defaultPrevented, true);
  assert.equal(game.worldPosition(), x, 'Enter cannot reset the running game');
  game.focus('BUTTON');
  game.keyDown('Space');
  game.keyDown('KeyS');
  game.keyDown('KeyP');
  assert.equal(game.playerState().jumps, 0);
  assert.equal(game.playerState().crouch, false);
  assert.equal(game.mode(), 'running');
  game.focus('INPUT');
  game.keyDown('Space');
  game.keyDown('ArrowDown');
  assert.equal(game.playerState().jumps, 0);
  assert.equal(game.playerState().crouch, false);
  game.focus('BODY');
  game.keyDown('Space');
  assert.equal(game.playerState().jumps, 1, 'Space still controls the game');
});

test('holding crouch through either jump does not reenable it on landing', () => {
  for (const downCode of ['KeyS', 'ArrowDown']) {
    const game = createGame();
    game.startForInputTest();
    game.keyDown(downCode);
    assert.equal(game.playerState().crouch, true);
    const crouchedHeadTop = game.playerBoxes()[2].top;

    game.keyDown('Space');
    assert.equal(game.playerState().grounded, false);
    assert.equal(game.playerState().crouch, false, 'takeoff clears crouch immediately');
    assert.ok(game.playerBoxes()[2].top < crouchedHeadTop - 15,
      'the collision box uses the upright pose immediately after takeoff');
    game.keyDown(downCode, true);
    game.tick(.016);
    assert.equal(game.playerState().crouch, false, 'held key repeats cannot crouch in flight');

    game.keyDown('Space');
    assert.equal(game.playerState().jumps, 2);
    assert.equal(game.playerState().crouch, false, 'second jump also stays upright');
    for (let frame = 0; frame < 180 && !game.playerState().grounded; frame++) {
      game.keyDown(downCode, true);
      game.tick(.016);
      assert.equal(game.playerState().crouch, false,
        'held input and repeated keydowns cannot change posture during or after a jump');
    }
    assert.equal(game.playerState().grounded, true);
    assert.equal(game.playerState().crouch, false, 'landing alone does not resume crouch');
    game.keyDown(downCode, true);
    assert.equal(game.playerState().crouch, false, 'key repeat is not a fresh press');
    game.keyUp(downCode);
    assert.equal(game.playerState().crouch, false);
    game.keyDown(downCode);
    assert.equal(game.playerState().crouch, true, 'a new press on the ground enables crouch');
  }
});

test('a fresh crouch press in the air accelerates downward without teleporting or slowing forward travel', () => {
  for (const downCode of ['KeyS', 'ArrowDown']) {
    const game = createGame();
    const normalJump = createGame();
    game.startForInputTest();
    normalJump.startForInputTest();
    game.keyDown('Space');
    normalJump.keyDown('Space');
    for (let frame = 0; frame < 20; frame++) { game.tick(.016); normalJump.tick(.016); }
    game.keyDown('Space');
    normalJump.keyDown('Space');
    assert.equal(game.playerState().jumps, 2);
    for (let frame = 0; frame < 20; frame++) { game.tick(.016); normalJump.tick(.016); }
    const airY = game.playerState().feetY;
    assert.ok(airY < 100, 'the dive is tested from a high double jump');
    game.keyDown(downCode);
    assert.equal(game.playerState().feetY, airY, 'input does not move the character instantly');
    assert.equal(game.playerState().vy, 0);
    assert.equal(game.playerState().diving, true);
    assert.equal(game.playerState().grounded, false);
    assert.equal(game.playerState().crouch, false);
    game.tick(.016);
    normalJump.tick(.016);
    assert.equal(game.worldPosition(), normalJump.worldPosition(), 'horizontal speed is unchanged');
    assert.ok(game.playerState().feetY > airY && game.playerState().feetY < 320);
    assert.ok(game.playerState().vy > 0);
    let previousY = game.playerState().feetY;
    for (let frame = 0; frame < 120 && !game.playerState().grounded; frame++) {
      game.tick(.016);
      assert.ok(game.playerState().feetY >= previousY, 'descent progresses continuously');
      assert.ok(game.playerState().vy <= 1200, 'vertical speed stays bounded between frames');
      assert.equal(game.playerState().crouch, game.playerState().grounded);
      previousY = game.playerState().feetY;
    }
    assert.equal(game.playerState().grounded, true);
    assert.equal(game.playerState().feetY, 320);
    assert.equal(game.playerState().jumps, 0);
    assert.equal(game.playerState().diving, false);
    assert.equal(game.playerState().crouch, true);
    game.keyUp(downCode);
    assert.equal(game.playerState().crouch, false);
  }
});

test('pressing crouch over a cliff dives without creating ground in the gap', () => {
  const game = createGame();
  game.startForInputTest();
  game.keyDown('Space');
  game.setObstacles([{ kind: 'gap', x: 120, width: 180 }]);
  game.player(200, 250, false);
  game.keyDown('ArrowDown');
  assert.equal(game.playerState().grounded, false);
  assert.equal(game.playerState().feetY, 250);
  assert.equal(game.playerState().crouch, false);
  assert.equal(game.playerState().diving, true);
  game.tick(.016);
  assert.ok(game.playerState().feetY > 250);
  assert.equal(game.playerState().grounded, false);
  for (let frame = 0; frame < 20 && game.playerState().feetY <= 325; frame++) game.tick(.016);
  const belowLedgeY = game.playerState().feetY;
  assert.ok(belowLedgeY > 325);
  game.keyDown('Space');
  assert.equal(game.playerState().feetY, belowLedgeY,
    'a second jump after diving below a ledge does not snap the player upward');
  assert.equal(game.playerState().diving, false);
});

test('releasing crouch during the dive keeps the descent but lands upright', () => {
  const game = createGame();
  game.startForInputTest();
  game.keyDown('Space');
  game.tick(.016);
  game.keyDown('KeyS');
  game.keyUp('KeyS');
  assert.equal(game.playerState().diving, true);
  for (let frame = 0; frame < 120 && !game.playerState().grounded; frame++) game.tick(.016);
  assert.equal(game.playerState().grounded, true);
  assert.equal(game.playerState().crouch, false);
});

test('both crouch keys are tracked independently', () => {
  const game = createGame();
  game.startForInputTest();
  game.keyDown('KeyS');
  game.keyDown('ArrowDown');
  game.keyUp('KeyS');
  assert.equal(game.playerState().crouch, true);
  game.keyUp('ArrowDown');
  assert.equal(game.playerState().crouch, false);
  game.keyDown('KeyS');
  game.blur();
  assert.equal(game.playerState().crouch, false);
});

test('pressing the other crouch key cannot rearm a held crouch input after jumping', () => {
  const game = createGame();
  game.startForInputTest();
  game.keyDown('KeyS');
  game.keyDown('Space');
  for (let frame = 0; frame < 120 && !game.playerState().grounded; frame++) game.tick(.016);
  assert.equal(game.playerState().grounded, true);
  game.keyDown('ArrowDown');
  assert.equal(game.playerState().crouch, false);
  game.keyUp('KeyS');
  game.keyDown('KeyS');
  assert.equal(game.playerState().crouch, false);
  game.keyUp('ArrowDown');
  game.keyUp('KeyS');
  game.keyDown('ArrowDown');
  assert.equal(game.playerState().crouch, true);
});

test('ground shadow is limited to the actual ledges around a cliff', () => {
  const game = createGame();
  const shadow = () => JSON.parse(JSON.stringify(game.solidGroundSegments(146, 224)));
  game.player(185, 230, false);
  game.setObstacles([{ kind: 'gap', x: 205, width: 100 }]);
  assert.deepEqual(shadow(), [[146, 205]], 'the takeoff shadow stops at the near edge');
  game.setObstacles([{ kind: 'gap', x: 120, width: 120 }]);
  assert.deepEqual(shadow(), [], 'there is no shadow above the gap');
  game.setObstacles([{ kind: 'gap', x: 100, width: 65 }]);
  assert.deepEqual(shadow(), [[165, 224]], 'the landing shadow begins at the far edge');
  game.setObstacles([{ kind: 'gap', x: 100, width: 65 }, { kind: 'gap', x: 205, width: 90 }]);
  assert.deepEqual(shadow(), [[165, 205]], 'only the ground between two cliffs receives shadow');
});

test('speed reaches 2x at 1000m, 3x at 10000m and 3.2x at 12000m', () => {
  const game = createGame();
  assert.equal(game.speedAt(0), 350);
  assert.equal(game.speedAt(5000), 525);
  assert.equal(game.speedAt(10000), 700);
  assert.ok(game.speedAt(20000) > 700);
  assert.ok(game.speedAt(60000) < 1050);
  assert.equal(game.speedAt(100000), 1050);
  assert.equal(game.speedAt(110000), 1085);
  assert.equal(game.speedAt(120000), 1120);
  assert.equal(game.speedAt(300000), 1120);
  assert.equal(game.speedAt(1100000), 1120);
});

test('balance: moving birds continuously follow the player multiplier including extreme', () => {
  const game = createGame(() => .5);
  game.startForInputTest();
  const bird = game.makeObstacle('movingLow', 700, 68);
  assert.equal(bird.baseFlightSpeed, 110);
  for (const [x, expected] of [[0,110], [10000,220], [100000,330], [110000,341], [120000,352], [300000,352]]) {
    game.player(x,320,false); bird.x = x + 700; game.setObstacles([bird]); game.tick(0);
    assert.ok(Math.abs(bird.flightSpeed - expected) < 1e-9);
    assert.equal(game.movingBirdSpeed(bird), bird.flightSpeed);
  }
  game.setExtreme(true); game.player(0,320,false); bird.x = 700; game.setObstacles([bird]); game.tick(0);
  assert.equal(bird.flightSpeed, 396);
});

test('balance: normal scene branch frequencies match conditional 8+2p, 5, 5 percent', () => {
  let rng = 27092026;
  const game = createGame(() => ((rng = (Math.imul(rng,1664525) + 1013904223) >>> 0) / 2 ** 32));
  const counts = { pillar:0, rhythm:0, cliff:0, single:0 };
  const n = 20000, x = 1100000, a = .08 + .02 * game.latePressure(x);
  for (let i = 0; i < n; i++) {
    game.setObstacles([]); game.next(x); game.spawnObstacleGroup();
    const items = game.obstacles();
    if (items.some((o) => o.kind === 'skyPillar')) counts.pillar++;
    else if (items.some((o) => o.short)) counts.cliff++;
    else if (items.length === 3) counts.rhythm++;
    else counts.single++;
  }
  for (const [key, expected] of Object.entries({ pillar:a, rhythm:(1-a)*.05, cliff:(1-a)*.95*.05, single:(1-a)*.95**2 })) {
    assert.ok(Math.abs(counts[key] / n - expected) < .008, key);
  }
});

test('difficulty continues rising smoothly after 10000 meters while preserving a minimum gap', () => {
  const game = createGame();
  assert.equal(game.latePressure(100000), 0);
  assert.ok(game.latePressure(200000) > 0 && game.latePressure(200000) < game.latePressure(500000));
  assert.ok(game.latePressure(500000) < game.latePressure(1000000) && game.latePressure(1000000) < 1);
  const birdShare = (x) => Array.from({ length: 10000 }, (_, index) => game.obstacleKind(x, index / 10000))
    .filter((kind) => kind === 'movingLow' || kind === 'movingHigh').length;
  assert.equal(birdShare(100000), 1200);
  assert.ok(birdShare(1000000) > birdShare(500000));
  const spacing = (x) => {
    const track = createGame();
    track.next(x);
    track.spawnObstacle();
    const item = track.obstacles()[0];
    return (track.nextPosition() - item.x - item.width) / track.speedAt(item.x);
  };
  assert.ok(spacing(1000000) < spacing(100000));
  assert.ok(spacing(1000000) >= .82, 'long hazards retain enough landing time');
});

test('long thorns repeat the same short module with varied length, height and color', () => {
  const game = createGame();
  const kinds = Array.from({ length: 1000 }, (_, index) => game.obstacleKind(30000, index / 1000));
  const thorns = kinds.filter((kind) => kind === 'cactus' || kind === 'bramble').length;
  const birds = kinds.filter((kind) => ['duck', 'jump', 'movingLow', 'movingHigh', 'giantGround', 'giantHover'].includes(kind)).length;
  assert.equal(thorns, 360);
  assert.equal(kinds.filter((kind) => kind === 'tallThorn').length, 120);
  assert.equal(birds, 360);
  assert.equal(kinds.filter((kind) => kind === 'collapseGap').length, 90);
  const widths = [0, .5, 1].map((roll) => game.obstacleWidth('bramble', 3000, roll));
  assert.ok(widths[0] < widths[1] && widths[1] < widths[2]);
  assert.ok(widths[2] <= game.speedAt(3000) * .86 + 1);
  const shortWidths = [0, .6, .9].map((roll) => game.obstacleWidth('cactus', 3000, roll));
  assert.deepEqual(shortWidths, [42, 78, 114]);
  assert.deepEqual(shortWidths.map((width) => game.thornModules({ kind: 'cactus', width }).length), [1, 2, 3]);
  const variants = createGame([.07, .24, .43]);
  const samples = Array.from({ length: 3 }, () => variants.makeObstacle('bramble', 500, 300));
  assert.equal(new Set(samples.map((item) => item.palette)).size, 3);
  assert.ok(new Set(samples.map((item) => item.height)).size > 1);
  for (const bramble of samples) {
    assert.ok(bramble.height >= 34 && bramble.height <= 64);
    const short = { ...bramble, kind: 'cactus', width: 42 };
    const modules = JSON.parse(JSON.stringify(game.thornModules(bramble)));
    assert.equal(game.thornModules(short).length, 1);
    assert.ok(modules.length > 1);
    assert.equal(modules[0].x, 0);
    assert.equal(modules.at(-1).x + 42, bramble.width);
    for (let i = 1; i < modules.length; i++) {
      assert.ok(modules[i].x - modules[i - 1].x <= 36,
        'copies of the short thorn overlap into one continuous obstacle');
      assert.ok(Math.abs(modules[i].height - modules[i - 1].height) < 10,
        'neighboring copies keep a matching silhouette');
    }
    game.drawCactus(100, 320, short);
    game.drawBramble(100, 320, bramble);
  }
  assert.doesNotMatch(source, /\b(?:thornSpikes|drawLongThorns|hitThorns|brambleClumps)\b|kind === 'long'/,
    'neither the triangular ground-spike nor the separate bush model may remain');
});

test('generated advanced tracks include all thorn variants and collapsing cliffs', () => {
  let state = 123456789;
  const game = createGame(() => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  });
  game.next(20000);
  for (let i = 0; i < 1200; i++) game.spawnObstacle();
  const obstacles = game.obstacles();
  // Scene replacements now include tall thorns; count all three thorn variants.
  const thornShare = obstacles.filter((item) => ['cactus', 'bramble', 'tallThorn'].includes(item.kind)).length / obstacles.length;
  assert.ok(thornShare >= .42 && thornShare <= .58, `total thorn share is ${(thornShare * 100).toFixed(1)}%`);
  assert.ok(obstacles.some((item) => item.kind === 'tallThorn'));
  assert.ok(obstacles.some((item) => item.kind === 'movingLow'));
  assert.ok(obstacles.some((item) => item.kind === 'movingHigh'));
  assert.ok(obstacles.some((item) => item.kind === 'skyPillar'));
  assert.ok(obstacles.some((item) => item.kind === 'collapseGap'));
  assert.ok(obstacles.some((item) => item.kind === 'duck' && obstacles.some((previous) => previous.kind === 'cactus' && previous.x < item.x)));
  const thornHeights = obstacles.filter((item) => item.kind === 'cactus' || item.kind === 'bramble').map((item) => item.height);
  assert.ok(Math.max(...thornHeights) - Math.min(...thornHeights) >= 22, 'thorn silhouettes vary visibly in height');
  const cactusWidths = new Set(obstacles.filter((item) => item.kind === 'cactus').map((item) => item.width));
  assert.deepEqual([...cactusWidths].sort((a, b) => a - b), [42, 78, 114]);
  const clustered = obstacles.filter((item) => item.kind === 'cactus' && item.width > 42).length;
  const cactusCount = obstacles.filter((item) => item.kind === 'cactus').length;
  assert.ok(clustered / cactusCount >= .60,
    `two and three plant clusters are the majority (${(clustered / cactusCount * 100).toFixed(1)}%)`);
  for (const item of obstacles.filter((obstacle) => obstacle.kind === 'bramble')) {
    assert.ok(item.height >= 34 && item.height <= 64);
    const speed = game.speedAt(item.x);
    assert.ok(item.width >= speed * .54 - 1 && item.width <= speed * .86 + 1);
  }
  for (let i = 1; i < obstacles.length; i++) {
    const previous = obstacles[i - 1], current = obstacles[i];
    if (current.kind === 'skyPillar') {
      assert.equal(previous.kind, 'gap');
      assert.ok(current.x > previous.x && current.x + current.width < previous.x + previous.width);
      continue;
    }
    const previousEnd = previous.kind === 'skyPillar'
      ? obstacles[i - 2].x + obstacles[i - 2].width : previous.x + previous.width;
    const gapTime = (current.x - previousEnd) / game.speedAt(previous.x);
    assert.ok(gapTime <= 1.121, 'the wait to the next obstacle has a clear upper bound');
    const besideCliff = ['gap', 'collapseGap', 'skyPillar'].includes(previous.kind)
      || ['gap', 'collapseGap'].includes(current.kind);
    const spacingScale = besideCliff && current.x >= 100000 ? .8 : 1;
    assert.ok(gapTime >= .40 * spacingScale, 'cliff intervals apply the requested twenty-percent reduction');
    if (previous.kind !== 'bramble' || current.kind !== 'bramble') continue;
    const recoveryTime = (current.x - previous.x - previous.width) / game.speedAt(current.x);
    assert.ok(recoveryTime >= .8, 'consecutive vines leave time to land and jump again');
  }
});

test('one to three short thorns remain clearable with one jump at every speed tier', () => {
  const game = createGame();
  for (const speed of [350, 700, 1050]) {
    for (const width of [42, 78, 114]) {
      for (const height of [34, 64]) {
        const thorn = { kind: 'cactus', x: 500, width, height, palette: 0, seed: 2 };
        let possible = false;
        for (let lead = 50; lead <= 230 && !possible; lead += 5) {
          let collision = false;
          for (let t = 0; t <= 1; t += .006) {
            const jumpHeight = Math.max(0, 650 * t - 850 * t ** 2);
            game.player(thorn.x - lead + speed * t, 320 - jumpHeight, false);
            if (game.hit(thorn)) { collision = true; break; }
          }
          possible = !collision;
        }
        assert.equal(possible, true, `${width}px / ${height}px thorn clears at speed ${speed}`);
        game.drawCactus(100, 320, thorn);
      }
    }
  }
});

test('the tallest and longest vine remains clearable with two jumps at every speed tier', () => {
  const game = createGame();
  const apexTime = 650 / 1700;
  const apexHeight = 650 * apexTime - 850 * apexTime ** 2;
  for (const speed of [350, 700, 1050]) {
    const vine = { kind: 'bramble', x: 500, width: Math.round(speed * .86), height: 64, palette: 1, seed: 2 };
    let possible = false;
    for (let lead = 65; lead <= 185 && !possible; lead += 5) {
      let collision = false;
      for (let t = 0; t <= 1.4; t += .008) {
        const after = t - apexTime;
        const height = after <= 0
          ? 650 * t - 850 * t ** 2
          : apexHeight + 650 * after - 850 * after ** 2;
        game.player(vine.x - lead + speed * t, 320 - Math.max(0, height), false);
        if (game.hit(vine)) { collision = true; break; }
      }
      possible = !collision;
    }
    assert.equal(possible, true, `double jump should clear maximum vine at speed ${speed}`);
  }
});

test('bird posture rules match their drawn body positions', () => {
  const game = createGame();
  const duckBird = { kind: 'duck', x: 170, width: 68 };
  const jumpBird = { kind: 'jump', x: 170, width: 68 };
  const hoverGiant = { kind: 'giantHover', x: 170, width: 250 };
  const groundGiant = { kind: 'giantGround', x: 70, width: 400 };
  game.player(200, 320, false);
  assert.equal(game.hit(duckBird), true);
  assert.equal(game.hit(hoverGiant), true, 'the hovering wing is part of its fixed collision envelope');
  game.player(130, 320, false);
  assert.equal(game.hit(hoverGiant), false, 'empty space beyond the wing stays safe');
  game.player(220, 320, false);
  assert.equal(game.hit(hoverGiant), true);
  game.player(200, 320, true);
  assert.equal(game.hit(duckBird), false);
  game.player(220, 320, true);
  assert.equal(game.hit(hoverGiant), false);
  game.player(200, 320, true);
  assert.equal(game.hit(jumpBird), true);
  assert.equal(game.hit(groundGiant), true);
  game.player(200, 250, false);
  assert.equal(game.hit(jumpBird), false);
  game.drawGiantBird(100, 320, { ...groundGiant, seed: 0 });
  game.drawGiantBird(100, 320, { ...hoverGiant, seed: 0 });
});

test('hovering giant shares its original curved wings with collision geometry', () => {
  const game = createGame();
  const bird = { kind: 'giantHover', x: 170, width: 250, seed: 0 };
  game.startForInputTest();
  game.player(200, 320, false);
  assert.equal(game.hit(bird), true, 'the wing envelope catches an upright dinosaur');
  game.drawCalls.length = 0;
  game.drawGiantBird(100, 320, bird);
  const wingAtStart = game.drawCalls.find((call) => call.key === 'quadraticCurveTo'
    && call.args[0] === -bird.width * .35 && call.args[2] === -bird.width * .49);
  assert.ok(wingAtStart);
  assert.equal(game.drawCalls.some((call) => call.key === 'ellipse'
    && Math.abs(call.args[2] - 50) < .01 && call.args[3] === 32), false,
  'oversized oval wing is gone');
  game.next(Infinity);
  game.tick(.1);
  game.player(200, 320, false);
  assert.equal(game.hit(bird), true, 'the upright dinosaur still intersects the current wing and body');
  game.drawCalls.length = 0;
  game.drawGiantBird(100, 320, bird);
  const wingAfterFlap = game.drawCalls.find((call) => call.key === 'quadraticCurveTo'
    && call.args[0] === -bird.width * .35 && call.args[2] === -bird.width * .49);
  assert.ok(wingAfterFlap);
  assert.ok(Math.abs(wingAfterFlap.args[1] - wingAtStart.args[1]) > 4,
    'the original curved wing still moves between frames');
  game.player(200, 320, true);
  assert.equal(game.hit(bird), false, 'crouching remains safe under the swept wing');
});

test('both high-bird wings share the faster flap height used by collision', () => {
  for (const kind of ['duck', 'movingHigh']) {
    const game = createGame();
    const bird = { kind, x: 170, width: 68, seed: 0 };
    game.startForInputTest();
    game.player(200, 320, false);
    assert.equal(game.hit(bird), true);
    game.drawCalls.length = 0;
    game.drawBird(100, 320, bird);
    const nearWing = () => game.drawCalls.find((call) => call.key === 'quadraticCurveTo'
      && call.args[0] === -26 && call.args[2] === -14);
    const farWing = () => game.drawCalls.find((call) => call.key === 'quadraticCurveTo'
      && call.args[0] === -12 && call.args[2] === 0);
    const initial = nearWing();
    assert.ok(initial && farWing());
    assert.equal(initial.args[3], farWing().args[3], 'both wing tips reach the same height');
    game.next(Infinity);
    game.setElapsed(Math.PI / (2 * (kind === 'movingHigh' ? 32 : 24)));
    game.player(200, 320, false);
    assert.equal(game.hit(bird), true, 'the body still blocks an upright dinosaur');
    game.drawCalls.length = 0;
    game.drawBird(100, 320, bird);
    const raised = nearWing();
    assert.ok(raised && farWing());
    assert.equal(raised.args[3], farWing().args[3], 'wing symmetry holds while flapping');
    assert.ok(initial.args[3] - raised.args[3] > 20, 'wing reaches substantially higher');
    assert.ok(raised.args[3] <= -70, 'wing reaches the high collision area');
    game.player(200, 320, true);
    assert.equal(game.hit(bird), false);
  }
});

test('low moving bird uses green wing and tail colors', () => {
  const game = createGame();
  game.drawBird(100, 320, { kind: 'movingLow', x: 170, width: 68, seed: 0 });
  const fills = game.drawCalls.filter((call) => call.key === 'fillStyle').map((call) => call.value);
  assert.ok(fills.includes('#427d78'), 'the body stays green');
  assert.ok(fills.includes('#8ac0a9'), 'the near wing matches the green palette');
  assert.ok(fills.includes('#376c67'), 'the tail matches the green palette');
  assert.equal(fills.includes('#c09170'), false, 'the former brown wing is gone');
});

test('moving birds approach from both heights and retain the matching avoidance move', () => {
  const game = createGame();
  game.startForInputTest();
  const low = game.makeObstacle('movingLow', 500, 68);
  const high = game.makeObstacle('movingHigh', 510, 68);
  const distant = game.makeObstacle('movingHigh', 1100, 68);
  game.setObstacles([low, high, distant]);
  game.next(Infinity);
  assert.ok(low.baseFlightSpeed >= 100 && low.baseFlightSpeed <= 120);
  assert.equal(game.makeObstacle('movingLow', 100000, 68).baseFlightSpeed, 110);
  const originalLowX = low.x, originalHighX = high.x, originalDistantX = distant.x;
  game.tick(.05);
  assert.ok(low.x < originalLowX && high.x < originalHighX);
  assert.ok(originalLowX - low.x >= 5, 'bird motion scales with the player speed');
  assert.equal(distant.x, originalDistantX, 'movement starts only near the player');
  const lowAtPlayer = { ...low, x: 170 };
  const highAtPlayer = { ...high, x: 170 };
  game.player(200, 320, false);
  assert.equal(game.hit(lowAtPlayer), true);
  assert.equal(game.hit(highAtPlayer), true);
  game.player(200, 320, true);
  assert.equal(game.hit(highAtPlayer), false);
  game.player(200, 250, false);
  assert.equal(game.hit(lowAtPlayer), false);
  game.drawBird(100, 320, low);
  game.drawBird(100, 320, high);
});

test('moving birds begin flying just before their first visible frame', () => {
  const game = createGame();
  game.startForInputTest();
  game.player(1000, 320, false);
  game.next(Infinity);
  const near = game.makeObstacle('movingHigh', 1816, 68);
  const far = game.makeObstacle('movingLow', 1850, 68);
  game.setObstacles([near, far]);
  const before = near.x;
  const distantBefore = far.x;
  game.tick(.016);
  assert.ok(near.x < before, 'the bird is already moving as it enters view');
  assert.equal(far.x, distantBefore, 'an offscreen bird still beyond the lead waits');
  assert.ok(game.worldPosition() < before - 696, 'the bird was offscreen before the movement frame');
});

test('high birds leave visible gaps safe and collide with raised wings in both directions', () => {
  const game = createGame();
  for (const kind of ['duck', 'movingHigh']) {
    const bird = { kind, x: 0, width: 68, seed: 0 };
    const rate = kind === 'movingHigh' ? 32 : 24;
    game.player(kind === 'movingHigh' ? 14 : 0, 170, false);
    game.setElapsed(0);
    assert.equal(game.hit(bird), false, `${kind}: screenshot gap no longer triggers a phantom hit`);
    game.setElapsed(Math.PI / (2 * rate));
    assert.equal(game.hit(bird), true, `${kind}: the raised visible wing hits the feet`);
    const emptySideX = kind === 'movingHigh' ? 13 : 45;
    assert.equal(game.hitBoxes(bird, [{ left: emptySideX - 2, right: emptySideX + 2,
      top: 163, bottom: 168 }]), false, `${kind}: the empty corner beside the curved tip is safe`);
    game.setElapsed(3 * Math.PI / (2 * rate));
    assert.equal(game.hit(bird), false, `${kind}: lowering the wing clears its former collision area`);

    for (let phase = 0; phase < Math.PI * 2; phase += .15) {
      game.setElapsed(phase / rate);
      game.player(20, 320, false);
      assert.equal(game.hit(bird), true, `${kind} body blocks standing at every phase`);
      game.player(20, 320, true);
      assert.equal(game.hit(bird), false, `${kind} crouching remains safe at every phase`);
      const tipY = 244 - 47 - Math.sin(phase) * 37;
      assert.equal(game.hitBoxes(bird, [{ left: 0, right: 68, top: tipY - 12, bottom: tipY - 2 }]),
        false, `${kind}: space above the current wing remains safe`);
    }

    game.setElapsed(0);
    const wingX = 29 + (kind === 'movingHigh' ? 9 : -9);
    const wingY = 244 - 47 * .55;
    assert.equal(game.hitBoxes(bird, [{ left: wingX - 2, right: wingX + 2,
      top: wingY - 2, bottom: wingY + 2 }]), true, `${kind}: actual curved wing interior collides`);
  }
});

test('the warning appears 0.8 seconds before pillar or moving bird enters view', () => {
  const game = createGame();
  game.startForInputTest();
  game.next(Infinity);
  game.player(30000, 320, false);
  game.tick(0);
  const speed = game.runSpeedAt(30000);
  for (const kind of ['skyPillar', 'movingLow', 'movingHigh']) {
    const entry = kind === 'skyPillar' ? 821 : 696;
    const lead = kind === 'skyPillar' ? speed * .81
      : 120 + speed * (.81 - 120 / (speed + 330));
    const obstacle = { kind, x: 30000 + entry + lead, width: 68, flightSpeed: 330 };
    game.setObstacles([obstacle]);
    assert.equal(game.warningTarget(), null, `${kind} is too far away`);
    obstacle.x -= speed * .02;
    assert.equal(game.warningTarget(), obstacle, `${kind} triggers an offscreen warning`);
    assert.ok(game.timeUntilVisible(obstacle) < .8);
    obstacle.x = 30000 + entry;
    assert.equal(game.warningTarget(), null, `${kind} entering the view clears the warning`);
  }
  game.setObstacles([{ kind: 'duck', x: 30000 + 821 + speed, width: 68 }]);
  assert.equal(game.warningTarget(), null, 'stationary birds do not trigger this warning');
});

test('extreme mode fixes p=1 and 3.6x speed while sharing normal obstacle kinds', () => {
  let state = 32517683;
  const game = createGame(() => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  });
  game.startForInputTest();
  game.setExtreme(true);
  game.next(2600);
  game.tick(0);
  assert.equal(game.runSpeedAt(0), 1260);
  assert.equal(game.runPressure(0), 1);
  assert.equal(game.obstacleWidth('bramble', 2600, 1), Math.round(1260 * .86));
  for (let i = 0; i < 1400; i++) game.spawnObstacle();
  const obstacles = game.obstacles();
  const priority = obstacles.filter((o) => o.kind === 'skyPillar' || o.kind === 'collapseGap'
    || o.kind === 'movingLow' || o.kind === 'movingHigh');
  assert.ok(priority.length / obstacles.length < .5, 'old training weighting has been removed');
  assert.ok(obstacles.some((o) => o.kind === 'skyPillar'));
  assert.ok(obstacles.some((o) => o.kind === 'collapseGap'));
  assert.ok(obstacles.some((o) => o.kind === 'movingLow'));
  assert.ok(obstacles.some((o) => o.kind === 'movingHigh'));
  assert.equal(game.extremeMode(), true);
  game.setObstacles([{ kind: 'cactus', x: 180, width: 42, height: 50, seed: 1 }]);
  game.next(Infinity);
  game.player(200, 320, false);
  game.tick(.016);
  assert.equal(game.mode(), 'running', 'extreme uses unlimited rescues');
  assert.equal(game.rescueCount(), 1);
  game.setExtreme(false);
  assert.equal(game.runSpeedAt(0), 350);
});

test('the first 2000 meters contain only thorns, stationary small birds and ordinary cliffs', () => {
  let state = 246813579;
  const game = createGame(() => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  });
  game.next(780);
  for (let i = 0; i < 70; i++) game.spawnObstacle();
  const warmup = game.obstacles().filter((obstacle) => obstacle.x < 20000);
  assert.ok(warmup.some((obstacle) => obstacle.kind === 'gap'));
  assert.ok(warmup.some((obstacle) => obstacle.kind === 'duck' || obstacle.kind === 'jump'));
  assert.ok(warmup.every((obstacle) => ['cactus', 'bramble', 'gap', 'duck', 'jump'].includes(obstacle.kind)));
  assert.ok(warmup.filter((obstacle) => obstacle.kind === 'gap').every((obstacle) => !obstacle.short && !obstacle.pillarScene));
});

test('a collapsing cliff looks and supports like ground until its reaction window', () => {
  const game = createGame();
  game.startForInputTest();
  const cliff = game.makeObstacle('collapseGap', 600, 301, { collapsed: false, collapseProgress: 0 });
  game.setObstacles([cliff]);
  game.next(Infinity);
  game.player(480, 320, false);
  assert.equal(game.hasGroundSupport(650), true);
  assert.deepEqual(JSON.parse(JSON.stringify(game.solidGroundSegments(300, 900))), [[300, 900]]);
  game.tick(.01);
  assert.equal(cliff.collapsed, false);
  game.tick(.04);
  assert.equal(cliff.collapsed, true);
  assert.ok(cliff.collapseProgress > 0 && cliff.collapseProgress < 1);
  assert.equal(game.hasGroundSupport(650), false);
  const edge = 185 + cliff.x - game.worldPosition();
  assert.deepEqual(JSON.parse(JSON.stringify(game.solidGroundSegments(0, 1000))),
    [[0, edge], [edge + cliff.width, 1000]]);
  game.tick(.1);
  assert.ok(cliff.collapseProgress > .5 && cliff.collapseProgress < 1);
  game.tick(.1);
  assert.equal(cliff.collapseProgress, 1);
});

test('a collapsing cliff leaves enough warning to double jump across each speed tier', () => {
  for (const gapX of [30000, 60000, 120000]) {
    const game = createGame();
    game.startForInputTest();
    const speed = game.speedAt(gapX);
    const cliff = game.makeObstacle('collapseGap', gapX, game.obstacleWidth('collapseGap', gapX),
      { collapsed: false, collapseProgress: 0 });
    game.setObstacles([cliff]);
    game.next(Infinity);
    game.player(gapX - speed * .34, 320, false);
    game.tick(.05);
    assert.equal(cliff.collapsed, true);
    let firstJump = false, secondJump = false;
    for (let frame = 0; frame < 550 && game.mode() === 'running'; frame++) {
      const x = game.worldPosition();
      if (!firstJump && x >= gapX - speed * .25) { game.keyDown('Space'); firstJump = true; }
      if (firstJump && !secondJump && x >= gapX + speed * .12) { game.keyDown('Space'); secondJump = true; }
      game.tick(.004);
      if (game.worldPosition() > gapX + cliff.width + speed * .45) break;
    }
    assert.equal(game.mode(), 'running');
    assert.equal(game.playerState().grounded, true);
    assert.ok(firstJump && secondJump);
  }
});

test('the sky pillar leaves room for a low single jump underneath', () => {
  const game = createGame();
  game.startForInputTest();
  game.next(30000);
  game.spawnGapPillarScene();
  const [gap, pillar] = game.obstacles();
  assert.equal(gap.pillarScene, true);
  assert.equal(pillar.kind, 'skyPillar');
  assert.ok(pillar.x > gap.x && pillar.x + pillar.width < gap.x + gap.width);
  game.player(pillar.x + pillar.width / 2, 250, false);
  assert.equal(game.hit(pillar), true, 'even a high jump hits the full-height pillar');
  game.player(pillar.x + pillar.width / 2, 335, false);
  assert.equal(game.hit(pillar), true, 'the head still touches the raised pillar');
  game.player(pillar.x + pillar.width / 2, 337, false);
  assert.equal(game.hit(pillar), false, 'the dinosaur clears the raised lower edge');
  game.drawSkyPillar(300, pillar);
  assert.doesNotMatch(source, /cliffBird|spawnGapBirdScene|birdScene/,
    'the former hovering bird scene is fully removed');
});

test('extreme rescues: every lethal hazard triggers progressive clearing and one three-second buffer', () => {
  for (const cause of ['thorn', 'fall', 'pillar']) {
    const game = createGame(() => 0);
    game.setExtreme(true); game.startForInputTest();
    const x = 300000;
    game.player(x, cause === 'fall' ? 512 : cause === 'pillar' ? 260 : 320, false);
    game.setPlayerState({ grounded: cause === 'thorn', vy: 0 });
    const lethal = cause === 'thorn' ? { kind: 'cactus', x, width: 42, height: 50, seed: 0 }
      : cause === 'fall' ? { kind: 'gap', x: x - 100, width: 200 }
        : { kind: 'skyPillar', x, width: 28 };
    game.setObstacles([lethal,
      { kind: 'duck', x: x + 280, width: 68, seed: 0 },
      { kind: 'gap', x: x + 500, width: 80 },
      { kind: 'skyPillar', x: x + 780, width: 28 }
    ]);
    game.tick(.016);
    const blastAt = game.shieldBreakAt();
    assert.equal(game.rescueCount(), 1, cause);
    assert.equal(game.blastColorful(), false);
    assert.ok(Math.abs(game.shieldBufferUntil() - blastAt - 3) < 1e-9);
    assert.ok(Math.abs(game.shieldWarningSpawnAfter() - blastAt - 3.8) < 1e-9);
    assert.equal(game.obstacles().some(o => o.x === x + 780), true, 'distant pillar waits for the blast wave');
    assert.ok(game.worldPosition() < x + 25, 'no teleport across the track');
    for (let i = 0; i < 24; i++) game.tick(.032);
    assert.equal(game.obstacles().length, 0, 'all visible hazards are shattered, including cliffs and pillars');
    while (game.elapsed() < blastAt + 2.95) game.tick(.016);
    assert.equal(game.obstacles().length, 0, 'no new hazards during the buffer');
    assert.equal(game.mode(), 'running');
    assert.equal(game.rescueCount(), 1, 'no repeat death during the explosion or buffer');
    game.setElapsed(blastAt + 3.01); game.tick(0);
    assert.ok(game.obstacles().length > 0, 'ordinary hazards resume');
    assert.ok(game.obstacles().every(o => o.x > game.worldPosition() + 815), 'spawn outside the viewport');
    assert.ok(game.obstacles().every(o => !['skyPillar', 'movingLow', 'movingHigh'].includes(o.kind)));
    game.setElapsed(blastAt + 3.79); game.next(game.worldPosition() + 100); game.tick(0);
    assert.ok(game.obstacles().every(o => !['skyPillar', 'movingLow', 'movingHigh'].includes(o.kind)));
    game.setElapsed(blastAt + 3.81); game.next(game.worldPosition() + 100); game.tick(0);
    const pillar = game.obstacles().find(o => o.kind === 'skyPillar');
    assert.ok(pillar, 'warning hazards resume after 3.8 seconds');
    assert.ok(game.timeUntilVisible(pillar) > .8, 'full warning lead is preserved');
  }
});

test('dropping one body below the pillar then jumping once reaches the far ledge', () => {
  for (const gapX of [20000, 100000, 300000, 1000000]) {
    const game = createGame();
    game.startForInputTest();
    game.next(gapX);
    game.spawnGapPillarScene();
    const [gap, pillar] = game.obstacles();
    game.next(Infinity);
    const speed = game.speedAt(gapX);
    game.player(gap.x - speed * .2, 320, false);
    let jumped = false, lowestClearance = Infinity, headAtJump = Infinity;
    for (let frame = 0; frame < 800 && game.mode() === 'running'; frame++) {
      const x = game.worldPosition();
      if (!jumped && x >= gap.x + speed * .35) {
        assert.equal(game.playerState().grounded, false);
        headAtJump = game.playerBoxes()[2].top;
        game.keyDown('Space'); jumped = true;
      }
      game.tick(.004);
      if (game.worldPosition() + 49 > pillar.x + 2 && game.worldPosition() - 35 < pillar.x + pillar.width - 2) {
        lowestClearance = Math.min(lowestClearance, game.playerBoxes()[2].top);
      }
      if (game.worldPosition() > gap.x + gap.width + speed * .4) break;
    }
    assert.equal(game.mode(), 'running', `pillar crossing at ${gapX}`);
    assert.equal(game.playerState().grounded, true);
    assert.equal(jumped, true);
    assert.ok(headAtJump - 268 >= 68, 'jump starts at least one body height below the pillar');
    assert.ok(lowestClearance >= 268, 'the dinosaur stays below the entire pillar');
  }
});

test('the pillar scene can lead directly into a clearable double-jump bramble', () => {
  for (const gapX of [20000, 100000, 1000000]) {
    const game = createGame([.5, .5, 0, .5]);
    game.startForInputTest();
    game.next(gapX);
    game.spawnGapPillarScene();
    const [gap, pillar, bramble] = game.obstacles();
    assert.equal(pillar.kind, 'skyPillar');
    assert.equal(bramble.kind, 'bramble');
    game.next(Infinity);
    const speed = game.speedAt(gapX);
    game.player(gap.x - speed * .2, 320, false);
    const jumped = [false, false, false, false];
    for (let frame = 0; frame < 1300 && game.mode() === 'running'; frame++) {
      const x = game.worldPosition();
      if (!jumped[0] && x >= gap.x + speed * .42) { game.keyDown('Space'); jumped[0] = true; }
      if (jumped[0] && !jumped[1] && x >= gap.x + speed * .60) { game.keyDown('Space'); jumped[1] = true; }
      if (!jumped[2] && x >= bramble.x - speed * .13) {
        assert.equal(game.playerState().grounded, true, 'the far ledge resets both jumps');
        game.keyDown('Space'); jumped[2] = true;
      }
      if (jumped[2] && !jumped[3] && x >= bramble.x + speed * .14) {
        game.keyDown('Space'); jumped[3] = true;
      }
      game.tick(.004);
      if (game.worldPosition() > bramble.x + bramble.width + speed * .8) break;
    }
    assert.equal(game.mode(), 'running', `pillar plus bramble at ${gapX}`);
    assert.equal(game.playerState().grounded, true);
    assert.ok(jumped.every(Boolean));
  }
});

test('jump-crouch-jump rhythm remains clearable as its intervals tighten', () => {
  for (const x of [20000, 100000, 300000, 1000000]) {
    const game = createGame();
    game.startForInputTest();
    game.next(x);
    game.spawnRhythmScene();
    const [first, bird, last] = game.obstacles();
    game.next(Infinity);
    const speed = game.speedAt(x);
    game.player(first.x - speed * .25, 320, false);
    let jumpedFirst = false, crouched = false, released = false, jumpedLast = false;
    for (let frame = 0; frame < 1000 && game.mode() === 'running'; frame++) {
      const position = game.worldPosition();
      if (!jumpedFirst && position >= first.x - speed * .15) { game.keyDown('Space'); jumpedFirst = true; }
      if (!crouched && position >= bird.x - speed * .15) {
        assert.equal(game.playerState().grounded, true);
        game.keyDown('ArrowDown'); crouched = true;
      }
      if (crouched && !released && position >= bird.x + bird.width + 50) {
        game.keyUp('ArrowDown'); released = true;
      }
      if (released && !jumpedLast && position >= last.x - speed * .12) {
        game.keyDown('Space'); jumpedLast = true;
      }
      game.tick(.004);
      if (game.worldPosition() > last.x + last.width + speed * .8) break;
    }
    assert.equal(game.mode(), 'running');
    assert.equal(game.playerState().grounded, true);
    assert.ok(jumpedFirst && crouched && released && jumpedLast);
  }
});

test('cactus and brambles allow a visible clearance', () => {
  const game = createGame();
  const cactus = { kind: 'cactus', x: 195, width: 42 };
  const thorns = { kind: 'bramble', x: 180, width: 300, height: 50, palette: 0, seed: 1 };
  game.player(200, 320, false);
  assert.equal(game.hit(cactus), true);
  assert.equal(game.hit(thorns), true);
  game.player(200, 255, false);
  assert.equal(game.hit(cactus), false);
  assert.equal(game.hit(thorns), false);
});

test('cliff scene can place ground hazards close to a single-jump gap', () => {
  const game = createGame([.5, .2, .5, .5, .55, .6, .5, .5]);
  game.next(2900);
  game.spawnCliffScene();
  const [first, gap, last] = game.obstacles();
  assert.equal(first.kind, 'cactus');
  assert.equal(gap.kind, 'gap');
  assert.equal(gap.short, true);
  assert.equal(last.kind, 'bramble');
  assert.equal(last.width, Math.round(game.speedAt(last.x) * (.54 + .6 * .32)));
  assert.ok(gap.x > first.x + first.width);
  assert.ok(last.x > gap.x + gap.width);
  assert.ok(gap.x - first.x - first.width < game.speedAt(gap.x) * .55);
  assert.ok(last.x - gap.x - gap.width < game.speedAt(last.x) * .50);
  assert.ok(gap.width < game.speedAt(gap.x) * (2 * 650 / 1700));
  assert.equal(game.hasGroundSupport(gap.x + 5), true, 'the rear foot remains on the near ledge');
  assert.equal(game.hasGroundSupport(gap.x + gap.width / 2), false);
  assert.equal(game.hasGroundSupport(gap.x + gap.width - 10), true, 'the front foot reaches the far ledge');
  assert.equal(game.cliffNeighborKind('before', 2900, .7), 'duck');
  assert.equal(game.cliffNeighborKind('after', 2900, .9), 'jump');
});

test('a dinosaur still visible below a cliff can double jump back to the far ledge', () => {
  const game = createGame();
  game.startForInputTest();
  const gap = { kind: 'gap', x: 100, width: 360 };
  game.setObstacles([gap]);
  game.player(200, 480, false);
  game.setPlayerState({ grounded: false, jumps: 0, vy: 0 });
  game.tick(.004);
  assert.equal(game.mode(), 'running', 'feet below the screen do not end the run while the head remains visible');
  game.keyDown('Space');
  for (let frame = 0; frame < 70; frame++) game.tick(.004);
  game.keyDown('Space');
  for (let frame = 0; frame < 300 && game.worldPosition() < gap.x + gap.width + 90; frame++) {
    game.tick(.004);
    if (game.mode() !== 'running') break;
  }
  assert.equal(game.mode(), 'running');
  assert.ok(game.worldPosition() > gap.x + gap.width);
  assert.equal(game.playerState().grounded, true);
});

test('touching the far cliff wall or leaving the screen ends the run without using a shield', () => {
  const gap = { kind: 'gap', x: 100, width: 360 };
  const wall = createGame();
  wall.startForInputTest();
  wall.setShieldReady(true);
  wall.setObstacles([gap]);
  wall.player(gap.x + gap.width - 15, 350, false);
  wall.setPlayerState({ grounded: false, vy: 0 });
  wall.tick(.004);
  assert.equal(wall.mode(), 'over');
  assert.equal(wall.shieldReady(), true);

  const drop = createGame();
  drop.startForInputTest();
  drop.setObstacles([gap]);
  drop.player(200, 509, false);
  drop.setPlayerState({ grounded: false, vy: 0 });
  drop.tick(.001);
  assert.equal(drop.mode(), 'running');
  drop.player(200, 510, false);
  drop.tick(.001);
  assert.equal(drop.mode(), 'over');

  const collapse = createGame();
  const sinkingGap = { kind: 'collapseGap', x: 100, width: 360, collapsed: false };
  collapse.setObstacles([sinkingGap]);
  collapse.player(450, 350, false);
  assert.equal(collapse.hitRightCliffWall(collapse.playerBoxes()), false);
  sinkingGap.collapsed = true;
  assert.equal(collapse.hitRightCliffWall(collapse.playerBoxes()), true);
});

test('mixed cliff scenes remain passable across the speed curve', () => {
  const apexTime = 650 / 1700;
  const apexHeight = 650 * apexTime - 850 * apexTime ** 2;
  const heightAt = (time, doubleJump) => {
    if (time < 0) return 0;
    if (!doubleJump || time < apexTime) return Math.max(0, 650 * time - 850 * time ** 2);
    const after = time - apexTime;
    return Math.max(0, apexHeight + 650 * after - 850 * after ** 2);
  };
  for (const start of [1800, 2900, 10000, 100000]) {
    for (const beforeRoll of [.2, .7, .84, .98]) {
      for (const afterRoll of [.2, .55, .8, .9, .98]) {
        const game = createGame([.5, beforeRoll, .5, .5, afterRoll, .5, .5]);
        game.next(start);
        game.spawnCliffScene();
        const [first, gap, last] = game.obstacles();
        const speed = game.speedAt(first.x);
        const firstDouble = first.kind === 'cactus' || first.kind === 'jump';
        const firstTakeoff = firstDouble ? first.x - (90 + Math.max(0, speed - 400) * 20 / 650) : gap.x - 70;
        const firstFlight = firstDouble
          ? apexTime + (650 + Math.sqrt(650 ** 2 + 2 * 1700 * apexHeight)) / 1700
          : 2 * 650 / 1700;
        const firstLanding = firstTakeoff + speed * firstFlight;
        const lastJump = ['cactus', 'jump', 'bramble'].includes(last.kind);
        const secondTakeoff = lastJump ? last.x - (last.kind === 'bramble' ? 90 : 125) : Infinity;
        assert.ok(firstLanding < secondTakeoff, `recovery before ${last.kind} near ${start}`);
        for (let x = Math.min(first.x, firstTakeoff) - 20; x < last.x + last.width + 90; x += 4) {
          const afterSecond = x >= secondTakeoff;
          const height = afterSecond
            ? heightAt((x - secondTakeoff) / speed, last.kind === 'bramble')
            : heightAt((x - firstTakeoff) / speed, firstDouble);
          const crouch = (!firstDouble && x < firstTakeoff) || (!lastJump && x >= firstLanding);
          game.player(x, 320 - height, crouch);
          const label = `${first.kind}/${last.kind} at ${Math.round(x)} near ${start}`;
          assert.ok(height > 0 || game.hasGroundSupport(x), `ground support ${label}`);
          assert.equal(game.hit(first) || game.hit(last), false, `scene collision ${label}`);
        }
      }
    }
  }
});

test('ground giant is passable with two jumps but not one', () => {
  const game = createGame();
  const speed = 500;
  const obstacle = { kind: 'giantGround', x: 500, width: Math.round(speed * .80) };
  const apexTime = 650 / 1700;
  const apexHeight = 650 * apexTime - 850 * apexTime ** 2;
  const canPass = (doubleJump) => {
    for (let lead = 60; lead <= 300; lead += 5) {
      let hit = false;
      for (let t = 0; t <= 2.2; t += .008) {
        const secondTime = t - apexTime;
        const height = doubleJump && secondTime > 0
          ? apexHeight + 650 * secondTime - 850 * secondTime ** 2
          : 650 * t - 850 * t ** 2;
        game.player(obstacle.x - lead + speed * t, 320 - Math.max(0, height), false);
        if (game.hit(obstacle)) { hit = true; break; }
      }
      if (!hit) return true;
    }
    return false;
  };
  assert.equal(canPass(false), false);
  assert.equal(canPass(true), true);
});

test('after a normal failure Space cannot restart, while Enter or the start button can', () => {
  const game = createGame();
  game.startForInputTest();
  game.endGame();
  assert.equal(game.mode(), 'over');
  assert.equal(game.keyDown('Space').defaultPrevented, true);
  assert.equal(game.mode(), 'over');
  game.focus('start-button');
  assert.equal(game.keyDown('Space').defaultPrevented, true);
  assert.equal(game.mode(), 'over');
  game.focus('INPUT');
  assert.equal(game.keyDown('Space').defaultPrevented, false, 'profile text remains editable');
  game.focus('BODY');
  assert.equal(game.keyDown('Enter').defaultPrevented, true);
  assert.equal(game.mode(), 'running');
  assert.equal(game.playerState().jumps, 0, 'Enter starts on the ground without jumping');
  game.endGame();
  game.focus('BUTTON');
  assert.equal(game.keyDown('Enter').defaultPrevented, true);
  assert.equal(game.mode(), 'running', 'Enter also works if a button retained focus');
  game.endGame();
  game.startGame();
  assert.equal(game.mode(), 'running', 'the visible start button can still restart');
});

test('the stationary high bird uses the same brown family as the low bird', () => {
  const game = createGame();
  game.drawBird(100, 320, { kind: 'duck', width: 68, seed: 0 });
  const highColors = game.drawCalls.filter((call) => call.key === 'fillStyle').map((call) => call.value);
  assert.ok(highColors.includes('#9b715e'));
  assert.ok(highColors.includes('#b18062'));
  assert.ok(highColors.includes('#6f4b3f'));
  assert.equal(highColors.includes('#5c547b'), false);
  game.drawCalls.length = 0;
  game.drawBird(100, 320, { kind: 'jump', width: 68, seed: 0 });
  assert.ok(game.drawCalls.some((call) => call.key === 'fillStyle' && call.value === '#9b715e'));
  game.drawCalls.length = 0;
  game.drawBird(100, 320, { kind: 'movingHigh', width: 68, seed: 0 });
  assert.ok(game.drawCalls.some((call) => call.key === 'fillStyle' && call.value === '#427d78'));
});

test('shield pickups occupy high-bird, cliff and long-thorn risk positions', () => {
  const game = createGame(() => 0);
  game.setPowerupDistance(2000);
  game.addObstacles(
    { kind: 'duck', x: 1000, width: 68 },
    { kind: 'gap', x: 5000, width: 500 },
    { kind: 'bramble', x: 9000, width: 800, height: 64 },
    { kind: 'gap', x: 13000, width: 767, pillarScene: true }
  );
  const pickups = game.shieldPickups();
  assert.equal(pickups.length, 3);
  assert.equal(pickups[0].x, 1029);
  assert.equal(pickups[0].y, 113);
  assert.equal(pickups[1].x, 5250);
  assert.equal(pickups[1].y, 326);
  assert.equal(pickups[2].x, 9400);
  assert.equal(pickups[2].y, 198);
  const noDrop = createGame(() => .5);
  noDrop.addObstacles({ kind: 'duck', x: 1000, width: 68 });
  assert.equal(noDrop.shieldPickups().length, 0);
  const groundRunner = createGame();
  groundRunner.startForInputTest();
  groundRunner.player(9400, 320, false);
  groundRunner.setShieldPickups([{ x: 9400, y: 222 }]);
  groundRunner.tick(.016);
  assert.equal(groundRunner.shieldReady(), false, 'the long-thorn pickup requires a jump');
});

test('shield drops cover other hazards with scene-specific chances and 1800px spacing', () => {
  const kinds = ['jump', 'cactus', 'bramble', 'collapseGap', 'giantGround',
    'giantHover', 'movingLow', 'movingHigh'];
  const hazards = kinds.map((kind, index) => ({
    kind, x: 1000 + index * 4000, width: kind === 'collapseGap' ? 500 : 68,
    height: 64, flightSpeed: 330, collapsed: false
  }));
  const game = createGame(() => 0);
  game.setPowerupDistance(2000);
  game.addObstacles(...hazards,
    { kind: 'skyPillar', x: 35000, width: 28 },
    { kind: 'gap', x: 39000, width: 700, pillarScene: true });
  assert.equal(game.shieldPickups().length, kinds.length);
  for (const pickup of game.shieldPickups()) {
    assert.ok(hazards.includes(pickup.source), 'each drop belongs to an obstacle');
    assert.ok(pickup.x >= pickup.source.x && pickup.x <= pickup.source.x + pickup.source.width);
  }
  for (const [kind, height, chance] of [
    ['duck', 0, .02], ['gap', 0, .02], ['bramble', 64, .02],
    ['cactus', 46, .01], ['bramble', 46, .01], ['movingHigh', 0, .01]
  ]) {
    const obstacle = { kind, x: 1000, width: 68, height };
    const succeeds = createGame(() => chance - .001);
  succeeds.setPowerupDistance(2000);
    succeeds.addObstacles(obstacle);
    assert.equal(succeeds.shieldPickups().length, 1, `${kind} should drop below ${chance}`);
    const fails = createGame(() => chance);
  fails.setPowerupDistance(2000);
    fails.addObstacles(obstacle);
    assert.equal(fails.shieldPickups().length, 0, `${kind} should not drop at ${chance}`);
  }
  const spaced = createGame(() => 0);
  spaced.setPowerupDistance(2000);
  spaced.addObstacles(
    { kind: 'cactus', x: 1000, width: 42, height: 46 },
    { kind: 'cactus', x: 2000, width: 42, height: 46 },
    { kind: 'cactus', x: 2800, width: 42, height: 46 }
  );
  assert.equal(spaced.shieldPickups().length, 2);
});

test('moving-bird drops follow the bird and collapse drops appear only after sinking', () => {
  const moving = createGame(() => 0);
  moving.startForInputTest(); moving.setPowerupDistance(2000);
  const bird = { kind: 'movingLow', x: 1000, width: 68, flightSpeed: 330 };
  moving.addObstacles(bird);
  moving.player(200, 320, false);
  moving.tick(.016);
  assert.ok(bird.x < 1000);
  assert.equal(moving.shieldPickups()[0].x, bird.x + 29);

  const collapse = createGame(() => 0); collapse.setPowerupDistance(2000);
  const gap = { kind: 'collapseGap', x: 500, width: 500, collapsed: false };
  collapse.addObstacles(gap);
  collapse.drawShieldPickups();
  assert.equal(collapse.drawCalls.some((call) => call.key === 'scale'), false);
  gap.collapsed = true;
  collapse.drawShieldPickups();
  assert.equal(collapse.drawCalls.some((call) => call.key === 'scale'), true);
});

test('larger pickup radius matches its icon and the shield fits around the dinosaur', () => {
  const game = createGame();
  game.setShieldPickups([{ x: 0, y: 240 }]);
  game.drawShieldPickups();
  const iconScale = game.drawCalls.find((call) => call.key === 'scale');
  assert.equal(iconScale.args[0], 19 / 14);
  game.drawCalls.length = 0;
  game.setShieldReady(true);
  game.drawDino();
  const standingCircle = game.drawCalls.find((call) => call.key === 'arc');
  assert.equal(standingCircle.args[2], 64);
  game.drawCalls.length = 0;
  game.player(0, 320, true);
  game.drawDino();
  const crouchedCircle = game.drawCalls.find((call) => call.key === 'arc');
  assert.equal(crouchedCircle.args[2], 64);
  assert.equal(crouchedCircle.args[1], standingCircle.args[1]);

  const touchingEdge = createGame();
  touchingEdge.startForInputTest();
  touchingEdge.setShieldPickups([{ x: 64, y: 260 }]);
  touchingEdge.tick(.001);
  assert.equal(touchingEdge.shieldReady(), true, 'the expanded icon edge can be collected');
});

test('collecting a shield removes pending pickups and prevents new drops while held', () => {
  const game = createGame(() => 0);
  game.setPowerupDistance(2000);
  game.startForInputTest();
  game.addObstacles(
    { kind: 'duck', x: 1000, width: 68 },
    { kind: 'cactus', x: 4000, width: 42, height: 46 }
  );
  assert.equal(game.shieldPickups().length, 2);
  game.setShieldPickups([...game.shieldPickups(), { x: 64, y: 260 }]);
  game.tick(.001);
  assert.equal(game.shieldReady(), true);
  assert.equal(game.shieldPickups().length, 0, 'future pickups disappear when the charge is collected');
  game.addObstacles({ kind: 'cactus', x: 9000, width: 42, height: 46 });
  assert.equal(game.shieldPickups().length, 0, 'no pickup is created while shielded');
});

test('breaking a shield plays a short ring-and-shard effect', () => {
  const game = createGame();
  game.startForInputTest();
  game.setShieldReady(true);
  game.setObstacles([{ kind: 'cactus', x: 0, width: 42, height: 46, seed: 0 }]);
  game.tick(.016);
  assert.equal(game.shieldBreakAt(), game.elapsed());
  game.drawCalls.length = 0;
  game.drawShieldBreak();
  assert.equal(game.drawCalls.filter((call) => call.key === 'arc').length, 1);
  assert.equal(game.drawCalls.filter((call) => call.key === 'fillStyle').length, 18);
  assert.equal(game.drawCalls.find((call) => call.key === 'arc').args[2], 56);
  assert.ok(game.shieldDebris().length > 0, 'the struck obstacle breaks into visible pieces');
  game.drawCalls.length = 0;
  game.drawShieldDebris();
  assert.ok(game.drawCalls.some((call) => call.key === 'fillStyle'));
  game.tick(.08);
  game.drawCalls.length = 0;
  game.drawShieldBreak();
  assert.ok(game.drawCalls.find((call) => call.key === 'arc').args[2] > 250,
    'shield fragments race away from the impact');
  game.setElapsed(game.shieldBreakAt() + .65);
  game.drawCalls.length = 0;
  game.drawShieldBreak();
  assert.equal(game.drawCalls.length, 0, 'the effect expires after 0.65 seconds');
});

test('the blast reaches visible obstacles in sequence and fills a cliff on impact', () => {
  const game = createGame();
  game.startForInputTest();
  game.setShieldReady(true);
  game.setObstacles([
    { kind: 'cactus', x: 0, width: 42, height: 46, seed: 0 },
    { kind: 'duck', x: 280, width: 68, seed: 0 },
    { kind: 'bramble', x: 470, width: 120, height: 52, seed: 0 },
    { kind: 'gap', x: 680, width: 80 },
    { kind: 'skyPillar', x: 780, width: 28 }
  ]);
  game.tick(.016);
  assert.deepEqual(Array.from(game.obstacles(), (obstacle) => obstacle.kind),
    ['duck', 'bramble', 'gap', 'skyPillar'], 'only the struck thorn shatters immediately');
  for (let i = 0; i < 6; i++) game.tick(.016);
  assert.equal(game.obstacles().some((obstacle) => obstacle.kind === 'duck'), false);
  assert.equal(game.obstacles().some((obstacle) => obstacle.kind === 'bramble'), true);
  for (let i = 0; i < 6; i++) game.tick(.016);
  assert.equal(game.obstacles().some((obstacle) => obstacle.kind === 'bramble'), false);
  assert.equal(game.obstacles().some((obstacle) => obstacle.kind === 'gap'), true);
  for (let i = 0; i < 5; i++) game.tick(.016);
  assert.equal(game.obstacles().some((obstacle) => obstacle.kind === 'gap'), false);
  assert.equal(game.obstacles().some((obstacle) => obstacle.kind === 'skyPillar'), true);
  for (let i = 0; i < 4; i++) game.tick(.016);
  assert.equal(game.obstacles().length, 0);
  assert.equal(game.mode(), 'running');
  assert.ok(game.shieldDebris().length > 0);
});

test('the shield blast outruns nearby hazards at maximum running speed', () => {
  const game = createGame();
  game.setExtreme(true);
  game.startForInputTest();
  game.setShieldReady(true);
  game.setObstacles([
    { kind: 'cactus', x: 0, width: 42, height: 46, seed: 0 },
    { kind: 'movingLow', x: 130, width: 68, flightSpeed: 360 },
    { kind: 'gap', x: 230, width: 160 },
    { kind: 'skyPillar', x: 320, width: 28 }
  ]);
  game.tick(.016);
  for (let frame = 0; frame < 8; frame++) game.tick(.032);
  assert.equal(game.mode(), 'running');
  assert.equal(game.obstacles().length, 0);
  assert.equal(game.hasGroundSupport(game.worldPosition()), true);
});

test('post-break hazards enter from offscreen and warning hazards wait 3.8 seconds', () => {
  const game = createGame(() => 0);
  game.startForInputTest();
  game.player(300000, 320, false);
  game.setShieldReady(true);
  game.setObstacles([{ kind: 'cactus', x: 300000, width: 42, height: 46, seed: 0 }]);
  game.tick(.016);
  const breakX = game.worldPosition();
  const bufferEnd = game.shieldBufferUntil();
  const warningStart = game.shieldWarningSpawnAfter();
  assert.ok(Math.abs(warningStart - game.shieldBreakAt() - 3.8) < 1e-9);
  game.setElapsed(bufferEnd - .003);
  game.player(breakX + 1120 * 3 - 2, 320, false);
  game.tick(.004);
  assert.ok(game.obstacles().length > 0, 'ordinary hazards resume after three seconds');
  assert.ok(game.obstacles().every((obstacle) => !['movingLow', 'movingHigh', 'skyPillar'].includes(obstacle.kind)));
  assert.ok(game.obstacles().every((obstacle) => obstacle.x > game.worldPosition() + 815),
    'new obstacles start outside the right edge');
  game.setElapsed(warningStart - .02);
  game.next(game.worldPosition() + 100);
  game.tick(.01);
  assert.ok(game.obstacles().every((obstacle) => !['movingLow', 'movingHigh', 'skyPillar'].includes(obstacle.kind)),
    'warning hazards remain blocked before 3.8 seconds');
  game.next(game.worldPosition() + 100);
  game.setElapsed(warningStart - .001);
  game.tick(.002);
  const pillar = game.obstacles().find((obstacle) => obstacle.kind === 'skyPillar');
  assert.ok(pillar, 'normal late-game generation can create a pillar after the cooldown');
  assert.ok(game.timeUntilVisible(pillar) > .8, 'the pillar retains its full warning lead');
});

test('one shield charge clears a three-second flat buffer and cannot stack', () => {
  const game = createGame();
  game.startForInputTest();
  game.setShieldPickups([{ x: 5, y: 280 }, { x: 10, y: 280 }]);
  game.setObstacles([
    { kind: 'cactus', x: 0, width: 42, height: 46, seed: 0 },
    { kind: 'gap', x: 250, width: 500 },
    { kind: 'skyPillar', x: 800, width: 28 },
    { kind: 'movingLow', x: 1050, width: 68, flightSpeed: 360 }
  ]);
  game.tick(.016);
  assert.equal(game.mode(), 'running');
  assert.equal(game.shieldReady(), false, 'both overlapping pickups still give only one charge');
  assert.ok(game.shieldBufferUntil() >= 3);
  assert.ok(game.obstacles().some((obstacle) => obstacle.kind === 'gap'),
    'the visible cliff waits for the blast instead of vanishing instantly');
  assert.ok(game.obstacles().some((obstacle) => obstacle.kind === 'skyPillar'),
    'the visible pillar remains until fragments reach it');
  assert.equal(game.shieldPickups().length, 0);
  game.tick(.12);
  assert.equal(game.obstacles().some((obstacle) => obstacle.kind === 'gap'), false,
    'the blast fills the cliff when it reaches the edge');
  game.tick(.3);
  assert.equal(game.obstacles().length, 0, 'all visible hazards have visibly shattered');
  game.next(100);
  game.tick(.016);
  assert.equal(game.nextPosition(), 100, 'new obstacles are not generated inside the buffer');
  game.next(Infinity);
  for (let i = 0; i < 190; i++) game.tick(.016);
  const x = game.worldPosition();
  game.setObstacles([{ kind: 'cactus', x: x + 8, width: 42, height: 46, seed: 0 }]);
  game.tick(.016);
  assert.equal(game.mode(), 'over', 'the next hit is fatal after the charge is spent');
});

test('a shield never blocks a sky pillar or a fall into a cliff', () => {
  const pillar = createGame();
  pillar.startForInputTest();
  pillar.setShieldReady(true);
  pillar.setObstacles([{ kind: 'skyPillar', x: 0, width: 30 }]);
  pillar.tick(.016);
  assert.equal(pillar.mode(), 'over');
  assert.equal(pillar.shieldReady(), true);

  const cliff = createGame();
  cliff.startForInputTest();
  cliff.setShieldReady(true);
  cliff.setObstacles([{ kind: 'gap', x: -100, width: 300 }]);
  cliff.player(0, 512, false);
  cliff.setPlayerState({ grounded: false });
  cliff.tick(.016);
  assert.equal(cliff.mode(), 'over');
  assert.equal(cliff.shieldReady(), true);
});

test('a shield also absorbs one flying-bird collision', () => {
  const game = createGame();
  game.startForInputTest();
  game.setShieldReady(true);
  game.setObstacles([{ kind: 'duck', x: 0, width: 68, seed: 0 }]);
  game.tick(.016);
  assert.equal(game.mode(), 'running');
  assert.equal(game.shieldReady(), false);
  assert.equal(game.obstacles().length, 0);
});

test('rebalance: A and C have exactly 6% high thorns on either side, never both', () => {
  for (const spawn of ['spawnCliffScene', 'spawnRhythmScene']) {
    let rolls = [];
    const game = createGame(() => rolls.shift() ?? .5);
    const counts = { before: 0, after: 0, neither: 0 };
    for (let i = 0; i < 1000; i++) {
      rolls = [(i + .5) / 1000];
      game.setObstacles([]); game.next(150000); game[spawn]();
      const items = game.obstacles();
      const first = items[0].kind === 'tallThorn', last = items[2].kind === 'tallThorn';
      assert.equal(items.length, 3);
      assert.ok(!(first && last));
      counts[first ? 'before' : last ? 'after' : 'neither']++;
      for (const o of items.filter((o) => o.kind === 'tallThorn')) {
        assert.equal(o.width, 84);
        assert.ok(o.height >= 119 && o.height <= 123);
      }
      assert.ok(items[1].x >= items[0].x + items[0].width);
      assert.ok(items[2].x >= items[1].x + items[1].width);
    }
    assert.deepEqual(counts, { before:60, after:60, neither:880 });
  }
  const game = createGame([0, .999999]);
  assert.equal(game.makeObstacle('tallThorn', 0, 84).height, 119);
  assert.equal(game.makeObstacle('tallThorn', 0, 84).height, 123);
  assert.equal(game.sceneTallThornSide(.06), 'after');
  assert.equal(game.sceneTallThornSide(.12), null);
});

test('classic distance wraps as int32, explodes once, and reset discards the run', () => {
  const key = 'elsasms.dino-plus.v1.profile';
  const store = { [key]: JSON.stringify({ best: 500, recent: [500], outfit: 'explorer' }) };
  const game = createGame([], store);
  let explosions = 0;
  game.sound.explosion = () => { explosions++; };
  game.startGame();
  game.setObstacles([]); game.next(Infinity);
  const originalRecord = store[key];
  assert.equal(game.element('mode-reset').hidden, true);

  // Start 647 meters below the signed 32-bit limit instead of running billions of meters.
  game.player(2147483000 * 10, 320, false);
  game.tick(0);
  assert.equal(game.element('distance').textContent, '2147483000');
  for (let frame = 0; frame < 250 && game.mode() === 'running'; frame++) game.tick(.032);
  assert.equal(game.mode(), 'overflow');
  assert.ok(Number(game.element('distance').textContent) < 0);
  assert.equal(Number(game.element('distance').textContent), Math.floor(game.worldPosition() / 10) | 0);
  assert.equal(game.element('status-text').textContent, '极速 ×3.2', 'overflow does not announce itself');
  assert.equal(game.element('overflow-whiteout').hidden, false);
  assert.equal(explosions, 1);
  assert.equal(game.element('mode-reset').hidden, false);
  assert.equal(game.element('mode-reset').disabled, false);
  const stoppedAt = game.worldPosition();
  game.tick(.032); game.endGame();
  assert.equal(explosions, 1);
  assert.equal(game.worldPosition(), stoppedAt);
  assert.equal(game.keyDown('Space').defaultPrevented, true);
  assert.equal(game.mode(), 'overflow');
  assert.equal(store[key], originalRecord, 'the overflowed run never becomes a record');

  game.element('mode-reset').click();
  assert.equal(game.mode(), 'ready');
  assert.equal(game.worldPosition(), 0);
  assert.equal(game.element('distance').textContent, '0000');
  assert.equal(game.element('overflow-whiteout').hidden, true);
  assert.equal(game.element('mode-reset').hidden, true);
  assert.equal(store[key], originalRecord);
});

test('classic wraps immediately after INT_MAX; training retains its ordinary counter', () => {
  const classic = createGame();
  classic.startGame(); classic.setObstacles([]); classic.next(Infinity);
  classic.player(2147483647 * 10, 320, false);
  classic.tick(0);
  assert.equal(classic.element('distance').textContent, '2147483647');
  classic.tick(.01);
  assert.equal(classic.element('distance').textContent, '-2147483648');
  assert.equal(classic.mode(), 'overflow');

  const training = createGame([], {}, ['cactus']);
  training.startForInputTest();
  training.player(2147483648 * 10, 320, false);
  training.tick(0);
  assert.equal(training.mode(), 'running');
  assert.equal(training.element('distance').textContent, '2147483648');
});

test('formal game covers the entire card and keeps demo instructions out of the page', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const footer = page.indexOf('class="game-footer"');
  const whiteout = page.indexOf('id="overflow-whiteout"');
  assert.ok(footer >= 0 && whiteout > footer, 'whiteout sits above the complete game card');
  assert.equal(page.includes('计数溢出'), false);
  assert.equal(page.includes('白屏后点击上方'), false);
  assert.equal(page.includes('本页不会写入游戏纪录'), false);
});

test('local demo uses the real classic game from 2147483000m without hazards or record writes', () => {
  const game = createGame([], {}, null, 3.2, true);
  const recordBefore = game.store['elsasms.dino-plus.v1.profile'];
  game.startGame();
  assert.equal(game.mode(), 'running');
  assert.equal(game.worldPosition(), 2147483000 * 10);
  assert.equal(game.element('distance').textContent, '2147483000');
  assert.equal(game.obstacles().length, 0);
  assert.equal(game.nextPosition(), Infinity);
  for (let frame = 0; frame < 250 && game.mode() === 'running'; frame++) game.tick(.032);
  assert.equal(game.mode(), 'overflow');
  assert.equal(game.element('overflow-whiteout').hidden, false);
  assert.equal(game.store['elsasms.dino-plus.v1.profile'], recordBefore);
  game.element('mode-reset').click();
  assert.equal(game.mode(), 'ready');
  assert.equal(game.worldPosition(), 0);
  assert.equal(game.element('distance').textContent, '0000');
  game.startGame();
  assert.equal(game.worldPosition(), 2147483000 * 10);
});
