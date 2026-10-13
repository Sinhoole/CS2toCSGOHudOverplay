'use strict';

/**
 * vitals · 血量 / 护甲 / 拆弹器（含低血预警辉光）
 *
 * 由 src/renderer/hud.js（重构前巨石，1665 行）机械拆分而来，正文逐字保留。
 * 共享可变状态走 C（globalThis.OphHudCtx），纯函数走 K（globalThis.OphHudKit）。
 * 想加/删这块功能：改 src/renderer/hud-manifest.js 里的一行即可。
 */
;(function () {
  const C = globalThis.OphHudCtx;
  const K = globalThis.OphHudKit;

  /** 每帧渲染：快照到达时由宿主分发调用 */
  function render(s) {
  // ---- 血量：白 → 红 → 红+发光，三级按阈值切换 ----
  C.nodes.hp.textContent = s.health;
  C.nodes.hpFill.style.width = `${K.pct(s.health)}%`;

  const critical = s.health <= C.lowHealthThreshold;
  C.nodes.healthBlock.classList.toggle('is-hurt', s.health <= C.healthRedThreshold);
  C.nodes.healthBlock.classList.toggle('is-critical', critical);
  C.nodes.bottomBar.classList.toggle('is-critical', critical);

  // 血量越低发光越强：25 血 → 0，0 血 → 1
  const glow = critical
    ? Math.min(1, (C.lowHealthThreshold - s.health) / Math.max(1, C.lowHealthThreshold))
    : 0;
  document.documentElement.style.setProperty('--glow', glow.toFixed(3));
  applyHealthGlow(critical, glow);

  // ---- 护甲 / 护甲槽：0 甲时保留整块，只把盾牌变灰、槽放空 ----
  C.nodes.ar.textContent = s.armor;
  C.nodes.arFill.style.width = `${K.pct(s.armor)}%`;
  C.nodes.armorBlock.classList.toggle('off', C.showFlags.armor === false);
  C.nodes.armorBlock.classList.toggle('is-empty', s.armor <= 0);
  C.nodes.armorIcon.classList.toggle('has-helmet', !!s.helmet && s.armor > 0);

  C.nodes.kitBlock.classList.toggle('off', C.showFlags.defuseKit === false || !s.defusekit);
  }

/**
 * 低血量辉光。
 *
 * 为什么不写在 CSS 里：Chromium 会把 calc() 出现在 text-shadow / drop-shadow 中的
 * 整条声明判为无效（同样的 calc 放进 box-shadow 就正常），导致辉光整个不渲染。
 * 这里直接算出最终像素值再注入，绕开解析器这个坑。
 *
 * @param {boolean} critical 是否处于低血量预警
 * @param {number}  glow     0~1，血量越低越大
 */
function applyHealthGlow(critical, glow) {
  if (!critical) {
    C.nodes.hp.style.textShadow = '';
    if (C.nodes.hpIcon) C.nodes.hpIcon.style.filter = '';
    return;
  }

  const u = C.scale;                 // 缩放后的像素单位
  const px = (n) => `${(n * u).toFixed(1)}px`;
  const a = (base, span) => (base + span * glow).toFixed(2);
  const rgb = '255, 46, 36';

  C.nodes.hp.style.textShadow = [
    '0 1px 2px rgba(0, 0, 0, 0.75)',
    `0 0 ${px(3)} rgba(255, 84, 66, ${a(0.85, 0.15)})`,
    `0 0 ${px(10)} rgba(255, 58, 45, ${a(0.70, 0.30)})`,
    `0 0 ${px(22)} rgba(${rgb}, ${a(0.50, 0.45)})`,
    `0 0 ${px(40)} rgba(255, 38, 28, ${a(0.30, 0.50)})`,
  ].join(', ');

  if (C.nodes.hpIcon) {
    C.nodes.hpIcon.style.filter = [
      `drop-shadow(0 0 ${px(4)} rgba(255, 62, 48, ${a(0.80, 0.20)}))`,
      `drop-shadow(0 0 ${px(13)} rgba(${rgb}, ${a(0.55, 0.45)}))`,
    ].join(' ');
  }
}

  globalThis.OphHud.register({ id: 'vitals', render });
})();
