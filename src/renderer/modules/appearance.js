'use strict';

/**
 * appearance · 每块 HUD 的位移 / 缩放 / 配色 / 辉光 / 不透明度
 *
 * 由 src/renderer/hud.js（重构前巨石，1665 行）机械拆分而来，正文逐字保留。
 * 共享可变状态走 C（globalThis.OphHudCtx），纯函数走 K（globalThis.OphHudKit）。
 * 想加/删这块功能：改 src/renderer/hud-manifest.js 里的一行即可。
 */
;(function () {
  const C = globalThis.OphHudCtx;
  const K = globalThis.OphHudKit;

/**
 * 每块 HUD 的位移 / 缩放 / 配色 / 字体。
 *
 * 位移是相对默认锚点的屏幕像素（不受缩放影响）；
 * scaleX / scaleY 分开设，两个值不一样就是非等比拉伸。
 * 配色按模块下发：色块类走 CSS 变量，"#RRGGBB" 会转成 "r, g, b"
 * 三元组，好让底栏那条 rgba(var(--bar-color), alpha) 渐变继续能用。
 */
function applyModules(cfg) {
  const M = cfg.modules || {};
  const n = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const rst = document.documentElement.style;

  const keys = {
    scoreboard: '--m-scoreboard',
    money: '--m-money',
    vitals: '--m-vitals',
    ammo: '--m-ammo',
    weaponList: '--m-weaponList',
    roster: '--m-roster',
  };

  for (const [key, prefix] of Object.entries(keys)) {
    const m = M[key] || {};
    rst.setProperty(`${prefix}-x`, `${n(m.offsetX, 0)}px`);
    rst.setProperty(`${prefix}-y`, `${n(m.offsetY, 0)}px`);
    rst.setProperty(`${prefix}-sx`, String(n(m.scaleX, 1)));
    rst.setProperty(`${prefix}-sy`, String(n(m.scaleY, 1)));
    rst.setProperty(`${prefix}-rot`, `${n(m.rotate, 0)}deg`);
  }

  const sb = M.scoreboard || {};
  const scorebar = document.querySelector('.scoreboard');
  if (scorebar) {
    if (sb.ctColor) scorebar.style.setProperty('--ct-block', sb.ctColor);
    if (sb.tColor) scorebar.style.setProperty('--t-block', sb.tColor);
    if (sb.centerColor) scorebar.style.setProperty('--center-block', sb.centerColor);
  }

  const bars = { money: C.nodes.moneyModule, vitals: C.nodes.bottomBar, ammo: C.nodes.rightBar };
  for (const [key, el] of Object.entries(bars)) {
    const m = M[key] || {};
    if (!el) continue;
    const rgb = K.toRgbTriplet(m.barColor);
    if (rgb) el.style.setProperty('--bar-color', rgb);
    if (m.barAlpha != null) el.style.setProperty('--bar-alpha', String(n(m.barAlpha, 0.5)));
  }

  const wb = M.weaponList || {};
  if (C.nodes.weaponBar) {
    if (wb.textColor) C.nodes.weaponBar.style.setProperty('--wtext-color', wb.textColor);
    if (wb.dimColor) C.nodes.weaponBar.style.setProperty('--wtext-dim', wb.dimColor);
  }

  // ---- 武器栏 SVG 态：位置 + 颜色 + 辉光 ----
  const wls = wb.svg || {};
  const wlsN = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  rst.setProperty('--m-weaponListSvg-x', `${wlsN(wls.offsetX, 0)}px`);
  rst.setProperty('--m-weaponListSvg-y', `${wlsN(wls.offsetY, 0)}px`);
  rst.setProperty('--m-weaponListSvg-sx', String(wlsN(wls.scaleX, 1)));
  rst.setProperty('--m-weaponListSvg-sy', String(wlsN(wls.scaleY, 1)));
  rst.setProperty('--m-weaponListSvg-rot', `${wlsN(wls.rotate, 0)}deg`);
  rst.setProperty('--wl-svg-color', wls.color || '#3b82f6');
  rst.setProperty('--wl-svg-active', wls.activeColor || '#FFFFFF');
  rst.setProperty('--wl-svg-glow', `${wlsN(wls.glow, 0)}px`);
  rst.setProperty('--wl-svg-glow-color', wls.glowColor || '#3b82f6');
  rst.setProperty('--wl-svg-gap', `${wlsN(wls.gap, 12)}px`);
  rst.setProperty('--wl-svg-num-gap', `${wlsN(wls.numGap, 26)}px`);
  rst.setProperty('--wl-svg-active-scale', String(wlsN(wls.activeScale, 1.18)));
  rst.setProperty('--wl-svg-name-size', `${wlsN(wls.nameSize, 13)}px`);
  rst.setProperty('--wl-svg-name-color', wls.nameColor || '#FFFFFF');
  rst.setProperty('--wl-svg-name-dx', `${wlsN(wls.nameOffsetX, 0)}px`);
  rst.setProperty('--wl-svg-name-dy', `${wlsN(wls.nameOffsetY, 0)}px`);
  // 名称辉光开关：关了就把半径压成 0（阴影看不见）
  rst.setProperty('--wl-svg-name-glow', wls.nameGlow ? `${wlsN(wls.glow, 0)}px` : '0px');
  // 名称辉光颜色留空 = 跟随该槽位的辉光颜色（CSS 里做 var 回退，别写成默认色）
  if (wls.nameGlowColor) rst.setProperty('--wl-svg-name-glow-color', wls.nameGlowColor);
  else rst.removeProperty('--wl-svg-name-glow-color');

  // 名单面板：底栏浓度走 barAlpha，其余是各类文字的颜色
  const rp = M.roster || {};
  if (C.nodes.rosterPanel) {
    const st = C.nodes.rosterPanel.style;
    const rgb = K.toRgbTriplet(rp.barColor);
    if (rgb) st.setProperty('--roster-bar', rgb);
    if (rp.barAlpha != null) st.setProperty('--roster-bar-a', String(n(rp.barAlpha, 0.5)));
    if (rp.textColor) st.setProperty('--roster-text', rp.textColor);
    if (rp.dimColor) st.setProperty('--roster-dim', rp.dimColor);
    if (rp.aliveColor) st.setProperty('--roster-alive', rp.aliveColor);
    if (rp.deadColor) st.setProperty('--roster-dead', rp.deadColor);
    if (rp.selfColor) st.setProperty('--roster-self', rp.selfColor);
    if (rp.accentColor) st.setProperty('--roster-accent', rp.accentColor);
  }

  // 字体：预设 + 自定义覆盖都收在 OphAdv.fontStack 里（设置界面读同一份，所见即所得）
  if (C.OPH_ADV && typeof C.OPH_ADV.fontStack === 'function') {
    const stack = C.OPH_ADV.fontStack(cfg.font);
    if (stack) rst.setProperty('--font-hud', stack);
  } else if (cfg.font && cfg.font.family) {
    rst.setProperty('--font-hud', cfg.font.family);
  }
}


/**
 * 每块 HUD 和每个自定义文本元素的「不透明度 + 辉光」。
 * 必须在 applyBounds() 之后调用 —— 辉光半径是按当前 scale 算的。
 */
function applyEffects(cfg) {
  const u = C.scale;
  const M = cfg.modules || {};

  const opOf = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n < 1 ? String(Math.max(0, n)) : '';
  };

  for (const [key, getEl] of Object.entries(K.MODULE_ELS)) {
    const el = getEl();
    if (!el) continue;
    const m = M[key] || {};
    el.style.opacity = opOf(m.opacity);
    el.style.filter = K.glowFilter(m.glow, m.glowColor, u);
  }

  const list = Array.isArray(cfg.custom) ? cfg.custom : [];
  for (const item of C.customEls) {
    const m = list[item.srcIndex] || {};
    item.el.style.opacity = opOf(m.opacity);
    item.el.style.filter = K.glowFilter(m.glow, m.glowColor, u);
  }

  const shapes = Array.isArray(cfg.shapes) ? cfg.shapes : [];
  for (const item of C.shapeEls) {
    const m = shapes[item.srcIndex] || {};
    item.el.style.opacity = opOf(m.opacity);
    item.el.style.filter = K.glowFilter(m.glow, m.glowColor, u);
  }
}

  globalThis.OphHudAppearance = { applyModules, applyEffects };
})();
