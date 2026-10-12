'use strict';

// 设计分辨率 → 真实屏幕的映射。
// 独立成模块是因为渲染层（浏览器，nodeIntegration 关闭，只能读全局）
// 和自检（Node，用 require）都要用同一份算法，避免两边算出不同结果。
//
// ⚠️ 必须用 IIFE 包起来！这是经典脚本（<script> 加载），顶层的
//    `function computeFit` 会直接在全局对象上建同名属性；而 hud.js 顶层
//    也声明了同名标识符，两者相撞会让 **hud.js 整个脚本报
//    「Identifier 'x' has already been declared」而一行都不执行**，
//    表现就是 HUD 完全黑掉。包进闭包后只对外暴露 globalThis.OphFit。
(function (root, factory) {
  const API = factory();
  // 浏览器：挂全局给 <script> 之后的脚本读
  if (root) root.OphFit = API;
  // Node（自检）：走 CommonJS
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // fill = 非等比拉伸（4:3 怀旧感）；stretch = 等比填满；contain = 等比完整
  const FIT_MODES = { fill: 1, stretch: 1, contain: 1 };

  /**
   * @param {object} cfg   配置：designWidth / designHeight / fit / scale / safezone
   * @param {{width:number,height:number}} bounds 真实屏幕尺寸
   * @returns {{scale:number, stretchX:number, stretchY:number,
   *            virtW:number, virtH:number, insetX:number, insetY:number}}
   *
   * 语义约定（很重要，两套模式的单位不同）：
   *   - contain / stretch：直接映射。scale = 屏幕像素/设计像素，元素尺寸与位置都在屏幕坐标系里算。
   *   - fill：虚拟画布。HUD 内部严格按 designW×designH 排版（所有长度单位 = 设计像素），
   *           再由 .hud 的 transform: scale(stretchX, stretchY) 整体拉满全屏。
   *           所以此时 scale（--scale）只含「用户缩放」，不含屏幕倍率，屏幕倍率交给 transform。
   */

  function computeFit(cfg, bounds) {
    const dw = Number(cfg.designWidth) || 1920;
    const dh = Number(cfg.designHeight) || 1080;
    const user = Number(cfg.scale) || 1;
    const fit = FIT_MODES[cfg.fit] ? cfg.fit : 'contain';

    // Y 方向倍率：contain 取小（完整可见），stretch 取大（铺满）
    const rx = bounds.width / dw;
    const ry = bounds.height / dh;
    let ky = ry;
    if (fit === 'contain') ky = Math.min(rx, ry);
    else if (fit === 'stretch') ky = Math.max(rx, ry);

    // fill 的纵向要严格贴合屏幕高度，否则画布缩一点就铺不满。
    // 用户缩放只作用在元素尺寸（--scale）上，不参与画布几何。
    const scale = (fit === 'fill' ? ky : ky * user);
    const szX = (1 - (cfg.safezone?.x ?? 1)) * (bounds.width / 2);
    const szY = (1 - (cfg.safezone?.y ?? 1)) * (bounds.height / 2);

    // fill：非等比拉伸铺满 = 经典的 4:3 怀旧观感。
    // 画布恒等于 designW×designH（绝不能被 scale 污染，否则铺不满屏），
    // 屏幕倍率完全交给 transform 的 scale(stretchX, stretchY)，一次拉满。
    if (fit === 'fill') {
      return {
        scale: user,                    // 元素尺寸倍率（设计像素单位）
        stretchX: bounds.width / dw,    // 整体横向拉伸
        stretchY: bounds.height / dh,   // 整体纵向拉伸
        virtW: dw,                      // 虚拟画布 = 设计分辨率
        virtH: dh,
        insetX: 26 * user + (1 - (cfg.safezone?.x ?? 1)) * (dw / 2),
        insetY: 22 * user + (1 - (cfg.safezone?.y ?? 1)) * (dh / 2),
      };
    }

    return {
      scale,
      stretchX: 1,
      stretchY: 1,
      virtW: bounds.width,
      virtH: bounds.height,
      insetX: 26 * scale + szX,
      insetY: 22 * scale + szY,
    };
  }

  return { FIT_MODES, computeFit };
});
