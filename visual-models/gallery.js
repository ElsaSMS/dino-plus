(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const canvas = $('preview');
  const ctx = canvas.getContext('2d');
  const renderer = window.DinoModels.createRenderer(ctx, { PLAYER_X: 500 });
  const catalog = [];
  const add = (id, name, group, description, setup) => catalog.push({ id, name, group, description, setup });
  for (const [id, name] of [['explorer', '森林探险家'], ['stargazer', '星光旅行家'], ['sunrider', '落日骑士'], ['minty', '薄荷小队长']]) {
    add(id, name, '角色与动作', '原尺寸角色与奔跑动作；服装配色和细节直接来自游戏。', (s) => { s.profile.outfit = id; return 'dino'; });
  }
  add('crouch', '下蹲', '角色与动作', '压低身体、保持奔跑。', (s) => { s.player.crouch = true; return 'dino'; });
  add('jump', '跳跃姿态', '角色与动作', '展示角色在空中的外形与落地阴影，预览轨迹仅用于展示。', (s, t) => { s.player.feetY -= Math.sin(t % 1.5 / 1.5 * Math.PI) * 125; s.player.grounded = false; return 'dino'; });
  add('shield-aura', '护盾光圈', '角色与动作', '固定大小的护盾光圈；每两秒切换站立和下蹲，便于观察。', (s, t) => { s.shieldReady = true; s.player.crouch = Math.floor(t / 2) % 2 === 1; return 'dino'; });
  add('flight', '彩焰喷气背包', '角色与动作', '趴伏飞行姿态、背包与向后喷射的彩色火焰。', (s) => { s.jetpackActive = true; s.player.feetY = 150; s.player.grounded = false; return 'dino'; });
  const obstacle = (kind, width, extra = {}) => ({ kind, width, x: -width / 2, seed: 0, height: 58, palette: 0, ...extra });
  for (const [id, name, width, extra] of [
    ['thorn-one', '单株荆棘', 42, {}], ['thorn-two', '两株荆棘', 78, {}], ['thorn-three', '三株荆棘', 114, {}],
    ['thorn-rose', '玫瑰色荆棘', 114, { palette: 1 }], ['thorn-ochre', '赭色荆棘', 114, { palette: 2 }],
    ['bramble', '连续长荆棘', 685, { kind: 'bramble' }], ['tall-thorn', '高荆棘', 84, { kind: 'tallThorn', height: 119 }]
  ]) add(id, name, '荆棘', '共用短荆棘模块，保留原始比例、连接藤蔓与分株高度变化。', (s) => { s.obstacles = [obstacle('cactus', width, extra)]; });
  for (const [id, name, width] of [
    ['jump-bird', '贴地静止小鸟', 68], ['duck', '悬空静止小鸟', 68],
    ['movingLow', '贴地运动小鸟', 68], ['movingHigh', '悬空运动小鸟', 68],
    ['giantGround', '贴地巨鸟', 840], ['giantHover', '悬空巨鸟', 578]
  ]) add(id, name, '飞鸟', '保持游戏尺寸与扇翅频率；运动鸟带尾流，并在展台内往返循环飞过。', (s, t) => {
    const o = obstacle(id === 'jump-bird' ? 'jump' : id, width);
    if (id.startsWith('moving')) o.x += 200 - t * 330 % 400;
    s.obstacles = [o];
  });
  add('gap', '普通悬崖', '地形与风景', '903 px 的开口、崖壁与深色谷底。', (s) => { s.obstacles = [obstacle('gap', 903)]; });
  add('short-gap', '短悬崖', '地形与风景', '组合场景中的 462 px 短悬崖。', (s) => { s.obstacles = [obstacle('gap', 462)]; });
  add('collapse', '地面塌方', '地形与风景', '先显示完整地面，再以游戏中的 0.22 秒时长下沉；每三秒重播。', (s, t) => {
    const phase = t % 3;
    s.obstacles = [obstacle('collapseGap', 620, { collapsed: phase > 1, collapseProgress: Math.min(1, Math.max(0, (phase - 1) / .22)) })];
  });
  add('pillar', '悬崖与空中柱子', '地形与风景', '767 px 悬崖、28 px 柱身，柱子距左崖边 273 px；保留游戏原始位置。', (s) => {
    s.obstacles = [obstacle('gap', 767), obstacle('skyPillar', 28, { x: -767 / 2 + 273 })];
  });
  add('landscape', '夕阳、云层与远山', '地形与风景', '多层视差背景，包含阳光、云朵、远山与地面。', (s, t) => { s.worldX = t * 140; });
  add('shadow', '崖边阴影裁切', '地形与风景', '角色投影只落在仍然存在的地面上。', (s) => { s.obstacles = [obstacle('gap', 260, { x: 0 })]; s.player.feetY = 180; s.player.grounded = false; return 'dino'; });
  for (const [id, name] of [['shield', '护盾徽章'], ['jetpack', '喷气背包徽章']]) {
    add(id, name, '道具与特效', '半径 19 px 的拾取图标与呼吸光晕。', (s) => { s[id === 'shield' ? 'shieldPickups' : 'jetpackPickups'] = [{ kind: id, x: 0, y: 215 }]; });
  }
  for (const [id, name, colorful] of [['shield-break', '护盾爆破', false], ['rainbow-blast', '彩色落地爆破', true]]) {
    add(id, name, '道具与特效', '扩散光环与向四周飞出的碎片，持续 0.65 秒；每两秒重播。', (s, t) => {
      s.shieldBreakAt = Math.floor(t / 2) * 2; s.shieldBreakY = 210; s.blastColorful = colorful;
    });
  }
  add('debris', '障碍粉碎碎屑', '道具与特效', '展示障碍被击碎后的旋转、下落与渐隐。', (s, t) => {
    const age = t % 1.2;
    s.shieldDebris = Array.from({ length: 20 }, (_, i) => ({ x: Math.cos(i * 2.4) * age * 230,
      y: 170 + Math.sin(i * 2.4) * age * 160 + 550 * age ** 2, size: 4 + i % 5,
      color: ['#71865d', '#a7b679', '#dfb77b'][i % 3], life: 1.2 - age, maxLife: 1.2 }));
  });
  add('warning', '闪烁预警', '道具与特效', '与主游戏共用预警样式，闪烁周期 0.45 秒。', () => {});
  let selected = catalog.find((item) => item.id === location.hash.slice(1)) || catalog[0];
  let time = 0, previous = 0, playing = true;
  function state() { return { worldX: 0, elapsed: time, mode: 'running', player: { feetY: 320, crouch: false, grounded: true }, profile: { outfit: 'stargazer' },
    obstacles: [], shieldPickups: [], jetpackPickups: [], shieldReady: false, jetpackActive: false,
    shieldBreakAt: -Infinity, shieldBreakX: 0, shieldBreakY: 283, shieldDebris: [], blastColorful: false,
    extremeMode: false, rescueCount: 0, highScoreFlash: 0 }; }
  function paint() {
    const s = state(); const subject = selected.setup(s, time);
    renderer.setState(s); ctx.clearRect(0, 0, 1000, 430);
    renderer.drawBackground(); renderer.drawGround(); renderer.drawObstacles(); renderer.drawShieldPickups();
    if (subject === 'dino') { renderer.drawGroundShadow(); renderer.drawDino(); }
    renderer.drawShieldBreak(); renderer.drawShieldDebris();
    $('warning').hidden = selected.id !== 'warning';
    $('warning').style.animationPlayState = playing ? 'running' : 'paused';
  }
  function populate() {
    $('catalog').replaceChildren(); let group = '';
    const query = $('search').value.trim().toLowerCase();
    for (const item of catalog.filter((o) => (o.name + o.group + o.id).toLowerCase().includes(query))) {
      if (item.group !== group) { const title = document.createElement('h3'); title.textContent = group = item.group; $('catalog').append(title); }
      const button = document.createElement('button'); button.textContent = item.name;
      button.type = 'button'; button.setAttribute('aria-pressed', String(selected === item));
      button.addEventListener('click', () => { location.hash = item.id; }); $('catalog').append(button);
    }
  }
  function select() {
    selected = catalog.find((item) => item.id === location.hash.slice(1)) || catalog[0]; time = 0;
    $('model-name').textContent = selected.name; $('category').textContent = selected.group;
    $('description').textContent = selected.description; populate(); paint();
  }
  $('search').addEventListener('input', populate); window.addEventListener('hashchange', select);
  $('pause').addEventListener('click', () => { playing = !playing; $('pause').textContent = playing ? '暂停动画' : '继续动画'; paint(); });
  $('restart').addEventListener('click', () => { time = 0; paint(); });
  $('snapshot').addEventListener('click', () => { const link = document.createElement('a'); link.download = selected.id + '.png'; link.href = canvas.toDataURL('image/png'); link.click(); });
  document.addEventListener('visibilitychange', () => { previous = 0; });
  function frame(now) { if (previous && playing && !document.hidden) time += Math.min(.05, (now - previous) / 1000) * Number($('speed').value); previous = now; paint(); requestAnimationFrame(frame); }
  select(); requestAnimationFrame(frame);
})();
