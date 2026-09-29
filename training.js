(() => {
  'use strict';

  const STORAGE_KEY = 'elsasms.dino-plus.training.v1.selected-kinds';
  const SPEED_KEY = 'elsasms.dino-plus.training.v1.speed';
  const kinds = [
    ['cactus', '普通荆棘'], ['bramble', '连续荆棘'], ['tallThorn', '高荆棘'],
    ['gap', '普通悬崖'], ['collapseGap', '塌方悬崖'],
    ['duck', '高空静止小鸟'], ['jump', '贴地静止小鸟'],
    ['movingHigh', '高空运动小鸟'], ['movingLow', '贴地运动小鸟'],
    ['giantGround', '贴地巨鸟'], ['giantHover', '悬空巨鸟']
  ];
  const known = new Set(kinds.map(([kind]) => kind));
  let saved;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { saved = null; }
  let active = Array.isArray(saved) ? saved.filter((kind) => known.has(kind)) : kinds.map(([kind]) => kind);
  if (!active.length) active = kinds.map(([kind]) => kind);
  let activeSpeed = 3.2;
  try { if (JSON.parse(localStorage.getItem(SPEED_KEY)) === 3.6) activeSpeed = 3.6; } catch { /* Use the default. */ }

  const options = document.getElementById('training-options');
  const speedInputs = [...document.querySelectorAll('input[name="training-speed"]')];
  speedInputs.forEach((input) => { input.checked = Number(input.value) === activeSpeed; });
  const summary = document.getElementById('training-summary');
  const apply = document.getElementById('training-apply');
  const checkedKinds = () => [...options.querySelectorAll('input:checked')].map((input) => input.value);
  const selectedSpeed = () => Number(speedInputs.find((input) => input.checked)?.value) || 3.2;
  const refresh = () => {
    const pending = checkedKinds();
    apply.disabled = pending.length === 0;
    summary.textContent = pending.length
      ? `已勾选 ${pending.length} 种 · 固定 ${selectedSpeed().toFixed(1)} 倍速；点击应用后从 0 米重新开始。`
      : '至少选择一种障碍，才能开始练习。';
  };
  for (const [kind, name] of kinds) {
    const label = document.createElement('label');
    label.className = 'training-option';
    const input = document.createElement('input');
    input.type = 'checkbox'; input.value = kind; input.checked = active.includes(kind);
    input.addEventListener('change', refresh);
    const text = document.createElement('span'); text.textContent = name;
    label.append(input, text); options.append(label);
  }
  speedInputs.forEach((input) => input.addEventListener('change', refresh));
  window.DinoTraining = { selectedKinds: () => [...active], speedMultiplier: () => activeSpeed };
  apply.addEventListener('click', () => {
    const next = checkedKinds();
    if (!next.length) return;
    active = next;
    activeSpeed = selectedSpeed();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
      localStorage.setItem(SPEED_KEY, JSON.stringify(activeSpeed));
    } catch { /* Practice still works without storage. */ }
    window.DinoTraining.resetRun?.();
    refresh();
  });
  document.getElementById('training-reset').addEventListener('click', () => window.DinoTraining.resetRun?.());
  document.getElementById('training-select-all').addEventListener('click', () => {
    options.querySelectorAll('input').forEach((input) => { input.checked = true; });
    refresh();
  });
  document.getElementById('training-clear').addEventListener('click', () => {
    options.querySelectorAll('input').forEach((input) => { input.checked = false; });
    refresh();
  });
  refresh();
})();
