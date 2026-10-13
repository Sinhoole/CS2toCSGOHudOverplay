'use strict';

/**
 * OphStore · 路径式状态容器
 *
 * 只做一件事：用 'a.b.c' 这种路径读写一棵对象树，并在写的时候通知订阅者。
 * 它不认识配置结构，也不碰 DOM —— 所以主进程、渲染层、设置界面能共用同一套语义。
 *
 * source 可以给对象，也可以给函数。给函数（如 () => state.cfg）的好处是：
 * 上层把整棵配置换成另一个对象（重新读取/导入/恢复默认）之后，store 不用重建。
 *
 *   const s = OphStore.create({ source: () => state.cfg, onChange: () => markDirty() });
 *   s.get('show.money');           // 读
 *   s.set('show.money', false);    // 写 + 通知
 *   s.batch(() => { ... });        // 一批改动只通知一次（导入整份配置时用）
 */
;(function () {
  const TAG = '[core:store]';

  function create(cfg = {}) {
    const Path = globalThis.OphPath || {};
    const source = cfg.source != null ? cfg.source : {};
    const subs = new Set();          // { paths: string[]|null, fn }
    let depth = 0;                   // batch 嵌套层数
    let pending = null;              // 批处理期间累积的改动路径
    let writes = 0;

    const root = () => (typeof source === 'function' ? source() : source);

    const notify = (patch) => {
      if (depth > 0) {
        if (pending == null) pending = [];
        for (const p of patch) if (!pending.includes(p)) pending.push(p);
        return;
      }
      writes += 1;
      for (const s of [...subs]) {
        if (s.paths && !patch.some((p) => s.paths.some((sp) => p === sp || p.startsWith(sp + '.') || sp.startsWith(p + '.')))) continue;
        try { s.fn(root(), patch); }
        catch (e) { console.error(`${TAG} 订阅者抛错：`, e && e.message); }
      }
      if (cfg.onChange) {
        try { cfg.onChange(patch, root()); }
        catch (e) { console.error(`${TAG} onChange 抛错：`, e && e.message); }
      }
    };

    const store = {
      get(path, def) {
        if (path == null) return root();
        const v = Path.getPath ? Path.getPath(root(), path) : undefined;
        return v === undefined ? def : v;
      },

      set(path, val) {
        Path.setPath(root(), path, val);
        notify([path]);
        return val;
      },

      /** 一次改多个路径：改完只通知一次，避免 n 个控件各推一次预览 */
      setMany(pairs) {
        const patch = [];
        for (const [p, v] of Object.entries(pairs || {})) { Path.setPath(root(), p, v); patch.push(p); }
        notify(patch);
        return pairs;
      },

      has(path) {
        return Path.getPath ? Path.getPath(root(), path) !== undefined : false;
      },

      remove(path) {
        const ks = String(path).split('.');
        let o = root();
        for (let i = 0; i < ks.length - 1 && o; i++) o = o[ks[i]];
        if (!o) return false;
        const ok = delete o[ks[ks.length - 1]];
        if (ok) notify([path]);
        return ok;
      },

      /** 整棵换掉（读取/导入/恢复默认）：算一次大通知 */
      replace(obj) {
        if (typeof source === 'function') {
          const cur = root();
          if (cur && typeof cur === 'object' && obj && typeof obj === 'object') {
            // 就地换血：让所有持有旧引用的模块（state.cfg）自动看到新值
            for (const k of Object.keys(cur)) delete cur[k];
            Object.assign(cur, obj);
            notify(['']);
            return cur;
          }
        }
        console.warn(TAG + ' source 不是函数，replace() 无法就地换血，请直接换 source');
        return obj;
      },

      /** 深拷贝快照：导出配置 / 推给预览窗口，避免对方改到工作副本 */
      snapshot() {
        const r = root();
        if (r == null) return r;
        try { return JSON.parse(JSON.stringify(r)); } catch (e) { return r; }
      },

      /** 外部直接改了对象（如控件写 state.cfg）后，手工打一次通知 */
      touch(paths) { notify(Array.isArray(paths) ? paths : ['']); },

      batch(fn) {
        depth += 1;
        try { return fn(); }
        finally {
          depth -= 1;
          if (depth === 0 && pending && pending.length) { const p = pending; pending = null; notify(p); }
        }
      },

      /**
       * 订阅。paths 给数组则只关心这些前缀下的改动；
       * 不给则任何改动都通知。返回退订函数。
       */
      subscribe(paths, fn) {
        if (typeof paths === 'function') { fn = paths; paths = null; }
        const rec = { paths: Array.isArray(paths) ? paths : null, fn };
        subs.add(rec);
        return () => subs.delete(rec);
      },

      subscriberCount() { return subs.size; },
      writeCount() { return writes; },
    };
    return store;
  }

  globalThis.OphStore = Object.assign(globalThis.OphStore || {}, { create });
})();
