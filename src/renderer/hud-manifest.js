'use strict';

/**
 * hud-manifest · HUD 渲染层清单
 *
 * 和设置界面同一套思路：这是渲染层**唯一**需要手工维护顺序的地方。
 * index.html 只负责骨架 DOM 与三件基础件（loader / 本清单 / hud.js 引导），
 * 具体加载什么全看这里。
 *
 * 顺序为什么是这样（改顺序前先读这里）：
 *   1. hud-env.js 建共享环境 C —— 后面所有文件在**加载期**就要 `const C = globalThis.OphHudCtx`，
 *      所以它必须第一个；
 *   2. hud-kit.js 是纯函数库 K，同样在加载期被解构；
 *   3. hud-registry.js 提供 OphHud.register，模块加载时要用；
 *   4. 各模块之间零耦合（互相只通过 C / K 说话），所以它们之间的先后随意；
 *   5. hud-host.js 是宿主，要等所有模块都注册完才绑桥，排最后。
 *
 * 加一个 HUD 元素：写一个 modules/xxx.js，末尾 OphHud.register({id,...})，
 *                 然后在下面 modules 里加一行 —— 完事。
 * 删一个 HUD 元素：把这一行去掉（文件可以留着，也可以删）。
 */

;(function () {
  // 共享环境与底层库
  const CORE = [
    'hud-env.js',        // ⚠️ 共享状态 C：必须最先（模块加载期就解构它）
    'hud-kit.js',        // 纯函数 / 常量 K
    'hud-registry.js',   // OphHud.register + render/apply/reset 分发
  ];

  // 上架模块：顺序 = render 调用顺序（各模块写不同 DOM，顺序不影响结果）
  const SECTIONS = [
    'modules/viewport.js',       // 画布映射（宿主按固定顺序直接调，不参与逐帧分发）
    'modules/appearance.js',     // 位移 / 缩放 / 配色 / 辉光 / 不透明度
    'modules/scoreboard.js',     // 顶部比分面板
    'modules/vitals.js',         // 血量 / 护甲 / 拆弹器
    'modules/money.js',          // 金钱与变动提示
    'modules/ammo.js',           // 弹药 + 连杀骷髅
    'modules/weapon-text.js',    // 武器栏（文字态）
    'modules/weapon-svg.js',     // 武器栏（剪影图标态）
    'modules/roster.js',         // 名单面板（默认关）
    'modules/events.js',         // 击杀 / 死亡播报
    'modules/custom.js',         // 自定义文本 + 画图
    'modules/preview.js',        // 预览工具条（仅 ?preview=1）
  ];

  globalThis.OphHudManifest = {
    core: CORE,
    sections: SECTIONS,
    host: ['hud-host.js'],

    /**
     * 未上架（代码保留、不加载）。想恢复某一块：把文件挪回 sections 里。
     * 这些文件里同样有 OphHud.register()，一旦被加载就会生效。
     */
    dormant: [],

    /**
     * 样式表。按这个顺序插 <link>；顺序 = 层叠顺序，挪动前想清楚选择器之间的覆盖关系
     * （经典一例：全局 `.ico path` 的浅填充会被 `css/weapon.css` 里的覆盖规则盖掉）。
     */
    css: [
      'css/base.css',        // 令牌 + 容器 + 底栏 + 组件开关 + 每块位移/缩放
      'css/vitals.css',      // 模块行 / 图标 / 进度条 / 血量分级 / 护甲 / 拆弹器
      'css/ammo.css',        // 连杀骷髅 + 弹药 + 子弹装饰
      'css/money.css',       // 金钱模块
      'css/scoreboard.css',  // 顶部比分面板
      'css/weapon.css',      // 武器栏（文字态 + SVG 态）
      'css/custom.css',      // 自定义文本元素 + 画图形状 + 进阶覆盖
      'css/roster.css',      // 名单面板
      'css/events.css',      // 播报 + 播报的进阶外观
      'css/preview.css',     // 预览工具条
    ],

    // 扁平化的加载顺序（hud.js 引导读的就是它）
    flat: [
      ...CORE, ...SECTIONS, 'hud-host.js',
    ],
  };
})();
