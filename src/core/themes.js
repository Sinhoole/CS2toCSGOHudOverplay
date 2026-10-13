'use strict';

/**
 * OphThemes · 主题注册表
 *
 * 一套主题 = 一份 CSS（覆盖同名 CSS 变量）+ 一条注册记录。
 *   OphThemes.register({ id: 'plain', name: '素纸', href: '../themes/plain.css' });
 *   OphThemes.use('plain');
 *
 * 切换做的事只有三件：换 <link id="oph-theme"> 的 href、在 root 上打 data-theme、
 * 广播 theme:change。因为所有外观都走 CSS 变量，所以不需要重建任何 DOM。
 *
 * 主题可以带 `tokens`（JS 覆盖），优先级高于 CSS 文件 —— 适合「轻微微调」这种
 * 不值得单独开一个文件的场合：
 *   OphThemes.register({ id:'high-contrast', name:'高对比', tokens: { '--accent': '#000' } });
 *
 * ⚠️ 主题文件必须覆盖「同一批变量名」（见 settings.css 的 :root 与 themes/README 说明），
 *    没覆盖到的会自动回落到底层样式表，不会变成空白。
 */
;(function () {
  const TAG = '[core:themes]';
  const LINK_ID = 'oph-theme';

  function create(cfg = {}) {
    const bus = cfg.bus || globalThis.OphBus?.app || null;
    const store = globalThis.OphStore;   // 只要求存在即可，没用到就不管
    const root = () => cfg.root ? (typeof cfg.root === 'function' ? cfg.root() : cfg.root) : document.documentElement;
    const Tokens = globalThis.OphTokens || null;

    const reg = globalThis.OphRegistry.create({ name: 'themes' });
    let currentId = null;

    function linkEl() {
      let el = document.getElementById(LINK_ID);
      if (!el) {
        el = document.createElement('link');
        el.id = LINK_ID;
        el.rel = 'stylesheet';
        document.head.append(el);
      }
      return el;
    }

    const api = {
      register(desc) { return reg.add(desc, { replace: true }); },
      list() { return reg.list(); },
      has(id) { return reg.has(id); },
      get(id) { return reg.get(id); },
      current() { return currentId; },
      currentDesc() { return currentId ? reg.get(currentId) : null; },

      /**
       * 切主题。默认会记住（localStorage），传 { remember:false } 只切不记。
       * 返回最终生效的主题 id（未知 id 会退回到第一个已注册主题并报警告）。
       */
      use(id, o = {}) {
        let desc = reg.get(id);
        if (!desc) {
          const first = reg.list()[0] || null;
          console.warn(`${TAG} 未知主题 "${id}"${first ? `，回落到 "${first.id}"` : ''}`);
          desc = first;
          if (!desc) return null;
        }
        const prev = currentId;
        currentId = desc.id;

        // 1) 样式表：href 为空表示「用默认（内置样式表里的那份）」
        const el = linkEl();
        if (desc.href) { if (el.getAttribute('href') !== desc.href) el.setAttribute('href', desc.href); }
        else el.removeAttribute('href');

        // 2) 内联令牌覆盖：先清干净，避免上一个主题残留
        if (Tokens) {
          const r = root();
          Tokens.reset(r);
          if (desc.tokens) Tokens.apply(desc.tokens, r);
        }

        // 3) 打标：CSS 里可以用 [data-theme="xxx"] 做局部微调
        const r = root();
        if (r && r.dataset) r.dataset.theme = desc.id;

        if (o.remember !== false) {
          try { localStorage.setItem('oph.theme', desc.id); } catch (e) { /* 隐身模式等，忽略 */ }
        }
        if (bus && prev !== desc.id) bus.emit('theme:change', desc.id, prev);
        return desc.id;
      },

      /** 记住的主题 id（没有则 null） */
      remembered() {
        try { return localStorage.getItem('oph.theme') || null; } catch (e) { return null; }
      },

      /** 启动时调用：优先用 remember 的，其次用传入的 defaultId，兜底第一个 */
      boot(defaultId) {
        const want = api.remembered() || defaultId || (reg.list()[0] || {}).id;
        return api.use(want, { remember: false });
      },

      /** 自检用：列出每个主题覆盖了哪些令牌 */
      coverage(name) {
        const d = reg.get(name);
        if (!d) return null;
        return d.tokens ? Object.keys(d.tokens) : (d.css ? Object.keys(Tokens ? Tokens.fromCss(d.css) : {}) : []);
      },
    };
    return api;
  }

  globalThis.OphThemes = Object.assign(globalThis.OphThemes || {}, { create, LINK_ID });
})();
