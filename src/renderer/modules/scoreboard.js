'use strict';

/**
 * scoreboard · 顶部比分面板（比分 / 存活 / 计时器）
 *
 * 由 src/renderer/hud.js（重构前巨石，1665 行）机械拆分而来，正文逐字保留。
 * 共享可变状态走 C（globalThis.OphHudCtx），纯函数走 K（globalThis.OphHudKit）。
 * 想加/删这块功能：改 src/renderer/hud-manifest.js 里的一行即可。
 */
;(function () {
  const C = globalThis.OphHudCtx;
  const K = globalThis.OphHudKit;

  const prevAlive = { ct: undefined, t: undefined };
  const prevScore = { ct: undefined, t: undefined };
  /** 每帧渲染：快照到达时由宿主分发调用 */
  function render(s) {
  // ---- 比分（变化时一帧放大提亮）----
  setScore(C.nodes.scoreCT, s.scoreCT, 'ct');
  setScore(C.nodes.scoreT, s.scoreT, 't');

  // ---- 存活人数：GSI 对本地玩家不提供 allplayers，拿不到就压暗显示占位 ----
  setAlive(C.nodes.aliveCT, s.aliveCT ?? null, 'ct');
  setAlive(C.nodes.aliveT, s.aliveT ?? null, 't');

  // ---- 计时器 ----
  const t = s.timer || { mode: 'none', text: '' };
  C.nodes.timerText.textContent = t.text;
  C.nodes.timerBlock.classList.toggle('empty', !t.text);
  C.nodes.timerBlock.classList.toggle('is-bomb', t.mode === 'bomb');
  C.nodes.timerBlock.classList.toggle('is-freeze', t.mode === 'freeze');
  C.nodes.timerBlock.classList.toggle('is-low', t.mode !== 'none' && t.remain <= 10);
  }

/**
 * 存活人数。GSI 对本地玩家不提供 allplayers_*（仅 GOTV / 观察者可用），
 * 所以拿不到数据时显示占位横杠并压暗，拿到时数字直接切换 + 一次变暗微反馈。
 */
function setAlive(node, n, key) {
  const block = node.closest('.team-block');
  const hasCount = C.aliveCountMode !== 'label' && typeof n === 'number';

  // 默认只显示阵营名（GSI 对本地玩家不给存活人数，不去编一个假数字）
  const L = C.textMap.labels || {};
  node.textContent = hasCount ? String(n) : (key === 'ct' ? (L.ct || 'CT') : (L.t || 'T'));
  block.classList.toggle('show-count', hasCount);

  if (hasCount && prevAlive[key] !== undefined && prevAlive[key] !== n) {
    node.classList.remove('dim');
    void node.offsetWidth;
    node.classList.add('dim');
    setTimeout(() => node.classList.remove('dim'), 120);
  }
  prevAlive[key] = n;
}

/** 比分变化时给一帧放大提亮的强调 */
function setScore(node, n, key) {
  node.textContent = n;
  if (prevScore[key] !== undefined && prevScore[key] !== n) {
    node.classList.remove('bump');
    void node.offsetWidth;
    node.classList.add('bump');
    setTimeout(() => node.classList.remove('bump'), 240);
  }
  prevScore[key] = n;
}

/** 「存活」这类静态标签也走用户自定义 */
function applyTextLabels() {
  const L = C.textMap.labels || {};
  for (const el of document.querySelectorAll('.team-block .label')) {
    el.textContent = L.alive || '存活';
  }
}

  globalThis.OphHud.register({
    id: 'scoreboard',
    apply() { applyTextLabels(); },
    render,
  });
})();
