'use strict';

/**
 * ammo · 弹药与连杀骷髅徽章
 *
 * 由 src/renderer/hud.js（重构前巨石，1665 行）机械拆分而来，正文逐字保留。
 * 共享可变状态走 C（globalThis.OphHudCtx），纯函数走 K（globalThis.OphHudKit）。
 * 想加/删这块功能：改 src/renderer/hud-manifest.js 里的一行即可。
 */
;(function () {
  const C = globalThis.OphHudCtx;
  const K = globalThis.OphHudKit;

  let prevKills = 0;
  let badgeEls = [];
  /** 每帧渲染：快照到达时由宿主分发调用 */
  function render(s) {
  // ---- 弹药 ----
  const w = s.weapon;
  if (!w || w.clip == null) {
    C.nodes.clipWrap.classList.add('off');
  } else {
    C.nodes.clipWrap.classList.remove('off');
    C.nodes.clip.textContent = w.clip;
    C.nodes.reserve.textContent = w.reserve == null ? '' : w.reserve;
    C.nodes.clip.classList.toggle('is-empty', w.clip === 0);   // 空弹匣转红
  }

  // ---- 连杀骷髅：每击杀 1 人加 1 枚，最多 5 枚，死亡清空 ----
  renderKills(s);
  }

/**
 * 连杀骷髅徽章。
 * 数据源是 player.state.round_kills（本回合击杀数），但 GSI 在玩家死亡后不会清零，
 * 而规范要求「死亡立即清空」，所以死亡时按 0 显示。
 * 上限 5 枚；新增的那一枚播 0.2 秒淡入回弹，已存在的保持静止。
 */
function renderKills(s) {
  const n = s.health > 0 ? Math.min(5, Math.max(0, s.roundKills | 0)) : 0;

  badgeEls.forEach((el, i) => {
    const on = i < n;
    el.classList.toggle('on', on);
    if (on && i === n - 1 && n > prevKills) {
      el.classList.remove('fresh');
      void el.offsetWidth;
      el.classList.add('fresh');
    }
  });

  C.nodes.killsBlock.classList.toggle('off', C.showFlags.roundKills === false || n === 0);
  prevKills = n;
}

  badgeEls = Array.from(document.querySelectorAll('#killsBlock .badge'));

  globalThis.OphHud.register({
    id: 'ammo',
    render,
    reset() { prevKills = 0; },
  });
})();
