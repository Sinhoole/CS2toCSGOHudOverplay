'use strict';

/**
 * hud-registry · HUD 模块注册表（OphHud）
 *
 * 每个 HUD 元素/功能是一个自注册模块：
 *
 *   globalThis.OphHud.register({
 *     id: 'scoreboard',          // 唯一 id
 *     render(s) {},              // 每帧（快照到达时）调用，可以省
 *     apply(cfg) {},             // 配置变化时调用，可以省（用来重建 DOM / 失效缓存）
 *     reset() {},                // 预览时间线归零时调用，可以省
 *   });
 *
 * 上不上架只由 src/renderer/hud-manifest.js 决定 —— 那个文件不在清单里就不会被加载，
 * 也就不会注册。所以「删一个 HUD 元素」= 清单里去掉一行。
 *
 * ⚠️ render 的调用顺序 = 注册顺序 = 清单顺序。各模块写的是不同的 DOM 节点，
 *    顺序不影响结果；真需要严格先后（几何 / 外观）的，由宿主按固定顺序直接调用，
 *    不走这个分发（见 hud.js 的 applyGeometry）。
 */
;(function () {
  const C = globalThis.OphHudCtx;
  const list = [];
  const seen = new Set();

  function register(mod) {
    if (!mod || !mod.id) return console.error('[hud:registry] 模块缺少 id', mod);
    if (seen.has(mod.id)) return console.error('[hud:registry] id 重复：' + mod.id);
    seen.add(mod.id);
    list.push(mod);
  }

  /** 每帧渲染：宿主在每个快照到达时调一次 */
  function render(s) {
    if (!s) return;
    C.lastSnap = s;
    if (C.root) C.root.classList.toggle('hidden', !s.visible);
    for (const m of list) {
      if (!m.render) continue;
      try { m.render(s); } catch (e) { console.error(`[hud:${m.id}] render 抛错`, e); }
    }
  }

  /** 配置变化：让每个模块有机会重建自己的 DOM / 失效缓存 */
  function apply(cfg) {
    for (const m of list) {
      if (!m.apply) continue;
      try { m.apply(cfg); } catch (e) { console.error(`[hud:${m.id}] apply 抛错`, e); }
    }
  }

  /** 预览时间线归零：清掉各模块的「上次值」基线 */
  function reset() {
    for (const m of list) {
      if (!m.reset) continue;
      try { m.reset(); } catch (e) { console.error(`[hud:${m.id}] reset 抛错`, e); }
    }
  }

  globalThis.OphHud = {
    register, render, apply, reset,
    ids() { return list.map((m) => m.id); },
  };
})();
