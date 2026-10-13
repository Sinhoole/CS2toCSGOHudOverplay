'use strict';

/**
 * OphEffects · 特效 / 触感总线
 *
 * 现在只做「缝」：谁想放效果就 play()，谁想实现效果就 register()。
 * 后期加手柄震动时，只需要注册一个 haptic 处理器（Gamepad API 原生振动），
 * 播放侧（击杀、掉血、切页）一行都不用改 —— 这就是本次重构给它预留的位置。
 *
 *   // 播放侧（任意模块）
 *   OphEffects.play('haptic', { kind: 'kill', strength: 0.8 });
 *   OphEffects.haptic(0.6, 90);
 *
 *   // 实现侧（后期补上）
 *   OphEffects.register('haptic', ({ strength, ms }) => gamepad.vibrationActuator.playEffect(...));
 *
 * 约定 kind：kill / death / hurt / lowhealth / ui / switch
 * 没有注册处理器时不会报错，只走总线广播（方便先接日志、后接实现）。
 */
;(function () {
  const TAG = '[core:effects]';

  function create(cfg = {}) {
    const bus = cfg.bus || globalThis.OphBus?.app || null;
    /** @type {Map<string, Set<Function>>} */
    const handlers = new Map();
    const stats = new Map();     // name -> 播放次数（诊断用）

    const api = {
      register(name, fn) {
        if (typeof fn !== 'function') throw new Error(`${TAG} register("${name}") 需要函数`);
        if (!handlers.has(name)) handlers.set(String(name), new Set());
        handlers.get(String(name)).add(fn);
        return () => api.unregister(name, fn);
      },

      unregister(name, fn) {
        const set = handlers.get(String(name));
        return set ? set.delete(fn) : false;
      },

      has(name) { return (handlers.get(String(name))?.size || 0) > 0; },
      names() { return [...handlers.keys()]; },
      playCount(name) { return name == null ? [...stats.values()].reduce((a, b) => a + b, 0) : (stats.get(name) || 0); },
      resetStats() { stats.clear(); },

      /** 播放一个效果：先给订阅者，再走总线。返回「有几个实现接住了」 */
      play(name, params = {}) {
        const key = String(name);
        stats.set(key, (stats.get(key) || 0) + 1);
        const set = handlers.get(key);
        let n = 0;
        for (const fn of [...(set || [])]) {
          try { fn(params); n += 1; }
          catch (e) { console.error(`${TAG} "${key}" 处理器抛错：`, e && e.message); }
        }
        if (bus) bus.emit('fx:' + key, params);
        if (cfg.debug && !n) console.debug(`${TAG} "${key}" 暂无实现（已广播）`, params);
        return n;
      },

      /**
       * 触感快捷入口：强度 0~1 + 时长 ms。
       * kind 便于实现侧按场景给不同波形（现在只透传）。
       */
      haptic(strength = 0.5, ms = 80, kind = 'ui') {
        const s = Math.max(0, Math.min(1, Number(strength) || 0));
        return api.play('haptic', { strength: s, ms: Math.max(0, Number(ms) || 0), kind });
      },
    };

    // 默认实现：什么都不做，但把「有人请求过震动」记录下来，方便后期对比。
    // 真正的手柄震动（Gamepad API 原生 rumble）实现后，把这里换成你的 handler 即可。
    api.register('haptic', (p) => {
      if (cfg.debug) console.debug(`${TAG} haptic(未实现) kind=${p.kind} strength=${p.strength} ms=${p.ms}`);
    });

    return api;
  }

  globalThis.OphEffects = Object.assign(globalThis.OphEffects || {}, {
    create,
    app: create({ bus: globalThis.OphBus?.app || null }),
  });
})();
