(() => {
  'use strict';

  const VERSION = 1;
  const MAX_CHARS = 2_000_000;
  const MAX_NODES = 50_000;
  const MAX_DEPTH = 256;
  const SLOTS = new Set(['classic', 'extreme', 'training']);

  // JSON alone loses shared references, cycles, Sets, Maps and infinite sentinels.
  // A run snapshot needs all of them: obstacle scenes refer to each other, and
  // achievement collections use the very same obstacle objects as keys.
  function encodeGraph(root) {
    const nodes = [];
    const seen = new Map();

    function encode(value, depth) {
      if (depth > MAX_DEPTH) throw new Error('Run snapshot is too deep');
      if (value === undefined) return ['u'];
      if (value === null || typeof value === 'string' || typeof value === 'boolean') return ['p', value];
      if (typeof value === 'number') {
        if (value === Infinity) return ['n', '+inf'];
        if (value === -Infinity) return ['n', '-inf'];
        if (Number.isNaN(value)) return ['n', 'nan'];
        if (Object.is(value, -0)) return ['n', '-0'];
        return ['p', value];
      }
      if (typeof value !== 'object') throw new Error('Unsupported run snapshot value');
      if (seen.has(value)) return ['r', seen.get(value)];
      if (nodes.length >= MAX_NODES) throw new Error('Run snapshot is too large');

      const id = nodes.length;
      seen.set(value, id);
      const node = { t: '', v: [] };
      nodes.push(node);
      const type = Object.prototype.toString.call(value);
      if (Array.isArray(value)) {
        node.t = 'a';
        for (let index = 0; index < value.length; index++) {
          node.v.push(Object.hasOwn(value, index) ? encode(value[index], depth + 1) : ['h']);
        }
      } else if (type === '[object Map]') {
        node.t = 'm';
        for (const [key, entry] of value) {
          node.v.push([encode(key, depth + 1), encode(entry, depth + 1)]);
        }
      } else if (type === '[object Set]') {
        node.t = 's';
        for (const entry of value) node.v.push(encode(entry, depth + 1));
      } else if (type === '[object Object]') {
        node.t = 'o';
        for (const key of Object.keys(value)) node.v.push([key, encode(value[key], depth + 1)]);
      } else {
        throw new Error('Unsupported run snapshot object');
      }
      return ['r', id];
    }

    return { version: VERSION, root: encode(root, 0), nodes };
  }

  function decodeGraph(graph) {
    if (!graph || graph.version !== VERSION || !Array.isArray(graph.nodes)
      || graph.nodes.length > MAX_NODES) throw new Error('Invalid run snapshot');
    const nodes = graph.nodes;
    const objects = nodes.map((node) => {
      if (!node || !Array.isArray(node.v)) throw new Error('Invalid run snapshot node');
      if (node.t === 'a') return new Array(node.v.length);
      if (node.t === 'o') return Object.create(null);
      if (node.t === 'm') return new Map();
      if (node.t === 's') return new Set();
      throw new Error('Invalid run snapshot node type');
    });

    function decode(value) {
      if (!Array.isArray(value)) throw new Error('Invalid run snapshot reference');
      if (value[0] === 'u' && value.length === 1) return undefined;
      if (value[0] === 'p' && value.length === 2
        && (value[1] === null || ['string', 'boolean', 'number'].includes(typeof value[1]))) return value[1];
      if (value[0] === 'n' && value.length === 2) {
        if (value[1] === '+inf') return Infinity;
        if (value[1] === '-inf') return -Infinity;
        if (value[1] === 'nan') return NaN;
        if (value[1] === '-0') return -0;
      }
      if (value[0] === 'r' && value.length === 2 && Number.isInteger(value[1])
        && value[1] >= 0 && value[1] < objects.length) return objects[value[1]];
      throw new Error('Invalid run snapshot reference');
    }

    nodes.forEach((node, index) => {
      const target = objects[index];
      if (node.t === 'a') {
        node.v.forEach((item, itemIndex) => {
          if (Array.isArray(item) && item[0] === 'h' && item.length === 1) return;
          target[itemIndex] = decode(item);
        });
      } else if (node.t === 'o') {
        for (const entry of node.v) {
          if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') {
            throw new Error('Invalid run snapshot property');
          }
          Object.defineProperty(target, entry[0], {
            value: decode(entry[1]), enumerable: true, writable: true, configurable: true
          });
        }
      } else if (node.t === 'm') {
        for (const entry of node.v) {
          if (!Array.isArray(entry) || entry.length !== 2) throw new Error('Invalid run snapshot map entry');
          target.set(decode(entry[0]), decode(entry[1]));
        }
      } else {
        for (const entry of node.v) target.add(decode(entry));
      }
    });
    return decode(graph.root);
  }

  function create(storageKey) {
    if (typeof storageKey !== 'string' || !storageKey.startsWith('elsasms.dino-plus.')) {
      throw new Error('Run session key must use the game prefix');
    }

    function storage() {
      try { return window.sessionStorage; } catch { return null; }
    }
    function read() {
      try {
        const raw = storage()?.getItem(storageKey);
        if (!raw || raw.length > MAX_CHARS) return null;
        const data = JSON.parse(raw);
        return data?.version === VERSION && data.slots && typeof data.slots === 'object'
          && !Array.isArray(data.slots) ? data : null;
      } catch { return null; }
    }
    function write(data) {
      try {
        const raw = JSON.stringify(data);
        if (raw.length > MAX_CHARS) return false;
        const target = storage();
        if (!target) return false;
        target.setItem(storageKey, raw);
        return true;
      } catch { return false; }
    }
    const fresh = () => ({ version: VERSION, mainMode: 'classic', slots: {} });

    return {
      get(slot) {
        if (!SLOTS.has(slot)) return null;
        const data = read();
        if (!data || !Object.hasOwn(data.slots, slot)) return null;
        try {
          const value = decodeGraph(data.slots[slot]);
          return value === undefined ? null : value;
        } catch { return null; }
      },
      set(slot, value) {
        if (!SLOTS.has(slot)) return false;
        try {
          const data = read() || fresh();
          data.slots[slot] = encodeGraph(value);
          return write(data);
        } catch { return false; }
      },
      clear(slot) {
        if (!SLOTS.has(slot)) return false;
        const data = read() || fresh();
        delete data.slots[slot];
        return write(data);
      },
      getMainMode() {
        return read()?.mainMode === 'extreme' ? 'extreme' : 'classic';
      },
      setMainMode(mode) {
        if (mode !== 'classic' && mode !== 'extreme') return false;
        const data = read() || fresh();
        data.mainMode = mode;
        return write(data);
      }
    };
  }

  window.DinoRunSessions = { create };
})();
