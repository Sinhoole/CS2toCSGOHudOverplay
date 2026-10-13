'use strict';

/**
 * manifest · 脚本清单
 *
 * 这是全项目**唯一**需要手工维护顺序的地方。分段只是给人看的，
 * OphLoader 会把它们摊平成一条串行加载链：
 *
 *   core → ui → 宿主接口 → 页面 → 宿主
 *
 * 为什么要这个顺序（改顺序前请先读这里）：
 *   1. core 不许依赖 DOM，所以放最前；
 *   2. ui 依赖 core（OphDOM/OphCtx），且 ui/controls 与 ui/module-cards 在
 *      **加载期**就解构了 globalThis.OphApp —— 所以 app-api.js 必须排在它们前面；
 *   3. 页面模块在加载期解构 OphApp / OphLayout / OphControls，所以排在它们之后；
 *   4. app.js 是宿主，要等所有页面都注册完才初始化，排最后。
 *
 * 加一个设置页：把文件写进 sections/，在文件末尾 OphSections.register({...})，
 *               然后在这个清单的 sections 里加一行 —— 完事，别处都不用动。
 * 删一个设置页：把这一行去掉（文件可以留着，也可以删）。
 */
;(function () {
  const CORE = [
    '../core/bus.js',        // 事件总线
    '../core/registry.js',   // 通用注册表
    '../core/kernel.js',     // 功能内核（声明式生命周期）
    '../core/path.js',       // 'a.b.c' 路径读写
    '../core/util.js',       // clone / newId
    '../core/color.js',      // 颜色换算
    '../core/store.js',      // 路径式状态容器（依赖 OphPath）
    '../core/schema.js',     // 字段 schema + 控件类型注册表
    '../core/search.js',     // 检索索引
    '../core/effects.js',    // 特效/触感总线
    '../core/tokens.js',     // CSS 变量读写
    '../core/themes.js',     // 主题注册表（依赖 registry/tokens）
  ];

  const UI = [
    '../ui/dom.js',          // el / 事件 / CSS 变量
    '../ui/ctx.js',          // 编辑上下文（state + commit）
    'app-api.js',            // ⚠️ 宿主接口：必须早于 ui/controls 与 ui/module-cards
    '../ui/layout.js',       // sectionHead / newCard / fieldRow / 锚点
    '../ui/controls/base.js',   // num / color / switch / select / text
    '../ui/controls/extra.js',  // tri / color2 / num2
    '../ui/module-cards.js',    // ⚠️ 用到 OphControls，必须排在 controls 之后
    '../ui/media.js',           // 读文件为 dataURL
    '../ui/adv-bridge.js',      // 访问 OphAdv（进阶外观库）的一行桥
  ];

  globalThis.OphManifest = {
    core: CORE,
    ui: UI,
    app: ['app.js'],

    // 上架页面：顺序 = 侧栏顺序
    sections: [
      'sections/index.js',        // 注册表本体，必须最先
      'sections/home.js',         // 总览
      'sections/update.js',       // 更新公告
      'sections/gamecmds.js',     // 原生 HUD 命令
      'sections/declarative.js',  // 金钱 / 血量护甲 / 弹药连杀 / 武器栏文字态
      'sections/weaponListSvg.js',
      'sections/text.js',
      'sections/custom.js',
      'sections/global.js',
      'sections/profiles.js',
    ],

    /**
     * 未上架（代码保留、不加载）。想恢复某一页：把文件从下面挪到 sections 里。
     * 这些文件里同样有 OphSections.register()，一旦被加载就会出现在侧栏。
     */
    dormant: [
      'sections/offline/about.js',
      'sections/offline/tutorial.js',
      'sections/offline/events.js',
      'sections/offline/buywheel.js',
      'sections/offline/adv/core.js',
      'sections/offline/adv/elements.js',
      'sections/offline/adv/icons.js',
      'sections/offline/adv/draw.js',
    ],
  };

  // 扁平化后的完整加载顺序（诊断用；bootstrap 读的就是它）
  // ⚠️ 宿主 app.js 必须排在页面之后：页面在加载期就解构了 OphApp / OphSections，
  //    而 app.js 反过来要读 OphSecXxx 这些页面钩子。
  globalThis.OphManifest.flat = [
    ...CORE, ...UI, ...globalThis.OphManifest.sections, ...globalThis.OphManifest.app,
  ];
})();
