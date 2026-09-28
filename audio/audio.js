(() => {
  'use strict';

  // An original, eight-bar pop loop. A step is one sixteenth note.
  const BPM = 124;
  const STEP_SECONDS = 60 / BPM / 4;
  const CHORDS = [
    { root: 45, notes: [57, 60, 64] }, // Am
    { root: 41, notes: [53, 57, 60] }, // F
    { root: 48, notes: [60, 64, 67] }, // C
    { root: 43, notes: [55, 59, 62] }, // G
    { root: 45, notes: [57, 60, 64] },
    { root: 41, notes: [53, 57, 60] },
    { root: 48, notes: [60, 64, 67] },
    { root: 43, notes: [55, 59, 62] }
  ];
  const HOOK = [
    { 0: 76, 2: 79, 4: 81, 7: 79, 10: 76, 12: 72, 14: 76 },
    { 0: 77, 2: 76, 4: 72, 6: 69, 8: 72, 11: 76, 14: 77 },
    { 0: 79, 2: 81, 4: 84, 7: 83, 10: 79, 12: 76, 14: 79 },
    { 0: 81, 2: 79, 4: 76, 6: 74, 8: 79, 11: 76, 14: 74 },
    { 0: 76, 2: 79, 4: 81, 6: 84, 8: 81, 10: 79, 12: 76, 14: 72 },
    { 0: 77, 2: 81, 4: 84, 7: 81, 10: 77, 12: 76, 14: 72 },
    { 0: 79, 2: 84, 4: 88, 7: 84, 10: 83, 12: 79, 14: 76 },
    { 0: 81, 2: 79, 4: 76, 6: 74, 8: 72, 10: 74, 12: 76, 14: 79 }
  ];
  const EVENT_GAINS = {
    start: .80, pause: .72, resume: .72, end: .78,
    jump: .65, land: .96, warning: .78,
    shieldPickup: .72, explosion: .66, collapse: .68
  };
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
  const volumeCurve = (volume) => volume ** 1.25;

  // Optional offline context renders the exact same synthesis into portable WAV files.
  function create(prefix = 'elsasms.dino-plus.v1.', options = {}) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const muteKey = `${prefix}audio-muted`;
    const oldVolumeKey = `${prefix}audio-volume`;
    const musicKey = `${prefix}music-volume`;
    const effectsKey = `${prefix}effects-volume`;
    const read = (key, fallback) => {
      if (options.offlineContext) return fallback;
      try { const value = localStorage.getItem(key); return value === null ? fallback : JSON.parse(value); }
      catch { return fallback; }
    };
    const save = (key, value) => {
      if (options.offlineContext) return;
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private browsing */ }
    };
    const oldVolume = read(oldVolumeKey, .55);
    let muted = read(muteKey, false) === true;
    let musicVolume = clamp(Number(read(musicKey, oldVolume)) || 0, 0, 1);
    let effectsVolume = clamp(Number(read(effectsKey, oldVolume)) || 0, 0, 1);
    let context;
    let master;
    let musicBus;
    let musicFader;
    let effectsBus;
    let noiseBuffer;
    let timer;
    let musicWanted = false;
    let nextStep = 0;
    let nextStepTime = 0;
    let intensity = 0;
    let lastLandAt = -Infinity;
    let lastCollapseAt = -Infinity;
    let jetpackWanted = false;
    let engineBus;
    let engineSources = [];

    function moveGain(param, value, seconds = .04) {
      if (!context) return;
      const now = context.currentTime;
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(value, now + seconds);
    }
    function makeNoise() {
      const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const samples = buffer.getChannelData(0);
      let seed = 0x534f554e;
      for (let index = 0; index < samples.length; index++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        samples[index] = (seed / 2147483648 - 1) * .72;
      }
      return buffer;
    }
    function ensureAudio() {
      if (!AudioContextClass || muted) return false;
      if (!context) {
        try {
          context = options.offlineContext || new AudioContextClass();
          master = context.createGain();
          musicBus = context.createGain();
          musicFader = context.createGain();
          effectsBus = context.createGain();
          const effectLimiter = context.createDynamicsCompressor();
          master.gain.value = .84;
          musicBus.gain.value = .67 * volumeCurve(musicVolume);
          musicFader.gain.value = 0;
          effectsBus.gain.value = .82 * volumeCurve(effectsVolume);
          effectLimiter.threshold.value = -18;
          effectLimiter.knee.value = 10;
          effectLimiter.ratio.value = 5;
          effectLimiter.attack.value = .003;
          effectLimiter.release.value = .14;
          musicBus.connect(musicFader);
          musicFader.connect(master);
          effectsBus.connect(effectLimiter);
          effectLimiter.connect(master);
          master.connect(context.destination);
          noiseBuffer = makeNoise();
        } catch { context = undefined; return false; }
      }
      if (!options.offlineContext && context.state === 'suspended') Promise.resolve(context.resume()).catch(() => {});
      return true;
    }
    function tone(frequency, at, duration, options = {}) {
      if (!context) return;
      const { wave = 'sine', level = .1, attack = .006, release = .09,
        endFrequency = frequency, bus = effectsBus, cutoff = 0 } = options;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = wave;
      oscillator.frequency.setValueAtTime(Math.max(1, frequency), at);
      if (endFrequency !== frequency) {
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), at + duration);
      }
      envelope.gain.setValueAtTime(.0001, at);
      envelope.gain.linearRampToValueAtTime(level, at + attack);
      envelope.gain.setValueAtTime(level, at + Math.max(attack, duration - release));
      envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);
      oscillator.connect(envelope);
      if (cutoff) {
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = cutoff;
        envelope.connect(filter);
        filter.connect(bus);
      } else envelope.connect(bus);
      oscillator.start(at);
      oscillator.stop(at + duration + .02);
    }
    function noise(at, duration, level, cutoff, options = {}) {
      if (!context) return;
      const { bus = effectsBus, filterType = 'highpass', endCutoff = cutoff,
        attack = .003, offset = 0 } = options;
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const envelope = context.createGain();
      source.buffer = noiseBuffer;
      filter.type = filterType;
      filter.frequency.setValueAtTime(cutoff, at);
      if (endCutoff !== cutoff) {
        filter.frequency.exponentialRampToValueAtTime(endCutoff, at + duration);
      }
      envelope.gain.setValueAtTime(.0001, at);
      envelope.gain.linearRampToValueAtTime(level, at + attack);
      envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);
      source.connect(filter);
      filter.connect(envelope);
      envelope.connect(bus);
      source.start(at, offset);
      source.stop(at + duration + .01);
    }
    function lead(midi, at, duration = .19, level = .095, bus = musicBus) {
      tone(hz(midi), at, duration, { wave: 'sawtooth', level, cutoff: 2500,
        attack: .006, release: duration * .64, bus });
      tone(hz(midi) * 2, at, duration * .7, { wave: 'triangle', level: level * .25,
        attack: .004, release: duration * .55, bus });
    }
    function kick(at) {
      tone(145, at, .17, { endFrequency: 48, level: .31,
        attack: .002, release: .13, bus: musicBus });
    }
    function clap(at) {
      noise(at, .105, .092, 1250, { bus: musicBus, offset: .28 });
      noise(at + .018, .07, .042, 2800, { bus: musicBus, offset: .58 });
    }
    function scheduleMusicStep(step, at) {
      const bar = Math.floor(step / 16);
      const tick = step % 16;
      const chord = CHORDS[bar];
      if (tick % 4 === 0) kick(at);
      if (tick === 4 || tick === 12) clap(at);
      if (tick === 2 || tick === 6 || tick === 10 || tick === 14) {
        noise(at, .05, .026, 5700, { bus: musicBus, offset: .74 });
      }
      if (intensity > .55 && tick % 2 === 1) {
        noise(at, .028, .012, 6800, { bus: musicBus, offset: .92 });
      }
      if ([0, 3, 6, 8, 11, 14].includes(tick)) {
        const bassMidi = chord.root + (tick === 6 || tick === 14 ? 12 : 0);
        tone(hz(bassMidi), at, tick === 0 ? .34 : .22, {
          wave: 'sawtooth', level: .13, cutoff: 360,
          attack: .005, release: .16, bus: musicBus
        });
        tone(hz(bassMidi), at, .20, { wave: 'sine', level: .12,
          attack: .005, release: .15, bus: musicBus });
      }
      if (tick === 0 || tick === 7 || tick === 10) {
        for (const midi of chord.notes) {
          tone(hz(midi + 12), at, tick === 0 ? .42 : .24, {
            wave: 'sawtooth', level: .031, cutoff: 1350,
            attack: .008, release: .18, bus: musicBus
          });
        }
      }
      const note = HOOK[bar][tick];
      if (note !== undefined) {
        lead(note, at, tick === 0 || tick === 8 ? .28 : .19);
        if (intensity > .78 && tick === 4) lead(note + 12, at, .19, .045);
      }
    }
    function scheduleAhead() {
      if (!context || muted || !musicWanted) return;
      const now = context.currentTime;
      if (nextStepTime < now - .1) nextStepTime = now + .04;
      while (nextStepTime < now + .19) {
        scheduleMusicStep(nextStep, nextStepTime);
        nextStep = (nextStep + 1) % 128;
        nextStepTime += STEP_SECONDS;
      }
    }
    function runMusic(reset) {
      if (options.offlineContext) return; // Event exports must not include background music.
      if (!ensureAudio()) return;
      if (reset) nextStep = 0;
      nextStepTime = context.currentTime + .07;
      moveGain(musicFader.gain, 1, .20);
      if (!timer) timer = window.setInterval(scheduleAhead, 60);
      scheduleAhead();
    }
    function stopMusic() {
      if (timer) window.clearInterval(timer);
      timer = undefined;
      if (musicFader) moveGain(musicFader.gain, 0, .12);
    }
    function effect(name, callback) {
      if (effectsVolume === 0 || !ensureAudio()) return;
      const bus = context.createGain();
      bus.gain.value = EVENT_GAINS[name];
      bus.connect(effectsBus);
      callback(context.currentTime + .006, bus);
      if (!options.offlineContext) window.setTimeout(() => bus.disconnect(), 1500);
    }
    function runJetpack() {
      if (!jetpackWanted || !musicWanted || engineBus || !ensureAudio()) return;
      const at = context.currentTime + .006;
      engineBus = context.createGain();
      engineBus.gain.setValueAtTime(0, at);
      engineBus.gain.linearRampToValueAtTime(.55, at + .35);
      engineBus.connect(effectsBus);
      // A steady, soft air stream: remove engine harmonics and rapid flutter.
      // Cut both bass rumble and sharp hiss so the sustained sound stays gentle.
      const lowCut = context.createBiquadFilter();
      lowCut.type = 'highpass'; lowCut.frequency.value = 220;
      lowCut.Q.value = .5;
      const highCut = context.createBiquadFilter();
      highCut.type = 'lowpass'; highCut.frequency.value = 1700;
      highCut.Q.value = .5;
      const air = context.createBufferSource();
      const airGain = context.createGain();
      air.buffer = noiseBuffer; air.loop = true; airGain.gain.value = .30;
      air.connect(lowCut); lowCut.connect(highCut);
      highCut.connect(airGain); airGain.connect(engineBus);
      air.start(at);
      engineSources.push(air);
    }
    function stopJetpack() {
      if (!engineBus) return;
      const bus = engineBus;
      moveGain(bus.gain, 0, .22);
      for (const source of engineSources) source.stop(context.currentTime + .24);
      window.setTimeout(() => bus.disconnect(), 350);
      engineSources = []; engineBus = undefined;
    }
    function explosion() {
      effect('explosion', (at, bus) => {
        tone(180, at, .48, { endFrequency: 35, level: .28, attack: .003, release: .44, bus });
        noise(at, .12, .22, 1100, { bus, offset: .63 });
        noise(at + .02, .65, .28, 1500, {
          bus, filterType: 'lowpass', endCutoff: 140, offset: .17, attack: .009
        });
        noise(at + .06, .36, .12, 2100, { bus, filterType: 'bandpass', endCutoff: 600, offset: .82 });
      });
    }
    function setMuted(next) {
      muted = Boolean(next);
      save(muteKey, muted);
      if (muted) {
        stopMusic(); stopJetpack();
        if (master) moveGain(master.gain, 0);
      } else if (ensureAudio()) {
        moveGain(master.gain, .84, .07);
        if (musicWanted) runMusic(false);
        runJetpack();
      }
    }
    function setMusicVolume(next) {
      musicVolume = clamp(Number(next) || 0, 0, 1);
      save(musicKey, musicVolume);
      if (musicBus) moveGain(musicBus.gain, .67 * volumeCurve(musicVolume));
    }
    function setEffectsVolume(next) {
      effectsVolume = clamp(Number(next) || 0, 0, 1);
      save(effectsKey, effectsVolume);
      if (effectsBus) moveGain(effectsBus.gain, .82 * volumeCurve(effectsVolume));
    }
    const api = {
      supported: Boolean(AudioContextClass),
      settings: () => ({ muted, musicVolume, effectsVolume }),
      setMuted, setMusicVolume, setEffectsVolume,
      explosion,
      shieldBreak: explosion,
      jetpack(active) {
        jetpackWanted = Boolean(active);
        if (jetpackWanted) runJetpack(); else stopJetpack();
      },
      setIntensity: (value) => { intensity = clamp(value, 0, 1); },
      start() {
        musicWanted = true;
        effect('start', (at, bus) => {
          [69, 72, 76, 81].forEach((midi, index) => lead(midi, at + index * .095, .23, .09, bus));
        });
        runMusic(true);
      },
      pause() {
        musicWanted = false;
        stopJetpack();
        effect('pause', (at, bus) => {
          tone(hz(76), at, .13, { wave: 'triangle', level: .12, bus });
          tone(hz(69), at + .1, .17, { wave: 'triangle', level: .10, bus });
        });
        stopMusic();
      },
      resume() {
        musicWanted = true;
        effect('resume', (at, bus) => lead(76, at, .17, .12, bus));
        runMusic(false);
        runJetpack();
      },
      end() {
        musicWanted = false;
        jetpackWanted = false; stopJetpack(); stopMusic();
        effect('end', (at, bus) => {
          [76, 72, 69, 64].forEach((midi, index) => lead(midi, at + index * .12, .25, .1, bus));
          tone(100, at, .32, { endFrequency: 54, level: .16, release: .28, bus });
        });
      },
      ready() { musicWanted = false; jetpackWanted = false; stopJetpack(); stopMusic(); },
      jump(second = false) {
        effect('jump', (at, bus) => {
          // A soft tap with a smooth envelope; no noise layer or extra click.
          tone(second ? 220 : 195, at, .045, { endFrequency: 105,
            wave: 'sine', level: .12, attack: .004, release: .038, bus });
        });
      },
      land() {
        if (!context || context.currentTime - lastLandAt < .08) return;
        effect('land', (at, bus) => {
          lastLandAt = at;
          tone(120, at, .095, { endFrequency: 66, level: .13, release: .078, bus });
          noise(at, .072, .08, 550, { bus, filterType: 'lowpass', offset: .41 });
        });
      },
      warning() {
        effect('warning', (at, bus) => {
          for (const offset of [0, .13, .26]) {
            tone(880, at + offset, .082, { wave: 'square', level: .12,
              attack: .003, release: .04, cutoff: 1600, bus });
          }
        });
      },
      collapse() {
        if (!context || context.currentTime - lastCollapseAt < .35) return;
        effect('collapse', (at, bus) => {
          lastCollapseAt = at;
          // Fracture, gravel and a falling mass: noise layers instead of pitched beeps.
          noise(at, .085, .24, 1300, { bus, endCutoff: 3100, offset: .12 });
          noise(at + .035, .78, .25, 700, {
            bus, filterType: 'lowpass', endCutoff: 110, attack: .025, offset: .23
          });
          noise(at + .075, .48, .17, 2400, {
            bus, filterType: 'bandpass', endCutoff: 360, attack: .012, offset: .81
          });
          [0, .11, .23, .35].forEach((offset, index) => {
            noise(at + offset, .075 + index * .018, .10 - index * .012,
              750 + index * 260, { bus, filterType: 'bandpass', offset: .3 + index * .21 });
          });
          tone(92, at + .04, .49, { endFrequency: 37, wave: 'sine',
            level: .13, attack: .02, release: .40, bus });
        });
      },
      shieldPickup() {
        effect('shieldPickup', (at, bus) => {
          [79, 83, 86].forEach((midi, index) => lead(midi, at + index * .08, .28, .12, bus));
        });
      }
    };
    if (options.offlineContext) {
      musicVolume = 1; effectsVolume = 1;
      ensureAudio();
      const name = options.clip;
      if (name === 'bgm' || name === 'bgm-intense') {
        intensity = name === 'bgm-intense' ? 1 : 0;
        musicFader.gain.setValueAtTime(1, 0);
        for (let step = 0; step < 128; step++) scheduleMusicStep(step, .07 + step * STEP_SECONDS);
        const end = options.offlineContext.length / options.offlineContext.sampleRate;
        moveGain(master.gain, .84, .02);
        master.gain.setValueAtTime(.84, end - .45);
        master.gain.linearRampToValueAtTime(0, end - .02);
      } else if (name === 'jetpack') {
        musicWanted = true; jetpackWanted = true; runJetpack();
        engineBus.gain.setValueAtTime(.55, 3.55);
        engineBus.gain.linearRampToValueAtTime(0, 3.95);
        for (const node of engineSources) node.stop(4);
      } else if (name === 'jump2') api.jump(true);
      else api[name]();
    }
    return api;
  }

  const clips = [
    { id: 'bgm', title: '夕阳冲刺 · BGM', group: '音乐', seconds: 16.3, description: '124 BPM，八小节流行风格循环。' },
    { id: 'bgm-intense', title: '夕阳冲刺 · 高速版', group: '音乐', seconds: 16.3, description: '高速时的配器：更密的踩镲与旋律点缀。' },
    { id: 'start', title: '开始冒险', seconds: 1 },
    { id: 'pause', title: '暂停', seconds: .7 },
    { id: 'resume', title: '继续冒险', seconds: .7 },
    { id: 'end', title: '游戏结束', seconds: 1.2 },
    { id: 'jump', title: '第一次跳跃', seconds: .35, description: '轻短的蹬地敲击。' },
    { id: 'jump2', title: '空中二连跳', seconds: .35 },
    { id: 'land', title: '普通落地', seconds: .4 },
    { id: 'warning', title: '前方警报', seconds: .8, description: '三声滴滴滴。' },
    { id: 'shieldPickup', title: '拾取道具', seconds: .8, description: '护盾和喷气背包共用。' },
    { id: 'explosion', title: '爆炸', seconds: 1.2, description: '护盾破裂与喷气落地共用。' },
    { id: 'collapse', title: '地面塌方', seconds: 1.3 },
    { id: 'jetpack', title: '喷气背包 · 轻柔气流', seconds: 4.2, description: '平稳气流，含起停渐变；游戏中按飞行时长持续播放。' }
  ];
  async function renderWav(id) {
    const clip = clips.find((item) => item.id === id);
    if (!clip) throw new Error('Unknown audio clip: ' + id);
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Offline) throw new Error('当前浏览器不支持离线音频导出');
    const context = new Offline(2, Math.ceil(clip.seconds * 44100), 44100);
    create('elsasms.dino-plus.asset-export.', { offlineContext: context, clip: id });
    const audio = await context.startRendering();
    const bytes = new Uint8Array(44 + audio.length * 4);
    const view = new DataView(bytes.buffer);
    const text = (offset, value) => { for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i); };
    text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true);
    view.setUint32(24, 44100, true); view.setUint32(28, 176400, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true);
    text(36, 'data'); view.setUint32(40, bytes.length - 44, true);
    const channels = [audio.getChannelData(0), audio.getChannelData(1)];
    for (let i = 0; i < audio.length; i++) for (let channel = 0; channel < 2; channel++) {
      const sample = clamp(channels[channel][i], -1, 1);
      view.setInt16(44 + (i * 2 + channel) * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
    }
    return bytes;
  }
  window.DinoAudio = { create, clips, renderWav };
})();
