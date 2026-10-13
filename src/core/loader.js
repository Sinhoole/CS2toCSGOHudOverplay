'use strict';

/**
 * OphLoader · 脚本清单加载器
 *
 * 为什么要它：渲染层不能 require（nodeIntegration:false / contextIsolation:true），
 * 而 file:// 下 ES Module 会被 CORS 拦掉，所以只能走经典 <script>。
 * 经典脚本的痛点是 index.html 里得手写一长串 <script src>，加个文件就要去改 HTML，
 * 顺序错了还只表现为「某个函数 undefined」。
 *
 * 这个加载器把顺序变成一份**数据**（manifest），并按顺序串行等下每个文件真的执行完，
 * 出错立刻停在出事的那一个并显示可读的失败页 —— 而不是留下半死不活的界面。
 *
 *   OphLoader.load(manifest)      // manifest: ['a.js','../core/bus.js', ...]
 *      .then(() => OphApp.boot())
 *      .catch((e) => OphLoader.fatal(e, '设置界面'));
 */
;(function () {
  const TAG = '[core:loader]';
  const loaded = new Set();
  let inflight = null;

  function loadOne(src) {
    if (loaded.has(src)) return Promise.resolve(src);
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = false;              // 保住执行顺序（配合下面的串行 await 双保险）
      s.dataset.oph = '1';
      s.onload = () => { loaded.add(src); res(src); };
      s.onerror = () => rej(new Error(`加载失败：${src}`));
      (document.head || document.documentElement).append(s);
    });
  }

  /**
   * 串行加载。串行是刻意的：经典脚本靠全局名互相见面，
   * 并行加载会让执行顺序变得不确定（浏览器对 async=false 的支持并不一致）。
   */
  async function load(list, o = {}) {
    const arr = (list || []).flat().filter(Boolean);
    let i = 0;
    const t0 = performance.now();
    for (const item of arr) {
      const src = typeof item === 'string' ? item : item.src;
      try {
        await loadOne(src);
      } catch (e) {
        console.error(`${TAG} 第 ${i + 1}/${arr.length} 个文件挂了：${src}`);
        throw e;
      }
      i += 1;
    }
    const ms = Math.round(performance.now() - t0);
    console.log(`${TAG} 已加载 ${i} 个文件（${ms}ms）`);
    return { count: i, ms };
  }

  /** 同一个清单只加载一次（重复调用复用同一个 Promise） */
  function once(list, o) {
    if (!inflight) inflight = load(list, o);
    return inflight;
  }

  /** 可读的失败页：纸白 + 墨线，跟界面同一套气质；同时把错误留在控制台给诊断转发 */
  function fatal(err, where) {
    const msg = (err && err.message) || String(err);
    console.error(`${TAG} 致命错误${where ? '（' + where + '）' : ''}：`, err);
    try {
      const box = document.createElement('div');
      box.setAttribute('data-oph-fatal', '1');
      box.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#F9F9F7;color:#111;'
        + 'font:14px/1.6 "Inter",system-ui,sans-serif;padding:48px;overflow:auto';
      box.innerHTML = '<div style="max-width:720px;margin:0 auto">'
        + '<div style="font:600 22px/1.3 \'Playfair Display\',serif">启动失败'
        + (where ? ' · ' + where : '') + '</div>'
        + '<div style="height:2px;background:#111;margin:14px 0 18px"></div>'
        + '<pre style="white-space:pre-wrap;font:12px/1.6 \'JetBrains Mono\',monospace">'
        + msg.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c])
        + '</pre>'
        + '<div style="margin-top:18px;color:#525252">已加载文件：' + [...loaded].length
        + ' 个 —— 详细堆栈见控制台。</div></div>';
      document.body.append(box);
    } catch (e) { /* 连 DOM 都不可用就只能靠控制台了 */ }
    return err;
  }

  globalThis.OphLoader = Object.assign(globalThis.OphLoader || {}, {
    load, once, fatal,
    loaded() { return [...loaded]; },
    reset() { loaded.clear(); inflight = null; },
  });
})();
