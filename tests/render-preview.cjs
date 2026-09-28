// Generate a local, static visual review page. It does not alter the shipped game.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'output', 'playwright');
fs.mkdirSync(output, { recursive: true });
let game = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
game = game.replace('  updateAudioControls(); updateProfileUI(); fillObstacles(); draw(); requestAnimationFrame(frame);', `
  updateAudioControls(); updateProfileUI(); hideOverlay();
  mode = 'running'; worldX = 100000; elapsed = .55; speed = MAX_SPEED;
  profile.outfit = 'stargazer';
  window.preview = (scene) => {
    jetpackActive = scene === 'flight';
    blastColorful = scene === 'landing';
    shieldBreakAt = scene === 'landing' ? elapsed - .16 : -Infinity;
    shieldBreakX = worldX; shieldBreakY = GROUND - 37;
    player.feetY = jetpackActive ? 150 : GROUND;
    player.grounded = !jetpackActive;
    obstacles = [
      { kind: 'cactus', x: worldX + 70, width: 42, height: 52, seed: 0, palette: 0 },
      { kind: 'tallThorn', x: worldX + 230, width: 84, height: 168, seed: 0, palette: 0 },
      { kind: 'giantGround', x: worldX + 410, width: 260, seed: 0 }
    ];
    shieldPickups = [{ x: worldX + 130, y: GROUND - 120, kind: 'shield' }];
    jetpackPickups = [{ x: worldX + 190, y: GROUND - 120, kind: 'jetpack' }];
    if (scene === 'landing') shatterReachedObstacles(56 + .16 * SHIELD_BLAST_SPEED);
    draw();
  };
  window.preview('flight');
`);
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace('./styles.css?', '../../styles.css?');
for (const asset of ['audio/audio.js', 'visual-models/models.js', 'game.js']) {
  const content = asset === 'game.js' ? game : fs.readFileSync(path.join(root, asset), 'utf8');
  html = html.replace(new RegExp('<script src="\\./' + asset.replaceAll('.', '\\.') + '[^" ]*" defer><\\/script>'), () => '<script>' + content + '</script>');
}
fs.writeFileSync(path.join(output, 'preview.html'), html);
console.log(path.join(output, 'preview.html'));
if (process.argv.includes('--serve')) {
  require('node:http').createServer((request, response) => {
    const name = new URL(request.url, 'http://localhost').pathname;
    if (name === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    const file = name === '/' || name === '/preview.html' ? path.join(output, 'preview.html')
      : name === '/styles.css' ? path.join(root, name.slice(1)) : null;
    if (!file) { response.writeHead(404); response.end(); return; }
    response.setHeader('Content-Type', file.endsWith('.html') ? 'text/html; charset=utf-8'
      : file.endsWith('.css') ? 'text/css' : 'text/javascript');
    response.end(fs.readFileSync(file));
  }).listen(8766, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:8766'));
}
