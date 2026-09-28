(() => {
  'use strict';
  const players = [];
  const status = document.getElementById('status');
  const volume = document.getElementById('volume');
  function stop() { for (const player of players) { player.pause(); player.currentTime = 0; } status.textContent = '已停止播放'; }
  for (const clip of window.DinoAudio.clips) {
    const card = document.createElement('article'); card.className = 'clip-card' + (clip.group ? ' music' : '');
    const kind = document.createElement('span'); kind.className = 'eyebrow'; kind.textContent = `${clip.group || '音效'} / ${clip.seconds} s`;
    const title = document.createElement('h2'); title.textContent = clip.title;
    const description = document.createElement('p'); description.textContent = clip.description || '游戏中的独立事件音效。';
    const player = document.createElement('audio'); player.controls = true; player.preload = 'metadata';
    player.src = './' + clip.id + '.wav?v=20260927-jump-land-volume'; player.volume = Number(volume.value) / 100;
    player.setAttribute('aria-label', clip.title); players.push(player);
    player.addEventListener('play', () => { for (const other of players) if (other !== player) { other.pause(); other.currentTime = 0; } status.textContent = '正在播放：' + clip.title; });
    player.addEventListener('ended', () => { status.textContent = '播放完毕：' + clip.title; });
    player.addEventListener('error', () => { status.textContent = '文件不可用，可点击“重新合成 WAV”生成：' + clip.title; });
    const footer = document.createElement('div'); footer.className = 'clip-footer';
    const download = document.createElement('a'); download.href = player.src; download.download = clip.id + '.wav'; download.textContent = '下载 WAV ↓';
    const render = document.createElement('button'); render.type = 'button'; render.textContent = '重新合成 WAV';
    render.addEventListener('click', async () => {
      render.disabled = true; render.textContent = '合成中…';
      try {
        const bytes = await window.DinoAudio.renderWav(clip.id);
        const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
        const link = document.createElement('a'); link.href = url; link.download = clip.id + '.wav'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000); status.textContent = '已导出：' + clip.title;
      } catch (error) { status.textContent = '导出失败：' + error.message; }
      finally { render.disabled = false; render.textContent = '重新合成 WAV'; }
    });
    footer.append(download, render); card.append(kind, title, description, player, footer); document.getElementById('clips').append(card);
  }
  volume.addEventListener('input', () => { for (const player of players) player.volume = Number(volume.value) / 100; document.getElementById('volume-label').textContent = volume.value + '%'; });
  document.getElementById('stop').addEventListener('click', stop);
  window.addEventListener('pagehide', stop);
})();
