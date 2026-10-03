const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'run-session.js'), 'utf8');
const key = 'elsasms.dino-plus.v1.run-sessions.v1';

function createStorage() {
  const values = new Map();
  return {
    getItem(name) { return values.get(name) ?? null; },
    setItem(name, value) { values.set(name, value); },
    removeItem(name) { values.delete(name); },
    values
  };
}

function createSessions(storage = createStorage()) {
  const context = vm.createContext({ window: { sessionStorage: storage } });
  vm.runInContext(source, context);
  return { sessions: context.window.DinoRunSessions.create(key), storage, context };
}

test('a saved run restores scene cycles, shared obstacle references and special numbers', () => {
  const { sessions } = createSessions();
  const gap = { kind: 'gap', x: 100, scenePillar: null };
  const pillar = { kind: 'skyPillar', x: 110, sceneGap: gap };
  gap.scenePillar = pillar;
  const pickup = { kind: 'shield', source: gap };
  const run = {
    obstacles: [gap, pillar], pickups: [pickup],
    achievementAir: { birds: new Set([pillar]), birdStarts: new Map([[pillar, 110]]) },
    shieldBreakAt: -Infinity, nextObstacleX: Infinity, missing: undefined, negativeZero: -0
  };

  assert.equal(sessions.set('classic', run), true);
  const copy = sessions.get('classic');
  assert.equal(copy.obstacles[0].scenePillar, copy.obstacles[1]);
  assert.equal(copy.obstacles[1].sceneGap, copy.obstacles[0]);
  assert.equal(copy.pickups[0].source, copy.obstacles[0]);
  assert.equal(copy.achievementAir.birds.has(copy.obstacles[1]), true);
  assert.equal(copy.achievementAir.birdStarts.get(copy.obstacles[1]), 110);
  assert.equal(copy.shieldBreakAt, -Infinity);
  assert.equal(copy.nextObstacleX, Infinity);
  assert.equal(Object.hasOwn(copy, 'missing'), true);
  assert.equal(copy.missing, undefined);
  assert.equal(Object.is(copy.negativeZero, -0), true);
});

test('classic, extreme and training slots and selected main mode remain independent', () => {
  const { sessions, storage } = createSessions();
  assert.equal(sessions.getMainMode(), 'classic');
  assert.equal(sessions.set('classic', { meters: 100 }), true);
  assert.equal(sessions.set('extreme', { meters: 200 }), true);
  assert.equal(sessions.set('training', { meters: 300 }), true);
  assert.equal(sessions.setMainMode('extreme'), true);
  assert.equal(sessions.getMainMode(), 'extreme');
  const reloaded = createSessions(storage).sessions;
  assert.equal(reloaded.get('classic').meters, 100);
  assert.equal(reloaded.get('extreme').meters, 200);
  assert.equal(reloaded.get('training').meters, 300);
  assert.equal(reloaded.clear('extreme'), true);
  assert.equal(reloaded.get('extreme'), null);
  assert.equal(reloaded.get('classic').meters, 100);
  assert.equal(reloaded.getMainMode(), 'extreme');
  assert.equal(reloaded.setMainMode('training'), false);
  assert.equal(reloaded.getMainMode(), 'extreme');
});

test('corrupt, invalid and oversized stored data are ignored safely', () => {
  const { sessions, storage } = createSessions();
  storage.setItem(key, '{broken');
  assert.equal(sessions.get('classic'), null);
  assert.equal(sessions.getMainMode(), 'classic');
  assert.equal(sessions.set('classic', { meters: 7 }), true);
  assert.equal(sessions.get('classic').meters, 7);
  const data = JSON.parse(storage.getItem(key));
  data.slots.classic.root = ['r', 9000];
  storage.setItem(key, JSON.stringify(data));
  assert.equal(sessions.get('classic'), null);
  storage.setItem(key, ' '.repeat(2_000_001));
  assert.equal(sessions.get('classic'), null);
  assert.equal(sessions.set('classic', { meters: 9 }), true);
  assert.equal(sessions.get('classic').meters, 9);
  assert.equal(sessions.set('classic', { huge: 'x'.repeat(2_000_001) }), false);
  assert.equal(sessions.get('classic').meters, 9);
});

test('blocked sessionStorage access and quota errors do not interrupt the game', () => {
  const unavailable = vm.createContext({ window: {} });
  Object.defineProperty(unavailable.window, 'sessionStorage', { get() { throw new Error('blocked'); } });
  vm.runInContext(source, unavailable);
  const sessions = unavailable.window.DinoRunSessions.create(key);
  assert.equal(sessions.get('classic'), null);
  assert.equal(sessions.getMainMode(), 'classic');
  assert.equal(sessions.set('classic', { meters: 3 }), false);
  assert.equal(sessions.clear('classic'), false);
  assert.equal(sessions.setMainMode('extreme'), false);

  const storage = createStorage();
  storage.setItem = () => { throw new Error('quota'); };
  const quota = createSessions(storage).sessions;
  assert.equal(quota.set('classic', { meters: 3 }), false);
  assert.equal(quota.setMainMode('extreme'), false);
});
