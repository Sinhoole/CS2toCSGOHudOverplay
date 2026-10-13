'use strict';

/**
 * OphDOM · DOM 小工具
 *
 * 只有这一份 `el()`，所有模块都用它 —— 重构前它散在设置界面顶部，
 * HUD 层另有一份类似的写法，两边行为不一致的地方（比如 textContent 传 0）
 * 最容易出「显示成空白」这类怪事。
 *
 * 用法：const { el } = OphDOM;
 */
;(function () {
  /** 建元素。text 传 null/undefined 表示不设文本（注意 0 与 '' 都会照设） */
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  const api = {
    el,

    frag(...nodes) {
      const f = document.createDocumentFragment();
      for (const n of nodes.flat()) if (n) f.append(n);
      return f;
    },

    qs(sel, root) { return (root || document).querySelector(sel); },
    qsa(sel, root) { return [...(root || document).querySelectorAll(sel)]; },
    byId(id) { return document.getElementById(id); },

    /** 一次性绑定；返回解绑函数（模块 dispose 里调用，避免残留监听） */
    on(node, evt, fn, opts) {
      if (!node) return () => {};
      node.addEventListener(evt, fn, opts);
      return () => node.removeEventListener(evt, fn, opts);
    },

    /** 设/清单个 CSS 变量（模块自有的 --m-xxx 都用它，别手写 style 字符串） */
    cssVar(name, val, node) {
      const n = node || document.documentElement;
      if (val == null) n.style.removeProperty(name);
      else n.style.setProperty(name, String(val));
      return n;
    },

    /** 显示/隐藏：统一用 hidden 属性，避免各模块自成一套 display 规则 */
    show(node, yes) { if (node) node.hidden = !yes; },

    clear(node) { if (node) while (node.firstChild) node.removeChild(node.firstChild); return node; },

    /** 输入防抖（搜索框、文本输入用） */
    debounce(fn, ms = 120) {
      let t = 0;
      return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
    },
  };

  globalThis.OphDOM = Object.assign(globalThis.OphDOM || {}, api);
})();
