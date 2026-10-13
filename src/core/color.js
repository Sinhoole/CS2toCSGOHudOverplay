'use strict';

/**
 * OphColor · 通用库
 *
 * 由 src/settings/settings.js（重构前巨石）机械拆分而来，代码原样保留。
 * 依赖通过头部解构显式声明 —— 不依赖加载顺序之外的东西，也不往全局挂散名。
 */
;(function () {

function hexToRgb(hex) {
  const m = String(hex || '').trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const v = parseInt(h, 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}
/** 支持 "#RRGGBB" 与 "rgba(r, g, b, a)" 两种写法 */
function parseColor(v) {
  const s = String(v || '').trim();
  const rgba = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (rgba) {
    return {
      r: Math.round(Number(rgba[1])), g: Math.round(Number(rgba[2])), b: Math.round(Number(rgba[3])),
      a: rgba[4] == null ? 1 : Number(rgba[4]),
    };
  }
  const rgb = hexToRgb(s);
  return rgb ? { ...rgb, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
}
function toHex({ r, g, b }) {
  return '#' + [r, g, b].map((n) => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function toCss({ r, g, b, a }) {
  return a >= 0.999 ? toHex({ r, g, b }) : `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(2))})`;
}

  globalThis.OphColor = Object.assign(globalThis.OphColor || {}, {
    hexToRgb, parseColor, toHex, toCss
  });
})();
