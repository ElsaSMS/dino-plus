const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'achievements.js'), 'utf8');
const KEY = 'elsasms.dino-plus.v1.achievements';
function load(store = {}) {
  const localStorage = {
    getItem(key) { return store[key] ?? null; },
    setItem(key, value) { store[key] = value; }
  };
  const window = { localStorage };
  vm.runInNewContext(source, { window });
  return { api: window.DinoAchievements, store };
}
function award(api, groupId, tier) {
  return api.getView().groups.find((group) => group.id === groupId).awards.find((item) => item.tier === tier);
}

test('catalogue has all 31 named badges and every image resolves', () => {
  const { api } = load();
  const groups = api.getView().groups;
  assert.equal(groups.reduce((sum, group) => sum + group.awards.length, 0), 31);
  assert.equal(groups.find((group) => group.id === 'extreme').name, '万里归途');
  assert.equal(groups.find((group) => group.id === 'training').name, '初入黄沙');
  assert.equal(groups.find((group) => group.id === 'bird').name, '雄踞长空');
  for (const group of groups) for (const item of group.awards) {
    const badgePath = path.join(__dirname, '..', item.image);
    assert.ok(fs.existsSync(badgePath), item.image);
    assert.match(fs.readFileSync(badgePath, 'utf8'),
      new RegExp(`<text[^>]+id="achievement-name"[^>]*>${group.name}</text>`),
      `${item.image} must carry the current achievement name`);
    if (item.hidden) assert.equal(item.requirement, null);
    else assert.ok(item.requirement.length > 4);
  }
});

test('training settles at run end; saved name and two started outfits unlock immediately', () => {
  const store = {};
  const { api } = load(store);
  let notifications = 0;
  const unsubscribe = api.subscribe(() => notifications++);
  api.noteNameSaved();
  api.startRun('training', 'explorer');
  assert.equal(award(api, 'outfit', 'wood').unlocked, false);
  assert.equal(award(api, 'training', 'wood').unlocked, false);
  api.finishRun({ distance: 200 });
  assert.equal(award(api, 'training', 'wood').unlocked, true);
  assert.equal(award(api, 'outfit', 'wood').unlocked, false);
  api.startRun('classic', 'stargazer');
  assert.equal(award(api, 'outfit', 'wood').unlocked, true);
  assert.ok(notifications >= 4);
  unsubscribe();
  const previous = notifications;
  api.startRun('classic');
  assert.equal(notifications, previous);
  assert.ok(store[KEY]);
  const restored = load(store).api;
  assert.equal(award(restored, 'outfit', 'wood').unlocked, true);
});

test('a stored nickname and selected outfit do not stand in for save and game starts', () => {
  const store = {
    'elsasms.dino-plus.v1.active-name': JSON.stringify('晚霞旅人'),
    'elsasms.dino-plus.v1.profile': JSON.stringify({ outfit: 'sunrider' })
  };
  const { api } = load(store);
  assert.equal(award(api, 'outfit', 'wood').progress, '0/2');
  api.startRun('classic', 'sunrider');
  api.finishRun({ distance: 200 });
  api.startRun('classic', 'minty');
  assert.equal(award(api, 'outfit', 'wood').progress, '1/2');
  api.noteNameSaved();
  assert.equal(award(api, 'outfit', 'wood').unlocked, true);
});

test('earlier personal records seed the achievement progress that can be reconstructed', () => {
  const store = {
    'elsasms.dino-plus.v1.profile': JSON.stringify({ best: 52000, extremeBest: 12, outfit: 'explorer' })
  };
  const { api } = load(store);
  assert.equal(award(api, 'classic', 'bronze').unlocked, true);
  assert.equal(award(api, 'classic', 'silver').unlocked, true);
  assert.equal(award(api, 'classic', 'gold').progress, '52000/1000000');
  assert.equal(award(api, 'extreme', 'gold').unlocked, true);
  assert.equal(award(api, 'extreme', 'hidden').unlocked, false);
});

test('saving the default nickname counts, but repeated runs in one outfit do not', () => {
  const { api } = load();
  api.noteNameSaved();
  api.startRun('classic', 'explorer');
  api.finishRun({ distance: 50 });
  api.startRun('classic', 'explorer');
  assert.equal(award(api, 'outfit', 'wood').progress, '1/2');
  assert.equal(award(api, 'outfit', 'wood').unlocked, false);
  api.startRun('classic', 'minty');
  assert.equal(award(api, 'outfit', 'wood').unlocked, true);
});

test('a saved name and first started outfit survive a page reload', () => {
  const store = {};
  const first = load(store).api;
  first.noteNameSaved();
  first.startRun('classic', 'explorer');
  assert.equal(award(first, 'outfit', 'wood').progress, '1/2');
  const restored = load(store).api;
  assert.equal(award(restored, 'outfit', 'wood').progress, '1/2');
  restored.startRun('extreme', 'sunrider');
  assert.equal(award(restored, 'outfit', 'wood').unlocked, true);
});

test('version-one outfit selections and badge cannot prove the clarified rule', () => {
  const store = { [KEY]: JSON.stringify({
    version: 1, nicknameSet: true, outfits: ['explorer', 'sunrider'],
    classic: { best: 10000, total: 10000 },
    unlocked: { 'outfit.wood': true, 'classic.bronze': true }
  }) };
  const { api } = load(store);
  assert.equal(award(api, 'outfit', 'wood').unlocked, false);
  assert.equal(award(api, 'outfit', 'wood').progress, '0/2');
  assert.equal(award(api, 'classic', 'bronze').unlocked, true);
  api.noteNameSaved();
  api.startRun('classic', 'explorer');
  assert.equal(award(api, 'outfit', 'wood').unlocked, false);
  api.startRun('classic', 'sunrider');
  assert.equal(award(api, 'outfit', 'wood').unlocked, true);
  assert.equal(JSON.parse(store[KEY]).version, 2);
});

test('a catalogue tab refreshes progress saved by another game tab', () => {
  const store = {};
  const catalogue = load(store).api;
  const game = load(store).api;
  game.startRun('classic');
  game.finishRun({ distance: 12345 });
  assert.equal(award(catalogue, 'classic', 'bronze').unlocked, false);
  catalogue.refresh();
  assert.equal(award(catalogue, 'classic', 'bronze').unlocked, true);
  assert.equal(award(catalogue, 'classic', 'silver').progress, '12345/50000');
});

test('two game tabs settle into one browser achievement record', () => {
  const store = {};
  const first = load(store).api;
  const second = load(store).api;
  first.startRun('classic');
  second.startRun('classic');
  first.finishRun({ distance: 700 });
  second.finishRun({ distance: 800 });
  assert.equal(award(second, 'classic', 'gold').progress, '1500/1000000');
});

test('classic distances and thorn counts accumulate only at the end, with idempotent settlement', () => {
  const { api } = load();
  api.startRun('classic');
  for (let i = 0; i < 3; i++) api.record('highThornResult', { single: true });
  api.record('highThornResult', { single: false });
  assert.equal(award(api, 'thorn', 'bronze').unlocked, false);
  api.finishRun({ distance: 10000 });
  assert.equal(award(api, 'classic', 'bronze').unlocked, true);
  assert.equal(award(api, 'classic', 'silver').unlocked, false);
  assert.equal(award(api, 'thorn', 'silver').unlocked, true);
  assert.equal(award(api, 'thorn', 'gold').progress, '3/100');
  api.finishRun({ distance: 999999 });
  assert.equal(award(api, 'classic', 'gold').progress, '10000/1000000');
  api.startRun('classic');
  api.finishRun({ distance: 990000 });
  assert.equal(award(api, 'classic', 'gold').unlocked, true);
  assert.equal(award(api, 'classic', 'gold').progress, '1000000/1000000');
});

test('a later run may unlock a gated tier using progress saved from earlier runs', () => {
  const { api } = load();
  api.startRun('training');
  for (let i = 0; i < 100; i++) api.record('highThornResult', { single: true });
  api.finishRun({ distance: 300 });
  assert.equal(award(api, 'thorn', 'bronze').unlocked, true);
  assert.equal(award(api, 'thorn', 'silver').unlocked, false);
  assert.equal(award(api, 'thorn', 'gold').unlocked, false);
  assert.equal(award(api, 'thorn', 'gold').progress, '100/100');
  api.startRun('classic');
  for (let i = 0; i < 3; i++) api.record('highThornResult', { single: true });
  api.finishRun({ distance: 20 });
  assert.equal(award(api, 'thorn', 'silver').unlocked, true);
  assert.equal(award(api, 'thorn', 'gold').unlocked, true);
});

test('overflow can earn every classic tier while the achievement counter remains consistent', () => {
  const { api } = load();
  api.startRun('classic');
  api.record('overflow');
  api.finishRun({ distance: -2147483648, overflow: true });
  for (const tier of ['bronze', 'silver', 'gold', 'hidden']) assert.equal(award(api, 'classic', tier).unlocked, true);
  assert.equal(award(api, 'classic', 'gold').progress, '1000000/1000000');
  api.startRun('classic');
  api.finishRun({ distance: 500 });
  assert.equal(award(api, 'classic', 'gold').progress, '1000000/1000000');
});

test('extreme tiers cascade on a single clean completion; later poor completions cannot undo them', () => {
  const { api } = load();
  api.startRun('extreme');
  api.finishRun({ distance: 100000, completedExtreme: true, rescues: 0 });
  for (const tier of ['bronze', 'silver', 'gold', 'hidden']) assert.equal(award(api, 'extreme', tier).unlocked, true);
  api.startRun('extreme');
  api.finishRun({ distance: 100000, completedExtreme: true, rescues: 99 });
  assert.equal(award(api, 'extreme', 'gold').unlocked, true);
});

test('extreme hidden handling needs a full 100000 m completion and no failures in that run', () => {
  const { api } = load();
  api.startRun('classic');
  for (let i = 0; i < 100; i++) api.record('highThornResult', { single: true });
  for (let i = 0; i < 50; i++) api.record('birdResult', { over: true, small: i === 0, single: i === 0 });
  for (const kind of ['gap', 'collapseGap', 'skyPillar']) api.record('cliffResult', { kind, recovered: true, dived: true });
  api.finishRun({ distance: 5000 });
  assert.equal(award(api, 'thorn', 'gold').unlocked, true);
  assert.equal(award(api, 'bird', 'gold').unlocked, true);
  assert.equal(award(api, 'cliff', 'gold').unlocked, true);
  api.startRun('extreme');
  api.finishRun({ distance: 100000, completedExtreme: true, rescues: 5 });
  for (const group of ['thorn', 'bird', 'cliff']) assert.equal(award(api, group, 'hidden').unlocked, false);
  api.startRun('extreme');
  api.record('highThornResult', { single: true });
  api.record('highThornResult', { single: false });
  api.record('birdResult', { over: true });
  api.record('birdResult', { over: false });
  api.record('cliffResult', { kind: 'gap', recovered: true, dived: true });
  api.record('cliffResult', { kind: 'skyPillar', recovered: false, dived: true });
  api.finishRun({ distance: 4000 });
  for (const group of ['thorn', 'bird', 'cliff']) assert.equal(award(api, group, 'hidden').unlocked, false);
  api.startRun('extreme');
  api.record('highThornResult', { single: true });
  api.record('birdResult', { over: true });
  api.record('cliffResult', { kind: 'collapseGap', recovered: true, dived: true });
  api.finishRun({ distance: 3000 });
  for (const group of ['thorn', 'bird', 'cliff']) assert.equal(award(api, group, 'hidden').unlocked, false);
  api.startRun('extreme');
  api.record('highThornResult', { single: true });
  api.record('birdResult', { over: true });
  api.record('cliffResult', { kind: 'collapseGap', recovered: true, dived: true });
  api.finishRun({ distance: 3000, completedExtreme: true });
  for (const group of ['thorn', 'bird', 'cliff']) assert.equal(award(api, group, 'hidden').unlocked, false);
  api.startRun('extreme');
  api.record('highThornResult', { single: true });
  api.record('birdResult', { over: true });
  api.record('cliffResult', { kind: 'collapseGap', recovered: true, dived: true });
  api.finishRun({ distance: 100000, completedExtreme: true, rescues: 10 });
  for (const group of ['thorn', 'bird', 'cliff']) assert.equal(award(api, group, 'hidden').unlocked, true);
});

test('air combos distinguish ordered high-obstacle pairs within a single run', () => {
  const { api } = load();
  api.startRun('classic');
  api.record('airCombo', { obstacles: 2, highKinds: ['thorn', 'thorn'] });
  api.record('airCombo', { obstacles: 2, highKinds: ['thorn', 'bird'] });
  api.record('airCombo', { obstacles: 2, highKinds: ['bird', 'thorn'] });
  api.finishRun({ distance: 10 });
  assert.equal(award(api, 'air', 'gold').unlocked, true);
  assert.equal(award(api, 'air', 'hidden').unlocked, false);
  api.startRun('classic');
  for (const pair of ['thorn-thorn', 'thorn-bird', 'bird-thorn', 'bird-bird']) {
    api.record('airCombo', { obstacles: 2, highKinds: pair.split('-') });
  }
  api.finishRun({ distance: 10 });
  assert.equal(award(api, 'air', 'hidden').unlocked, true);
});

test('lucky encounter counters keep occurrences even after the first crystal badge', () => {
  const { api } = load();
  api.startRun('classic');
  api.record('pickup', { kind: 'shield', seconds: 2 });
  api.record('pickup', { kind: 'jetpack', seconds: 2.7 });
  api.record('pickup', { kind: 'shield', seconds: 5 });
  api.record('pickup', { kind: 'jetpack', seconds: 6.1 });
  api.record('beakDeath');
  api.record('shieldBlastBird');
  api.record('jetpackFillGap');
  api.record('obstacleResult', { warned: true, cleared: true });
  api.record('obstacleResult', { warned: true, cleared: true });
  api.record('obstacleResult', { warned: false, cleared: true });
  api.record('obstacleResult', { warned: true, cleared: true });
  api.record('obstacleResult', { warned: true, cleared: true });
  api.record('obstacleResult', { warned: true, cleared: true });
  assert.equal(award(api, 'dual', 'crystal').unlocked, false);
  api.finishRun({ distance: 100 });
  for (const group of ['dual', 'beak', 'shieldBird', 'jetpackCliff', 'warning']) {
    assert.equal(award(api, group, 'crystal').unlocked, true);
    assert.equal(award(api, group, 'crystal').progress, '当前遇到 1 次');
  }
  api.startRun('classic');
  api.record('beakDeath');
  api.finishRun({ distance: 5 });
  assert.equal(award(api, 'beak', 'crystal').progress, '当前遇到 2 次');
});

test('three warning hazards must be consecutive obstacle outcomes', () => {
  const { api } = load();
  api.startRun('classic');
  const warning = { warned: true, cleared: true };
  api.record('obstacleResult', warning);
  api.record('obstacleResult', warning);
  api.record('obstacleResult', { warned: false, cleared: true });
  api.record('obstacleResult', warning);
  api.record('obstacleResult', warning);
  api.finishRun({ distance: 100 });
  assert.equal(award(api, 'warning', 'crystal').unlocked, false);
  api.startRun('classic');
  api.record('obstacleResult', warning);
  api.record('obstacleResult', { warned: true, cleared: false });
  api.record('obstacleResult', warning);
  api.record('obstacleResult', warning);
  api.record('obstacleResult', warning);
  api.finishRun({ distance: 100 });
  assert.equal(award(api, 'warning', 'crystal').unlocked, true);
  assert.equal(award(api, 'warning', 'crystal').progress, '当前遇到 1 次');
});
