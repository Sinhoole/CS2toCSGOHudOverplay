'use strict';

/**
 * hud.js · HUD 渲染层引导
 *
 * 做的事只有三件：订阅桥并把数据缓存起来 → 挂样式表 → 按清单加载脚本并交给宿主。
 * 具体加载什么全在 hud-manifest.js 里，这个文件不随功能增减而改。
 *
 * ⚠️ 为什么要「解析期就订阅桥」：
 *    ipcRenderer 的监听一旦错过就永远错过（preload 没提供取消订阅，主进程也不会重发）。
 *    主进程通常在 did-finish-load 那一刻就把配置推过来，而我们是异步加载十几个脚本的，
 *    若等到加载完再订阅，第一份配置就可能永远收不到 —— 表现为 HUD 一直不出现、
 *    直到下次改配置。所以这里第一时间订阅、只做缓存，宿主起来后再把缓存交过去。
 */
;(function () {
  const TAG = '[hud:boot]';

  // ---------- 1. 解析期订阅桥 ----------
  const BRIDGE = window.overplayhud || {
    onConfig() {}, onBounds() {}, onSnapshot() {}, onPreviewReset() {}, equipIcons: null,
  };
  const BUF = { cfg: null, bounds: null, snap: null };
  let host = null;

  BRIDGE.onConfig((p) => {
    BUF.cfg = p && p.cfg;
    BUF.bounds = p && p.bounds;
    if (host) host.onConfig(BUF.cfg, BUF.bounds);
  });
  BRIDGE.onBounds((b) => {
    BUF.bounds = b;
    if (host) host.onBounds(b);
  });
  BRIDGE.onSnapshot((s) => {
    BUF.snap = s;
    if (host) host.onSnapshot(s);
  });

  function fail(e, where) {
    globalThis.OphLoader?.fatal(e, where);
    return null;
  }

  /** 按清单插 <link>；任一失败只记一行日志，绝不把启动卡死 */
  function loadCss(list) {
    return Promise.all((list || []).map((href) => new Promise((res) => {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      l.dataset.oph = '1';
      const done = () => res(href);
      l.onload = done;
      l.onerror = () => { console.error(`${TAG} 样式加载失败：${href}`); done(); };
      document.head.append(l);
      setTimeout(done, 1500);   // 兜底：本地文件读不到时也不拖住启动
    })));
  }

  async function main() {
    const L = globalThis.OphLoader;
    const M = globalThis.OphHudManifest;
    if (!L) return fail(new Error('OphLoader 未加载（../core/loader.js）'), 'HUD');
    if (!M) return fail(new Error('OphHudManifest 未加载（hud-manifest.js）'), 'HUD');

    await loadCss(M.css);

    try {
      await L.load(M.flat);
    } catch (e) {
      return fail(e, '加载脚本');
    }

    const H = globalThis.OphHudHost;
    if (!H || typeof H.start !== 'function') {
      return fail(new Error('OphHudHost.start 不存在 —— hud-host.js 没跑起来或 export 缺失'), 'HUD');
    }

    host = H;
    H.start(BUF);   // 把解析期缓存下来的配置/快照补上，不丢第一帧
    console.log(`${TAG} 启动完成（${L.loaded().length} 个文件）`);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main);
  else main();
})();
