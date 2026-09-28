# 音乐与音效

双击 `index.html` 打开试听室，或直接双击任意 WAV 用系统播放器播放。

| 文件 | 声音 |
| --- | --- |
| bgm.wav | 普通 BGM |
| bgm-intense.wav | 高速 BGM |
| start.wav / pause.wav / resume.wav / end.wav | 开始 / 暂停 / 继续 / 结束 |
| jump.wav / jump2.wav | 起跳 / 二连跳 |
| land.wav | 普通落地 |
| warning.wav | 三声警报 |
| shieldPickup.wav | 护盾和喷气背包拾取共用 |
| explosion.wav | 破盾和喷气落地共用 |
| collapse.wav | 塌方 |
| jetpack.wav | 轻柔喷气气流 |

所有音频为项目自有 Web Audio 合成内容，无需外部下载或授权素材。文件为 44.1 kHz、16 位、双声道 PCM WAV，合计约 8 MB。

## 维护

`audio.js` 是音频的唯一源定义，主游戏直接引用它。WAV 是用于直接播放的导出副本；音乐尾部淡出、喷气试听时长与游戏中的实时循环有所不同。

修改音色后，在试听室逐项点击“重新合成 WAV”，下载后覆盖同名文件。也可使用 `export-wav.cjs` 批量导出，它需要 Node.js、Playwright 和 Chromium/Edge；通过 `DINO_BROWSER_PATH` 指定浏览器路径。导出不会更改游戏的存档、静音或音量设置。
