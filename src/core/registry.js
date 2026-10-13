'use strict';

/**
 * OphRegistry · 通用注册表
 *
 * 「加功能 = 多注册一条」的底座。设置页、主题、特效、控件类型全都是同一套东西，
 * 没必要各写一份。
 *
 * 特性：
 *   · id 唯一 —— 重复注册直接报错（可传 { replace: true } 覆盖，方便热改）
 *   · 保序 —— 默认按注册顺序排列，渲染顺序 = 代码顺序，肉眼可查
 *   · 可排序 —— desc.order 存在时按 order 排（数值小的在前）
 *   · 可过滤 —— list({ group: 'basic' }) / list({ where: fn })
 *
 * 用法：
 *   const reg = OphRegistry.create({ name: 'themes' });
 *   reg.add({ id: 'newsprint', name: '报刊风' });
 *   reg.list();            // 全部
 *   reg.get('newsprint');
 */
;(function () {
  const TAG = '[core:registry]';

  function create(opts = {}) {
    const name = opts.name || 'registry';
    const tag = `[core:registry:${name}]`;
    /** @type {Map<string, object>} */
    const map = new Map();
    const listeners = new Set();

    const notify = (action, desc) => {
      for (const fn of [...listeners]) {
        try { fn(action, desc, reg); }
        catch (e) { console.error(`${tag} 监听者抛错：`, e && e.message); }
      }
    };

    const reg = {
      name,

      add(desc, o = {}) {
        if (!desc || !desc.id) throw new Error(`${tag} 注册项缺少 id`);
        if (map.has(desc.id) && !o.replace) {
          throw new Error(`${tag} id 重复："${desc.id}"（要覆盖请传 { replace: true }）`);
        }
        const rec = Object.freeze({ ...desc, id: String(desc.id) });
        if (o.prepend && !o.replace) {
          const rest = [...map.entries()];
          map.clear();
          map.set(rec.id, rec);
          for (const [k, v] of rest) map.set(k, v);
        } else {
          map.set(rec.id, rec);
        }
        notify('add', rec);
        return rec;
      },

      remove(id) {
        const rec = map.get(id);
        if (!rec) return false;
        map.delete(id);
        notify('remove', rec);
        return true;
      },

      has(id) { return map.has(id); },
      get(id) { return map.get(id) || null; },

      /**
       * 取列表。{ group } 按分组过滤；{ where } 自定义；{ sort: 'order' } 按 order 数值排。
       * 默认返回注册顺序，且返回的是新数组 —— 调用方随便改。
       */
      list(o = {}) {
        let arr = [...map.values()];
        if (o.group != null) arr = arr.filter((d) => (d.group || o.defaultGroup) === o.group);
        if (typeof o.where === 'function') arr = arr.filter(o.where);
        if (o.sort === 'order') {
          arr = arr.map((d, i) => [d, i])
            .sort((a, b) => (Number(a[0].order) || 0) - (Number(b[0].order) || 0) || a[1] - b[1])
            .map((x) => x[0]);
        }
        return arr;
      },

      /** 分组 → 成员列表（保序，空组自动省略），导航栏直接用这个 */
      groups(o = {}) {
        const out = [];
        const seen = new Map();
        for (const d of reg.list(o)) {
          const g = d.group || o.defaultGroup || '';
          if (!seen.has(g)) { seen.set(g, []); out.push([g, seen.get(g)]); }
          seen.get(g).push(d);
        }
        return out;
      },

      ids() { return [...map.keys()]; },
      size() { return map.size; },

      onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

      clear() {
        const old = [...map.values()];
        map.clear();
        for (const d of old) notify('remove', d);
      },
    };
    return reg;
  }

  globalThis.OphRegistry = Object.assign(globalThis.OphRegistry || {}, { create });
})();
