(() => {
  'use strict';

  const library = document.getElementById('achievement-library');
  const detailList = document.getElementById('achievement-detail-list');
  const summary = document.getElementById('achievement-progress-summary');
  if (!library && !detailList) return;

  const api = window.DinoAchievements;
  if (!api || typeof api.getView !== 'function') {
    const target = library || detailList;
    target.textContent = '成就暂时无法载入，请刷新页面。';
    if (summary) summary.textContent = '成就暂时无法载入';
    return;
  }
  let lastLibrarySignature = null;
  const tierRank = { wood: 1, bronze: 2, silver: 3, gold: 4, crystal: 5, hidden: 6 };

  function node(tag, className, content) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== undefined) element.textContent = String(content);
    return element;
  }

  function groupsFromView() {
    const view = api.getView();
    return Array.isArray(view && view.groups) ? view.groups : [];
  }

  function renderLibrary(groups) {
    if (!library) return;
    const unlockedAwards = groups.flatMap((group) => {
      const award = (group.awards || []).filter((item) => item.unlocked)
        .reduce((best, item) => !best || (tierRank[item.tier] || 0) > (tierRank[best.tier] || 0)
          ? item : best, null);
      return award ? [{ group, award }] : [];
    });
    const signature = unlockedAwards.map(({ group, award }) => `${group.id}:${group.name}:${award.tier}`).join('|');
    if (signature === lastLibrarySignature) return;
    lastLibrarySignature = signature;
    const fragment = document.createDocumentFragment();
    for (const { group, award } of unlockedAwards) {
      const item = node('div', 'achievement-library-item');
      const image = node('img');
      image.src = award.image;
      image.alt = `${group.name}·${award.label}徽章`;
      image.width = 104;
      image.height = 104;
      image.loading = 'lazy';
      item.append(image);
      fragment.append(item);
    }

    if (!unlockedAwards.length) fragment.append(node('p', 'achievement-empty', '还没有收藏徽章。出发吧，故事刚刚开始。'));
    library.replaceChildren(fragment);
    const heading = document.getElementById('achievement-library-title');
    if (heading) heading.setAttribute('aria-label', `成就库，已收藏 ${unlockedAwards.length} 枚徽章`);
  }

  function renderDetail(groups) {
    if (!detailList) return;
    const categories = new Map();
    let available = 0;
    let unlocked = 0;

    for (const group of groups) {
      const publicAwards = (group.awards || []).filter(award => !award.hidden);
      if (!publicAwards.length) continue;
      const category = group.category || '旅途成就';
      const awards = category === '奇遇流光'
        ? publicAwards.filter(award => award.unlocked)
        : publicAwards;
      if (!categories.has(category)) categories.set(category, []);
      if (awards.length) categories.get(category).push({ group, awards });
      available += publicAwards.length;
      unlocked += publicAwards.filter(award => award.unlocked).length;
    }

    const fragment = document.createDocumentFragment();
    for (const [category, entries] of categories) {
      const section = node('section', 'achievement-category');
      const heading = node('div', 'achievement-category-heading');
      heading.append(node('h2', '', category));
      section.append(heading);
      if (category === '奇遇流光' && !entries.length) {
        section.append(node('p', 'achievement-detail-empty', '暂无成就，快去探索吧！'));
        fragment.append(section);
        continue;
      }
      const grid = node('div', 'achievement-group-grid');

      for (const { group, awards } of entries) {
        const card = node('section', 'achievement-group-card');
        const cardHeading = node('div', 'achievement-group-card-heading');
        cardHeading.append(node('h3', '', group.name));
        cardHeading.append(node('small', '', `${awards.filter(award => award.unlocked).length} / ${awards.length} 枚`));
        card.append(cardHeading);
        const awardGrid = node('div', 'achievement-award-grid');

        for (const award of awards) {
          const item = node('article', `achievement-award ${award.unlocked ? 'is-unlocked' : 'is-locked'}`);
          item.tabIndex = 0;
          item.setAttribute('role', 'button');
          item.setAttribute('aria-expanded', 'false');
          item.setAttribute('aria-label', `${group.name}，${award.label}，${award.unlocked ? '已获得' : '尚未获得'}，${award.requirement}。${award.progress}`);
          const image = node('img', 'achievement-award-image');
          image.src = award.image;
          image.alt = '';
          image.width = 83;
          image.height = 83;
          image.loading = 'lazy';
          item.append(image);
          item.append(node('span', 'achievement-award-tier', `${award.label}${award.unlocked ? ' · 已获得' : ''}`));
          item.append(node('span', 'achievement-award-requirement', award.requirement));
          const progress = node('span', 'achievement-award-progress');
          progress.append(node('span', '', award.progress || '尚未达成'));
          item.append(progress);
          const toggle = () => {
            const open = item.classList.toggle('is-open');
            item.setAttribute('aria-expanded', String(open));
          };
          item.addEventListener('click', toggle);
          item.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            toggle();
          });
          item.addEventListener('blur', () => {
            item.classList.remove('is-open');
            item.setAttribute('aria-expanded', 'false');
          });
          awardGrid.append(item);
        }
        card.append(awardGrid);
        grid.append(card);
      }
      section.append(grid);
      fragment.append(section);
    }

    if (!categories.size) fragment.append(node('p', 'achievement-detail-empty', '成就图鉴暂时无法载入。'));
    detailList.replaceChildren(fragment);
    if (summary) summary.textContent = `已收藏 ${unlocked} / ${available} 枚徽章`;
  }

  function render() {
    try {
      const groups = groupsFromView();
      renderLibrary(groups);
      renderDetail(groups);
    } catch (error) {
      console.error('成就页面更新失败', error);
    }
  }

  render();
  if (typeof api.subscribe === 'function') api.subscribe(render);
  if (typeof api.refresh === 'function') {
    window.addEventListener('storage', (event) => {
      if (event.key === 'elsasms.dino-plus.v1.achievements' || event.key === null) api.refresh();
    });
  }
})();
