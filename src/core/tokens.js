'use strict';

/**
 * OphTokens · 设计令牌（CSS 变量）读写
 *
 * 主题切换要能真的生效，前提是外观参数只有一处来源 —— 也就是 CSS 变量。
 * 这里提供读、写、快照、解析四件事，不绑定任何具体主题。
 *
 *   OphTokens.read('--paper');                    // 计算后的值
 *   OphTokens.apply({ '--accent': '#00A0FF' });   // 覆盖到 :root
 *   OphTokens.fromCss(':root{--a:1px;}')          // { '--a': '1px' }
 *   OphTokens.snapshot(['--paper','--ink']);      // { '--paper': '#F9F9F7', ... }
 */
;(function () {
  const TAG = '[core:tokens]';

  const rootEl = () => document.documentElement;

  const api = {
    /** 读一个令牌的计算值（取不到返回 ''） */
    read(name, node) {
      const el = node || rootEl();
      if (!el || !el.ownerDocument) return '';
      const v = getComputedStyle(el).getPropertyValue(name);
      return v == null ? '' : String(v).trim();
    },

    /** 批量读：['--paper','--ink'] → { '--paper': ..., '--ink': ... } */
    snapshot(names, node) {
      const out = {};
      for (const n of names || []) out[n] = api.read(n, node);
      return out;
    },

    /**
     * 写令牌。传 null/undefined 视为「清掉这个覆盖」，
     * 于是主题可以只覆盖部分变量，其余自动回落到底层样式表。
     */
    apply(map, node) {
      const el = node || rootEl();
      if (!el) return 0;
      let n = 0;
      for (const [k, v] of Object.entries(map || {})) {
        if (!k.startsWith('--')) continue;
        if (v == null) el.style.removeProperty(k);
        else { el.style.setProperty(k, String(v)); n += 1; }
      }
      return n;
    },

    /** 清掉全部内联令牌（回到样式表的定义） */
    reset(node) {
      const el = node || rootEl();
      if (!el) return false;
      const names = [];
      for (let i = 0; i < el.style.length; i++) {
        const p = el.style[i];
        if (p && p.startsWith('--')) names.push(p);
      }
      for (const p of names) el.style.removeProperty(p);
      return names.length;
    },

    /**
     * 从 CSS 文本里抠出 `--name: value;` 键值对（单层，不展开 @import / @media）。
     * 用于「把一套令牌写成文本」的场景，也方便自检时对比两套主题覆盖面。
     */
    fromCss(text) {
      const out = {};
      const body = String(text || '').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of body.matchAll(/(^|[;{])\s*(--[A-Za-z0-9_-]+)\s*:\s*([^;{}]+)/g)) {
        out[m[2]] = m[3].trim();
      }
      if (!Object.keys(out).length && body.trim()) console.warn(TAG + ' fromCss() 没解析出任何令牌');
      return out;
    },
  };

  globalThis.OphTokens = Object.assign(globalThis.OphTokens || {}, api);
})();
