# 视觉模型馆

双击 `index.html` 浏览全部 33 个展示项目，无需启动服务器。

- 左侧选择或搜索模型，右侧查看动画。
- 支持暂停、重新播放、0.25× / 0.5× 慢放与 PNG 导出。
- 地址末尾的 `#flight`、`#movingHigh`、`#pillar` 等标识可以直接定位模型。
- `models.js` 是主游戏实际使用的绘制模块，并提供碰撞所用的鸟翼、巨鸟与荆棘几何。
- `gallery.js` 负责展示场景，修改它不会影响主游戏。
- 预警标志沿用根目录 `styles.css` 的样式。PNG 导出仅保存 Canvas 画面，不包含位于 Canvas 上方的 HTML 预警标志。

主游戏调用方式：

```js
const renderer = window.DinoModels.createRenderer(canvas.getContext('2d'), constants);
renderer.render(gameState);
```

绘制模块只读取状态，不负责输入、物理更新、障碍生成或计分。移动项目时请保留两个资源目录与根目录的相对位置。
