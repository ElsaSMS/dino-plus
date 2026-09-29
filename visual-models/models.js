(() => {
  'use strict';
  const RAINBOW = ['#ff7188', '#ffb65e', '#ffe57c', '#83e9b1', '#6cd6ff', '#ba9aff'];
  const birdStyles = {
    duck: { center: -76 },
    jump: { center: -25 },
    movingHigh: { center: -76 },
    movingLow: { center: -25 },
    giantGround: { center: -44 },
    giantHover: { center: -86 }
  };
  const thornPalettes = [
    { shadow: '#52614f', body: '#71865d', leaf: '#a7b679', stem: '#40594e', bloom: '#ead59a' },
    { shadow: '#6e5260', body: '#996a77', leaf: '#c78f91', stem: '#614b5d', bloom: '#f1c6aa' },
    { shadow: '#75594d', body: '#aa7658', leaf: '#d5a479', stem: '#695349', bloom: '#f1d49a' }
  ];
  const outfits = {
    explorer: { body: '#3f8c62', light: '#74b886', belly: '#b9db9c', dark: '#265840', accent: '#c95850', stage: '#e7efdc' },
    stargazer: { body: '#7860aa', light: '#ab90d0', belly: '#d6c2eb', dark: '#493a72', accent: '#f1d478', stage: '#eee6f5' },
    sunrider: { body: '#446f9e', light: '#7fa6cc', belly: '#b4cde1', dark: '#294968', accent: '#b84864', stage: '#e1eaf4' },
    minty: { body: '#369b97', light: '#76c7b6', belly: '#b9e5d4', dark: '#236965', accent: '#f3c775', stage: '#e0f0ed' }
  };

  function highBirdWingTip(o, elapsed) {
    return -47 - Math.sin(elapsed * (o.kind === 'movingHigh' ? 32 : 24) + (o.seed ?? 0)) * 37;
  }
  function highBirdWingShape(offset, tipY) {
    const tipX = -14 + offset;
    return {
      start: [-15 + offset, -3],
      curves: [
        [-26 + offset, tipY * .65, tipX, tipY],
        [tipX + 14, tipY + 6, 16 + offset, -3],
        [5 + offset, 9, -15 + offset, -3]
      ]
    };
  }
  function highBirdWingPoints(offset, tipY) {
    return outlinePoints(highBirdWingShape(offset, tipY));
  }
  function outlinePoints(shape, segments = 16) {
    const points = [shape.start];
    let start = shape.start;
    for (const curve of shape.curves) {
      if (curve.length === 2) { points.push(curve); start = curve; continue; }
      const [cx, cy, x, y] = curve;
      for (let step = 1; step <= segments; step++) {
        const t = step / segments;
        const u = 1 - t;
        points.push([u * u * start[0] + 2 * u * t * cx + t * t * x,
          u * u * start[1] + 2 * u * t * cy + t * t * y]);
      }
      start = [x, y];
    }
    return points;
  }

  function giantBirdParts(o, elapsed) {
    const w = o.width;
    const flap = Math.sin(elapsed * 11 + (o.seed ?? 0)) * 7;
    const foot = o.kind === 'giantGround' ? 45 : 30;
    return {
      tail: { start: [-w * .23, 9], curves: [
        [-w * .42, 6, -w * .50, -13], [-w * .32, -13, -w * .22, -3]
      ] },
      rear: { start: [-w * .18, -7], curves: [
        [-w * .35, -44 - flap, -w * .49, -30 - flap],
        [-w * .40, 10, -w * .20, 19]
      ] },
      front: { start: [w * .05, -9], curves: [
        [-w * .11, -51 + flap, -w * .30, -40 + flap],
        [-w * .14, 10, w * .16, 16]
      ] },
      beak: { start: [w * .27, -5], curves: [[w * .46, 4], [w * .27, 12]] },
      feet: [-w * .07, w * .04].map((x) => ({
        start: [x, 22], curves: [[x - 5, foot], [x + 7, foot - 7]]
      }))
    };
  }

  function thornModules(o) {
    const count = o.kind === 'bramble'
      ? Math.max(2, Math.ceil((o.width - 42) / 36) + 1)
      : Math.max(1, Math.round((o.width - 42) / 36) + 1);
    const step = count > 1 ? (o.width - 42) / (count - 1) : 0;
    return Array.from({ length: count }, (_, index) => ({
      x: index * step,
      height: (o.height ?? 46) * (count > 1 && o.kind !== 'tallThorn'
        ? .93 + .07 * Math.sin(index * 1.3 + (o.seed ?? 0))
        : 1)
    }));
  }

  function createRenderer(ctx, config = {}) {
    const { W = 1000, H = 430, GROUND = 320, PLAYER_X = 185,
      SKY_PILLAR_BOTTOM = 268, SHIELD_PICKUP_RADIUS = 19,
      SHIELD_BREAK_EFFECT_SECONDS = .65, SHIELD_BLAST_SPEED = 2600 } = config;
    let worldX, elapsed, player, profile, mode, obstacles, shieldPickups, jetpackPickups, shieldReady, jetpackActive, shieldBreakAt, shieldBreakX, shieldBreakY, shieldDebris, blastColorful, extremeMode, rescueCount, highScoreFlash;
    function setState(state) { ({ worldX, elapsed, player, profile, mode, obstacles, shieldPickups, jetpackPickups, shieldReady, jetpackActive, shieldBreakAt, shieldBreakX, shieldBreakY, shieldDebris, blastColorful, extremeMode, rescueCount, highScoreFlash } = state); }
    const isMovingBird = (kind) => kind === 'movingHigh' || kind === 'movingLow';
    const isOpenGap = (o) => o.kind === 'gap' || (o.kind === 'collapseGap' && o.collapsed);
    const inGap = (x) => obstacles.some((o) => isOpenGap(o) && x > o.x && x < o.x + o.width);
  function roundRect(x, y, w, h, radius, fill) {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill();
  }
  function cloud(x, y, scale, alpha) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = '#fff6e9';
    ctx.beginPath(); ctx.ellipse(x, y, 51 * scale, 12 * scale, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 20 * scale, y - 9 * scale, 21 * scale, 17 * scale, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 10 * scale, y - 14 * scale, 26 * scale, 22 * scale, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 35 * scale, y - 3 * scale, 22 * scale, 12 * scale, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  function hills(offset, base, color, scale) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = -100; x <= W + 100; x += 8) {
      const world = x + offset * scale;
      const y = base + Math.sin(world / 116) * 23 + Math.sin(world / 57 + 2) * 11;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  }
  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#f5be9b'); sky.addColorStop(.54, '#f8d5a8'); sky.addColorStop(1, '#f8dfa9');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    const sun = ctx.createRadialGradient(733, 102, 4, 733, 102, 94);
    sun.addColorStop(0, '#fff1bf'); sun.addColorStop(.42, '#ffe7aa'); sun.addColorStop(1, '#ffe7aa00');
    ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(733, 102, 94, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffe7ad'; ctx.beginPath(); ctx.arc(733, 102, 39, 0, Math.PI * 2); ctx.fill();
    cloud(115 - (worldX * .04 % 1200), 103, .67, .65);
    cloud(466 - (worldX * .025 % 1300), 70, .48, .48);
    cloud(946 - (worldX * .035 % 1400), 138, .8, .52);
    hills(worldX, 241, '#e6b996', .14);
    hills(worldX + 300, 274, '#d6ae91', .29);
    hills(worldX + 700, 311, '#c69d7e', .48);
    ctx.fillStyle = '#dbad89';
    for (let i = 0; i < 15; i++) {
      const x = ((i * 137 - worldX * .28) % 1240 + 1240) % 1240 - 80;
      const y = 256 + Math.sin(i * 7.3) * 19;
      ctx.fillRect(x, y, 2, 2);
    }
  }
  function solidGroundSegments(left, right) {
    const gaps = obstacles.filter((o) => isOpenGap(o)
      && PLAYER_X + o.x - worldX < right
      && PLAYER_X + o.x + o.width - worldX > left)
      .sort((a, b) => a.x - b.x);
    const segments = [];
    let start = left;
    for (const gap of gaps) {
      const edge = PLAYER_X + gap.x - worldX;
      if (edge > start) segments.push([start, Math.min(edge, right)]);
      start = Math.max(start, edge + gap.width);
      if (start >= right) break;
    }
    if (start < right) segments.push([start, right]);
    return segments;
  }
  function drawGround() {
    ctx.fillStyle = '#624d3d'; ctx.fillRect(0, GROUND + 13, W, H - GROUND);
    const leftWorld = worldX - PLAYER_X;
    const gaps = obstacles.filter((o) => isOpenGap(o) && o.x + o.width > leftWorld && o.x < leftWorld + W);
    const segments = solidGroundSegments(0, W);
    for (const [a, b] of segments) {
      ctx.fillStyle = '#7b5c43'; ctx.fillRect(a, GROUND + 8, b - a, H - GROUND);
      ctx.fillStyle = '#dfb77b'; ctx.fillRect(a, GROUND - 2, b - a, 11);
      ctx.fillStyle = '#f4d39a'; ctx.fillRect(a, GROUND - 2, b - a, 4);
      for (let x = Math.floor((a + worldX) / 38) * 38 - worldX; x < b; x += 38) {
        if (x < a + 4) continue;
        ctx.fillStyle = '#966d4c'; ctx.fillRect(x, GROUND + 22 + (Math.floor(x / 38) % 3) * 13, 13, 3);
        ctx.fillStyle = '#b88d5e'; ctx.fillRect(x + 17, GROUND + 62, 5, 3);
      }
    }
    for (const gap of gaps) {
      const x = PLAYER_X + gap.x - worldX;
      ctx.fillStyle = '#473c3b'; ctx.fillRect(x, GROUND + 10, gap.width, H - GROUND);
      const deep = ctx.createLinearGradient(0, GROUND, 0, H);
      deep.addColorStop(0, '#4d4344'); deep.addColorStop(1, '#2f343b');
      ctx.fillStyle = deep; ctx.fillRect(x + 4, GROUND + 11, gap.width - 8, H - GROUND);
      ctx.fillStyle = '#a97858'; ctx.fillRect(x - 4, GROUND + 7, 7, 17); ctx.fillRect(x + gap.width - 3, GROUND + 7, 7, 17);
      if (gap.kind === 'collapseGap' && gap.collapseProgress < 1) {
        const t = Math.max(0, gap.collapseProgress);
        const drop = (H - GROUND + 42) * t ** 1.35;
        ctx.save();
        ctx.beginPath(); ctx.rect(x, GROUND - 2, gap.width, H - GROUND + 2); ctx.clip();
        ctx.fillStyle = '#806149'; ctx.fillRect(x, GROUND + 8 + drop, gap.width, H - GROUND);
        ctx.fillStyle = '#dfb77b'; ctx.fillRect(x, GROUND - 2 + drop, gap.width, 11);
        ctx.fillStyle = '#f4d39a'; ctx.fillRect(x, GROUND - 2 + drop, gap.width, 4);
        ctx.strokeStyle = '#a77a5a'; ctx.lineWidth = 3; ctx.beginPath();
        for (let i = 1; i < 4; i++) {
          const crackX = x + gap.width * i / 4;
          ctx.moveTo(crackX, GROUND + 9 + drop);
          ctx.lineTo(crackX + 7, GROUND + 25 + drop);
          ctx.lineTo(crackX + 2, GROUND + 39 + drop);
        }
        ctx.stroke(); ctx.restore();
      }
    }
    for (let i = 0; i < 22; i++) {
      const x = ((i * 89 - worldX * .95) % 2050 + 2050) % 2050 - 100;
      if (inGap(worldX + x - PLAYER_X)) continue;
      const y = GROUND - 3;
      ctx.strokeStyle = i % 3 ? '#7a9f70' : '#a0a66b'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y - 7); ctx.moveTo(x, y); ctx.lineTo(x + 3, y - 9); ctx.stroke();
    }
  }
  function drawGroundShadow() {
    const radius = player.crouch ? 45 : 39;
    const segments = solidGroundSegments(PLAYER_X - radius, PLAYER_X + radius);
    if (!segments.length) return;
    ctx.save();
    ctx.beginPath();
    for (const [left, right] of segments) ctx.rect(left, GROUND - 2, right - left, 12);
    ctx.clip();
    ctx.globalAlpha = Math.max(.35, 1 - Math.max(0, GROUND - player.feetY) / 230);
    ctx.fillStyle = '#3c453a25';
    ctx.beginPath(); ctx.ellipse(PLAYER_X, GROUND + 4, radius, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function drawThornModule(x, y, module, colors) {
    ctx.save(); ctx.translate(x, y); ctx.scale(1, module.height / 53);
    roundRect(11, -53, 21, 53, 8, colors.body);
    roundRect(15, -52, 9, 49, 5, colors.leaf);
    roundRect(0, -32, 12, 15, 5, colors.body); roundRect(0, -42, 8, 23, 4, colors.body);
    roundRect(30, -38, 11, 13, 5, colors.shadow); roundRect(36, -48, 6, 24, 4, colors.shadow);
    ctx.strokeStyle = colors.stem; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(13, -37); ctx.lineTo(8, -43);
    ctx.moveTo(31, -30); ctx.lineTo(37, -36); ctx.stroke();
    ctx.fillStyle = colors.bloom; ctx.beginPath(); ctx.arc(25, -49, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function drawCactus(x, y, o) {
    const colors = thornPalettes[o.palette ?? 0];
    if (o.width > 42) roundRect(x + 3, y - 8, o.width - 6, 8, 4, colors.shadow);
    for (const module of thornModules(o)) drawThornModule(x + module.x, y, module, colors);
  }
  function drawHighBirdWing(offset, tipY, baseColor, featherColor) {
    const tipX = -14 + offset;
    const shape = highBirdWingShape(offset, tipY);
    ctx.fillStyle = baseColor;
    ctx.beginPath(); ctx.moveTo(...shape.start);
    for (const curve of shape.curves) ctx.quadraticCurveTo(...curve);
    ctx.fill();
    ctx.fillStyle = featherColor;
    ctx.beginPath(); ctx.moveTo(-2 + offset, -5);
    ctx.quadraticCurveTo(tipX + 2, tipY * .7, tipX + 2, tipY + 5);
    ctx.quadraticCurveTo(tipX + 14, tipY + 9, 9 + offset, -3);
    ctx.fill();
  }
  function drawBird(x, y, o) {
    if (o.kind === 'giantGround' || o.kind === 'giantHover') { drawGiantBird(x, y, o); return; }
    const isDuckBird = o.kind === 'duck' || o.kind === 'movingHigh';
    const approaching = isMovingBird(o.kind);
    const centerY = y + birdStyles[o.kind].center;
    const flap = Math.sin(elapsed * (approaching ? 24 : 16) + o.seed) * (approaching ? 14 : 10);
    if (approaching) {
      const trailY = centerY;
      ctx.save();
      ctx.strokeStyle = '#427d7899'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath();
      ctx.moveTo(x + 77, trailY - 10); ctx.lineTo(x + 112, trailY - 10);
      ctx.moveTo(x + 84, trailY + 1); ctx.lineTo(x + 119, trailY + 1);
      ctx.moveTo(x + 78, trailY + 12); ctx.lineTo(x + 101, trailY + 12);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save(); ctx.translate(x + 29, centerY);
    if (approaching) ctx.scale(-1, 1);
    const highWingTipY = isDuckBird ? highBirdWingTip(o, elapsed) : 0;
    if (isDuckBird) drawHighBirdWing(14, highWingTipY,
      approaching ? '#5c9a91' : '#88624f', approaching ? '#9dd0b7' : '#c69778');
    ctx.fillStyle = approaching ? '#427d78' : '#9b715e';
    ctx.beginPath(); ctx.ellipse(0, 0, 27, 15, 0, 0, Math.PI * 2); ctx.fill();
    if (isDuckBird) {
      drawHighBirdWing(0, highWingTipY,
        approaching ? '#8ac0a9' : '#b18062', approaching ? '#b8ddc6' : '#d5a480');
    } else {
      ctx.fillStyle = approaching ? '#8ac0a9' : '#c09170';
      ctx.beginPath(); ctx.moveTo(-6, -3); ctx.quadraticCurveTo(-34, -31 - flap, -43, -13 - flap); ctx.quadraticCurveTo(-28, 8, -3, 7); ctx.fill();
    }
    ctx.fillStyle = approaching ? '#376c67' : '#6f4b3f';
    ctx.beginPath(); ctx.moveTo(-22, 1); ctx.lineTo(-42, 11); ctx.lineTo(-35, -2); ctx.fill();
    ctx.fillStyle = '#f0bc77'; ctx.beginPath(); ctx.moveTo(24, -3); ctx.lineTo(39, 2); ctx.lineTo(24, 6); ctx.fill();
    ctx.fillStyle = '#fff9df'; ctx.beginPath(); ctx.arc(14, -5, 3.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#2a3440'; ctx.beginPath(); ctx.arc(15, -5, 1.7, 0, 7); ctx.fill();
    ctx.restore();
  }
  function drawGiantBird(x, y, o) {
    const grounded = o.kind === 'giantGround';
    const centerX = x + o.width * .53;
    const centerY = y + birdStyles[o.kind].center;
    const parts = giantBirdParts(o, elapsed);
    const paint = (part, color) => {
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(...part.start);
      for (const curve of part.curves) {
        if (curve.length === 2) ctx.lineTo(...curve);
        else ctx.quadraticCurveTo(...curve);
      }
      ctx.closePath(); ctx.fill();
    };
    ctx.save(); ctx.translate(centerX, centerY);
    paint(parts.tail, '#4f435d');
    paint(parts.rear, '#715f83');
    ctx.fillStyle = '#51465f'; ctx.beginPath(); ctx.ellipse(0, 0, o.width * .30, grounded ? 42 : 28, 0, 0, Math.PI * 2); ctx.fill();
    paint(parts.front, '#8a759b');
    paint(parts.beak, '#eebc7e');
    ctx.fillStyle = '#f8e7c9'; ctx.beginPath(); ctx.arc(o.width * .19, -10, 6, 0, 7); ctx.fill();
    ctx.fillStyle = '#2d2d3c'; ctx.beginPath(); ctx.arc(o.width * .20, -10, 3, 0, 7); ctx.fill();
    for (const foot of parts.feet) paint(foot, '#40384c');
    ctx.restore();
  }
  function drawBramble(x, y, o) {
    const colors = thornPalettes[o.palette ?? 0];
    roundRect(x + 3, y - 8, o.width - 6, 8, 4, colors.shadow);
    for (const module of thornModules(o)) drawThornModule(x + module.x, y, module, colors);
  }
  function drawSkyPillar(x, o) {
    const body = ctx.createLinearGradient(x, 0, x + o.width, 0);
    body.addColorStop(0, '#534d65'); body.addColorStop(.25, '#968aa1');
    body.addColorStop(.78, '#73677f'); body.addColorStop(1, '#403e57');
    ctx.fillStyle = '#4b455d'; ctx.fillRect(x - 4, 0, o.width + 8, SKY_PILLAR_BOTTOM - 2);
    ctx.fillStyle = body; ctx.fillRect(x, 0, o.width, SKY_PILLAR_BOTTOM - 4);
    ctx.fillStyle = '#c7b8bd'; ctx.fillRect(x + 4, 0, Math.max(3, o.width * .12), SKY_PILLAR_BOTTOM - 8);
    ctx.fillStyle = '#b29da3'; ctx.fillRect(x - 6, SKY_PILLAR_BOTTOM - 18, o.width + 12, 18);
    ctx.fillStyle = '#d3b9b0'; ctx.fillRect(x - 6, SKY_PILLAR_BOTTOM - 18, o.width + 12, 4);
    ctx.strokeStyle = '#554c61'; ctx.lineWidth = 2; ctx.beginPath();
    for (let y = 40; y < SKY_PILLAR_BOTTOM - 26; y += 62) {
      ctx.moveTo(x + o.width * .55, y);
      ctx.lineTo(x + o.width * .38, y + 12);
      ctx.lineTo(x + o.width * .61, y + 24);
    }
    ctx.stroke();
  }
  function drawObstacles() {
    for (const o of obstacles) {
      const x = PLAYER_X + o.x - worldX;
      if (x > W + 30 || x + o.width < -30) continue;
      if (o.kind === 'cactus' || o.kind === 'tallThorn') drawCactus(x, GROUND, o);
      if (o.kind === 'skyPillar') drawSkyPillar(x, o);
      if (birdStyles[o.kind]) drawBird(x, GROUND, o);
      if (o.kind === 'bramble') drawBramble(x, GROUND, o);
      if (isOpenGap(o)) {
        ctx.fillStyle = '#fbdfaa';
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + 14 + i * 9, GROUND - 8 - i * 4, 2 + i, 0, 7); ctx.fill(); }
      }
    }
  }
  function drawShieldPickups() {
    for (const pickup of [...shieldPickups, ...jetpackPickups]) {
      if (pickup.source?.kind === 'collapseGap' && !pickup.source.collapsed) continue;
      const x = PLAYER_X + pickup.x - worldX;
      if (x < -30 || x > W + 30) continue;
      ctx.save(); ctx.translate(x, pickup.y);
      ctx.scale(SHIELD_PICKUP_RADIUS / 14, SHIELD_PICKUP_RADIUS / 14);
      const pulse = Math.sin(elapsed * 6 + pickup.x * .01) * 2;
      ctx.fillStyle = pickup.kind === 'jetpack' ? '#b1dbff77' : '#fff0b966';
      ctx.beginPath(); ctx.arc(0, 0, 20 + pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f6d28f'; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
      if (pickup.kind === 'jetpack') {
        roundRect(-9, -9, 7, 17, 3, '#617cac');
        roundRect(2, -9, 7, 17, 3, '#719ccd');
        roundRect(-5, -5, 10, 10, 3, '#d1e8ec');
        for (let index = 0; index < 3; index++) {
          ctx.fillStyle = RAINBOW[index * 2];
          ctx.beginPath(); ctx.moveTo(-8 + index * 5, 7);
          ctx.lineTo(-5 + index * 5, 13); ctx.lineTo(-3 + index * 5, 7); ctx.fill();
        }
        ctx.restore(); continue;
      }
      ctx.fillStyle = '#3b827a'; ctx.beginPath();
      ctx.moveTo(0, -10); ctx.lineTo(9, -6); ctx.lineTo(8, 3);
      ctx.quadraticCurveTo(6, 9, 0, 12); ctx.quadraticCurveTo(-6, 9, -8, 3);
      ctx.lineTo(-9, -6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f9e8ab'; ctx.beginPath(); ctx.moveTo(0, -6);
      ctx.lineTo(3, -1); ctx.lineTo(0, 6); ctx.lineTo(-3, -1); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  function drawShieldBreak() {
    const age = elapsed - shieldBreakAt;
    const phase = age / SHIELD_BREAK_EFFECT_SECONDS;
    if (phase < 0 || phase >= 1) return;
    const x = PLAYER_X + shieldBreakX - worldX;
    ctx.save(); ctx.translate(x, shieldBreakY);
    ctx.globalAlpha = 1 - phase;
    const distance = 56 + age * SHIELD_BLAST_SPEED;
    ctx.lineWidth = 5 - phase * 3;
    if (blastColorful) {
      for (let index = 0; index < RAINBOW.length; index++) {
        ctx.strokeStyle = RAINBOW[index];
        ctx.beginPath(); ctx.arc(-4, 0, distance,
          index * Math.PI / 3, (index + 1) * Math.PI / 3); ctx.stroke();
      }
    } else {
      ctx.strokeStyle = '#e9fff2';
      ctx.beginPath(); ctx.arc(-4, 0, distance, 0, Math.PI * 2); ctx.stroke();
    }
    for (let index = 0; index < 18; index++) {
      const angle = index * Math.PI * 2 / 18;
      ctx.save();
      ctx.translate(-4 + Math.cos(angle) * distance, Math.sin(angle) * distance);
      ctx.rotate(angle + phase * 2);
      ctx.fillStyle = blastColorful ? RAINBOW[index % RAINBOW.length] : index % 2 ? '#a5eadc' : '#f8e4a9';
      ctx.beginPath(); ctx.moveTo(-9, -5); ctx.lineTo(12, 0);
      ctx.lineTo(-9, 5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
  function drawShieldDebris() {
    for (const piece of shieldDebris) {
      const x = PLAYER_X + piece.x - worldX;
      if (x < -30 || x > W + 30 || piece.y > H + 20) continue;
      ctx.save(); ctx.translate(x, piece.y);
      ctx.rotate(piece.x * .04 + elapsed * 12);
      ctx.globalAlpha = Math.min(1, piece.life / piece.maxLife);
      ctx.fillStyle = piece.color;
      ctx.beginPath(); ctx.moveTo(-piece.size, -piece.size * .7);
      ctx.lineTo(piece.size, -piece.size * .2);
      ctx.lineTo(0, piece.size); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  function drawDino() {
    const outfit = outfits[profile.outfit];
    const duck = player.crouch;
    ctx.save(); ctx.translate(PLAYER_X, player.feetY);
    if (shieldReady) {
      ctx.fillStyle = '#b9eee022'; ctx.strokeStyle = '#c8f5e3bb'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(-4, -37, 64, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    if (jetpackActive) {
      ctx.rotate(-.06); ctx.scale(1.25, .57);
      for (let index = 0; index < RAINBOW.length; index++) {
        const y = -74 + index * 3;
        const length = 77 + Math.sin(elapsed * 38 + index) * 15;
        ctx.fillStyle = RAINBOW[index];
        ctx.beginPath(); ctx.moveTo(-30, y - 3);
        ctx.quadraticCurveTo(-65, y - 9, -35 - length, y + 2);
        ctx.quadraticCurveTo(-65, y + 8, -30, y + 3); ctx.fill();
      }
    } else if (duck) ctx.scale(1.17, .72);
    const bodyPaint = ctx.createLinearGradient(-22, -75, 20, 2);
    bodyPaint.addColorStop(0, outfit.light); bodyPaint.addColorStop(.48, outfit.body); bodyPaint.addColorStop(1, outfit.dark);
    if (profile.outfit === 'sunrider') {
      const capePaint = ctx.createLinearGradient(-45, -53, -13, -10);
      capePaint.addColorStop(0, '#e28494'); capePaint.addColorStop(1, outfit.accent);
      ctx.fillStyle = capePaint; ctx.beginPath(); ctx.moveTo(5,-51);
      ctx.quadraticCurveTo(-27,-70,-45,-48); ctx.lineTo(-58,-10);
      ctx.quadraticCurveTo(-38,-17,-6,-28); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#f4bc91'; ctx.lineWidth = 1.6; ctx.beginPath();
      ctx.moveTo(-44,-44); ctx.quadraticCurveTo(-48,-27,-54,-15); ctx.stroke();
    }
    const stride = player.grounded && mode === 'running' ? Math.sin(elapsed * 18) * 8 : 0;
    ctx.fillStyle = outfit.dark; ctx.beginPath(); ctx.moveTo(-19,-34);
    ctx.quadraticCurveTo(-45,-37,-61,-51);
    ctx.quadraticCurveTo(-57,-31,-35,-23);
    ctx.lineTo(-21,-23); ctx.fill();
    // The rear leg sits behind the belly. Its narrow shin and short forward toe
    // follow the original runner's stance instead of reading as a round pillar.
    const rearStep = stride * .55;
    ctx.fillStyle = outfit.dark; ctx.beginPath(); ctx.moveTo(-18,-23);
    ctx.quadraticCurveTo(-11,-25,-7,-19);
    ctx.quadraticCurveTo(-9,-14,-10 + rearStep * .2,-11);
    ctx.lineTo(-10 + rearStep,-3);
    ctx.lineTo(-5 + rearStep,-3);
    ctx.quadraticCurveTo(-2 + rearStep,-2,-2 + rearStep,0);
    ctx.lineTo(-18 + rearStep,0);
    ctx.quadraticCurveTo(-20 + rearStep,-1,-18 + rearStep,-3);
    ctx.lineTo(-17 + rearStep * .35,-12);
    ctx.quadraticCurveTo(-20,-18,-18,-23); ctx.fill();
    // Both hips stay behind the torso, leaving two slim shins and short toes
    // visible below it, as in the original running silhouette.
    const frontStep = -stride * .55;
    ctx.fillStyle = bodyPaint; ctx.beginPath(); ctx.moveTo(-5,-24);
    ctx.quadraticCurveTo(2,-25,7,-18);
    ctx.quadraticCurveTo(11 + frontStep * .2,-14,11 + frontStep * .3,-11);
    ctx.lineTo(11 + frontStep,-3);
    ctx.lineTo(15 + frontStep,-3);
    ctx.quadraticCurveTo(19 + frontStep,-2,19 + frontStep,0);
    ctx.lineTo(3 + frontStep,0);
    ctx.quadraticCurveTo(1 + frontStep,-1,3 + frontStep,-3);
    ctx.lineTo(3 + frontStep * .4,-11);
    ctx.quadraticCurveTo(-1,-18,-5,-24); ctx.fill();
    // A tapered torso replaces the round stomach; the collision geometry stays untouched.
    ctx.fillStyle = bodyPaint; ctx.beginPath(); ctx.moveTo(5,-58);
    ctx.bezierCurveTo(-10,-62,-24,-53,-34,-41);
    ctx.lineTo(-35,-31);
    ctx.bezierCurveTo(-32,-22,-23,-15,-10,-14);
    ctx.bezierCurveTo(2,-13,13,-24,17,-39);
    ctx.quadraticCurveTo(18,-52,5,-58); ctx.fill();
    ctx.fillStyle = outfit.belly; ctx.beginPath(); ctx.moveTo(12,-40);
    ctx.bezierCurveTo(13,-32,6,-26,-5,-22);
    ctx.bezierCurveTo(4,-20,10,-23,13,-28);
    ctx.quadraticCurveTo(16,-34,12,-40); ctx.fill();
    roundRect(1,-62,22,38,10,bodyPaint);
    if (profile.outfit !== 'minty') {
      ctx.strokeStyle = outfit.dark; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(11,-72); ctx.quadraticCurveTo(7,-78,7,-80);
      ctx.moveTo(18,-73); ctx.quadraticCurveTo(15,-80,15,-81);
      ctx.moveTo(24,-73); ctx.quadraticCurveTo(23,-78,22,-79);
      ctx.stroke();
    }
    roundRect(1,-73,50,33,12,bodyPaint);
    roundRect(29,-49,24,12,5,bodyPaint);
    roundRect(9,-70,20,3,1.5,'#ffffff30');
    roundRect(36,-46,15,4,2,outfit.dark);
    const gaze = mode === 'running' ? Math.sin(elapsed * 1.5) * .7 : .35;
    ctx.fillStyle = '#fff9e9'; ctx.beginPath(); ctx.ellipse(32,-62,5.1,4.3,-.08,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#253d39'; ctx.beginPath(); ctx.ellipse(33.1 + gaze,-61.3,2.6,2.9,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(34 + gaze,-62.5,1,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = outfit.dark; ctx.lineWidth = 2.1; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(27,-69); ctx.quadraticCurveTo(33,-71,38,-68); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(29,-57.2); ctx.quadraticCurveTo(33,-55.8,36,-57.3); ctx.stroke();
    // One continuous foreleg: shoulder inside the torso, elbow below the neck, hand forward.
    ctx.fillStyle = bodyPaint; ctx.beginPath(); ctx.moveTo(-1,-43);
    ctx.bezierCurveTo(8,-46,17,-41,20,-35);
    ctx.quadraticCurveTo(22,-31,22,-27);
    ctx.quadraticCurveTo(26,-25,30,-24);
    ctx.quadraticCurveTo(33,-22,31,-19);
    ctx.quadraticCurveTo(29,-17,25,-19);
    ctx.quadraticCurveTo(17,-21,14,-26);
    ctx.quadraticCurveTo(10,-31,8,-33);
    ctx.quadraticCurveTo(2,-32,-1,-36);
    ctx.quadraticCurveTo(-3,-40,-1,-43); ctx.fill();
    if (profile.outfit === 'explorer') {
      // Both scarf ends hang down over the chest from a knot below the jaw.
      ctx.fillStyle = '#a8403a'; ctx.beginPath(); ctx.moveTo(0,-44);
      ctx.quadraticCurveTo(10,-41,21,-43); ctx.lineTo(22,-37);
      ctx.quadraticCurveTo(11,-35,1,-38); ctx.closePath(); ctx.fill();
      ctx.fillStyle = outfit.accent; ctx.beginPath(); ctx.moveTo(2,-43);
      ctx.quadraticCurveTo(11,-40,20,-41); ctx.lineTo(19,-38);
      ctx.quadraticCurveTo(10,-37,2,-40); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#a8403a'; ctx.beginPath(); ctx.moveTo(10,-37);
      ctx.quadraticCurveTo(13,-29,7,-21); ctx.lineTo(2,-19);
      ctx.quadraticCurveTo(6,-29,6,-37); ctx.fill();
      ctx.fillStyle = outfit.accent; ctx.beginPath(); ctx.moveTo(12,-37);
      ctx.quadraticCurveTo(17,-31,14,-25); ctx.lineTo(10,-24);
      ctx.quadraticCurveTo(12,-31,9,-37); ctx.fill();
      ctx.fillStyle = '#f5bb81'; ctx.beginPath(); ctx.arc(9,-38,3,0,Math.PI*2); ctx.fill();
    } else if (profile.outfit === 'stargazer') {
      roundRect(2,-66,44,6,2,outfit.dark);
      roundRect(15,-70,30,14,5,'#f3d98b'); roundRect(18,-67,24,8,3,'#324967');
      roundRect(20,-66,19,2,1,'#93e0eb');
      ctx.strokeStyle = '#e8ffffb0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(24,-65); ctx.lineTo(21,-61); ctx.moveTo(29,-65); ctx.lineTo(26,-61); ctx.stroke();
      ctx.fillStyle='#efdc8c'; ctx.beginPath(); ctx.arc(-30,-34,3,0,7); ctx.fill();
    } else if (profile.outfit === 'sunrider') {
      roundRect(1,-50,23,6,3,outfit.accent);
      ctx.fillStyle='#f7d995'; ctx.beginPath(); ctx.arc(8,-46,4,0,7); ctx.fill();
      ctx.fillStyle='#ba783e'; ctx.beginPath(); ctx.arc(8,-46,1.7,0,7); ctx.fill();
    } else if (profile.outfit === 'minty') {
      roundRect(8,-79,35,11,5,'#f4cf81'); roundRect(10,-72,33,4,2,'#b98144');
      roundRect(36,-70,18,5,2,'#e6b762');
      ctx.strokeStyle = '#fff0bf'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(28,-77); ctx.lineTo(28,-73); ctx.stroke();
      roundRect(19,-80,8,3,1.5,outfit.dark);
    }
    if (jetpackActive) {
      roundRect(-34, -84, 35, 29, 7, '#486780');
      roundRect(-30, -81, 28, 11, 5, '#c6d9df');
      roundRect(-30, -68, 28, 10, 5, '#81a9c5');
      roundRect(-41, -75, 10, 15, 3, '#d2b190');
      roundRect(-15, -76, 8, 8, 3, '#ffe28a');
    }
    ctx.restore();
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawBackground(); drawGround(); drawGroundShadow(); drawObstacles();
    drawShieldPickups(); drawDino(); drawShieldBreak(); drawShieldDebris();
    if (extremeMode) {
      ctx.fillStyle = '#325a45'; ctx.font = 'bold 14px sans-serif';
      ctx.fillText(`极限模式 · 续命 ${rescueCount}`, 24, 42);
    }
    if (mode === 'running' && highScoreFlash > .7) {
      ctx.fillStyle = '#fff7d9'; ctx.font = 'bold 13px sans-serif'; ctx.fillText('✦ 新纪录!', 38, 42);
    }
  }

    return { setState, render(state) { setState(state); draw(); }, roundRect, cloud, hills, drawBackground, solidGroundSegments, drawGround, drawGroundShadow, drawThornModule, drawCactus, drawHighBirdWing, drawBird, drawGiantBird, drawBramble, drawSkyPillar, drawObstacles, drawShieldPickups, drawShieldBreak, drawShieldDebris, drawDino, draw };
  }
  function drawOutfitPortrait(canvas, id) {
    const ctx = canvas.getContext('2d');
    ctx.save(); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(canvas.width / 160, canvas.height / 136);
    const outfit = outfits[id];
    const backdrop = ctx.createLinearGradient(0, 0, 160, 136);
    backdrop.addColorStop(0, '#fffdf7'); backdrop.addColorStop(1, outfit.stage);
    ctx.fillStyle = backdrop; ctx.fillRect(0, 0, 160, 136);
    ctx.fillStyle = outfit.stage; ctx.beginPath(); ctx.arc(88, 60, 53, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#233b3517'; ctx.beginPath(); ctx.ellipse(83, 118, 43, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.scale(1.18, 1.18);
    const renderer = createRenderer(ctx, { PLAYER_X: 72 });
    renderer.setState({ profile: { outfit: id }, player: { feetY: 96, grounded: true, crouch: false },
      elapsed: 0, mode: 'ready', shieldReady: false, jetpackActive: false });
    renderer.drawDino(); ctx.restore();
  }
  window.DinoModels = { RAINBOW, birdStyles, thornPalettes, outfits, drawOutfitPortrait,
    highBirdWingTip, highBirdWingShape, highBirdWingPoints, outlinePoints,
    giantBirdParts, thornModules, createRenderer };
})();
