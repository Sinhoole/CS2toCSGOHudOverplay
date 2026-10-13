'use strict';

/**
 * OphBus · 事件总线
 *
 * 模块之间唯一允许的横向联系。任何「A 想知道 B 发生了什么」都应该走这里，
 * 而不是 A 去 require/读全局变量 —— 那样才能做到删掉一个模块不影响另一个。
 *
 * 用法：
 *   OphBus.app.on('config:changed', (cfg, patch) => {...});
 *   OphBus.app.emit('config:changed', cfg, { 'show.money': false });
 *
 * 约定的事件名（新增请沿用这个命名风格：域:动作）
 *   config:changed    配置被改动（未落盘）
 *   config:saved      配置已落盘
 *   section:change    设置界面切页
 *   theme:change      主题切换
 *   haptic            触感/震动请求（手柄震动、界面反馈都走这里）
 *   fx:play           视觉特效请求
 *   hud:snapshot      HUD 收到一份新快照（渲染层）
 */
;(function () {
  const TAG = '[core:bus]';

  function create(name) {
    /** @type {Map<string, Set<Function>>} */
    const map = new Map();
    let handled = 0;

    const off = (evt, fn) => {
      const set = map.get(evt);
      if (!set) return false;
      const ok = set.delete(fn);
      if (!set.size) map.delete(evt);
      return ok;
    };

    const bus = {
      name: name || 'bus',

      /** 订阅；返回「退订」函数，方便模块在 dispose 里一句 onConfig = on(...) 后直接调用 */
      on(evt, fn) {
        if (typeof fn !== 'function') throw new TypeError(TAG + ' on() 需要函数');
        if (!map.has(evt)) map.set(evt, new Set());
        map.get(evt).add(fn);
        return () => off(evt, fn);
      },

      once(evt, fn) {
        const wrap = (...args) => { off(evt, wrap); fn(...args); };
        return bus.on(evt, wrap);
      },

      off,

      /**
       * 广播。单个订阅者抛错不会影响其他人 —— 一个坏模块不该拖垮整条链。
       * 出错时按 `[core:bus]` 前缀打到控制台（渲染层的诊断转发会自动捞走）。
       */
      emit(evt, ...args) {
        const set = map.get(evt);
        if (!set || !set.size) return 0;
        handled += 1;
        let n = 0;
        for (const fn of [...set]) {
          try { fn(...args); n += 1; }
          catch (e) { console.error(`${TAG} "${evt}" 订阅者抛错：`, e && e.message); }
        }
        return n;
      },

      /** 只订阅一次但希望在下一帧任意事件后触发时用（内部把 fn 包起来） */
      count(evt) { return map.has(evt) ? map.get(evt).size : 0; },
      events() { return [...map.keys()]; },
      totalEmits() { return handled; },

      clear(evt) {
        if (evt) map.delete(evt);
        else map.clear();
      },
    };
    return bus;
  }

  globalThis.OphBus = Object.assign(globalThis.OphBus || {}, {
    create,
    /** 全局应用总线：设置界面、HUD、主进程各自的桥都用它 */
    app: create('app'),
  });
})();
