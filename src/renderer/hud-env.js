'use strict';

/**
 * hud-env · 渲染层共享环境（C）
 *
 * 全渲染层只有这一个地方持有「会变的东西」：DOM 引用、缩放、当前配置、各类开关，
 * 以及各模块共用的可变状态。模块文件加载时拿到的是这个对象的**引用**，
 * 所以任何时候读 C.xxx 都是当前值 —— 不需要谁去手动同步。
 *
 * ⚠️ 这里的 name 少一个都不行：拆出来的模块里 C.xxx 是硬引用，
 *    改字段名要全局搜一遍（tools/check-arch.mjs 不查这个）。
 */
;(function () {
  const $ = (id) => document.getElementById(id);

  // ---------- 预览模式（设置窗口里「预览」开的那个窗口）----------
  // 真实覆盖层不带 ?preview=1，下面所有分支都不会进入，行为与以前逐行一致。
  const PREVIEW = (() => {
    try { return new URLSearchParams(location.search).get('preview') === '1'; }
    catch (e) { return false; }
  })();
  const PREVIEW_BAR = 34;    // 顶部工具条高度（px）：预览时 HUD 画布整体往下让这么多

  // ---------- 桥 ----------
  // 正常窗口由 preload 提供；万一没有（例如被当普通网页打开）也不能整脚本崩掉。
  const BRIDGE = window.overplayhud || {
    onConfig() {}, onBounds() {}, onSnapshot() {}, onPreviewReset() {},
  };
  if (!window.overplayhud) {
    console.error('[hud] 未找到 overplayhud 桥（preload 没生效？）——HUD 收不到任何数据');
  }

  // ---------- DOM ----------
  const root = $('hud');
  const nodes = {
    bottomBar: $('bottomBar'),
    moneyModule: $('moneyModule'),
    rightBar: $('rightBar'),
    weaponBar: $('weaponBar'),
    aliveCT: $('aliveCT'),
    aliveT: $('aliveT'),
    scoreCT: $('scoreCT'),
    scoreT: $('scoreT'),
    timerBlock: $('timerBlock'),
    timerText: $('timerText'),
    hp: $('hp'),
    hpIcon: $('hpIcon'),
    hpFill: $('hpFill'),
    healthBlock: $('healthBlock'),
    ar: $('ar'),
    arFill: $('arFill'),
    armorBlock: $('armorBlock'),
    armorIcon: $('armorIcon'),
    kitBlock: $('kitBlock'),
    clipWrap: $('clipWrap'),
    clip: $('clip'),
    reserve: $('reserve'),
    ammoBlock: $('ammoBlock'),
    killsBlock: $('killsBlock'),
    roundKills: $('roundKills'),
    money: $('money'),
    rewardWrap: $('rewardWrap'),
    rewardLine: $('rewardLine'),
    rewardAmt: $('rewardAmt'),
    spendWrap: $('spendWrap'),
    spendLine: $('spendLine'),
    spendAmt: $('spendAmt'),
    rosterPanel: $('rosterPanel'),
    eventLayer: $('eventLayer'),
  };

  // ---------- 外部依赖 ----------
  // 设计分辨率 → 真实屏幕的映射。算法在 src/fit.js（与自检共用同一份）。
  // 渲染层 nodeIntegration 关闭，用 <script> 引入后读全局 OphFit。
  // ⚠️ 绝不能写成 `const { computeFit } = globalThis.OphFit`：fit.js 是经典脚本，
  //    顶层同名标识符会落在全局对象上，这句 const 会撞名并抛
  //    「Identifier 'computeFit' has already been declared」——整个脚本一行都不执行、
  //    HUD 彻底黑掉（踩过的坑）。这里用唯一名字，并加兜底防黑屏。
  const OPH_FIT = globalThis.OphFit;
  if (!OPH_FIT || typeof OPH_FIT.computeFit !== 'function') {
    console.error('[hud] OphFit 未加载，缩放暂用等比兜底（检查 index.html 是否引入了 ../fit.js）');
  }

  // 播报「进阶外观」的纯计算。缺失时降级为「关闭进阶」，基础播报不受影响。
  const OPH_ADV = globalThis.OphAdv;
  if (!OPH_ADV || typeof OPH_ADV.resolveKind !== 'function') {
    console.warn('[hud] OphAdv 未加载，进阶外观自动关闭（检查 index.html 是否引入了 ../advstyle.js）');
  }

  // ---------- 共享可变状态 ----------
  const C = {
    // 常量 / 依赖
    PREVIEW, PREVIEW_BAR, BRIDGE, OPH_FIT, OPH_ADV,
    root, nodes,

    // 几何与配置
    scale: 1,
    showFlags: {},
    currentCfg: null,
    lowHealthThreshold: 25,
    healthRedThreshold: 50,
    aliveCountMode: 'label',
    moneyHoldMs: 1800,
    moneyFadeMs: 240,

    // 最近一份快照 / 图标表
    pending: null,
    lastSnap: null,
    equipIconMap: {},

    // 文案与图标库
    textMap: {
      weaponNames: {},
      grenadeChars: {},
      grenadeSep: '・',
      labels: { alive: '存活', ct: 'CT', t: 'T' },
    },
    iconLib: {},

    // 自定义元素（build 时写、applyEffects 时读，跨模块）
    customEls: [],
    shapeEls: [],

    // 各模块的配置快照
    rosterCfg: {},
    eventsCfg: {},
    advCfg: {},
    devEventKind: null,     // 仅截图模式会带这个字段

    // 预览窗口的冻结状态（宿主与预览模块共用）
    pvPaused: false,
    pvLastSnap: null,
  };

  globalThis.OphHudCtx = C;
})();
