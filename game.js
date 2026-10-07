(() => {
  'use strict';

  const STORAGE_PREFIX = 'elsasms.dino-plus.v1.';
  const PROFILE_KEY = `${STORAGE_PREFIX}profile`;
  const LEGACY_PROFILES_KEY = `${STORAGE_PREFIX}profiles`;
  const ACTIVE_KEY = `${STORAGE_PREFIX}active-name`;
  const W = 1000;
  const H = 430;
  const GROUND = 320;
  const FALL_SCREEN_LIMIT = H + 80;
  const SKY_PILLAR_BOTTOM = GROUND - 52;
  const PLAYER_X = 185;
  const GRAVITY = 1700;
  const DIVE_GRAVITY = 9000;
  const DIVE_MAX_VELOCITY = 1200;
  const JUMP_VELOCITY = -650;
  const BASE_SPEED = 350;
  const MAX_SPEED = BASE_SPEED * 3.2;
  const EXTREME_SPEED = BASE_SPEED * 3.6;
  const EXTREME_MIN_CLIFF_WIDTH = 780;
  const EXTREME_DISTANCE = 100000 * 10; // Displayed meters -> world units.
  const CLASSIC_INT_MAX = 2147483647;
  const OVERFLOW_DEMO_START = 2147483000 * 10;
  const DOUBLE_SPEED_DISTANCE = 10000;
  const TRIPLE_SPEED_DISTANCE = 100000;
  const MAX_SPEED_DISTANCE = 120000;
  const SCENE_TALL_THORN_CHANCE = .12;
  const ADVANCED_DISTANCE = 20000;
  const MAX_OBSTACLE_GAP_TIME = 1.12;
  const COLLAPSE_WARNING_TIME = .30;
  const COLLAPSE_DURATION = .22;
  const HAZARD_WARNING_TIME = .8;
  const MOVING_BIRD_ENTRY = W - PLAYER_X - 119;
  const MOVING_BIRD_FLIGHT_LEAD = 120;
  const SHIELD_HARD_DROP_CHANCE = .02;
  const SHIELD_OTHER_DROP_CHANCE = .01;
  const SHIELD_DROP_SPACING = 1800;
  const SHIELD_BUFFER_SECONDS = 2;
  const SHIELD_WARNING_SPAWN_DELAY = 2.8;
  const SHIELD_BREAK_EFFECT_SECONDS = .65;
  const SHIELD_BLAST_SPEED = 2600;
  const SHIELD_PICKUP_RADIUS = 19;
  const JETPACK_DISTANCE = 8000; // World units: 10 pixels of travel per displayed meter.
  const trainingMode = Boolean(window.DinoTraining);
  const overflowDemo = window.DinoOverflowDemo === true;
  const { RAINBOW, birdStyles, thornPalettes, outfits,
    highBirdWingPoints, outlinePoints, thornModules } = window.DinoModels;
  const highBirdWingTip = (o) => window.DinoModels.highBirdWingTip(o, elapsed);
  const giantBirdParts = (o) => window.DinoModels.giantBirdParts(o, elapsed);
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const ui = {
    overlay: $('overlay'), kicker: $('overlay-kicker'), title: $('overlay-title'), copy: $('overlay-copy'),
    startButton: $('start-button'), startLabel: $('start-button-label'), pauseButton: $('pause-button'),
    status: $('status-text'), pill: $('status-pill'), distance: $('distance'), best: $('best'),
    bestLabel: $('best-label'), distanceLabel: $('distance-label'),
    extremeBest: $('extreme-best'), extremeRecent: $('extreme-recent'),
    profileBest: $('profile-best'), recordNote: $('record-note'), recent: $('recent-list'),
    name: $('name-input'), nameHint: $('name-hint'), outfitGrid: $('outfit-grid'),
    warning: $('hazard-warning'), whiteout: $('overflow-whiteout'), audioToggle: $('audio-toggle'),
    countdown: $('resume-countdown'), countdownNumber: $('resume-countdown-number'),
    musicVolume: $('music-volume'), effectsVolume: $('effects-volume')
  };
  const noSound = () => {};
  const sound = window.DinoAudio?.create(STORAGE_PREFIX) || {
    supported: false, settings: () => ({ muted: true, musicVolume: .55, effectsVolume: .55 }),
    setMuted: noSound, setMusicVolume: noSound, setEffectsVolume: noSound, setIntensity: noSound,
    start: noSound, pause: noSound, resume: noSound, end: noSound,
    ready: noSound, jump: noSound, land: noSound, warning: noSound,
    collapse: noSound, shieldPickup: noSound, shieldBreak: noSound,
    explosion: noSound, jetpack: noSound
  };
  const achievements = (!overflowDemo && window.DinoAchievements) || {
    startRun: noSound, record: noSound, finishRun: noSound,
    noteNameSaved: noSound, snapshotRun: () => null, restoreRun: () => true
  };
  const runSessions = overflowDemo ? null
    : (window.DinoRunSessions?.create(`${STORAGE_PREFIX}run-sessions.v1`) ?? null);
  const volatileSlots = new Map();
  const currentSlot = () => trainingMode ? 'training' : extremeMode ? 'extreme' : 'classic';
  function updateAudioControls() {
    const { muted, musicVolume, effectsVolume } = sound.settings();
    ui.audioToggle.setAttribute('aria-pressed', String(!muted));
    ui.audioToggle.textContent = muted ? '♪ 静音' : '♫ 声音';
    ui.audioToggle.title = muted ? '开启游戏声音' : '关闭游戏声音';
    ui.musicVolume.value = String(Math.round(musicVolume * 100));
    ui.effectsVolume.value = String(Math.round(effectsVolume * 100));
    ui.audioToggle.disabled = !sound.supported;
    ui.musicVolume.disabled = !sound.supported;
    ui.effectsVolume.disabled = !sound.supported;
  }

  function readStore(key, fallback) {
    try { const value = localStorage.getItem(key); return value === null ? fallback : JSON.parse(value); }
    catch { return fallback; }
  }
  function writeStore(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
  }
  let activeName = readStore(ACTIVE_KEY, '小小冒险家');
  if (typeof activeName !== 'string' || !activeName.trim()) activeName = '小小冒险家';
  const isProfile = (value) => value && typeof value === 'object' && !Array.isArray(value);
  const legacyProfiles = readStore(LEGACY_PROFILES_KEY, null);
  const legacyProfile = isProfile(legacyProfiles)
    ? (Object.hasOwn(legacyProfiles, activeName) && isProfile(legacyProfiles[activeName])
      ? legacyProfiles[activeName] : Object.values(legacyProfiles).find(isProfile)) : null;
  function ensureProfile(value) {
    const profile = isProfile(value) ? value : { best: 0, recent: [], outfit: 'explorer' };
    if (!Number.isFinite(profile.best) || profile.best < 0) profile.best = 0;
    if (!Array.isArray(profile.recent)) profile.recent = [];
    const validRescues = (n) => Number.isSafeInteger(n) && n >= 0;
    if (!validRescues(profile.extremeBest)) profile.extremeBest = null;
    profile.extremeRecent = Array.isArray(profile.extremeRecent)
      ? profile.extremeRecent.filter(validRescues).slice(0, 5) : [];
    if (!outfits[profile.outfit]) profile.outfit = 'explorer';
    return profile;
  }
  const storedProfile = readStore(PROFILE_KEY, null);
  const profile = ensureProfile(isProfile(storedProfile) ? storedProfile : legacyProfile);
  if (writeStore(PROFILE_KEY, profile) && legacyProfiles !== null) {
    try { localStorage.removeItem(LEGACY_PROFILES_KEY); } catch { /* Keep the legacy backup if storage is read-only. */ }
  }
  let mode = 'ready';
  let worldX = 0;
  let speed = BASE_SPEED;
  let obstacles = [];
  let shieldPickups = [];
  let jetpackPickups = [];
  let jetpackActive = false;
  let jetpackStartX = 0;
  let jetpackStartY = GROUND;
  let lastJetpackDropX = -Infinity;
  let nextObstacleX = 850;
  let lastShieldDropX = -Infinity;
  let powerupEpochX = 0;
  let elapsed = 0;
  let lastFrame = 0;
  let countdownRemaining = 0;
  let player = { feetY: GROUND, vy: 0, jumps: 0, crouch: false, grounded: true, diving: false };
  const downKeys = new Set();
  let touchDownHeld = false;
  const isDownHeld = () => downKeys.size > 0 || touchDownHeld;
  let highScoreFlash = 0;
  let recordCelebrated = false;
  let extremeMode = false;
  let rescueCount = 0;
  let shieldUntil = 0;
  let shieldReady = false;
  let shieldBufferUntil = 0;
  let shieldWarningSpawnAfter = 0;
  let shieldRecoverySpawnPending = false;
  let shieldWarningSpawnPending = false;
  let shieldBreakAt = -Infinity;
  let shieldBreakX = 0;
  let shieldBreakY = 0;
  let shieldDebris = [];
  let blastColorful = false;
  let achievementRunMode = null;
  let achievementAir = null;
  let achievementAirSerial = 0;
  let blastCause = null;
  let jetpackLandingGap = null;

  const rand = (min, max) => min + Math.random() * (max - min);
  const progress = (x) => Math.min(1, Math.max(0, x / 7000));
  const latePressure = (x) => 1 - Math.exp(-Math.max(0, x - TRIPLE_SPEED_DISTANCE) / 240000);
  const speedAt = (x) => x <= DOUBLE_SPEED_DISTANCE
    ? BASE_SPEED * (1 + Math.max(0, x) / DOUBLE_SPEED_DISTANCE)
    : x <= TRIPLE_SPEED_DISTANCE
      ? BASE_SPEED * (2 + (x - DOUBLE_SPEED_DISTANCE) / (TRIPLE_SPEED_DISTANCE - DOUBLE_SPEED_DISTANCE))
      : Math.min(MAX_SPEED, BASE_SPEED * 3 + (MAX_SPEED - BASE_SPEED * 3)
        * (x - TRIPLE_SPEED_DISTANCE) / (MAX_SPEED_DISTANCE - TRIPLE_SPEED_DISTANCE));
  const trainingSpeed = () => window.DinoTraining?.speedMultiplier?.() === 3.6 ? 3.6 : 3.2;
  const runSpeedAt = (x) => trainingMode ? BASE_SPEED * trainingSpeed() : extremeMode ? EXTREME_SPEED : speedAt(x);
  const runPressure = (x) => extremeMode ? 1 : latePressure(x);
  // x is actual player travel since the most recent start / blast, in world pixels.
  const powerupMultiplier = (x) => x <= 10000 ? 0 : x >= 80000 ? 3 : Math.log2(x / 10000);
  const movingBirdSpeed = (obstacle) => (obstacle.baseFlightSpeed ?? 110) * (speed / BASE_SPEED);
  const isGapKind = (kind) => kind === 'gap' || kind === 'collapseGap';
  const isThornKind = (kind) => ['cactus', 'bramble', 'tallThorn'].includes(kind);
  const isOpenGap = (obstacle) => obstacle.kind === 'gap' || (obstacle.kind === 'collapseGap' && obstacle.collapsed);
  const isDoubleJumpObstacle = (kind) => kind === 'giantGround' || kind === 'bramble' || kind === 'tallThorn' || kind === 'skyPillar' || isGapKind(kind);
  const isMovingBird = (kind) => kind === 'movingHigh' || kind === 'movingLow';
  const score = () => Math.max(0, Math.floor(worldX / 10));
  const padded = (n) => String(Math.floor(n)).padStart(4, '0');
  function updateProfileUI() {
    ui.name.value = activeName;
    ui.bestLabel.textContent = trainingMode ? '本轮续命' : extremeMode ? '最佳 · 续命次数' : '历史最佳';
    ui.distanceLabel.textContent = trainingMode ? '练习距离' : extremeMode ? '进度 · 共 100000 米' : '本次距离';
    ui.best.textContent = trainingMode ? String(rescueCount) : extremeMode ? (profile.extremeBest ?? '—') : padded(profile.best);
    ui.extremeBest.textContent = profile.extremeBest ?? '—';
    ui.extremeRecent.replaceChildren();
    if (!profile.extremeRecent.length) {
      const li = document.createElement('li'); li.className = 'empty-record';
      li.textContent = '还没有完成极限挑战'; ui.extremeRecent.append(li);
    } else {
      profile.extremeRecent.forEach((value, index) => {
        const li = document.createElement('li');
        const left = document.createElement('span'); left.textContent = index === 0 ? '最近一次' : '前 ' + index + ' 次';
        const right = document.createElement('strong'); right.textContent = value + ' 次续命';
        li.append(left, right); ui.extremeRecent.append(li);
      });
    }
    ui.profileBest.textContent = padded(profile.best);
    ui.recordNote.textContent = profile.best > 0 ? `${activeName} 的个人最佳纪录` : '第一次冒险在等你出发。';
    ui.outfitGrid.querySelectorAll('[data-outfit]').forEach((button) => {
      const selected = button.dataset.outfit === profile.outfit;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
      window.DinoModels.drawOutfitPortrait(button.querySelector('canvas'), button.dataset.outfit);
    });
    ui.recent.replaceChildren();
    const recent = profile.recent.slice(0, 5).filter((n) => Number.isFinite(n));
    if (!recent.length) {
      const li = document.createElement('li'); li.className = 'empty-record'; li.textContent = '还没有跑酷纪录'; ui.recent.append(li);
    } else {
      recent.forEach((value, index) => {
        const li = document.createElement('li');
        const left = document.createElement('span'); left.textContent = `第 ${index + 1} 次`;
        const right = document.createElement('strong'); right.textContent = `${padded(value)} 米`;
        li.append(left, right); ui.recent.append(li);
      });
    }
  }
  function showOverlay(kicker, title, copy, button) {
    ui.kicker.textContent = kicker; ui.title.textContent = title; ui.copy.textContent = copy;
    ui.startLabel.textContent = button; ui.overlay.inert = false; ui.overlay.classList.remove('hidden');
  }
  function hideOverlay() {
    if (document.activeElement === ui.startButton) ui.startButton.blur();
    ui.overlay.inert = true;
    ui.overlay.classList.add('hidden');
  }
  function setMode(next) {
    mode = next;
    if (mode !== 'overflow') {
      ui.status.textContent = ({ ready: '准备出发', running: '正在冒险', paused: '已暂停', countdown: '即将继续', over: '本轮结束' })[mode];
    }
    ui.pill.dataset.mode = mode;
    ui.pauseButton.disabled = mode === 'ready' || mode === 'over' || mode === 'overflow';
    ui.pauseButton.textContent = mode === 'paused' ? '继续' : mode === 'countdown' ? '取消倒计时' : '暂停';
    if (mode !== 'running') ui.warning.hidden = true;
  }
  function captureRunState() {
    return {
      version: 1, slot: currentSlot(), mode: mode === 'running' || mode === 'countdown' ? 'paused' : mode,
      worldX, speed, elapsed, player, obstacles, nextObstacleX,
      shieldPickups, jetpackPickups, shieldReady, shieldUntil, shieldBufferUntil,
      shieldWarningSpawnAfter, shieldRecoverySpawnPending, shieldWarningSpawnPending,
      shieldBreakAt, shieldBreakX, shieldBreakY, shieldDebris, blastColorful, blastCause,
      jetpackActive, jetpackStartX, jetpackStartY, jetpackLandingGap,
      lastShieldDropX, lastJetpackDropX, powerupEpochX,
      highScoreFlash, recordCelebrated, rescueCount,
      achievementAir, achievementAirSerial, achievementRunMode,
      achievementRun: achievements.snapshotRun?.() ?? null,
      distanceText: ui.distance.textContent,
      overlay: { kicker: ui.kicker.textContent, title: ui.title.textContent,
        copy: ui.copy.textContent, button: ui.startLabel.textContent }
    };
  }
  function saveRunSlot() {
    if (overflowDemo) return true;
    const slot = currentSlot();
    const snapshot = captureRunState();
    volatileSlots.set(slot, snapshot);
    const saved = runSessions?.set(slot, snapshot) === true;
    return trainingMode ? saved : runSessions?.setMainMode(slot) === true && saved;
  }
  function forgetRunSlot(slot = currentSlot()) {
    volatileSlots.delete(slot);
    runSessions?.clear(slot);
  }
  function restoreRunSlot(slot) {
    const snapshot = volatileSlots.get(slot) || runSessions?.get(slot);
    if (!snapshot) return false;
    if (snapshot.version !== 1 || snapshot.slot !== slot
      || !['ready', 'paused', 'over', 'overflow'].includes(snapshot.mode)
      || !Number.isFinite(snapshot.worldX) || snapshot.worldX < 0
      || !Number.isFinite(snapshot.elapsed) || snapshot.elapsed < 0
      || !Number.isFinite(snapshot.speed) || snapshot.speed <= 0
      || !snapshot.player || typeof snapshot.player !== 'object'
      || !Array.isArray(snapshot.obstacles) || !Array.isArray(snapshot.shieldPickups)
      || !Array.isArray(snapshot.jetpackPickups)
      || (snapshot.achievementRunMode !== null && snapshot.achievementRunMode !== slot)
      || (snapshot.achievementRunMode === null) !== (snapshot.achievementRun === null)
      || !achievements.restoreRun?.(snapshot.achievementRun, slot)) {
      forgetRunSlot(slot);
      return false;
    }
    ({ worldX, speed, elapsed, player, obstacles, nextObstacleX,
      shieldPickups, jetpackPickups, shieldReady, shieldUntil, shieldBufferUntil,
      shieldWarningSpawnAfter, shieldRecoverySpawnPending, shieldWarningSpawnPending,
      shieldBreakAt, shieldBreakX, shieldBreakY, shieldDebris, blastColorful, blastCause,
      jetpackActive, jetpackStartX, jetpackStartY, jetpackLandingGap,
      lastShieldDropX, lastJetpackDropX, powerupEpochX,
      highScoreFlash, recordCelebrated, rescueCount,
      achievementAir, achievementAirSerial, achievementRunMode } = snapshot);
    downKeys.clear(); touchDownHeld = false; player.crouch = false;
    countdownRemaining = 0; ui.countdown.hidden = true;
    lastFrame = 0;
    sound.ready();
    sound.jetpack(jetpackActive);
    setMode(snapshot.mode);
    ui.distance.textContent = snapshot.distanceText || padded(score());
    ui.warning.hidden = true;
    if (ui.whiteout) ui.whiteout.hidden = snapshot.mode !== 'overflow';
    if (snapshot.mode === 'overflow') {
      modeReset.hidden = false; modeReset.disabled = false;
      hideOverlay();
    } else if (snapshot.overlay && typeof snapshot.overlay.title === 'string') {
      showOverlay(snapshot.overlay.kicker, snapshot.overlay.title,
        snapshot.overlay.copy, snapshot.overlay.button);
    } else if (snapshot.mode === 'ready') showReadyOverlay();
    else showOverlay('TAKE A BREATH', '歇一歇，马上继续',
      '准备好后继续奔跑，或者按 P 键倒数三秒后继续。', '继续冒险');
    updateProfileUI();
    return true;
  }
  function settleAchievementRun(options = {}) {
    if (!achievementRunMode) return;
    cancelAchievementAir();
    achievements.finishRun({ distance: score(), completedExtreme: Boolean(options.completedExtreme),
      rescues: rescueCount, overflow: Boolean(options.overflow) });
    achievementRunMode = null;
  }
  function resetGame({ settle = true, forget = true } = {}) {
    if (settle) settleAchievementRun();
    if (forget) forgetRunSlot();
    sound.ready();
    worldX = 0; speed = runSpeedAt(0); obstacles = []; shieldPickups = [];
    jetpackPickups = []; jetpackActive = false; jetpackStartX = 0; jetpackStartY = GROUND;
    lastJetpackDropX = -Infinity; blastColorful = false;
    nextObstacleX = 780;
    lastShieldDropX = -Infinity;
    powerupEpochX = 0;
    elapsed = 0; highScoreFlash = 0; recordCelebrated = false;
    rescueCount = 0; shieldUntil = 0;
    if (trainingMode) ui.best.textContent = '0';
    shieldReady = false; shieldBufferUntil = 0; shieldWarningSpawnAfter = 0;
    shieldRecoverySpawnPending = false; shieldWarningSpawnPending = false;
    shieldBreakAt = -Infinity;
    shieldDebris = [];
    achievementAir = null; blastCause = null; jetpackLandingGap = null;
    downKeys.clear(); touchDownHeld = false;
    countdownRemaining = 0; ui.countdown.hidden = true;
    ui.warning.hidden = true;
    if (ui.whiteout) ui.whiteout.hidden = true;
    if (!extremeMode) { modeReset.hidden = true; modeReset.disabled = true; }
    player = { feetY: GROUND, vy: 0, jumps: 0, crouch: false, grounded: true, diving: false };
    ui.distance.textContent = '0000';
    fillObstacles();
  }
  function resumeGame() {
    if (!achievementRunMode) {
      achievementRunMode = trainingMode ? 'training' : extremeMode ? 'extreme' : 'classic';
      achievements.startRun(achievementRunMode, profile.outfit);
    }
    countdownRemaining = 0;
    ui.countdown.hidden = true;
    setMode('running'); hideOverlay(); sound.resume();
  }
  function startGame() {
    if (mode === 'paused') { resumeGame(); return; }
    resetGame();
    if (overflowDemo && !trainingMode && !extremeMode) {
      worldX = OVERFLOW_DEMO_START;
      speed = runSpeedAt(worldX);
      obstacles = []; shieldPickups = []; jetpackPickups = [];
      nextObstacleX = Infinity;
      recordCelebrated = true;
      ui.distance.textContent = String(score());
    }
    achievementRunMode = trainingMode ? 'training' : extremeMode ? 'extreme' : 'classic';
    achievements.startRun(achievementRunMode, profile.outfit);
    setMode('running'); hideOverlay(); sound.start();
  }
  function pauseGame() {
    if (mode === 'running') {
      sound.pause();
      setMode('paused'); showOverlay('TAKE A BREATH', '歇一歇，马上继续', '准备好后继续奔跑，或者按 P 键倒数三秒后继续。', '继续冒险');
    } else if (mode === 'paused') {
      downKeys.clear(); touchDownHeld = false; player.crouch = false;
      countdownRemaining = 3;
      ui.countdownNumber.textContent = '3';
      ui.countdown.hidden = false;
      setMode('countdown'); hideOverlay();
    } else if (mode === 'countdown') {
      countdownRemaining = 0;
      ui.countdown.hidden = true;
      setMode('paused'); showOverlay('TAKE A BREATH', '歇一歇，马上继续', '准备好后继续奔跑，或者按 P 键倒数三秒后继续。', '继续冒险');
    }
  }
  function jump() {
    if (mode === 'over') return;
    if (mode === 'ready' || mode === 'over') startGame();
    if (mode !== 'running' || player.jumps >= 2 || jetpackActive) return;
    const fromGround = player.grounded;
    player.vy = JUMP_VELOCITY;
    player.jumps += 1;
    if (!achievementAir || fromGround) {
      if (achievementAir) cancelAchievementAir();
      achievementAir = {
        id: ++achievementAirSerial, cleared: [], birds: new Set(), bodyAbove: new Set(),
        birdStarts: new Map(obstacles.filter((obstacle) => isAerialBird(obstacle.kind)
          || isMovingBird(obstacle.kind))
          .map((obstacle) => [obstacle, obstacle.x])),
        groundTakeoff: fromGround && hasGroundSupport(worldX) && Math.abs(player.feetY - GROUND) <= 1,
        takeoffRight: worldX + 20 * (player.crouch ? 1.17 : 1),
        maxJumps: player.jumps
      };
    } else {
      achievementAir.maxJumps = Math.max(achievementAir.maxJumps, player.jumps);
    }
    sound.jump(player.jumps === 2);
    player.grounded = false;
    player.crouch = false;
    player.diving = false;
    if (fromGround) player.feetY = Math.min(player.feetY, GROUND - 1);
  }
  function pressDown() {
    if (mode === 'paused' || mode === 'countdown' || mode === 'over' || mode === 'overflow' || jetpackActive) return;
    if (mode === 'running') achievements.record('crouch', { distance: score() });
    if (player.grounded) { player.crouch = true; return; }
    if (player.feetY < H) for (const obstacle of obstacles) {
      if (isGapKind(obstacle.kind) && isOpenGap(obstacle)
        && worldX > obstacle.x && worldX < obstacle.x + obstacle.width) {
        achievementState(obstacle).dived = true;
      }
    }
    player.diving = true;
    player.vy = Math.max(player.vy, 0);
  }
  function endGame() {
    if (mode !== 'running') return;
    settleAchievementRun();
    setMode('over'); sound.end();
    const finalScore = score();
    if (extremeMode) {
      showOverlay('EXTREME RUN', '挑战未完成',
        '这次挑战跑了 ' + finalScore + ' 米，成绩不会写入历史纪录。', '再来一次');
    } else {
      profile.recent.unshift(finalScore); profile.recent = profile.recent.slice(0, 5);
      const isRecord = finalScore > profile.best;
      if (isRecord) profile.best = finalScore;
      writeStore(PROFILE_KEY, profile);
      updateProfileUI();
      showOverlay(isRecord ? 'NEW PERSONAL BEST!' : 'THE RUN IS OVER', isRecord ? '新纪录，太精彩了！' : '别停，再跑一次！', `这次跑了 ${finalScore} 米。${isRecord ? '你的新纪录已保存。' : '再试试突破个人最佳。'}`, '再来一次');
    }
  }
  function triggerClassicOverflow() {
    if (trainingMode || extremeMode || mode !== 'running') return;
    // The world position stays precise; only the classic distance counter uses signed 32-bit arithmetic.
    ui.distance.textContent = String(score() | 0);
    achievements.record('overflow');
    settleAchievementRun({ overflow: true });
    setMode('overflow');
    sound.ready();
    sound.explosion();
    ui.whiteout.hidden = false;
    modeReset.hidden = false;
    modeReset.disabled = false;
    modeReset.title = '将本轮进度归零';
  }
  function finishExtreme() {
    if (!extremeMode || mode !== 'running' || worldX < EXTREME_DISTANCE) return;
    worldX = EXTREME_DISTANCE;
    ui.distance.textContent = String(EXTREME_DISTANCE / 10);
    settleAchievementRun({ completedExtreme: true });
    setMode('over'); sound.end();
    const isRecord = profile.extremeBest === null || rescueCount < profile.extremeBest;
    if (isRecord) profile.extremeBest = rescueCount;
    profile.extremeRecent.unshift(rescueCount);
    profile.extremeRecent = profile.extremeRecent.slice(0, 5);
    const saved = writeStore(PROFILE_KEY, profile);
    updateProfileUI();
    showOverlay(isRecord ? 'NEW EXTREME BEST!' : 'EXTREME COMPLETE', '十万米，挑战完成！',
      '跑完 100000 米，共续命 ' + rescueCount + ' 次。' + (isRecord ? '创造了个人最佳！' : '续命越少，成绩越好。') + (saved ? '' : '浏览器未能保存，本次纪录仅在当前页面有效。'), '再挑战一次');
  }
  function showReadyOverlay() {
    if (trainingMode) {
      showOverlay('PRACTICE RUN', '把每一关练成拿手好戏',
        `全程固定 ${trainingSpeed().toFixed(1)} 倍速，只会遇到你选中的单体障碍。碰撞后可继续练习。`, '开始练习');
      return;
    }
    showOverlay(extremeMode ? 'THE EXTREME RUN' : 'READY TO RUN?',
      extremeMode ? '十万米，挑战你的极限' : '冒险，从这一跃开始',
      extremeMode ? '全程 3.6 倍速，无道具、无限续命。跑完 100000 米，续命次数越少，成绩越好。'
        : '空格跳跃，再按一次完成二连跳。空中按 ↓ 或 S 键快速下坠，落地后下蹲。',
      extremeMode ? '开始极限挑战' : '开始冒险');
  }
  function makeObstacle(kind, x, width, extra = {}) {
    const seed = Math.random() * 10;
    const thornStyle = isThornKind(kind)
      ? { height: kind === 'tallThorn' ? 119 + Math.floor(seed * .5) : 34 + Math.floor(seed * 3.1), palette: Math.floor(seed * 3) % thornPalettes.length }
      : {};
    const motion = isMovingBird(kind)
      ? { baseFlightSpeed: 100 + seed * 2, flightSpeed: (100 + seed * 2) * (speed / BASE_SPEED) }
      : {};
    return { kind, x, width, seed, ...thornStyle, ...motion, ...extra };
  }
  function maybeDropPowerup(obstacle) {
    if (extremeMode || trainingMode) return;
    if (jetpackActive) return;
    let x; let y;
    const centerX = obstacle.x + obstacle.width * .5;
    if (obstacle.kind === 'duck' || obstacle.kind === 'movingHigh') {
      x = obstacle.x + 29; y = GROUND - 183;
    } else if (obstacle.kind === 'jump' || obstacle.kind === 'movingLow') {
      x = obstacle.x + 29; y = GROUND - 111;
    } else if (obstacle.kind === 'gap' && !obstacle.pillarScene) {
      x = centerX; y = GROUND + 30;
    } else if (obstacle.kind === 'collapseGap') {
      x = obstacle.x + obstacle.width * .38; y = GROUND - 105;
    } else if (obstacle.kind === 'cactus' || obstacle.kind === 'tallThorn') {
      x = centerX; y = GROUND - Math.max(104, (obstacle.height ?? 46) + 50);
    } else if (obstacle.kind === 'bramble') {
      x = centerX; y = GROUND - Math.max(98, (obstacle.height ?? 46) + 34);
    } else if (obstacle.kind === 'giantGround') {
      x = centerX; y = GROUND - 136;
    } else if (obstacle.kind === 'giantHover') {
      x = centerX; y = GROUND - 211;
    } else return;
    const hardScene = obstacle.kind === 'duck'
      || (obstacle.kind === 'gap' && !obstacle.pillarScene)
      || (obstacle.kind === 'bramble' && (obstacle.height ?? 46) >= 57);
    const dropChance = (hardScene ? SHIELD_HARD_DROP_CHANCE : SHIELD_OTHER_DROP_CHANCE)
      * powerupMultiplier(worldX - powerupEpochX);
    const shieldChance = !shieldReady && x - lastShieldDropX >= SHIELD_DROP_SPACING ? dropChance : 0;
    const jetChance = x - lastJetpackDropX >= SHIELD_DROP_SPACING ? dropChance : 0;
    const dropShield = Math.random() < shieldChance;
    const dropJetpack = Math.random() < jetChance;
    for (const kind of ['shield', 'jetpack']) {
      if (kind === 'shield' ? !dropShield : !dropJetpack) continue;
      // Independent rolls may both succeed: separate the icons without rerolling.
      const pickup = { kind, x, y: y + (dropShield && dropJetpack ? (kind === 'shield' ? -24 : 24) : 0), source: obstacle };
      if (isMovingBird(obstacle.kind)) {
        pickup.follow = obstacle;
        pickup.offsetX = x - obstacle.x;
      }
      if (kind === 'shield') { shieldPickups.push(pickup); lastShieldDropX = x; }
      else { jetpackPickups.push(pickup); lastJetpackDropX = x; }
    }
  }
  function addObstacles(...items) {
    for (const obstacle of items) {
      obstacles.push(obstacle);
      maybeDropPowerup(obstacle);
    }
  }
  function obstacleWidth(kind, x, roll = .5) {
    const targetSpeed = runSpeedAt(x);
    if (kind === 'duck' || kind === 'jump' || isMovingBird(kind)) return 68;
    if (kind === 'giantGround') return Math.round(targetSpeed * .80);
    if (kind === 'giantHover') return Math.round(targetSpeed * .55);
    if (kind === 'cactus') return roll < .20 ? 42 : roll < .65 ? 78 : 114;
    if (kind === 'tallThorn') return 84;
    if (kind === 'bramble') return Math.round(targetSpeed * (.54 + roll * .32));
    if (isGapKind(kind)) return extremeCliffWidth(Math.round(targetSpeed * .86));
    return 42;
  }
  function extremeCliffWidth(width) {
    return extremeMode ? Math.max(width, EXTREME_MIN_CLIFF_WIDTH) : width;
  }
  function obstacleKind(x, roll) {
    if (x < 1100) return 'cactus';
    if (x < ADVANCED_DISTANCE) return roll < .30 ? 'cactus' : roll < .56 ? 'bramble'
      : roll < .76 ? 'gap' : roll < .88 ? 'duck' : 'jump';
    const movingShift = .04 * runPressure(x);
    return roll < .18 ? 'cactus' : roll < .36 ? 'bramble' : roll < .43 ? 'gap' : roll < .55 ? 'tallThorn'
      : roll < .64 ? 'collapseGap' : roll < .72 - movingShift ? 'duck'
        : roll < .80 - movingShift * 2 ? 'jump'
          : roll < .86 - movingShift ? 'movingLow' : roll < .92 ? 'movingHigh'
          : roll < .96 ? 'giantGround' : 'giantHover';
  }
  function trainingObstacleKind(x, roll = Math.random()) {
    const pressure = runPressure(x);
    const shift = .04 * pressure;
    const pillarChance = .08 + pressure * .02;
    // Exclude the two five-percent combination branches, then normalize the
    // remaining singleton and pillar shares over the player's selection.
    const ordinaryScale = (1 - pillarChance) * .95 ** 2;
    const weights = [
      ['cactus', .18], ['bramble', .18], ['gap', .07], ['tallThorn', .12],
      ['collapseGap', .09], ['duck', .08 - shift], ['jump', .08 - shift],
      ['movingLow', .06 + shift], ['movingHigh', .06 + shift],
      ['giantGround', .04], ['giantHover', .04]
    ].map(([kind, weight]) => [kind, weight * ordinaryScale]);
    weights.push(['gapPillar', pillarChance]);
    const selected = new Set(window.DinoTraining?.selectedKinds() || []);
    const eligible = weights.filter(([kind]) => selected.has(kind));
    if (!eligible.length) return null;
    const total = eligible.reduce((sum, [, weight]) => sum + weight, 0);
    let target = roll * total;
    for (const [kind, weight] of eligible) {
      if (target < weight) return kind;
      target -= weight;
    }
    return eligible.at(-1)[0];
  }
  function cliffNeighborKind(side, x, roll) {
    if (side === 'before') return roll < .60 ? 'cactus' : roll < .77 ? 'duck'
      : roll < .91 ? 'jump' : x > 2600 ? 'giantHover' : 'cactus';
    return roll < .35 ? 'cactus' : roll < .75 ? 'bramble'
      : roll < .85 ? 'duck' : roll < .95 ? 'jump' : x > 2600 ? 'giantHover' : 'cactus';
  }
  function sceneTallThornSide(roll = Math.random()) {
    // One categorical roll keeps the two ends mutually exclusive: 6% / 6% / 88%.
    return roll < SCENE_TALL_THORN_CHANCE / 2 ? 'before'
      : roll < SCENE_TALL_THORN_CHANCE ? 'after' : null;
  }
  function spawnCliffScene() {
    const tallSide = sceneTallThornSide();
    const firstKind = tallSide === 'before' ? 'tallThorn' : cliffNeighborKind('before', nextObstacleX, Math.random());
    const firstSpeed = runSpeedAt(nextObstacleX);
    const first = makeObstacle(firstKind, nextObstacleX, obstacleWidth(firstKind, nextObstacleX, firstKind === 'cactus' ? .6 : 0));
    const gapX = first.x + first.width + firstSpeed * .48;
    const gapSpeed = runSpeedAt(gapX);
    const gap = makeObstacle('gap', gapX,
      extremeCliffWidth(Math.round(gapSpeed * .44)), { short: true });
    const lastKind = tallSide === 'after' ? 'tallThorn' : cliffNeighborKind('after', gapX, Math.random());
    const lastX = gap.x + gap.width + gapSpeed * .46;
    const lastSpeed = runSpeedAt(lastX);
    const last = makeObstacle(lastKind, lastX, obstacleWidth(lastKind, lastX,
      lastKind === 'bramble' ? Math.random() : lastKind === 'cactus' ? .6 : 0));
    addObstacles(first, gap, last);
    const recovery = rand(.83, 1.04) - runPressure(lastX) * .08;
    nextObstacleX = last.x + last.width + lastSpeed * Math.max(lastKind === 'bramble' ? .84 : .70, recovery);
  }
  function spawnGapPillarScene(includeFollowup = !trainingMode) {
    const gapX = nextObstacleX;
    const targetSpeed = runSpeedAt(gapX);
    const pressure = runPressure(gapX);
    const gap = makeObstacle('gap', gapX,
      extremeCliffWidth(Math.round(targetSpeed * .73)), { pillarScene: true });
    const pillar = makeObstacle('skyPillar', gapX + Math.round(targetSpeed * .26),
      Math.round(Math.max(22, targetSpeed * .027)));
    // The cliff and its pillar form one obstacle for warning streaks.
    gap.scenePillar = pillar;
    pillar.sceneGap = gap;
    addObstacles(gap, pillar);
    if (includeFollowup && Math.random() < .10 + pressure * .16) {
      const brambleX = gapX + gap.width + targetSpeed * (.82 - pressure * .14);
      const brambleSpeed = runSpeedAt(brambleX);
      const bramble = makeObstacle('bramble', brambleX, obstacleWidth('bramble', brambleX, .35));
      addObstacles(bramble);
      nextObstacleX = bramble.x + bramble.width + brambleSpeed * (1 - pressure * .08);
    } else {
      nextObstacleX = gapX + gap.width + targetSpeed * (.98 - pressure * .12);
    }
  }
  function spawnRhythmScene() {
    const tallSide = sceneTallThornSide();
    const x = nextObstacleX;
    const targetSpeed = runSpeedAt(x);
    const pressure = runPressure(x);
    const first = makeObstacle(tallSide === 'before' ? 'tallThorn' : 'cactus', x, tallSide === 'before' ? 84 : 78);
    const birdX = first.x + first.width + targetSpeed * (.82 - pressure * .08);
    const bird = makeObstacle('duck', birdX, 68);
    const lastX = bird.x + bird.width + targetSpeed * (.64 - pressure * .10);
    const last = makeObstacle(tallSide === 'after' ? 'tallThorn' : 'cactus', lastX, tallSide === 'after' ? 84 : 78);
    addObstacles(first, bird, last);
    nextObstacleX = last.x + last.width + runSpeedAt(lastX) * (.82 - pressure * .08);
  }
  function spawnObstacleGroup() {
    const previous = obstacles.at(-1);
    const pressure = runPressure(nextObstacleX);
    const allowWarningHazard = elapsed >= shieldWarningSpawnAfter;
    const warningLeadX = worldX + W - PLAYER_X
      + runSpeedAt(worldX) * HAZARD_WARNING_TIME + 90;
    let kind;
    if (!trainingMode && allowWarningHazard && nextObstacleX >= ADVANCED_DISTANCE
      && (!previous || !isDoubleJumpObstacle(previous.kind))
      && Math.random() < .08 + pressure * .02) {
      kind = 'gapPillar';
    }
    if (kind === 'gapPillar') {
      if (previous) nextObstacleX = Math.max(nextObstacleX,
        previous.x + previous.width + runSpeedAt(previous.x) * .78);
      if (shieldWarningSpawnPending) {
        nextObstacleX = Math.max(nextObstacleX, warningLeadX);
        shieldWarningSpawnPending = false;
      }
      spawnGapPillarScene(); return;
    }
    if (!trainingMode && nextObstacleX >= ADVANCED_DISTANCE && Math.random() < .05) {
      if (previous) nextObstacleX = Math.max(nextObstacleX,
        previous.x + previous.width + runSpeedAt(previous.x) * .72);
      spawnRhythmScene(); return;
    }
    if (!trainingMode && nextObstacleX >= ADVANCED_DISTANCE && Math.random() < .05) { spawnCliffScene(); return; }
    kind = trainingMode ? trainingObstacleKind(nextObstacleX) : obstacleKind(nextObstacleX, Math.random());
    if (!kind) { nextObstacleX = Infinity; return; }
    if (kind === 'gapPillar') {
      spawnGapPillarScene(); return;
    }
    if (!allowWarningHazard && isMovingBird(kind)) {
      kind = kind === 'movingHigh' ? 'duck' : 'jump';
    }
    if (isMovingBird(kind) && previous) {
      nextObstacleX = Math.max(nextObstacleX, previous.x + previous.width
        + runSpeedAt(previous.x) * (MAX_OBSTACLE_GAP_TIME - pressure * .12));
    }
    if (isMovingBird(kind) && shieldWarningSpawnPending) {
      nextObstacleX = Math.max(nextObstacleX, warningLeadX);
      shieldWarningSpawnPending = false;
    }
    const targetSpeed = runSpeedAt(nextObstacleX);
    const width = obstacleWidth(kind, nextObstacleX, kind === 'bramble' || kind === 'cactus' ? Math.random() : .5);
    addObstacles(makeObstacle(kind, nextObstacleX, width,
      kind === 'collapseGap' ? { collapsed: false, collapseProgress: 0 } : {}));
    const difficulty = progress(nextObstacleX);
    const recovery = isDoubleJumpObstacle(kind) ? rand(.94, 1.08) : rand(.73, .90);
    const previousRecovery = previous && isDoubleJumpObstacle(previous.kind) ? .14 : 0;
    const gapTime = Math.max(isDoubleJumpObstacle(kind) ? .82 : .56,
      Math.min(MAX_OBSTACLE_GAP_TIME, recovery + previousRecovery - difficulty * .04 - pressure * .16));
    nextObstacleX += width + targetSpeed * gapTime;
  }
  function spawnObstacle() {
    const oldLength = obstacles.length;
    let previous = obstacles.filter((o) => o.kind !== 'skyPillar').at(-1);
    spawnObstacleGroup();
    // Contract only the empty land beside cliffs, once per adjoining pair.
    // Moving the remaining scene as a whole preserves cliff widths and pillar placement.
    for (let index = oldLength; index < obstacles.length; index++) {
      const current = obstacles[index];
      if (current.kind === 'skyPillar') continue;
      const cliff = isGapKind(current.kind) ? current : previous && isGapKind(previous.kind) ? previous : null;
      if (previous && cliff && cliff.x >= TRIPLE_SPEED_DISTANCE) {
        const reduction = Math.max(0, current.x - previous.x - previous.width) * .20;
        const shifted = new Set(obstacles.slice(index));
        for (const obstacle of shifted) obstacle.x -= reduction;
        for (const pickup of [...shieldPickups, ...jetpackPickups]) {
          if (!shifted.has(pickup.source)) continue;
          if (pickup.x === lastShieldDropX) lastShieldDropX -= reduction;
          if (pickup.x === lastJetpackDropX) lastJetpackDropX -= reduction;
          pickup.x -= reduction;
        }
        nextObstacleX -= reduction;
      }
      previous = current;
    }
  }
  function fillObstacles() {
    if (elapsed < shieldBufferUntil) return;
    if (trainingMode && elapsed < shieldWarningSpawnAfter) return;
    if (shieldRecoverySpawnPending) {
      nextObstacleX = Math.max(nextObstacleX,
        worldX + W - PLAYER_X + runSpeedAt(worldX) * .35);
      shieldRecoverySpawnPending = false;
    }
    const horizon = worldX + W - PLAYER_X + runSpeedAt(worldX) * HAZARD_WARNING_TIME + 300;
    while (nextObstacleX < Math.min(horizon, extremeMode ? EXTREME_DISTANCE : Infinity)) spawnObstacle();
  }
  function inGap(x) { return obstacles.some((o) => isOpenGap(o) && x > o.x && x < o.x + o.width); }
  function hasGroundSupport(x) { return !inGap(x - 9) || !inGap(x + 18); }
  function hitRightCliffWall(boxes) {
    return obstacles.some((obstacle) => {
      if (!isOpenGap(obstacle)) return false;
      const wallX = obstacle.x + obstacle.width;
      return boxes.some((box) => box.right > wallX && box.left < wallX + 80
        && box.bottom > GROUND + 8 && box.top < H);
    });
  }
  function playerHitboxes() {
    const sx = player.crouch ? 1.17 : 1;
    const sy = player.crouch ? .72 : 1;
    return [
      [-29, -54, 13, -14], // vertical core of the rounded body
      [-35, -44, 17, -22], // wider middle of the body
      [8, -68, 47, -43],   // head
      [31, -44, 49, -37],  // snout
      [-11, -16, 0, -1],   // left foot
      [10, -16, 20, -1]   // right foot
    ].map(([left, top, right, bottom]) => ({
      left: worldX + left * sx, right: worldX + right * sx,
      top: player.feetY + top * sy, bottom: player.feetY + bottom * sy
    }));
  }
  function overlaps(a, b) {
    return a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
  }
  function ellipseHitsBoxes(cx, cy, rx, ry, boxes) {
    return boxes.some((box) => {
      const x = Math.max(box.left, Math.min(cx, box.right));
      const y = Math.max(box.top, Math.min(cy, box.bottom));
      return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1;
    });
  }
  function polygonHitsBox(points, box, inset = .5) {
    // Clip the visible outline to the player box. A small inset forgives edge grazes
    // and the subpixel error from sampling the quadratic curves.
    let clipped = points;
    for (const [axis, boundary, direction] of [
      [0, box.left + inset, 1], [0, box.right - inset, -1],
      [1, box.top + inset, 1], [1, box.bottom - inset, -1]
    ]) {
      const input = clipped;
      clipped = [];
      if (!input.length) return false;
      let previous = input[input.length - 1];
      for (const current of input) {
        const wasInside = (previous[axis] - boundary) * direction >= 0;
        const inside = (current[axis] - boundary) * direction >= 0;
        if (inside !== wasInside) {
          const t = (boundary - previous[axis]) / (current[axis] - previous[axis]);
          clipped.push([previous[0] + (current[0] - previous[0]) * t,
            previous[1] + (current[1] - previous[1]) * t]);
        }
        if (inside) clipped.push(current);
        previous = current;
      }
    }
    let area = 0;
    for (let index = 0; index < clipped.length; index++) {
      const a = clipped[index];
      const b = clipped[(index + 1) % clipped.length];
      area += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(area) > .01;
  }
  function hitHighBirdWings(o, boxes) {
    const tipY = highBirdWingTip(o);
    const direction = o.kind === 'movingHigh' ? -1 : 1;
    const centerY = GROUND + birdStyles[o.kind].center;
    return [0, 14].some((offset) => {
      const points = highBirdWingPoints(offset, tipY).map(([x, y]) =>
        [o.x + 29 + direction * x, centerY + y]);
      return boxes.some((box) => polygonHitsBox(points, box));
    });
  }
  function hitGiantBird(o, boxes) {
    const cx = o.x + o.width * .53;
    const cy = GROUND + birdStyles[o.kind].center;
    if (ellipseHitsBoxes(cx, cy, o.width * .30, o.kind === 'giantGround' ? 42 : 28, boxes)) return true;
    const parts = giantBirdParts(o);
    return [parts.tail, parts.rear, parts.front, parts.beak, ...parts.feet].some((part) => {
      const points = outlinePoints(part, 32).map(([x, y]) => [cx + x, cy + y]);
      return boxes.some((box) => polygonHitsBox(points, box, 0));
    });
  }
  function hitThornObstacle(o, boxes) {
    if (o.width > 42) {
      const connector = { left: o.x + 4, right: o.x + o.width - 4, top: GROUND - 7, bottom: GROUND - 1 };
      if (boxes.some((box) => overlaps(box, connector))) return true;
    }
    return thornModules(o).some((module) => {
      const left = o.x + module.x;
      const scale = module.height / 53;
      const targets = [
        { left: left + 13, right: left + 30, top: GROUND - (o.kind === 'tallThorn' ? 51 : 50) * scale, bottom: GROUND - 3 },
        { left: left + 2, right: left + 10, top: GROUND - 39 * scale, bottom: GROUND - 20 * scale },
        { left: left + 34, right: left + 41, top: GROUND - 45 * scale, bottom: GROUND - 26 * scale }
      ];
      return targets.some((target) => boxes.some((box) => overlaps(box, target)));
    });
  }
  function hitObstacle(o, boxes) {
    if (isGapKind(o.kind)) return false;
    if (boxes.every((box) => box.right <= o.x || box.left >= o.x + o.width)) return false;
    if (o.kind === 'skyPillar') {
      const body = { left: o.x + 2, right: o.x + o.width - 2, top: 0, bottom: SKY_PILLAR_BOTTOM };
      return boxes.some((box) => overlaps(box, body));
    }
    if (isThornKind(o.kind)) return hitThornObstacle(o, boxes);
    if (o.kind === 'duck' || o.kind === 'jump' || isMovingBird(o.kind)) {
      const centerY = GROUND + birdStyles[o.kind].center;
      const bodyHit = ellipseHitsBoxes(o.x + 29, centerY, 23, 12, boxes);
      const highWingHit = (o.kind === 'duck' || o.kind === 'movingHigh')
        && hitHighBirdWings(o, boxes);
      return bodyHit || highWingHit;
    }
    if (o.kind === 'giantGround' || o.kind === 'giantHover') {
      return hitGiantBird(o, boxes);
    }
    return false;
  }
  function pickupHitsBoxes(pickup, boxes) {
    if (pickup.source?.kind === 'collapseGap' && !pickup.source.collapsed) return false;
    return ellipseHitsBoxes(pickup.x, pickup.y, SHIELD_PICKUP_RADIUS, SHIELD_PICKUP_RADIUS, boxes);
  }
  function shieldBlastBounds(obstacle) {
    if (isGapKind(obstacle.kind)) return { top: GROUND, bottom: H };
    if (obstacle.kind === 'skyPillar') return { top: 0, bottom: SKY_PILLAR_BOTTOM };
    if (isThornKind(obstacle.kind)) {
      return { top: GROUND - (obstacle.height ?? 46), bottom: GROUND };
    }
    const center = GROUND + birdStyles[obstacle.kind].center;
    if (obstacle.kind === 'duck' || obstacle.kind === 'movingHigh') {
      return { top: center - 84, bottom: center + 16 };
    }
    if (obstacle.kind === 'giantHover') return { top: center - 59, bottom: center + 37 };
    if (obstacle.kind === 'giantGround') return { top: center - 39, bottom: center + 39 };
    return { top: center - 16, bottom: center + 16 };
  }
  function shieldBlastDistance(obstacle) {
    const { top, bottom } = shieldBlastBounds(obstacle);
    const nearestX = Math.max(obstacle.x, Math.min(shieldBreakX, obstacle.x + obstacle.width));
    const nearestY = Math.max(top, Math.min(shieldBreakY, bottom));
    return Math.hypot(nearestX - shieldBreakX, nearestY - shieldBreakY);
  }
  function shatterObstacle(obstacle) {
    const { top, bottom } = shieldBlastBounds(obstacle);
    const isCliff = isGapKind(obstacle.kind);
    const count = isCliff ? 14 : Math.min(16, Math.max(7, Math.ceil(obstacle.width / 32)));
    const color = isCliff ? '#dfb77b'
      : isThornKind(obstacle.kind)
        ? thornPalettes[obstacle.palette ?? 0].body
        : obstacle.kind === 'skyPillar' ? '#a99aab'
          : isMovingBird(obstacle.kind) ? '#58a197' : '#a77d68';
    for (let index = 0; index < count; index++) {
      const fraction = (index + .5) / count;
      const x = obstacle.x + obstacle.width * fraction;
      const y = isCliff ? GROUND + 7 : top + (bottom - top) * (.2 + .6 * ((index * 7 % count) / count));
      const angle = Math.atan2(y - shieldBreakY, x - shieldBreakX) + (index % 3 - 1) * .3;
      const force = 190 + index % 4 * 55;
      const life = .42 + index % 4 * .07;
      shieldDebris.push({ x, y, vx: Math.cos(angle) * force,
        vy: Math.sin(angle) * force - 140, life, maxLife: life,
        size: 4 + index % 3 * 2, color: blastColorful ? RAINBOW[index % RAINBOW.length] : color });
    }
  }
  function shatterReachedObstacles(radius) {
    obstacles = obstacles.filter((obstacle) => {
      if (shieldBlastDistance(obstacle) > radius) return true;
      if (blastCause === 'shield' && isMovingBird(obstacle.kind)
        && obstacle.x > worldX + 80) achievements.record('shieldBlastBird');
      if (blastCause === 'jetpack' && obstacle === jetpackLandingGap) {
        achievements.record('jetpackFillGap');
        jetpackLandingGap = null;
      }
      // A blast removes nearby obstacles before the player attempts them.
      // Only the obstacle that actually caused the blast was failed by the
      // collision/fall handler; collateral targets are not encounters.
      recordAchievementObstacleResult(obstacle, false);
      shatterObstacle(obstacle);
      return false;
    });
  }
  function updateShieldBlast(dt) {
    const age = elapsed - shieldBreakAt;
    if (age >= 0 && age < SHIELD_BREAK_EFFECT_SECONDS) {
      shatterReachedObstacles(56 + age * SHIELD_BLAST_SPEED);
    }
    for (const piece of shieldDebris) {
      piece.x += piece.vx * dt;
      piece.y += piece.vy * dt;
      piece.vy += 1100 * dt;
      piece.life -= dt;
    }
    shieldDebris = shieldDebris.filter((piece) => piece.life > 0);
  }
  function consumeShield() {
    shieldReady = false;
    triggerBlast(false, 'shield');
  }
  function triggerBlast(colorful, cause = colorful ? 'jetpack' : 'rescue') {
    powerupEpochX = worldX;
    blastColorful = colorful;
    blastCause = cause;
    if (cause !== 'jetpack') jetpackLandingGap = null;
    sound.explosion();
    shieldBufferUntil = elapsed + SHIELD_BUFFER_SECONDS;
    shieldUntil = Math.max(shieldUntil, shieldBufferUntil);
    shieldWarningSpawnAfter = elapsed + SHIELD_WARNING_SPAWN_DELAY;
    shieldRecoverySpawnPending = true;
    shieldWarningSpawnPending = true;
    shieldBreakAt = elapsed;
    shieldBreakX = worldX;
    shieldBreakY = player.feetY - 37;
    const safeSpeed = Math.max(speed, runSpeedAt(worldX + speed * SHIELD_BUFFER_SECONDS));
    const safeEndX = worldX + safeSpeed * SHIELD_BUFFER_SECONDS;
    obstacles = obstacles.filter((obstacle) => {
      const screenX = PLAYER_X + obstacle.x - worldX;
      return screenX <= W + 30 && screenX + obstacle.width >= -30;
    });
    shatterReachedObstacles(56);
    shieldPickups = [];
    jetpackPickups = [];
    lastShieldDropX = -Infinity;
    lastJetpackDropX = -Infinity;
    nextObstacleX = safeEndX + W - PLAYER_X + safeSpeed * .35;
    ui.warning.hidden = true;
  }
  function startJetpack() {
    // A pickup is the end of the current airtime for achievement purposes.
    // Finish hazards already passed, then exclude anything being crossed by flight.
    clearAchievementObstacles(worldX - 11 * (player.crouch ? 1.17 : 1));
    ignoreFlightAchievementObstacles(worldX);
    finishAchievementAir();
    jetpackActive = true;
    jetpackStartX = worldX;
    jetpackStartY = player.feetY;
    jetpackPickups = []; shieldPickups = [];
    player.vy = 0; player.jumps = 0; player.grounded = false;
    player.crouch = false; player.diving = false;
    sound.shieldPickup(); sound.jetpack(true);
  }
  function updateJetpack() {
    const progress = Math.min(1, (worldX - jetpackStartX) / JETPACK_DISTANCE);
    const smooth = (value) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
    const cruisingY = GROUND - 170;
    player.feetY = progress < .06
      ? jetpackStartY + (cruisingY - jetpackStartY) * smooth(progress / .06)
      : progress > .92 ? cruisingY + (GROUND - cruisingY) * smooth((progress - .92) / .08)
        : cruisingY + Math.sin(elapsed * 7) * 2;
    player.vy = 0; player.grounded = false; player.crouch = false; player.diving = false;
    if (progress >= 1) {
      jetpackActive = false; sound.jetpack(false);
      player.feetY = GROUND; player.grounded = true; player.jumps = 0;
      downKeys.clear(); touchDownHeld = false;
      jetpackLandingGap = obstacles.find((obstacle) => isOpenGap(obstacle)
        && obstacle.x < worldX + 18 && obstacle.x + obstacle.width > worldX - 9) || null;
      triggerBlast(true, 'jetpack');
    }
  }
  function rescue(fromFall) {
    rescueCount += 1;
    if (trainingMode) ui.best.textContent = String(rescueCount);
    if (fromFall || player.feetY > GROUND) {
      // The blast fills the current cliff. Restore the player here without skipping distance.
      player = { feetY: GROUND, vy: 0, jumps: 0, crouch: false, grounded: true, diving: false };
    }
    cancelAchievementAir();
    triggerBlast(false, 'rescue');
  }
  const isAerialBird = (kind) => kind === 'duck' || kind === 'movingHigh' || kind === 'giantHover';
  function achievementState(obstacle) {
    if (!obstacle.achievement) obstacle.achievement = {
      seen: false, recorded: false, warned: false, airId: null, mixedAir: false,
      airborne: false, maxJumps: 0, birdOver: false,
      birdSingle: false, birdResultRecorded: false, birdPending: false,
      deep: false, dived: false, escaped: false
    };
    return obstacle.achievement;
  }
  function ignoreFlightAchievementObstacles(previousWorldX) {
    const left = Math.min(previousWorldX, worldX) - 35;
    const right = Math.max(previousWorldX, worldX) + 49;
    for (const obstacle of obstacles) {
      if (obstacle.x >= right || obstacle.x + obstacle.width <= left) continue;
      const state = achievementState(obstacle);
      if (state.recorded) continue;
      state.flightIgnored = true;
      state.birdPending = false;
      state.birdResultRecorded = true;
      state.recorded = true;
      // Flight interrupts a warning streak without treating the hazard as an attempt.
      recordAchievementObstacleResult(obstacle, false);
    }
  }
  function trackAchievementObstacles() {
    const left = worldX - 35;
    const right = worldX + 49;
    for (const obstacle of obstacles) {
      const state = obstacle.achievement;
      if (state?.flightIgnored) continue;
      if (isGapKind(obstacle.kind) && state?.deep && player.grounded
        && worldX > obstacle.x + obstacle.width && player.feetY <= GROUND) state.escaped = true;
      if (obstacle.x >= right || obstacle.x + obstacle.width <= left) continue;
      const current = achievementState(obstacle);
      current.seen = true;
      if (achievementAir && !player.grounded && !jetpackActive) {
        if (current.airId === null) current.airId = achievementAir.id;
        else if (current.airId !== achievementAir.id) current.mixedAir = true;
        current.airborne = true;
        current.maxJumps = Math.max(current.maxJumps, player.jumps);
        if (isMovingBird(obstacle.kind) && !achievementAir.birdStarts.has(obstacle)) {
          achievementAir.birdStarts.set(obstacle, obstacle.x);
        }
        if (!isGapKind(obstacle.kind) && !isAerialBird(obstacle.kind)
          && obstacle.kind !== 'skyPillar'
          && worldX + 20 > obstacle.x && worldX - 11 < obstacle.x + obstacle.width
          && player.feetY <= shieldBlastBounds(obstacle).top) current.airAbove = true;
        if (isAerialBird(obstacle.kind)) {
          achievementAir.birds.add(obstacle);
          if (!achievementAir.birdStarts.has(obstacle)) {
            achievementAir.birdStarts.set(obstacle, obstacle.x);
          }
          if (worldX + 20 > obstacle.x && worldX - 11 < obstacle.x + obstacle.width) {
            if (player.feetY <= GROUND + birdStyles[obstacle.kind].center - 12) {
              current.airAbove = true;
            } else current.airBelow = true;
          }
          // Crossing beneath the bird must not count as leaping over it.
          if (player.feetY <= GROUND + birdStyles[obstacle.kind].center - 12) {
            achievementAir.bodyAbove.add(obstacle);
          }
        }
      }
      if (isGapKind(obstacle.kind) && isOpenGap(obstacle)
        && worldX > obstacle.x && worldX < obstacle.x + obstacle.width) {
        if (player.feetY >= H) current.deep = true;
      }
    }
  }
  function achievementFailObstacle(obstacle) {
    const state = achievementState(obstacle);
    if (state.recorded) return;
    if (state.seen && obstacle.kind === 'tallThorn') achievements.record('highThornResult', { single: false });
    if (state.seen && isAerialBird(obstacle.kind)) {
      recordAchievementBirdResult(obstacle);
    }
    if (state.seen && isGapKind(obstacle.kind)) {
      achievements.record('cliffResult', { kind: obstacle.pillarScene ? 'skyPillar' : obstacle.kind,
        recovered: false, dived: false });
    }
    recordAchievementObstacleResult(obstacle, false);
    state.recorded = true;
  }
  function recordAchievementObstacleResult(obstacle, cleared) {
    const scene = obstacle.sceneGap || obstacle;
    if (scene.achievementOutcomeRecorded) return;
    if (obstacle.sceneGap && cleared) return; // Wait for the far edge of the whole pillar cliff.
    const warningSource = scene.scenePillar || obstacle;
    achievements.record('obstacleResult', {
      warned: warningSource.achievement?.warned === true,
      cleared
    });
    scene.achievementOutcomeRecorded = true;
  }
  function clearAchievementObstacles(clearedLeft = worldX - 35) {
    for (const obstacle of [...obstacles].sort((a, b) =>
      a.x + a.width - b.x - b.width)) {
      const state = obstacle.achievement;
      if (!state?.seen || state.recorded || obstacle.x + obstacle.width > clearedLeft) continue;
      if (isGapKind(obstacle.kind) && state.deep && !state.escaped && !player.grounded) continue;
      let highKind = null;
      if (obstacle.kind === 'tallThorn') {
        achievements.record('highThornResult', { single: state.airborne && !state.mixedAir
          && state.maxJumps === 1 });
        highKind = 'thorn';
      } else if (isAerialBird(obstacle.kind)) {
        if (achievementAir?.birds.has(obstacle)) state.birdPending = true;
        else recordAchievementBirdResult(obstacle);
        if (state.birdOver && obstacle.kind !== 'giantHover') highKind = 'bird';
      } else if (isGapKind(obstacle.kind)) {
        achievements.record('cliffResult', { kind: obstacle.pillarScene ? 'skyPillar' : obstacle.kind,
          recovered: state.deep && state.escaped, dived: state.deep && state.escaped && state.dived });
      }
      recordAchievementObstacleResult(obstacle, true);
      if (achievementAir && state.airId === achievementAir.id && state.airborne && !state.mixedAir) {
        achievementAir.cleared.push({ kind: obstacle.kind, highKind, obstacle });
      }
      state.recorded = true;
    }
  }
  function recordAchievementBirdResult(obstacle) {
    const state = achievementState(obstacle);
    if (state.birdResultRecorded) return;
    achievements.record('birdResult', { over: state.birdOver,
      small: obstacle.kind !== 'giantHover', single: state.birdOver && state.birdSingle });
    state.birdResultRecorded = true;
    state.birdPending = false;
  }
  function cancelAchievementAir() {
    if (!achievementAir) return;
    for (const bird of achievementAir.birds) {
      if (!achievementState(bird).birdResultRecorded) recordAchievementBirdResult(bird);
    }
    achievementAir = null;
  }
  function finishAchievementAir() {
    if (!achievementAir) return;
    const landingLeft = worldX - 11 * (player.crouch ? 1.17 : 1);
    for (const bird of achievementAir.birds) {
      const state = achievementState(bird);
      if (!state.birdResultRecorded && achievementAir.groundTakeoff
        && achievementAir.takeoffRight <= achievementAir.birdStarts.get(bird)
        && landingLeft >= bird.x + bird.width && achievementAir.bodyAbove.has(bird)) {
        state.birdOver = true;
        state.birdSingle = achievementAir.maxJumps === 1;
        recordAchievementBirdResult(bird);
        if (!achievementAir.cleared.some((item) => item.obstacle === bird)) {
          achievementAir.cleared.push({ kind: bird.kind, highKind: bird.kind === 'giantHover' ? null : 'bird', obstacle: bird });
        }
      } else if (state.birdPending) recordAchievementBirdResult(bird);
    }
    const candidates = new Set(achievementAir.cleared.map((item) => item.obstacle));
    for (const obstacle of obstacles) {
      if (obstacle.achievement?.airId === achievementAir.id) candidates.add(obstacle);
    }
    const crossedAbove = [...candidates].filter((obstacle) => {
      const state = obstacle.achievement;
      if (!state || state.flightIgnored || state.airId !== achievementAir.id || state.mixedAir
        || obstacle.kind === 'skyPillar') return false;
      const startX = achievementAir.birdStarts.get(obstacle) ?? obstacle.x;
      if (achievementAir.takeoffRight > startX
        || landingLeft < obstacle.x + obstacle.width) return false;
      if (isAerialBird(obstacle.kind)) {
        return state.birdOver === true && state.airAbove === true && state.airBelow !== true;
      }
      if (isGapKind(obstacle.kind)) return achievementAir.groundTakeoff && isOpenGap(obstacle);
      return state.airAbove === true;
    }).sort((a, b) => a.x + a.width - b.x - b.width);
    if (crossedAbove.length >= 2) {
      achievements.record('airCombo', { obstacles: crossedAbove.length,
        jumps: achievementAir.maxJumps,
        highKinds: crossedAbove.map((obstacle) => obstacle.kind === 'tallThorn' ? 'thorn'
          : (obstacle.kind === 'duck' || obstacle.kind === 'movingHigh') ? 'bird' : null)
          .filter(Boolean) });
    }
    achievementAir = null;
  }
  function giantBeakBetweenFeet(obstacle, boxes) {
    if (obstacle.kind !== 'giantGround' && obstacle.kind !== 'giantHover') return false;
    const cx = obstacle.x + obstacle.width * .53;
    const cy = GROUND + birdStyles[obstacle.kind].center;
    const tipX = cx + obstacle.width * .46;
    const tipY = cy + 4;
    // Use the inner edges of the two drawn shins. The collision foot rectangles
    // cover more space than the visible gap and cannot define this achievement.
    const sx = player.crouch ? 1.17 : 1;
    const sy = player.crouch ? .72 : 1;
    const rise = (player.feetY - tipY) / sy;
    if (rise < 1 || rise > 11) return false;
    const rearT = -1 + Math.sqrt(4 - Math.min(rise, 3));
    const frontT = -1 + Math.sqrt(1 + Math.min(rise, 3));
    const rearInner = rise <= 3 ? -5 + 6 * rearT - 3 * rearT * rearT : -10;
    const frontInner = rise <= 3 ? 3 - 4 * frontT + 4 * frontT * frontT : 3;
    if (tipX <= worldX + rearInner * sx || tipX >= worldX + frontInner * sx) return false;
    const leftLeg = boxes[4];
    const rightLeg = boxes[5];
    const beak = outlinePoints(giantBirdParts(obstacle).beak, 24)
      .map(([x, y]) => [cx + x, cy + y]);
    return polygonHitsBox(beak, leftLeg, 0) || polygonHitsBox(beak, rightLeg, 0);
  }
  function timeUntilVisible(obstacle) {
    const moving = isMovingBird(obstacle.kind);
    const entry = moving ? MOVING_BIRD_ENTRY : W - PLAYER_X + 6;
    const distance = obstacle.x - worldX - entry;
    if (distance <= 0) return 0;
    if (!moving) return distance / speed;
    const flightLead = Math.min(distance, MOVING_BIRD_FLIGHT_LEAD);
    const flightSpeed = movingBirdSpeed(obstacle);
    return (distance - flightLead) / speed + flightLead / (speed + flightSpeed);
  }
  function warningTarget() {
    if (mode !== 'running') return null;
    return obstacles.find((obstacle) => {
      if (obstacle.kind !== 'skyPillar' && !isMovingBird(obstacle.kind)) return false;
      const seconds = timeUntilVisible(obstacle);
      return seconds > 0 && seconds <= HAZARD_WARNING_TIME;
    }) || null;
  }
  function update(dt) {
    if (mode === 'overflow') return;
    if (extremeMode && mode !== 'running') return;
    speed = runSpeedAt(worldX);
    sound.setIntensity(Math.min(1, Math.max(0, (speed / BASE_SPEED - 1) / 2)));
    // Stop at the finish, including the physics time step, rather than overshooting it.
    if (extremeMode) dt = Math.min(dt, Math.max(0, EXTREME_DISTANCE - worldX) / speed);
    const previousWorldX = worldX;
    const flightFrame = jetpackActive;
    elapsed += dt;
    worldX += speed * dt;
    if (!trainingMode && !extremeMode && score() > CLASSIC_INT_MAX) {
      triggerClassicOverflow();
      return;
    }
    const speedLabel = trainingMode ? '训练' : extremeMode ? '极限' : speed >= MAX_SPEED ? '极速' : '速度';
    const speedText = jetpackActive
      ? `喷气飞行 · ${Math.max(0, Math.ceil((JETPACK_DISTANCE - worldX + jetpackStartX) / 10))} 米`
      : `${speedLabel} ×${(speed / BASE_SPEED).toFixed(1)}`;
    if (ui.status.textContent !== speedText) ui.status.textContent = speedText;
    fillObstacles();
    for (const obstacle of obstacles) {
      if (isMovingBird(obstacle.kind)) obstacle.flightSpeed = movingBirdSpeed(obstacle);
      if (obstacle.kind === 'collapseGap' && !obstacle.collapsed
        && obstacle.x - worldX <= speed * COLLAPSE_WARNING_TIME) {
        obstacle.collapsed = true;
        sound.collapse();
      }
      if (obstacle.kind === 'collapseGap' && obstacle.collapsed) {
        obstacle.collapseProgress = Math.min(1, (obstacle.collapseProgress || 0) + dt / COLLAPSE_DURATION);
      }
      if (isMovingBird(obstacle.kind)
        && obstacle.x - worldX <= MOVING_BIRD_ENTRY + MOVING_BIRD_FLIGHT_LEAD) {
        obstacle.x -= obstacle.flightSpeed * dt;
      }
    }
    for (const pickup of [...shieldPickups, ...jetpackPickups]) {
      if (pickup.follow) pickup.x = pickup.follow.x + pickup.offsetX;
    }
    updateShieldBlast(dt);
    obstacles = obstacles.filter((o) => o.x + o.width > worldX - 300
      || (isGapKind(o.kind) && o.achievement?.deep && !o.achievement.recorded));
    shieldPickups = shieldPickups.filter((pickup) => pickup.x > worldX - 300
      && (!pickup.source || obstacles.includes(pickup.source)));
    jetpackPickups = jetpackPickups.filter((pickup) => pickup.x > worldX - 300
      && (!pickup.source || obstacles.includes(pickup.source)));
    const warnedObstacle = !jetpackActive && elapsed >= shieldWarningSpawnAfter ? warningTarget() : null;
    if (warnedObstacle) achievementState(warnedObstacle).warned = true;
    const warningVisible = Boolean(warnedObstacle);
    if (warningVisible && ui.warning.hidden) sound.warning();
    ui.warning.hidden = !warningVisible;
    const wasFeetY = player.feetY;
    let landedThisFrame = false;
    const supported = hasGroundSupport(worldX);
    if (jetpackActive) updateJetpack();
    else if (!player.grounded || !supported) {
      player.grounded = false;
      player.crouch = false;
      player.vy = player.diving
        ? Math.min(player.vy + DIVE_GRAVITY * dt, DIVE_MAX_VELOCITY)
        : player.vy + GRAVITY * dt;
      player.feetY += player.vy * dt;
      if (supported && wasFeetY <= GROUND && player.feetY >= GROUND) {
        player.feetY = GROUND; player.vy = 0; player.jumps = 0; player.grounded = true;
        player.crouch = player.diving && isDownHeld();
        player.diving = false;
        landedThisFrame = true;
        sound.land();
      }
    }
    const boxes = playerHitboxes();
    if (!flightFrame) trackAchievementObstacles();
    if (shieldReady || jetpackActive) shieldPickups = [];
    else if (shieldPickups.some((pickup) => pickupHitsBoxes(pickup, boxes))) {
      shieldReady = true;
      shieldPickups = [];
      sound.shieldPickup();
      achievements.record('pickup', { kind: 'shield', seconds: elapsed });
    }
    if (!jetpackActive && jetpackPickups.some((pickup) => pickupHitsBoxes(pickup, boxes))) {
      achievements.record('pickup', { kind: 'jetpack', seconds: elapsed });
      startJetpack();
    }
    if (flightFrame || jetpackActive) ignoreFlightAchievementObstacles(previousWorldX);
    const invincible = jetpackActive || elapsed < shieldBufferUntil;
    const fell = !invincible && (hitRightCliffWall(boxes) || player.feetY >= FALL_SCREEN_LIMIT);
    const hits = !invincible && !fell && elapsed >= shieldUntil ? obstacles.filter((o) => hitObstacle(o, boxes)) : [];
    const struckPillar = hits.some((o) => o.kind === 'skyPillar');
    clearAchievementObstacles();
    if (fell) {
      obstacles.filter((o) => isGapKind(o.kind) && isOpenGap(o)
        && worldX >= o.x - 30 && worldX <= o.x + o.width + 80)
        .forEach(achievementFailObstacle);
    }
    hits.forEach(achievementFailObstacle);
    if (fell || struckPillar) {
      cancelAchievementAir();
      if (extremeMode || trainingMode) rescue(fell);
      else { endGame(); return; }
    } else if (hits.length) {
      if (!shieldReady && !extremeMode && !trainingMode && hits.length === 1
        && (hits[0].kind === 'giantGround' || hits[0].kind === 'giantHover')) {
        if (giantBeakBetweenFeet(hits[0], boxes)) achievements.record('beakDeath');
      }
      cancelAchievementAir();
      if (shieldReady) consumeShield();
      else if (extremeMode || trainingMode) rescue(false);
      else { endGame(); return; }
    }
    if (landedThisFrame) finishAchievementAir();
    if (extremeMode && worldX >= EXTREME_DISTANCE) { finishExtreme(); return; }
    const current = score();
    ui.distance.textContent = padded(current);
    if (!extremeMode && !trainingMode && current > profile.best && !recordCelebrated) { highScoreFlash = 1.1; recordCelebrated = true; }
    highScoreFlash = Math.max(0, highScoreFlash - dt);
  }

  const renderer = window.DinoModels.createRenderer(ctx, {
    W, H, GROUND, PLAYER_X, SKY_PILLAR_BOTTOM, SHIELD_PICKUP_RADIUS,
    SHIELD_BREAK_EFFECT_SECONDS, SHIELD_BLAST_SPEED
  });
  function visualState() { return { worldX, elapsed, player, profile, mode, obstacles, shieldPickups, jetpackPickups, shieldReady, jetpackActive, shieldBreakAt, shieldBreakX, shieldBreakY, shieldDebris, blastColorful, extremeMode, rescueCount, highScoreFlash }; }
  function draw() { renderer.render(visualState()); }
  function frame(timestamp) {
    const wallDt = Math.max(0, (timestamp - (lastFrame || timestamp)) / 1000);
    const dt = Math.min(wallDt, .032);
    lastFrame = timestamp;
    if (mode === 'running') update(dt);
    else if (mode === 'countdown') {
      countdownRemaining = Math.max(0, countdownRemaining - wallDt);
      if (countdownRemaining <= 1e-6) resumeGame();
      else ui.countdownNumber.textContent = String(Math.ceil(countdownRemaining));
    }
    draw(); requestAnimationFrame(frame);
  }

  $('save-name').addEventListener('click', () => {
    const name = ui.name.value.trim().replace(/\s+/g, ' ').slice(0, 16);
    if (!name) { ui.nameHint.textContent = '请先输入一个昵称。'; ui.name.focus(); return; }
    activeName = name;
    const saved = writeStore(ACTIVE_KEY, activeName);
    achievements.noteNameSaved();
    ui.nameHint.textContent = saved ? `已更名为 ${name}，纪录和装扮保留。` : '昵称暂时无法保存，请检查浏览器存储设置。';
    updateProfileUI();
  });
  ui.name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('save-name').click(); ui.name.blur(); } });
  ui.outfitGrid.addEventListener('click', (e) => {
    const button = e.target.closest('[data-outfit]');
    if (!button || !outfits[button.dataset.outfit]) return;
    profile.outfit = button.dataset.outfit; writeStore(PROFILE_KEY, profile); updateProfileUI();
  });
  ui.startButton.addEventListener('click', startGame);
  ui.pauseButton.addEventListener('click', () => { pauseGame(); ui.pauseButton.blur(); });
  const classicButton = $('classic-mode');
  const extremeButton = $('extreme-mode');
  const modeReset = $('mode-reset');
  function updateModeControls() {
    classicButton.setAttribute('aria-pressed', String(!extremeMode));
    extremeButton.setAttribute('aria-pressed', String(extremeMode));
    $('mode-description').textContent = extremeMode
      ? '十万米终点见，看看你能用多少次续命抵达。'
      : '迎着晚霞出发，刷新属于你的最远纪录。';
    modeReset.hidden = !extremeMode;
    modeReset.disabled = !extremeMode;
    modeReset.title = extremeMode ? '将进度和续命次数归零，暂停在起点' : '将本轮进度归零';
  }
  function selectGameMode(extreme) {
    if (extremeMode === extreme) return;
    if (mode === 'running' || mode === 'countdown') pauseGame();
    downKeys.clear(); touchDownHeld = false; player.crouch = false;
    saveRunSlot();
    achievements.restoreRun?.(null);
    achievementRunMode = null;
    achievementAir = null;
    extremeMode = extreme;
    updateModeControls();
    runSessions?.setMainMode(currentSlot());
    if (!restoreRunSlot(currentSlot())) {
      resetGame({ settle: false, forget: false });
      setMode('ready'); showReadyOverlay(); updateProfileUI();
    }
  }
  classicButton.addEventListener('click', () => selectGameMode(false));
  extremeButton.addEventListener('click', () => selectGameMode(true));
  modeReset.addEventListener('click', () => {
    if (!extremeMode) {
      if (mode !== 'overflow') return;
      resetGame(); setMode('ready'); showReadyOverlay(); updateProfileUI();
      modeReset.blur();
      return;
    }
    resetGame(); setMode('paused');
    showOverlay('EXTREME RESET', '已回到 0 米', '准备好了再继续挑战。', '继续极限挑战');
    modeReset.blur();
  });
  if (trainingMode) {
    window.DinoTraining.resetRun = () => {
      resetGame(); setMode('ready'); showReadyOverlay(); updateProfileUI();
    };
  }
  let preservingNavigation = false;
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || (event.button !== undefined && event.button !== 0)
      || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest?.('a[href]');
    const href = anchor?.getAttribute?.('href');
    if (!['./index.html', './training.html', './achievements.html'].includes(href)
      || (anchor.target && anchor.target !== '_self')) return;
    if (mode === 'running' || mode === 'countdown') pauseGame();
    downKeys.clear(); touchDownHeld = false; player.crouch = false;
    if (!saveRunSlot()) {
      event.preventDefault();
      showOverlay('SAVE PAUSED', '本轮已暂停',
        '浏览器暂时无法保存当前进度，请检查存储设置后重试。', '继续冒险');
      return;
    }
    preservingNavigation = true;
  });
  const leaveGamePage = () => {
    if (preservingNavigation) return;
    settleAchievementRun();
    forgetRunSlot();
  };
  window.addEventListener('pagehide', leaveGamePage);
  window.addEventListener('beforeunload', leaveGamePage);
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    if (preservingNavigation) {
      preservingNavigation = false;
      achievements.refresh?.();
      return;
    }
    if (achievementRunMode || (mode !== 'running' && mode !== 'paused')) return;
    resetGame(); setMode('ready'); showReadyOverlay(); updateProfileUI();
  });
  ui.audioToggle.addEventListener('click', () => {
    sound.setMuted(!sound.settings().muted);
    updateAudioControls();
    ui.audioToggle.blur();
  });
  const adjustVolume = (control, change) => {
    change(Number(control.value) / 100);
    if (sound.settings().muted && Number(control.value) > 0) sound.setMuted(false);
    updateAudioControls();
  };
  ui.musicVolume.addEventListener('input', () => adjustVolume(ui.musicVolume, sound.setMusicVolume));
  ui.effectsVolume.addEventListener('input', () => adjustVolume(ui.effectsVolume, sound.setEffectsVolume));
  ui.musicVolume.addEventListener('pointerup', () => ui.musicVolume.blur());
  ui.effectsVolume.addEventListener('pointerup', () => ui.effectsVolume.blur());
  const viewToggle = $('view-toggle');
  viewToggle.addEventListener('click', () => {
    const expanded = document.body.classList.toggle('game-expanded');
    viewToggle.setAttribute('aria-pressed', String(expanded));
    viewToggle.setAttribute('aria-label', expanded ? '恢复布局并显示侧栏' : '放大游戏并隐藏侧栏');
    $('view-toggle-label').textContent = expanded ? '恢复布局' : '放大游戏';
    viewToggle.querySelector('.view-toggle-icon').textContent = expanded ? '⤡' : '⤢';
  });
  document.addEventListener('click', (e) => {
    if (e.detail > 0) e.target.closest?.('button')?.blur();
  });
  window.addEventListener('keydown', (e) => {
    const isEditable = (node) => node && (node.isContentEditable
      || ['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName));
    const isControl = (node) => node && (node.isContentEditable
      || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(node.tagName));
    if (mode === 'over') {
      if (isEditable(e.target) || isEditable(document.activeElement)) return;
      if (e.code === 'Space') { e.preventDefault(); return; }
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        if (!e.repeat) startGame();
      }
      return;
    }
    if (mode === 'overflow') {
      if (e.code === 'Space' || e.code === 'ArrowDown' || e.code === 'ArrowUp') e.preventDefault();
      return;
    }
    if (isControl(e.target) || isControl(document.activeElement)) return;
    if (mode === 'countdown') {
      if (['Space', 'ArrowUp', 'ArrowDown', 'KeyS'].includes(e.code)) e.preventDefault();
      if (e.code === 'KeyP') { e.preventDefault(); if (!e.repeat) pauseGame(); }
      return;
    }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (mode === 'running') e.preventDefault();
      return;
    }
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) jump(); }
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp' || e.code === 'KeyS') {
      e.preventDefault();
      if (!e.repeat && !isDownHeld()) pressDown();
      downKeys.add(e.code);
    }
    if (e.code === 'KeyP' && !e.repeat) { e.preventDefault(); pauseGame(); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp' || e.code === 'KeyS') {
      downKeys.delete(e.code);
      if (!isDownHeld()) player.crouch = false;
    }
  });
  window.addEventListener('blur', () => { downKeys.clear(); touchDownHeld = false; player.crouch = false; if (mode === 'running' || mode === 'countdown') pauseGame(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && (mode === 'running' || mode === 'countdown')) pauseGame(); });
  const jumpTouch = $('touch-jump'), duckTouch = $('touch-duck');
  jumpTouch.addEventListener('pointerdown', (e) => { e.preventDefault(); jump(); });
  duckTouch.addEventListener('pointerdown', (e) => {
    e.preventDefault(); duckTouch.setPointerCapture(e.pointerId);
    if (!isDownHeld()) pressDown();
    touchDownHeld = true;
  });
  const releaseDuck = () => { touchDownHeld = false; if (!isDownHeld()) player.crouch = false; };
  duckTouch.addEventListener('pointerup', releaseDuck); duckTouch.addEventListener('pointercancel', releaseDuck);

  function initializeGame() {
    if (!trainingMode && !overflowDemo) extremeMode = runSessions?.getMainMode() === 'extreme';
    updateModeControls();
    updateAudioControls();
    if (!restoreRunSlot(currentSlot())) {
      updateProfileUI(); fillObstacles(); showReadyOverlay();
    }
    draw(); requestAnimationFrame(frame);
  }
  initializeGame();
})();
