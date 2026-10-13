'use strict';

/**
 * viewport · 画布映射（设计分辨率 → 真实屏幕）
 *
 * 由 src/renderer/hud.js（重构前巨石，1665 行）机械拆分而来，正文逐字保留。
 * 共享可变状态走 C（globalThis.OphHudCtx），纯函数走 K（globalThis.OphHudKit）。
 * 想加/删这块功能：改 src/renderer/hud-manifest.js 里的一行即可。
 */
;(function () {
  const C = globalThis.OphHudCtx;
  const K = globalThis.OphHudKit;

function previewAwareBounds(bounds) {
  if (!C.PREVIEW) return bounds;
  return {
    width: window.innerWidth,
    height: Math.max(1, window.innerHeight - C.PREVIEW_BAR),
  };
}

/**
 * 纯计算在 src/fit.js（与自检共用），这里只负责把结果写进 CSS 变量和 DOM。
 */
function applyBounds(cfg, bounds) {
  const f = K.ophComputeFit(cfg, bounds);
  C.scale = f.scale;

  const fill = cfg.fit === 'fill';

  // 位移量单位跟着模式走：
  //   fill            —— 虚拟画布内一切长度都是「设计像素」，位移只乘用户缩放；
  //   contain/stretch —— 屏幕坐标系，位移乘 scale（屏幕像素 / 设计像素）。
  const unit = fill ? (Number(cfg.scale) || 1) : C.scale;

  const s = document.documentElement.style;
  s.setProperty('--scale', String(C.scale));
  s.setProperty('--offx', `${(cfg.layout?.offsetX || 0) * unit}px`);
  s.setProperty('--offy', `${(cfg.layout?.offsetY || 0) * unit}px`);
  s.setProperty('--inset-x', `${f.insetX}px`);
  s.setProperty('--inset-y', `${f.insetY}px`);

  // 预览模式：顶部留给工具条，画布整体往下让一行
  const topPx = C.PREVIEW ? `${C.PREVIEW_BAR}px` : null;

  if (fill) {
    // 虚拟画布按设计分辨率排版，再整体二维拉伸铺满真实屏幕。
    C.root.style.transformOrigin = 'left top';
    C.root.style.transform = `scale(${f.stretchX}, ${f.stretchY})`;
    C.root.style.left = '0px';
    C.root.style.top = topPx || '0px';
    C.root.style.right = 'auto';
    C.root.style.bottom = 'auto';
    C.root.style.width = `${f.virtW}px`;
    C.root.style.height = `${f.virtH}px`;
  } else {
    C.root.style.transform = '';
    C.root.style.left = '';
    C.root.style.top = topPx || '';      // 非预览时清回 ''，沿用 CSS 的 inset:0
    C.root.style.right = '';
    C.root.style.bottom = '';
    C.root.style.width = '';
    C.root.style.height = '';
  }
}

function applyShowFlags() {
  for (const node of document.querySelectorAll('[data-show]')) {
    const key = node.getAttribute('data-show');
    node.classList.toggle('off', C.showFlags[key] === false);
  }
}

  // 几何计算要在配置变化时按固定顺序被宿主调用，所以不注册成逐帧模块
  globalThis.OphHudViewport = { previewAwareBounds, applyBounds, applyShowFlags };
})();
