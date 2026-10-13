'use strict';

/**
 * bootstrap · 引导
 *
 * index.html 里只有三个 <script>（loader / manifest / bootstrap），
 * 具体加载什么由清单决定。这样 index.html 不用随功能增减而改 —— 它只负责骨架 DOM。
 *
 * 任何一步失败都会落到 OphLoader.fatal()：一张纸白墨线的失败页 + 控制台堆栈，
 * 而不是「窗口开着但什么都没有」。
 */
;(function () {
  const TAG = '[settings:bootstrap]';

  const fail = (e, where) => {
    globalThis.OphLoader?.fatal(e, where);
    return null;
  };

  async function main() {
    const L = globalThis.OphLoader;
    const M = globalThis.OphManifest;
    if (!L) return fail(new Error('OphLoader 未加载（../core/loader.js）'), '设置界面');
    if (!M) return fail(new Error('OphManifest 未加载（manifest.js）'), '设置界面');

    // 主题样式表按需挂载：src/themes/*.css 由 OphThemes 自己 insert <link>，
    // 这里不预先加载 —— 默认主题的令牌就在 settings.css 里。

    try {
      await L.load(M.flat);
    } catch (e) {
      return fail(e, '加载脚本');
    }

    const App = globalThis.OphApp;
    if (!App || typeof App.boot !== 'function') {
      return fail(new Error('OphApp.boot 不存在 —— app.js 没跑起来或 export 缺失'), '设置界面');
    }

    try {
      await App.boot();
    } catch (e) {
      return fail(e, '初始化');
    }
    console.log(`${TAG} 启动完成`);
  }

  // DOM 就绪后立刻开跑（脚本在 body 末尾，通常已经是 readyState=interactive）
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main);
  else main();
})();
