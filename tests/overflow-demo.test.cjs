const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('local demo has exactly the production interface plus its invisible start flag', () => {
  const read = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8').replace(/\r\n/g, '\n');
  const production = read('index.html');
  const demo = read('overflow-demo.html');
  const flag = '    <script>window.DinoOverflowDemo = true;</script>\n';
  assert.ok(demo.includes(flag));
  assert.ok(demo.indexOf(flag) < demo.indexOf('<script src="./game.js'));
  assert.equal(demo.replace(flag, ''), production);
});
