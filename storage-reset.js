(() => {
  'use strict';

  const prefix = 'elsasms.dino-plus.';
  const resetKey = `${prefix}reset.20261001`;
  try {
    const storage = window.localStorage;
    if (storage.getItem(resetKey) === 'done') return;
    const oldKeys = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key?.startsWith(prefix) && key !== resetKey) oldKeys.push(key);
    }
    for (const key of oldKeys) storage.removeItem(key);
    storage.setItem(resetKey, 'done');
  } catch { /* A browser without storage can still run the game. */ }
})();
