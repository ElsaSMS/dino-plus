/* Achievement bookkeeping shared by the main game, training ground and catalogue. */
(function (global) {
  'use strict';

  const KEY = 'elsasms.dino-plus.v1.achievements';
  const BADGES = './visual-models/achievement-badges/';
  const PAIRS = ['thorn-thorn', 'thorn-bird', 'bird-thorn', 'bird-bird'];
  const CLIFF_KINDS = ['gap', 'collapseGap', 'skyPillar'];
  const listeners = new Set();

  const groups = [
    { id: 'classic', name: '逐光行远', category: '逐光之路', badges: [
      ['bronze', '铜', 'bronze.svg', '经典模式单局达到 10000 米'],
      ['silver', '银', 'silver.svg', '经典模式单局达到 50000 米'],
      ['gold', '金', 'gold.svg', '经典模式累计跑过 1000000 米'],
      ['hidden', '隐藏', 'hidden.svg', null]
    ] },
    { id: 'extreme', name: '万里归途', category: '逐光之路', badges: [
      ['bronze', '铜', 'bronze-extreme.svg', '完成一次极限模式全程'],
      ['silver', '银', 'silver-extreme.svg', '极限模式完赛时续命不超过 60 次'],
      ['gold', '金', 'gold-extreme.svg', '极限模式完赛时续命不超过 15 次'],
      ['hidden', '隐藏', 'hidden-extreme.svg', null]
    ] },
    { id: 'training', name: '初入黄沙', category: '逐光之路', badges: [
      ['wood', '木', 'wood.svg', '使用一次训练营']
    ] },
    { id: 'outfit', name: '自有风姿', category: '逐光之路', badges: [
      ['wood', '木', 'wood-outfit.svg', '点击昵称保存，并分别穿着至少两款装扮开始游戏']
    ] },
    { id: 'thorn', name: '一跃凌棘', category: '身法入微', badges: [
      ['bronze', '铜', 'bronze-thorn.svg', '任意模式中单跳越过一次高荆棘'],
      ['silver', '银', 'silver-thorn.svg', '经典模式单局单跳越过 3 株高荆棘'],
      ['gold', '金', 'gold-thorn.svg', '累计单跳越过 100 株高荆棘'],
      ['hidden', '隐藏', 'hidden-thorn.svg', null]
    ] },
    { id: 'bird', name: '雄踞长空', category: '身法入微', badges: [
      ['bronze', '铜', 'bronze-bird.svg', '任意模式中从上方跃过一次空中飞鸟'],
      ['silver', '银', 'silver-bird.svg', '累计从上方跃过 50 只空中飞鸟'],
      ['gold', '金', 'gold-bird.svg', '单次跳跃越过空中静止或运动小鸟'],
      ['hidden', '隐藏', 'hidden-bird.svg', null]
    ] },
    { id: 'air', name: '横渡苍穹', category: '身法入微', badges: [
      ['bronze', '铜', 'bronze-air-chain.svg', '一次滞空跃过至少两个障碍'],
      ['silver', '银', 'silver-air-chain.svg', '一次滞空跃过多个障碍，其中至少一个为高障碍'],
      ['gold', '金', 'gold-air-chain.svg', '一次滞空跃过多个障碍，其中至少两个为高障碍'],
      ['hidden', '隐藏', 'hidden-air-chain.svg', null]
    ] },
    { id: 'cliff', name: '绝壑回身', category: '身法入微', badges: [
      ['bronze', '铜', 'bronze-cliff.svg', '脚落至画面底端后成功跳出一次悬崖'],
      ['silver', '银', 'silver-cliff.svg', '单局从普通悬崖、塌方和柱子悬崖底部各跳出一次'],
      ['gold', '金', 'gold-cliff.svg', '主动下蹲深入悬崖底部，再成功跳出'],
      ['hidden', '隐藏', 'hidden-cliff.svg', null]
    ] },
    { id: 'dual', name: '双曜同辉', category: '奇遇流光', badges: [
      ['crystal', '水晶', 'crystal.svg', '一秒内连续获得护盾和喷气背包']
    ] },
    { id: 'beak', name: '毫厘惊鸿', category: '奇遇流光', badges: [
      ['crystal', '水晶', 'crystal-beak.svg', '经典模式中被大鸟嘴尖卡在后肢之间而失败']
    ] },
    { id: 'shieldBird', name: '碎光截羽', category: '奇遇流光', badges: [
      ['crystal', '水晶', 'crystal-shield-bird.svg', '破盾时炸掉远处正要冲来的运动飞鸟']
    ] },
    { id: 'jetpackCliff', name: '虹焰填壑', category: '奇遇流光', badges: [
      ['crystal', '水晶', 'crystal-jetpack-cliff.svg', '喷气背包落地时的爆炸填平脚下悬崖']
    ] },
    { id: 'warning', name: '三响从容', category: '奇遇流光', badges: [
      ['crystal', '水晶', 'crystal-triple-warning.svg', '连续三次遇到警报并平安通过']
    ] }
  ];

  // Keep the saved format small and tolerant of older or corrupt browser storage.
  const freshState = () => ({
    version: 2,
    classic: { best: 0, total: 0 },
    extreme: { completions: 0, bestRescues: null },
    trainingUsed: false,
    nameSaved: false,
    outfitsStarted: [],
    thorn: { total: 0, bestClassicRun: 0 },
    bird: { total: 0, smallSingle: false },
    air: { any: false, high: false, twoHigh: false },
    cliff: { any: false, bestKinds: 0, dived: false },
    lucky: { dual: 0, beak: 0, shieldBird: 0, jetpackCliff: 0, warning: 0 },
    unlocked: {}
  });
  const whole = (value) => Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  const boolean = (value) => value === true;
  function existingProfileRecords(state) {
    try {
      const profile = JSON.parse(global.localStorage?.getItem('elsasms.dino-plus.v1.profile') || 'null');
      const priorBest = whole(profile?.best);
      state.classic.best = Math.max(state.classic.best, priorBest);
      state.classic.total = Math.max(state.classic.total, priorBest);
      if (Number.isFinite(profile?.extremeBest) && profile.extremeBest >= 0) {
        const priorRescues = whole(profile.extremeBest);
        state.extreme.completions = Math.max(state.extreme.completions, 1);
        state.extreme.bestRescues = state.extreme.bestRescues === null
          ? priorRescues : Math.min(state.extreme.bestRescues, priorRescues);
      }
    } catch { /* Ignore an unreadable earlier profile. */ }
    if (state.classic.best >= 10000) state.unlocked['classic.bronze'] = true;
    if (state.classic.best >= 50000) state.unlocked['classic.silver'] = true;
    if (state.classic.total >= 1000000) state.unlocked['classic.gold'] = true;
    if (state.extreme.completions > 0) state.unlocked['extreme.bronze'] = true;
    if (state.extreme.bestRescues !== null && state.extreme.bestRescues <= 60) state.unlocked['extreme.silver'] = true;
    if (state.extreme.bestRescues !== null && state.extreme.bestRescues <= 15) state.unlocked['extreme.gold'] = true;
    if (state.extreme.bestRescues === 0) state.unlocked['extreme.hidden'] = true;
  }
  function readState() {
    let saved;
    try { saved = JSON.parse(global.localStorage?.getItem(KEY) || 'null'); } catch { /* Private browsing or invalid JSON. */ }
    const state = freshState();
    if (!saved || typeof saved !== 'object') {
      existingProfileRecords(state);
      return state;
    }
    state.classic.best = whole(saved.classic?.best);
    state.classic.total = whole(saved.classic?.total);
    state.extreme.completions = whole(saved.extreme?.completions);
    state.extreme.bestRescues = Number.isFinite(saved.extreme?.bestRescues) && saved.extreme.bestRescues >= 0
      ? whole(saved.extreme.bestRescues) : null;
    state.trainingUsed = boolean(saved.trainingUsed);
    // Version 1 counted skin selections and inferred a name save from storage;
    // neither proves the two actions required by the current outfit badge.
    const preciseOutfitProgress = Number.isInteger(saved.version) && saved.version >= 2;
    state.nameSaved = preciseOutfitProgress && boolean(saved.nameSaved);
    state.outfitsStarted = preciseOutfitProgress && Array.isArray(saved.outfitsStarted)
      ? [...new Set(saved.outfitsStarted.filter((id) => typeof id === 'string' && id.length < 40))].slice(0, 20) : [];
    state.thorn.total = whole(saved.thorn?.total);
    state.thorn.bestClassicRun = whole(saved.thorn?.bestClassicRun);
    state.bird.total = whole(saved.bird?.total);
    state.bird.smallSingle = boolean(saved.bird?.smallSingle);
    state.air.any = boolean(saved.air?.any);
    state.air.high = boolean(saved.air?.high);
    state.air.twoHigh = boolean(saved.air?.twoHigh);
    state.cliff.any = boolean(saved.cliff?.any);
    state.cliff.bestKinds = Math.min(3, whole(saved.cliff?.bestKinds));
    state.cliff.dived = boolean(saved.cliff?.dived);
    for (const key of Object.keys(state.lucky)) state.lucky[key] = whole(saved.lucky?.[key]);
    if (saved.unlocked && typeof saved.unlocked === 'object') {
      for (const group of groups) for (const [tier] of group.badges) {
        const key = `${group.id}.${tier}`;
        if (group.id === 'outfit' && !preciseOutfitProgress) continue;
        if (saved.unlocked[key] === true) state.unlocked[key] = true;
      }
    }
    if (!state.nameSaved || state.outfitsStarted.length < 2) delete state.unlocked['outfit.wood'];
    existingProfileRecords(state);
    return state;
  }
  let state = readState();
  let run = null;
  function save() {
    try { global.localStorage?.setItem(KEY, JSON.stringify(state)); } catch { /* Gameplay still works without storage. */ }
  }
  function notify() {
    if (!listeners.size) return;
    const view = getView();
    for (const listener of [...listeners]) {
      try { listener(view); } catch { /* A failed panel must not interrupt gameplay. */ }
    }
  }
  function newRun(mode) {
    return {
      mode, finished: false,
      thornSeen: 0, thornSingle: 0,
      birdSeen: 0, birdOver: 0, birdSmallSingle: false,
      airAny: false, airHigh: false, airTwoHigh: false, airPairs: new Set(),
      cliffSeen: 0, cliffAllDived: true, cliffRecovered: new Set(), cliffAny: false, cliffDived: false,
      lucky: { dual: 0, beak: 0, shieldBird: 0, jetpackCliff: 0, warning: 0 },
      warningStreak: 0, lastPickup: null, overflow: false
    };
  }
  function startRun(mode, outfitId) {
    if (!['classic', 'extreme', 'training'].includes(mode)) return;
    state = readState();
    run = newRun(mode);
    if (typeof outfitId === 'string' && outfitId.trim() && outfitId.length < 40
      && !state.outfitsStarted.includes(outfitId)) state.outfitsStarted.push(outfitId);
    award('outfit', [state.nameSaved && state.outfitsStarted.length >= 2]);
    save();
    notify();
  }
  function record(type, payload = {}) {
    if (!run || run.finished) return;
    if (!payload || typeof payload !== 'object') payload = {};
    switch (type) {
      case 'highThornResult':
        run.thornSeen++;
        if (payload.single === true) run.thornSingle++;
        break;
      case 'birdResult':
        run.birdSeen++;
        if (payload.over === true) {
          run.birdOver++;
          if (payload.small === true && payload.single === true) run.birdSmallSingle = true;
        }
        break;
      case 'airCombo': {
        const obstacles = whole(payload.obstacles);
        if (obstacles < 2) break;
        run.airAny = true;
        const kinds = Array.isArray(payload.highKinds)
          ? payload.highKinds.filter((kind) => kind === 'thorn' || kind === 'bird') : [];
        if (kinds.length) run.airHigh = true;
        if (kinds.length >= 2) run.airTwoHigh = true;
        for (let index = 1; index < kinds.length; index++) run.airPairs.add(`${kinds[index - 1]}-${kinds[index]}`);
        break;
      }
      case 'cliffResult':
        if (!CLIFF_KINDS.includes(payload.kind)) break;
        run.cliffSeen++;
        if (payload.recovered === true) {
          run.cliffAny = true;
          run.cliffRecovered.add(payload.kind);
          if (payload.dived === true) run.cliffDived = true;
        }
        if (payload.recovered !== true || payload.dived !== true) run.cliffAllDived = false;
        break;
      case 'pickup': {
        const kind = payload.kind;
        const seconds = payload.seconds;
        if ((kind !== 'shield' && kind !== 'jetpack') || !Number.isFinite(seconds) || seconds < 0) break;
        if (run.lastPickup && run.lastPickup.kind !== kind && seconds >= run.lastPickup.seconds
          && seconds - run.lastPickup.seconds <= 1) run.lucky.dual++;
        run.lastPickup = { kind, seconds };
        break;
      }
      case 'beakDeath':
        if (run.mode === 'classic') run.lucky.beak++;
        break;
      case 'shieldBlastBird': run.lucky.shieldBird++; break;
      case 'jetpackFillGap': run.lucky.jetpackCliff++; break;
      case 'warningClear':
        run.warningStreak++;
        if (run.warningStreak % 3 === 0) run.lucky.warning++;
        break;
      case 'warningFail': run.warningStreak = 0; break;
      case 'overflow': if (run.mode === 'classic') run.overflow = true; break;
      default: return;
    }
    notify();
  }
  function noteNameSaved() {
    state = readState();
    if (state.nameSaved) return;
    state.nameSaved = true;
    award('outfit', [state.outfitsStarted.length >= 2]);
    save(); notify();
  }
  function award(groupId, candidates) {
    const group = groups.find((item) => item.id === groupId);
    if (!group) return;
    for (let index = 0; index < group.badges.length; index++) {
      const tier = group.badges[index][0];
      const key = `${groupId}.${tier}`;
      if (state.unlocked[key]) continue;
      if (index > 0 && !state.unlocked[`${groupId}.${group.badges[index - 1][0]}`]) break;
      if (!candidates[index]) break;
      state.unlocked[key] = true;
    }
  }
  function finishRun({ distance = 0, completedExtreme = false, rescues = 0, overflow = false } = {}) {
    if (!run || run.finished) return getView();
    run.finished = true;
    state = readState();
    const meters = whole(distance);
    const didOverflow = run.mode === 'classic' && (overflow === true || run.overflow);
    const extremeCompleted = run.mode === 'extreme' && completedExtreme === true && meters >= 100000;
    const effectiveMeters = didOverflow ? Math.max(meters, 2147483648) : meters;
    if (run.mode === 'classic') {
      // Achievement progress remembers the distance even when the game omits a whiteout from its score history.
      state.classic.best = Math.max(state.classic.best, effectiveMeters);
      state.classic.total += effectiveMeters;
    }
    if (extremeCompleted) {
      state.extreme.completions++;
      const used = whole(rescues);
      state.extreme.bestRescues = state.extreme.bestRescues === null ? used : Math.min(state.extreme.bestRescues, used);
    }
    if (run.mode === 'training') state.trainingUsed = true;
    state.thorn.total += run.thornSingle;
    if (run.mode === 'classic') state.thorn.bestClassicRun = Math.max(state.thorn.bestClassicRun, run.thornSingle);
    state.bird.total += run.birdOver;
    state.bird.smallSingle ||= run.birdSmallSingle;
    state.air.any ||= run.airAny;
    state.air.high ||= run.airHigh;
    state.air.twoHigh ||= run.airTwoHigh;
    state.cliff.any ||= run.cliffAny;
    state.cliff.bestKinds = Math.max(state.cliff.bestKinds, run.cliffRecovered.size);
    state.cliff.dived ||= run.cliffDived;
    for (const kind of Object.keys(state.lucky)) state.lucky[kind] += run.lucky[kind];

    const classicBest = state.classic.best;
    const classicTotalForAward = state.classic.total;
    award('classic', [classicBest >= 10000, classicBest >= 50000,
      classicTotalForAward >= 1000000, didOverflow]);
    award('extreme', [state.extreme.completions > 0,
      state.extreme.bestRescues !== null && state.extreme.bestRescues <= 60,
      state.extreme.bestRescues !== null && state.extreme.bestRescues <= 15,
      extremeCompleted && whole(rescues) === 0]);
    award('training', [state.trainingUsed]);
    award('outfit', [state.nameSaved && state.outfitsStarted.length >= 2]);
    award('thorn', [state.thorn.total >= 1, state.thorn.bestClassicRun >= 3,
      state.thorn.total >= 100,
      extremeCompleted && run.thornSeen > 0 && run.thornSingle === run.thornSeen]);
    award('bird', [state.bird.total >= 1, state.bird.total >= 50,
      state.bird.smallSingle,
      extremeCompleted && run.birdSeen > 0 && run.birdOver === run.birdSeen]);
    award('air', [state.air.any, state.air.high, state.air.twoHigh,
      PAIRS.every((pair) => run.airPairs.has(pair))]);
    award('cliff', [state.cliff.any, state.cliff.bestKinds >= 3,
      state.cliff.dived,
      extremeCompleted && run.cliffSeen > 0 && run.cliffAllDived]);
    for (const kind of Object.keys(state.lucky)) {
      const groupId = kind === 'dual' ? 'dual' : kind === 'beak' ? 'beak'
        : kind === 'shieldBird' ? 'shieldBird' : kind === 'jetpackCliff' ? 'jetpackCliff' : 'warning';
      award(groupId, [state.lucky[kind] > 0]);
    }
    save(); notify();
    return getView();
  }
  function capped(number, target) { return `${Math.min(whole(number), target)}/${target}`; }
  function getView() {
    const pending = run && !run.finished ? run : null;
    const liveThorn = state.thorn.total + (pending?.thornSingle || 0);
    const liveBird = state.bird.total + (pending?.birdOver || 0);
    const liveLucky = (kind) => state.lucky[kind] + (pending?.lucky[kind] || 0);
    const bestCliff = Math.max(state.cliff.bestKinds, pending?.cliffRecovered.size || 0);
    const progress = {
      classic: [capped(state.classic.best, 10000), capped(state.classic.best, 50000), capped(state.classic.total, 1000000)],
      extreme: [capped(state.extreme.completions, 1),
        state.extreme.bestRescues === null ? '最佳续命：尚未完赛' : `最佳续命：${state.extreme.bestRescues} 次`,
        state.extreme.bestRescues === null ? '最佳续命：尚未完赛' : `最佳续命：${state.extreme.bestRescues} 次`],
      training: [capped(state.trainingUsed || pending?.mode === 'training' ? 1 : 0, 1)],
      outfit: [`${(state.nameSaved ? 1 : 0) + (state.outfitsStarted.length >= 2 ? 1 : 0)}/2`],
      thorn: [capped(liveThorn, 1), capped(Math.max(state.thorn.bestClassicRun,
        pending?.mode === 'classic' ? pending.thornSingle : 0), 3), capped(liveThorn, 100)],
      bird: [capped(liveBird, 1), capped(liveBird, 50), capped(state.bird.smallSingle || pending?.birdSmallSingle ? 1 : 0, 1)],
      air: [capped(state.air.any || pending?.airAny ? 1 : 0, 1),
        capped(state.air.high || pending?.airHigh ? 1 : 0, 1),
        capped(state.air.twoHigh || pending?.airTwoHigh ? 1 : 0, 1)],
      cliff: [capped(state.cliff.any || pending?.cliffAny ? 1 : 0, 1), capped(bestCliff, 3),
        capped(state.cliff.dived || pending?.cliffDived ? 1 : 0, 1)],
      dual: [`当前遇到 ${liveLucky('dual')} 次`],
      beak: [`当前遇到 ${liveLucky('beak')} 次`],
      shieldBird: [`当前遇到 ${liveLucky('shieldBird')} 次`],
      jetpackCliff: [`当前遇到 ${liveLucky('jetpackCliff')} 次`],
      warning: [`当前遇到 ${liveLucky('warning')} 次`]
    };
    return { groups: groups.map((group) => ({
      id: group.id, name: group.name, category: group.category,
      awards: group.badges.map(([tier, label, file, requirement], index) => {
        const hidden = tier === 'hidden';
        const unlocked = state.unlocked[`${group.id}.${tier}`] === true;
        return { tier, label, image: `${BADGES}${file}`,
          requirement: hidden ? null : requirement,
          progress: hidden ? (unlocked ? '已获得' : '尚未发现') : progress[group.id][index],
          unlocked, hidden };
      })
    })) };
  }
  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  function refresh() {
    if (run && !run.finished) return getView();
    state = readState();
    notify();
    return getView();
  }
  global.DinoAchievements = { startRun, record, finishRun, noteNameSaved, getView, subscribe, refresh };
})(typeof window !== 'undefined' ? window : globalThis);
