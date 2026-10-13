'use strict';

/**
 * OphAdvBridge · 通用库
 *
 * 由 src/settings/settings.js（重构前巨石）机械拆分而来，代码原样保留。
 * 依赖通过头部解构显式声明 —— 不依赖加载顺序之外的东西，也不往全局挂散名。
 */
;(function () {

function advMod() { return globalThis.OphAdv || {}; }

  globalThis.OphAdvBridge = Object.assign(globalThis.OphAdvBridge || {}, {
    advMod
  });
})();
