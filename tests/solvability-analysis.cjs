// Reproducible reachability audit. SIM_START_METERS and EXTREME_PARAMS
// select a late-game stress test without modifying the shipped game.
// Run: node tests/solvability-analysis.cjs [seed-count] [end-meters]
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const startOption=process.argv.find((argument)=>argument.startsWith('--start='));
const START_X = Number(startOption?.slice('--start='.length) || process.env.SIM_START_METERS || 10000) * 10;
const extreme = process.argv.includes('--extreme') || process.env.EXTREME_PARAMS === '1';
const trainingGenerator = process.argv.includes('--training') || process.env.EXTREME_TRAINING === '1';
const adversarialScenes = process.argv.includes('--adversarial-scenes');
const originalSource = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
let source = originalSource;
if (extreme) {
  const substitutions = [
    ['const rand = (min, max) => min + Math.random() * (max - min);',
      'const rand = (min, max) => min;'],
    ['const latePressure = (x) => 1 - Math.exp(-Math.max(0, x - MAX_SPEED_DISTANCE) / 240000);',
      'const latePressure = (x) => 1;'],
    ['const seed = Math.random() * 10;', 'const seed = 9.999;'],
    ['flightSpeed: 300 + seed * 6', 'flightSpeed: 360'],
    ['const targetSpeed = runSpeedAt(x);',
      "const targetSpeed = runSpeedAt(x); if (kind === 'cactus' || kind === 'bramble') roll = .999999;"],
    ['if (Math.random() < .10 + pressure * .16) {', 'if (true) {']
  ];
  for (const [before, after] of substitutions) {
    if (!source.includes(before)) throw new Error(`Extreme generation hook changed: ${before}`);
    source = source.replace(before, after);
  }
  if (adversarialScenes) {
    const cliff=/function cliffNeighborKind\(side, x, roll\) \{[\s\S]*?\n  \}/;
    if (!cliff.test(source)) throw new Error('Cliff neighbor hook changed');
    source=source.replace(cliff,
      "function cliffNeighborKind(side, x, roll) { return side === 'before' ? 'giantHover' : 'bramble'; }");
  }
}
const startup = '  updateAudioControls(); updateProfileUI(); fillObstacles(); draw(); requestAnimationFrame(frame);';
if (!source.includes(startup)) throw new Error('Game startup hook changed');
const hook = `globalThis.auditGame = {
  next: (x) => { nextObstacleX = x; }, nextPosition: () => nextObstacleX,
  spawnObstacle, obstacles: () => obstacles, speedAt,
  setTraining: (enabled) => { trainingMode = enabled; },
  begin: (items, x) => { obstacles=items; shieldPickups=[]; shieldReady=false;
    shieldBufferUntil=0; nextObstacleX=Infinity; worldX=x; speed=MAX_SPEED;
    mode='running'; elapsed=0; player={feetY:GROUND,vy:0,jumps:0,crouch:false,grounded:true,diving:false};
    extremeMode=false;shieldUntil=0;downKeys.clear(); },
  step: (action, dt) => { if(action===1) jump();
    else if(action===2) { if(downKeys.size) throw new Error('down key pressed twice without release');
      downKeys.add('KeyS'); pressDown(); }
    else if(action===3) { downKeys.clear(); player.crouch=false; }
    update(dt); return { mode, x:worldX, player:{...player} }; }
};`;
function track(seed, finish = 1100000) {
  let rng = seed >>> 0;
  const math = Object.create(Math);
  math.random = () => ((rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 4294967296);
  const element = { getContext: () => ({}), addEventListener() {}, dataset: {},
    classList: { add() {}, remove() {} }, querySelectorAll: () => [], replaceChildren() {}, append() {} };
  const sandbox = { Math: math, document: { getElementById: () => element, addEventListener() {},
    createElement: () => element }, window: { addEventListener() {} },
    localStorage: { getItem: () => null } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../visual-models/models.js'), 'utf8'), sandbox);
  vm.runInContext(source.replace(startup, hook), sandbox);
  const game = sandbox.auditGame;
  game.setTraining(trainingGenerator);
  game.next(START_X+500);
  while (game.nextPosition() < finish + 1600) game.spawnObstacle();
  return {game, obstacles:Array.from(game.obstacles(), (o) => ({ ...o }))};
}

const GROUND = 320, SPEED = 1050, DT = 1/60, DX = SPEED * DT;
const finish = 1100000;
const birdY = { duck: 244, jump: 295, movingHigh: 244, movingLow: 295,
  giantGround: 276, giantHover: 234 };
const isGap = (o) => o.kind === 'gap' || o.kind === 'collapseGap';
const moving = (o) => o.kind === 'movingHigh' || o.kind === 'movingLow';
function obstacleX(o, x) {
  if (!moving(o)) return o.x;
  const frame=Math.round((x-START_X)/DX);
  const activation=Math.max(1,Math.ceil((o.x-816-START_X)/DX));
  return o.x-(o.flightSpeed||330)*DT*Math.max(0,frame-activation+1);
}
function overlap(a, b) { return a[2] > b[0] && a[0] < b[2] && a[3] > b[1] && a[1] < b[3]; }
function ellipse(cx, cy, rx, ry, boxes) {
  return boxes.some((b) => {
    const qx = Math.max(b[0], Math.min(cx, b[2]));
    const qy = Math.max(b[1], Math.min(cy, b[3]));
    return ((qx-cx)/rx)**2 + ((qy-cy)/ry)**2 < 1;
  });
}
function boxes(x, s) {
  const sx = s.c ? 1.17 : 1, sy = s.c ? .72 : 1;
  return [[-29,-54,13,-14],[-35,-44,17,-22],[8,-68,47,-43],
    [31,-44,49,-37],[-11,-16,0,-1],[10,-16,20,-1]]
    .map(([a,b,c,d]) => [x+a*sx,s.y+b*sy,x+c*sx,s.y+d*sy]);
}
function hits(o, ox, bs) {
  if (isGap(o) || bs.every((b) => b[2] <= ox || b[0] >= ox+o.width)) return false;
  if (o.kind === 'skyPillar') return bs.some((b) => overlap(b,[ox+2,0,ox+o.width-2,268]));
  if (o.kind === 'cactus' || o.kind === 'bramble') {
    if (o.width > 42 && bs.some((b) => overlap(b,[ox+4,313,ox+o.width-4,319]))) return true;
    const count = o.kind === 'bramble' ? Math.max(2,Math.ceil((o.width-42)/36)+1)
      : Math.max(1,Math.round((o.width-42)/36)+1);
    const step = count > 1 ? (o.width-42)/(count-1) : 0;
    for (let i=0;i<count;i++) {
      const h = (o.height ?? 46) * (count > 1 ? .93+.07*Math.sin(i*1.3+(o.seed??0)) : 1);
      const q = ox+i*step, k = h/53;
      const targets = [[q+13,320-50*k,q+30,317],
        [q+2,320-39*k,q+10,320-20*k],[q+34,320-45*k,q+41,320-26*k]];
      if (targets.some((t) => bs.some((b) => overlap(b,t)))) return true;
    }
    return false;
  }
  if (['duck','jump','movingHigh','movingLow'].includes(o.kind)) {
    const cy = birdY[o.kind];
    return ellipse(ox+29,cy,23,12,bs) ||
      (['duck','movingHigh'].includes(o.kind) && ellipse(ox+29,cy-42,18,42,bs));
  }
  if (o.kind === 'giantGround' || o.kind === 'giantHover') {
    const cx = ox+o.width*.53, cy = birdY[o.kind];
    if (ellipse(cx,cy,o.width*.276,o.kind === 'giantGround' ? 37 : 30,bs)) return true;
    return o.kind === 'giantHover' &&
      (ellipse(cx-o.width*.29,cy-13,o.width*.20,42,bs) ||
       ellipse(cx-o.width*.05,cy-17,o.width*.21,42,bs));
  }
  return false;
}
function nearby(track, x, from) {
  while (from < track.length && track[from].x+track[from].width < x-400) from++;
  let to=from;
  while (to < track.length && track[to].x < x+1150) to++;
  return [from, track.slice(from,to)];
}
function supported(obs,x) {
  function openAt(px) { return obs.some((o) => isGap(o) &&
    (o.kind !== 'collapseGap' || x >= o.x-315) && px>o.x && px<o.x+o.width); }
  return !openAt(x-9) || !openAt(x+18);
}
function advance(s, action, x, obs, t) {
  let y=s.y, v=s.v, j=s.j, c=s.c, g=s.g, d=s.d, held=s.h;
  if (action===1 && j<2) {
    const onGround=g; v=-650; j++; g=false; c=false; d=false;
    if (onGround) y=Math.min(y,319);
  } else if (action===2 && !held) {
    held=true;
    if (g) c=true; else { d=true; v=Math.max(v,0); }
  } else if (action===3 && held) { held=false; c=false; }
  const support=supported(obs,x);
  if (!g || !support) {
    g=false; c=false;
    const oldY=y;
    v=d ? Math.min(v+9000*DT,1200) : v+1700*DT;
    y+=v*DT;
    if (support && oldY<=GROUND && y>=GROUND) {
      y=GROUND;v=0;j=0;g=true;c=d&&held;d=false;
    }
  }
  const bs=boxes(x,{y,c});
  const wallHit=obs.some((o)=>isGap(o) &&
    (o.kind!=='collapseGap' || x>=o.x-315) && bs.some((b)=>
      overlap(b,[o.x+o.width,328,o.x+o.width+80,430])));
  if (y>=510 || wallHit) return null;
  for (const o of obs) if (hits(o,obstacleX(o,x),bs)) return null;
  return {y,v,j,c,g,d,h:held,prev:s,action,t,cost:s.cost+(action!==0)};
}
function key(s) {
  // Keep representative states on a 60 fps input lattice.
  return `${Math.round(s.y/8)},${Math.round(s.v/68)},${s.j},${+s.c},${+s.g},${+s.d},${+s.h}`;
}
function solve(track, start=START_X, end=finish, maxStates=12000) {
  let frontier=[{y:GROUND,v:0,j:0,c:false,g:true,d:false,h:false,prev:null,action:0,t:0,cost:0}];
  const commands=[];
  const checkpoints=[0];
  let x=start, index=0, widest=1;
  const steps=Math.ceil((end-start)/DX);
  for (let t=0;t<steps;t++) {
    x=start+(t+1)*DX;
    let obs; [index,obs]=nearby(track,x,index);
    const next=new Map();
    for (const s of frontier) {
      for (const action of [0,1,2,3]) {
        if ((action===1&&s.j>=2)||(action===2&&(s.h||s.d))||(action===3&&!s.h)) continue;
        const q=advance(s,action,x,obs,t+1);
        if (!q) continue;
        const id=key(q);
        const old=next.get(id);
        if (!old || q.cost<old.cost) next.set(id,q);
      }
    }
    if (!next.size) return {solved:false,x,meters:Math.floor(x/10),steps:t+1,
      obstacles:obs.filter((o)=>o.x>x-600&&o.x<x+1000).map((o)=>({kind:o.kind,x:Math.round(o.x),width:o.width}))};
    frontier=[...next.values()];
    if (frontier.length>widest) widest=frontier.length;
    if (t%5000===0) process.stderr.write(`  ${Math.floor(x/10)}m states=${frontier.length}\n`);
    if (frontier.length>maxStates) throw new Error(`State limit ${frontier.length} at ${Math.floor(x/10)}m`);
    // Once all variants have returned to a quiet stretch, keep one canonical ground state.
    if (t%10===0 && obs.every((o)=>o.x>x+780 || o.x+o.width<x-80)) {
      const calm=frontier.filter((s)=>s.g&&!s.h&&!s.c).sort((a,b)=>a.cost-b.cost)[0];
      if (calm) {
        const segment=[];
        for (let p=calm;p&&p.prev;p=p.prev) if (p.action) segment.push([p.t,p.action]);
        commands.push(...segment.reverse());
        checkpoints.push(t+1);
        calm.prev=null;calm.cost=0;frontier=[calm];
      }
    }
  }
  const final=frontier.filter((s)=>s.g&&!s.h&&!s.c).sort((a,b)=>a.cost-b.cost)[0]
    || frontier.sort((a,b)=>a.cost-b.cost)[0];
  const segment=[];
  for(let p=final;p&&p.prev;p=p.prev) if(p.action) segment.push([p.t,p.action]);
  commands.push(...segment.reverse());
  checkpoints.push(steps);
  return {solved:true,steps,widest,finalStates:frontier.length,meters:Math.floor(x/10),
    segments:checkpoints.length-1,commands,checkpoints};
}

function replay(game, obstacles, commands, steps) {
  game.begin(obstacles.map((o)=>({...o})),START_X);
  let i=0;
  for(let t=1;t<=steps;t++) {
    const action=i<commands.length&&commands[i][0]===t ? commands[i++][1] : 0;
    const state=game.step(action,DT);
    if(state.mode!=='running') return {valid:false,step:t,meters:Math.floor(state.x/10),action};
  }
  return {valid:true,actions:commands.length};
}

function operationWindows(obstacles, commands, checkpoints) {
  const result=[];
  let commandIndex=0;
  for(let segment=1;segment<checkpoints.length;segment++) {
    const start=checkpoints[segment-1], end=checkpoints[segment];
    const first=commandIndex;
    while(commandIndex<commands.length&&commands[commandIndex][0]<=end) commandIndex++;
    const segmentCommands=commands.slice(first,commandIndex);
    if(!segmentCommands.length) continue;
    let from=0;
    const frames=[];
    for(let t=start+1;t<=end;t++) {
      const x=START_X+t*DX;
      let obs;[from,obs]=nearby(obstacles,x,from);
      frames.push([x,obs]);
    }
    const baselineBefore=new Map();
    let baseline={y:GROUND,v:0,j:0,c:false,g:true,d:false,h:false,cost:0};
    for(let t=start+1;t<=end;t++) {
      const command=segmentCommands.find(([when])=>when===t);
      if(command) baselineBefore.set(t,baseline);
      const [x,obs]=frames[t-start-1];
      baseline=advance(baseline,command?.[1]||0,x,obs,t);
      if(!baseline) throw new Error(`Baseline failed at step ${t}`);
    }
    function valid(varied, shiftedTo, removed=false) {
      let state={y:GROUND,v:0,j:0,c:false,g:true,d:false,h:false,cost:0};
      for(let t=start+1;t<=end;t++) {
        const [x,obs]=frames[t-start-1];
        let action=0;
        for(let i=0;i<segmentCommands.length;i++) {
          const time=i===varied ? (removed ? -1 : shiftedTo) : segmentCommands[i][0];
          if(time===t) {
            if(action) return false;
            action=segmentCommands[i][1];
          }
        }
        state=advance(state,action,x,obs,t);
        if(!state) return false;
      }
      return state.g&&!state.h&&!state.c;
    }
    for(let i=0;i<segmentCommands.length;i++) {
      const [step,action]=segmentCommands[i];
      if(valid(i,step,true)) continue; // Optional input has no precision requirement.
      let earliest=step,latest=step;
      for(let candidate=step-1;candidate>Math.max(start,step-30);candidate--) {
        if(!valid(i,candidate)) break;
        earliest=candidate;
      }
      for(let candidate=step+1;candidate<=Math.min(end,step+30);candidate++) {
        if(!valid(i,candidate)) break;
        latest=candidate;
      }
      result.push({meters:Math.round((START_X+step*DX)/10),step,
        jumpNumber:action===1?baselineBefore.get(step).j+1:undefined,action:
        ['','jump','down','release'][action],windowFrames:latest-earliest+1,
        widthMs:(latest-earliest+1)*DT*1000,
        earliestMs:earliest*DT*1000,latestMs:latest*DT*1000,segmentStart:start,segmentEnd:end});
    }
  }
  result.sort((a,b)=>a.widthMs-b.widthMs);
  const sorted=result.map((r)=>r.widthMs);
  const minimum=result[0];
  const x=minimum && minimum.meters*10;
  const scene=minimum ? obstacles.filter((o)=>o.x>x-900&&o.x<x+1300)
    .map((o)=>({kind:o.kind,x:Math.round(o.x),width:o.width})) : [];
  return {required:result.length,minimum,scene,
    atMost40Ms:sorted.filter((w)=>w<=40).length,
    medianMs:sorted[Math.floor(sorted.length/2)],
    narrowest:result.slice(0,8)};
}

function adaptiveFirstJumpWindow(obstacles, target) {
  if (!target || target.action!=='jump' || target.jumpNumber!==1) return null;
  const start=target.segmentStart,end=target.segmentEnd;
  let from=0;
  const frames=[];
  for(let t=start+1;t<=end;t++) {
    const x=START_X+t*DX;
    let obs;[from,obs]=nearby(obstacles,x,from);
    frames[t]=[x,obs];
  }
  const before=[];
  before[start]=[{y:GROUND,v:0,j:0,c:false,g:true,d:false,h:false,cost:0}];
  function expand(frontier,t,actions) {
    const [x,obs]=frames[t],next=new Map();
    for(const s of frontier) for(const action of actions) {
      if ((action===1&&s.j>=2)||(action===2&&(s.h||s.d))||(action===3&&!s.h)) continue;
      const q=advance(s,action,x,obs,t);
      if(q) next.set(key(q),q);
    }
    return [...next.values()];
  }
  for(let t=start+1;t<=Math.min(end,target.step+60);t++)
    before[t]=expand(before[t-1],t,[0,2,3]);
  function possible(candidate) {
    if(!before[candidate-1]?.length) return false;
    let frontier=expand(before[candidate-1],candidate,[1]);
    for(let t=candidate+1;t<=end&&frontier.length;t++) frontier=expand(frontier,t,[0,1,2,3]);
    return frontier.some((s)=>s.g&&!s.h&&!s.c);
  }
  const lower=Math.max(start+1,target.step-60),upper=Math.min(end,target.step+60);
  const valid=[];
  for(let t=lower;t<=upper;t++) if(possible(t)) valid.push(t);
  const runs=[];
  for(const t of valid) {
    const last=runs.at(-1);
    if(last&&t===last[1]+1) last[1]=t;
    else runs.push([t,t]);
  }
  const local=runs.find(([a,b])=>a<=target.step&&target.step<=b);
  return {examined:[lower,upper],validFrames:valid.length,
    earliest:valid[0],latest:valid.at(-1),widthMs:valid.length*DT*1000,
    aroundChosen:local&&{frames:local,widthMs:(local[1]-local[0]+1)*DT*1000},
    runs,
    truncated:valid[0]===lower||valid.at(-1)===upper};
}

function reactionWindows(obstacles, checkpoints) {
  const windows=[];
  for(let segment=1;segment<checkpoints.length;segment++) {
    const start=checkpoints[segment-1],end=checkpoints[segment],length=end-start;
    const requireNeutral=segment<checkpoints.length-1;
    let from=0;
    const frames=[];
    for(let t=start+1;t<=end;t++) {
      const x=START_X+t*DX;
      let obs;[from,obs]=nearby(obstacles,x,from);
      frames[t-start]=[x,obs];
    }
    const noInput=[{y:GROUND,v:0,j:0,c:false,g:true,d:false,h:false,cost:0}];
    for(let i=1;i<=length;i++) {
      const previous=noInput[i-1];
      noInput[i]=previous&&advance(previous,0,...frames[i],start+i);
    }
    const final=noInput[length];
    if(final&&(!requireNeutral||(final.g&&!final.h&&!final.c))) continue;
    function canWait(k) {
      if(!noInput[k]) return false;
      let frontier=[noInput[k]];
      for(let i=k+1;i<=length;i++) {
        const [x,obs]=frames[i],next=new Map();
        for(const s of frontier) for(const action of [0,1,2,3]) {
          if ((action===1&&s.j>=2)||(action===2&&(s.h||s.d))||(action===3&&!s.h)) continue;
          const q=advance(s,action,x,obs,start+i);
          if(q) next.set(key(q),q);
        }
        frontier=[...next.values()];
        if(!frontier.length) return false;
      }
      return !requireNeutral ? frontier.length>0 : frontier.some((s)=>s.g&&!s.h&&!s.c);
    }
    if(!canWait(0)) throw new Error(`No reachable route from checkpoint ${start}`);
    let low=0,high=length;
    while(low<high) {
      const middle=Math.ceil((low+high)/2);
      if(canWait(middle)) low=middle;
      else high=middle-1;
    }
    const x=START_X+start*DX;
    windows.push({meters:Math.round(x/10),deadlineFrames:low+1,
      deadlineMs:(low+1)*DT*1000,
      nearby:obstacles.filter((o)=>o.x>x-100&&o.x<x+1700)
        .slice(0,3).map((o)=>({kind:o.kind,x:Math.round(o.x),width:o.width}))});
  }
  windows.sort((a,b)=>a.deadlineMs-b.deadlineMs);
  const values=windows.map((w)=>w.deadlineMs);
  return {requiredSegments:windows.length,minimum:windows[0],
    medianMs:values[Math.floor(values.length/2)],narrowest:windows.slice(0,5)};
}

const count = Number(process.argv[2] || 3);
const target = Number(process.argv[3] || 110000) * 10;
for (let seed=1;seed<=count;seed++) {
  const {game,obstacles}=track(seed,target);
  const started=Date.now();
  const result=solve(obstacles,START_X,target);
  const verified=result.solved&&replay(game,obstacles,result.commands,result.steps);
  const precision=result.solved&&verified.valid&&process.argv.includes('--windows')
    ? operationWindows(obstacles,result.commands,result.checkpoints):undefined;
  const adaptive=precision&&process.argv.includes('--adaptive')
    ? adaptiveFirstJumpWindow(obstacles,precision.minimum):undefined;
  const reaction=result.solved&&verified.valid&&process.argv.includes('--reaction')
    ? reactionWindows(obstacles,result.checkpoints):undefined;
  const {commands,checkpoints,...summary}=result;
  console.log(JSON.stringify({seed,startMeters:START_X/10,extreme,trainingGenerator,adversarialScenes,
    count:obstacles.length,seconds:(Date.now()-started)/1000,
    ...summary,verified,precision,adaptive,reaction}));
}
