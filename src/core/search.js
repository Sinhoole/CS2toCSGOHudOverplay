'use strict';

/**
 * OphSearch · 检索索引
 *
 * 「检索元素」的底座：任何模块（设置页、HUD 元素、图标、按键、命令）把自己的
 * 可检索项喂进来，这里统一打分排序。它不认识业务，只认条目。
 *
 * 条目形状：
 *   { id, label, keywords: ['血', 'health'], group, target }
 *   target 由调用方自定义（比如 { section:'vitals', path:'show.health' }），
 *   点结果时怎么跳由调用方决定 —— 索引层不猜。
 *
 * 打分（越大越靠前）
 *   label 全等 100 ／ label 前缀 60 ／ label 包含 40
 *   关键词全等 50 ／ 关键词包含 25 ／ id 包含 20 ／ group 命中 8
 * 多词查询按「每个词都要命中」过滤（AND），总分相加。
 */
;(function () {
  const TAG = '[core:search]';

  function create(opts = {}) {
    /** @type {Map<string, object>} */
    const items = new Map();

    const norm = (s) => String(s == null ? '' : s).trim().toLowerCase();

    function scoreOne(entry, q) {
      const label = norm(entry.label);
      const id = norm(entry.id);
      const group = norm(entry.group);
      const kws = (entry.keywords || []).map(norm);
      let s = 0;
      if (label === q) s += 100;
      else if (label.startsWith(q)) s += 60;
      else if (label.includes(q)) s += 40;
      if (kws.includes(q)) s += 50;
      else if (kws.some((k) => k.includes(q))) s += 25;
      if (id.includes(q)) s += 20;
      if (group && group.includes(q)) s += 8;
      return s;
    }

    const api = {
      /** 加一条（同 id 覆盖，方便重建索引） */
      add(entry) {
        if (!entry || !entry.id) throw new Error(`${TAG} add() 缺少 id`);
        const rec = Object.freeze({
          keywords: [],
          group: '',
          target: null,
          ...entry,
          id: String(entry.id),
          label: entry.label || String(entry.id),
        });
        items.set(rec.id, rec);
        return rec;
      },

      /** 一次性灌入（顺带清空旧的，重建索引时用） */
      index(list, o = {}) {
        if (o.reset !== false) items.clear();
        for (const e of list || []) api.add(e);
        return api.size();
      },

      remove(id) { return items.delete(id); },
      get(id) { return items.get(id) || null; },
      size() { return items.size; },
      all() { return [...items.values()]; },

      /**
       * 查询。空串返回 []（调用方通常想显示「最近使用」而不是全部）。
       * @param {string} str
       * @param {{limit?:number, group?:string}} o
       */
      query(str, o = {}) {
        const q = norm(str);
        if (!q) return [];
        const parts = q.split(/\s+/).filter(Boolean);
        const limit = o.limit || 20;
        const out = [];
        for (const e of items.values()) {
          if (o.group && e.group !== o.group) continue;
          let total = 0;
          let ok = true;
          for (const p of parts) {
            const s = scoreOne(e, p);
            if (!s) { ok = false; break; }
            total += s;
          }
          if (ok) out.push({ entry: e, score: total });
        }
        out.sort((a, b) => b.score - a.score || String(a.entry.id).localeCompare(String(b.entry.id)));
        return out.slice(0, limit);
      },
    };
    return api;
  }

  globalThis.OphSearch = Object.assign(globalThis.OphSearch || {}, { create });
})();
