const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'storage-reset.js'), 'utf8');
const marker = 'elsasms.dino-plus.reset.20261001';

function storageWith(entries) {
  const values = new Map(Object.entries(entries));
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
    values
  };
}

test('the one-time reset clears only this game, then keeps newly earned data', () => {
  const storage = storageWith({
    'elsasms.dino-plus.v1.profile': '{"best":10000}',
    'elsasms.dino-plus.v1.profiles': '{"old":{}}',
    'elsasms.dino-plus.v1.achievements': '{"unlocked":{}}',
    'elsasms.dino-plus.v1.music-volume': '.4',
    'elsasms.dino-plus.training.v1.selected-kinds': '["gap"]',
    'another-project.profile': 'keep'
  });
  const context = vm.createContext({ window: { localStorage: storage } });
  vm.runInContext(source, context);
  assert.deepEqual([...storage.values], [
    ['another-project.profile', 'keep'], [marker, 'done']
  ]);
  storage.setItem('elsasms.dino-plus.v1.profile', '{"best":500}');
  vm.runInContext(source, context);
  assert.equal(storage.getItem('elsasms.dino-plus.v1.profile'), '{"best":500}');
});

test('all pages reset storage before loading game, sound, training or achievements', () => {
  for (const name of ['index.html', 'training.html', 'achievements.html', 'overflow-demo.html']) {
    const html = fs.readFileSync(path.join(root, name), 'utf8');
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]);
    assert.ok(scripts[0].startsWith('./storage-reset.js?'), name);
    assert.equal(scripts.filter((script) => script.startsWith('./storage-reset.js?')).length, 1, name);
  }
});
