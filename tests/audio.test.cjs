const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'audio', 'audio.js'), 'utf8');
const gameSource = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function createAudioHarness(initial = {}) {
  const saved = new Map(Object.entries(initial));
  const starts = [];
  const stops = [];
  const oscillators = [];
  const noiseSources = [];
  const filters = [];
  const compressors = [];
  const intervals = new Map();
  let nextInterval = 1;
  let constructed = 0;
  let context;
  const parameter = () => ({
    value: 0,
    setValueAtTime(value) { this.value = value; },
    linearRampToValueAtTime(value) { this.value = value; },
    exponentialRampToValueAtTime(value) { this.value = value; },
    cancelScheduledValues() {}
  });
  class Node {
    connect() { return this; }
    disconnect() {}
    start(at) { starts.push(at); }
    stop() { stops.push(this); }
  }
  class FakeAudioContext {
    constructor() {
      constructed++;
      context = this;
      this.currentTime = 1;
      this.sampleRate = 8000;
      this.state = 'running';
      this.destination = new Node();
      this.gains = [];
    }
    createGain() {
      const node = Object.assign(new Node(), { gain: parameter() });
      this.gains.push(node);
      return node;
    }
    createOscillator() {
      const node = Object.assign(new Node(), { frequency: parameter() });
      oscillators.push(node);
      return node;
    }
    createBiquadFilter() {
      const node = Object.assign(new Node(), { frequency: parameter(), Q: parameter() });
      filters.push(node);
      return node;
    }
    createDynamicsCompressor() {
      const node = Object.assign(new Node(), {
        threshold: parameter(), knee: parameter(), ratio: parameter(),
        attack: parameter(), release: parameter()
      });
      compressors.push(node);
      return node;
    }
    createBuffer(_, length) { return { getChannelData: () => new Float32Array(length) }; }
    createBufferSource() {
      const node = new Node();
      noiseSources.push(node);
      return node;
    }
    resume() { this.state = 'running'; return Promise.resolve(); }
  }
  const window = {
    AudioContext: FakeAudioContext,
    setInterval(callback) { const id = nextInterval++; intervals.set(id, callback); return id; },
    clearInterval(id) { intervals.delete(id); },
    setTimeout() {}
  };
  const localStorage = {
    getItem: (key) => saved.has(key) ? saved.get(key) : null,
    setItem: (key, value) => saved.set(key, value)
  };
  vm.runInNewContext(source, { window, localStorage, Math, Promise }, { filename: 'audio.js' });
  return {
    audio: window.DinoAudio.create('elsasms.dino-plus.v1.'),
    saved, starts, stops, intervals, filters, compressors, oscillators, noiseSources,
    context: () => context,
    advance: (seconds) => { context.currentTime += seconds; for (const callback of intervals.values()) callback(); },
    constructed: () => constructed,
    tick: () => { for (const callback of intervals.values()) callback(); }
  };
}

test('jetpack airflow loops without engine tones and follows pause, mute, resume and reset', () => {
  const { audio, noiseSources, stops, oscillators } = createAudioHarness();
  audio.start();
  const tonesBeforeFlight = oscillators.length;
  audio.jetpack(true);
  assert.equal(oscillators.length, tonesBeforeFlight, 'flight adds no pitched motor or flutter oscillators');
  const firstEngine = noiseSources.find((source) => source.loop);
  assert.ok(firstEngine);
  const loops = () => noiseSources.filter((source) => source.loop);
  audio.jetpack(true);
  assert.equal(loops().length, 1, 'repeated updates cannot stack engine loops');
  audio.pause(); assert.ok(stops.includes(firstEngine));
  audio.resume(); assert.equal(loops().length, 2);
  audio.setMuted(true); assert.ok(stops.includes(loops().at(-1)));
  audio.setMuted(false); assert.equal(loops().length, 3);
  audio.jetpack(false); assert.ok(stops.includes(loops().at(-1)));
  audio.jetpack(true); audio.ready();
  assert.ok(stops.includes(loops().at(-1)));
  audio.start(); assert.equal(loops().length, 4, 'reset discards the previous flight sound');
  assert.equal(audio.shieldBreak, audio.explosion, 'landing and broken shield use the identical explosion');
});

test('music starts on interaction, pauses, resumes and ends', () => {
  const harness = createAudioHarness();
  const { audio, starts, intervals } = harness;
  assert.equal(harness.constructed(), 0);
  audio.start();
  assert.equal(harness.constructed(), 1);
  assert.equal(intervals.size, 1);
  assert.ok(starts.length > 10, 'opening cue and first music step are scheduled');
  for (let step = 0; step < 140; step++) harness.advance(60 / 124 / 4);
  assert.ok(starts.length > 180, 'the eight-bar cue loops and continues scheduling');
  const afterStart = starts.length;
  audio.pause();
  assert.equal(intervals.size, 0);
  assert.ok(starts.length > afterStart, 'pause cue is scheduled');
  audio.resume();
  assert.equal(intervals.size, 1);
  audio.end();
  assert.equal(intervals.size, 0);
  assert.equal(harness.constructed(), 1);
});

test('both jumps use a single soft tone without noise or a delayed extra click', () => {
  const { audio, starts, oscillators, noiseSources } = createAudioHarness();
  for (const second of [false, true]) {
    const previous = starts.length;
    audio.jump(second);
    assert.equal(starts.length - previous, 1);
    assert.equal(oscillators.at(-1).type, 'sine');
    assert.equal(noiseSources.length, 0);
  }
});

test('event sounds use balanced buses, three warning beeps, and layered collapse noise', () => {
  const { audio, starts, filters, compressors } = createAudioHarness();
  audio.start();
  assert.equal(compressors.length, 1);
  assert.equal(compressors[0].ratio.value, 5);
  const play = (name, ...args) => {
    const previous = starts.length;
    audio[name](...args);
    assert.ok(starts.length > previous, `${name} must schedule audio`);
  };
  play('jump', false);
  play('jump', true);
  play('land');
  const afterLand = starts.length;
  audio.land();
  assert.equal(starts.length, afterLand);
  const beforeWarning = starts.length;
  play('warning');
  assert.equal(starts.length - beforeWarning, 3);
  const beforeCollapseFilters = filters.length;
  play('collapse');
  assert.ok(filters.slice(beforeCollapseFilters).some((filter) => filter.type === 'lowpass'));
  assert.ok(filters.slice(beforeCollapseFilters).some((filter) => filter.type === 'bandpass'));
  assert.equal(audio.bird, undefined);
  play('shieldPickup');
  play('shieldBreak');
});

test('music and effects volumes are independent, prefixed, and migrate old volume', () => {
  const harness = createAudioHarness();
  const { audio, saved, intervals } = harness;
  audio.start();
  const [master, musicBus, musicFader, effectsBus] = harness.context().gains;
  const previousEffectsGain = effectsBus.gain.value;
  audio.setMusicVolume(.3);
  assert.equal(effectsBus.gain.value, previousEffectsGain);
  const changedMusicGain = musicBus.gain.value;
  audio.setEffectsVolume(.8);
  assert.equal(musicBus.gain.value, changedMusicGain);
  assert.notEqual(effectsBus.gain.value, previousEffectsGain);
  assert.ok(master.gain.value > 0 && musicFader.gain.value > 0);
  audio.setMuted(true);
  assert.equal(intervals.size, 0);
  assert.equal(saved.get('elsasms.dino-plus.v1.music-volume'), '0.3');
  assert.equal(saved.get('elsasms.dino-plus.v1.effects-volume'), '0.8');
  assert.equal(saved.get('elsasms.dino-plus.v1.audio-muted'), 'true');
  assert.deepEqual([...saved.keys()].sort(), [
    'elsasms.dino-plus.v1.audio-muted', 'elsasms.dino-plus.v1.effects-volume',
    'elsasms.dino-plus.v1.music-volume'
  ]);
  const restored = createAudioHarness(Object.fromEntries(saved)).audio;
  assert.equal(restored.settings().muted, true);
  assert.equal(restored.settings().musicVolume, .3);
  assert.equal(restored.settings().effectsVolume, .8);
  restored.start();
  restored.setMuted(false);
  assert.equal(restored.settings().muted, false);
  const migrated = createAudioHarness({ 'elsasms.dino-plus.v1.audio-volume': '0.42' }).audio;
  assert.equal(migrated.settings().musicVolume, .42);
  assert.equal(migrated.settings().effectsVolume, .42);
});

test('game wiring triggers collapse once and offers separate music and effects controls', () => {
  assert.match(gameSource, /obstacle\.collapsed = true;\s*sound\.collapse\(\);/);
  assert.doesNotMatch(gameSource, /sound\.bird\(/);
  assert.match(gameSource, /sound\.warning\(\)/);
  assert.match(gameSource, /sound\.setMusicVolume/);
  assert.match(gameSource, /sound\.setEffectsVolume/);
  assert.match(htmlSource, /id="music-volume"/);
  assert.match(htmlSource, /id="effects-volume"/);
});
