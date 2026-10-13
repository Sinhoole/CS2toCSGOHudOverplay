'use strict';

/**
 * OphKernel · 功能内核
 *
 * 每个「功能」声明成一条描述：什么时候初始化、什么时候挂载、被删掉时怎么收尾。
 * 内核负责按依赖排好顺序、统一兜错、统一销毁 —— 这样删功能只要删掉 define() 那一句，
 * 不用担心留下定时器、监听器、DOM 残骸。
 *
 * 描述字段：
 *   id        唯一名
 *   deps      ['其它功能 id'] —— 排在前面的依赖
 *   order     同层内的顺序（可省，默认按注册顺序）
 *   init(ctx)  只跑一次：读配置、建索引、注册事件
 *   mount(ctx) 每次「开始工作」时跑：建 DOM、开始计时器（可省）
 *   unmount()  与 mount 成对，收回 DOM/定时器（可省）
 *   dispose()  只跑一次：退订、释放（可省）
 *
 * ctx 由调用方给（设置界面传 { bus, store, root }），内核只透传，不认识任何具体业务。
 *
 *   const k = OphKernel.create({ bus });
 *   k.define({ id: 'search', init: (ctx) => {...} });
 *   k.start({ store });      // 依赖顺序 init
 *   k.stop();                // 逆序 dispose
 */
;(function () {
  const TAG = '[core:kernel]';

  function create(cfg = {}) {
    const bus = cfg.bus || globalThis.OphBus?.app || null;
    /** @type {Map<string, object>} */
    const defs = new Map();
    const state = new Map();       // id -> 'defined' | 'inited' | 'mounted' | 'failed'
    let order = [];
    let started = false;
    let ctx = null;

    const log = (msg, extra) => {
      if (extra) console.log(`${TAG} ${msg}`, extra);
      else console.log(`${TAG} ${msg}`);
    };

    /** 拓扑排序：deps 里的先上；缺依赖 / 成环直接抛，早失败胜过半死不活 */
    function resolve() {
      const out = [];
      const mark = new Map();      // id -> 1 处理中 / 2 完成
      const visit = (id, stack) => {
        const m = mark.get(id);
        if (m === 2) return;
        if (m === 1) throw new Error(`${TAG} 依赖成环：${stack.concat(id).join(' → ')}`);
        const d = defs.get(id);
        if (!d) throw new Error(`${TAG} 缺少依赖 "${id}"（被 ${stack[stack.length - 1] || '?'} 需要）`);
        mark.set(id, 1);
        for (const dep of d.deps || []) visit(dep, stack.concat(id));
        mark.set(id, 2);
        out.push(d);
      };
      // 先按 order 排一遍，让「同层顺序」稳定可预期
      const sorted = [...defs.values()]
        .map((d, i) => [d, i])
        .sort((a, b) => (Number(a[0].order) || 0) - (Number(b[0].order) || 0) || a[1] - b[1])
        .map((x) => x[0]);
      for (const d of sorted) visit(d.id, []);
      return out;
    }

    const call = (d, phase) => {
      const fn = d[phase];
      if (typeof fn !== 'function') return null;
      try {
        const r = fn(ctx);
        // 允许 async：错误在 Promise 里也要被抓住，否则渲染层就是静默黑屏
        if (r && typeof r.then === 'function') {
          return r.catch((e) => {
            state.set(d.id, 'failed');
            console.error(`${TAG} ${d.id}.${phase}() 异步失败：`, e && e.stack || e);
            if (bus) bus.emit('kernel:error', { id: d.id, phase, error: e });
          });
        }
      } catch (e) {
        state.set(d.id, 'failed');
        console.error(`${TAG} ${d.id}.${phase}() 抛错：`, e && e.stack || e);
        if (bus) bus.emit('kernel:error', { id: d.id, phase, error: e });
      }
      return null;
    };

    const kernel = {
      /** 声明一个功能。同名重复定义直接报错 —— 静默覆盖最难查 */
      define(desc) {
        if (!desc || !desc.id) throw new Error(`${TAG} define() 缺少 id`);
        if (defs.has(desc.id)) throw new Error(`${TAG} 功能 id 重复："${desc.id}"`);
        const rec = { deps: [], order: 0, ...desc, id: String(desc.id) };
        defs.set(rec.id, rec);
        state.set(rec.id, 'defined');
        if (started) throw new Error(`${TAG} 已经 start() 了，不能再 define("${rec.id}")`);
        return kernel;
      },

      has(id) { return defs.has(id); },
      get(id) { return defs.get(id) || null; },
      ids() { return [...defs.keys()]; },
      status(id) { return state.get(id) || null; },

      /** 依赖顺序（不启动）。排查顺序问题用 */
      resolve,

      start(c) {
        if (started) throw new Error(TAG + ' 只能 start() 一次');
        ctx = c || {};
        order = resolve();
        started = true;
        log(`启动 ${order.length} 个功能：` + order.map((d) => d.id).join(' → '));
        for (const d of order) {
          call(d, 'init');
          if (state.get(d.id) !== 'failed') state.set(d.id, 'inited');
        }
        for (const d of order) {
          if (state.get(d.id) === 'failed') continue;
          call(d, 'mount');
          if (state.get(d.id) !== 'failed') state.set(d.id, 'mounted');
        }
        if (bus) bus.emit('kernel:started', { ids: order.map((d) => d.id) });
        return kernel;
      },

      /** 逆序收尾：先卸挂载，再释放 */
      stop() {
        for (const d of [...order].reverse()) {
          if (state.get(d.id) === 'failed' && !d.unmount) continue;
          call(d, 'unmount');
        }
        for (const d of [...order].reverse()) call(d, 'dispose');
        order = [];
        started = false;
        if (bus) bus.emit('kernel:stopped');
        return kernel;
      },

      /** 单独重挂一个功能（改配置后想重建它的 DOM 时用） */
      remount(id) {
        const d = defs.get(id);
        if (!d) return false;
        call(d, 'unmount');
        call(d, 'mount');
        return true;
      },

      get ctx() { return ctx; },
      get started() { return started; },
    };
    return kernel;
  }

  globalThis.OphKernel = Object.assign(globalThis.OphKernel || {}, { create });
})();
