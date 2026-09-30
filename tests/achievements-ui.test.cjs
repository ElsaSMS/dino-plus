const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor(tag = 'div') {
    this.tagName = tag;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.textContent = '';
    this.classes = new Set();
    this.classList = {
      toggle: (name) => this.classes.has(name) ? (this.classes.delete(name), false) : (this.classes.add(name), true),
      remove: (name) => this.classes.delete(name)
    };
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, listener) { this.listeners[name] = listener; }
}

function descendants(root) {
  return [root, ...root.children.flatMap(descendants)];
}

test('library shows earned badges and detail cards disclose public progress by hover and keyboard', () => {
  const elements = new Map(['achievement-library', 'achievement-library-title',
    'achievement-detail-list', 'achievement-progress-summary'].map((id) => [id, new Element()]));
  const windowListeners = {};
  const groups = [{ id: 'classic', name: '逐光行远', category: '逐光之路', awards: [
    { tier: 'bronze', label: '铜', image: './bronze.svg', requirement: '经典模式单局达到 10000 米',
      progress: '250/10000', unlocked: false, hidden: false },
    { tier: 'silver', label: '银', image: './silver.svg', requirement: '经典模式单局达到 50000 米',
      progress: '250/50000', unlocked: false, hidden: false },
    { tier: 'gold', label: '金', image: './gold.svg', requirement: '经典模式累计跑过 1000000 米',
      progress: '250/1000000', unlocked: false, hidden: false },
    { tier: 'hidden', label: '隐藏', image: './hidden.svg', requirement: null,
      progress: '尚未发现', unlocked: false, hidden: true }
  ] }];
  let subscriber;
  let refreshes = 0;
  const sandbox = {
    document: {
      getElementById: (id) => elements.get(id) || null,
      createElement: (tag) => new Element(tag),
      createDocumentFragment: () => new Element('fragment')
    },
    window: {
      DinoAchievements: {
        getView: () => ({ groups }),
        subscribe: (listener) => { subscriber = listener; },
        refresh: () => { refreshes++; subscriber(); }
      },
      addEventListener: (type, listener) => { windowListeners[type] = listener; }
    },
    console
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'achievements-ui.js'), 'utf8');
  vm.runInNewContext(source, sandbox);
  const library = elements.get('achievement-library');
  const detail = elements.get('achievement-detail-list');
  const summary = elements.get('achievement-progress-summary');
  assert.equal(summary.textContent, '已收藏 0 / 3 枚徽章');
  assert.equal(descendants(library).filter((node) => node.className === 'achievement-library-item').length, 0);
  let cards = descendants(detail).filter((node) => node.tagName === 'article');
  assert.equal(cards.length, 3, 'hidden acquisition rules stay off the detail page');
  assert.equal(descendants(cards[0]).some((node) => node.textContent === '250/10000'), true);
  cards[0].listeners.keydown({ key: 'Enter', preventDefault() {} });
  assert.equal(cards[0].attributes['aria-expanded'], 'true');
  cards[0].listeners.blur();
  assert.equal(cards[0].attributes['aria-expanded'], 'false');

  groups[0].awards[0].unlocked = true;
  subscriber();
  let inventoryItems = descendants(library).filter((node) => node.className === 'achievement-library-item');
  assert.equal(inventoryItems.length, 1);
  assert.equal(inventoryItems[0].children[0].alt, '逐光行远·铜徽章');
  groups[0].awards[1].unlocked = true;
  subscriber();
  inventoryItems = descendants(library).filter((node) => node.className === 'achievement-library-item');
  assert.equal(inventoryItems.length, 1);
  assert.equal(inventoryItems[0].children[0].alt, '逐光行远·银徽章');
  groups[0].awards[2].unlocked = true;
  subscriber();
  inventoryItems = descendants(library).filter((node) => node.className === 'achievement-library-item');
  assert.equal(inventoryItems.length, 1);
  assert.equal(inventoryItems[0].children[0].alt, '逐光行远·金徽章');
  groups[0].awards[3].unlocked = true;
  subscriber();
  inventoryItems = descendants(library).filter((node) => node.className === 'achievement-library-item');
  assert.equal(inventoryItems.length, 1);
  assert.ok(inventoryItems.every((item) => item.children.length === 1 && item.children[0].tagName === 'img'),
    'the inventory displays badge icons without adjacent names or tiers');
  assert.equal(inventoryItems[0].children[0].alt, '逐光行远·隐藏徽章');
  assert.equal(summary.textContent, '已收藏 3 / 3 枚徽章');
  cards = descendants(detail).filter((node) => node.tagName === 'article');
  assert.equal(cards.length, 3);
  windowListeners.storage({ key: 'elsasms.dino-plus.v1.achievements' });
  assert.equal(refreshes, 1);
});

test('the catalogue intro does not reveal hidden badge tiers', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'achievements.html'), 'utf8');
  assert.equal(page.includes('每一次漂亮的腾跃'), false);
  assert.equal(page.includes('公开徽章'), false);
});
