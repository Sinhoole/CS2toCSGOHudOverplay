'use strict';

/**
 * hud-host · HUD 宿主
 *
 * 唯一负责「把桥上的数据分发给模块」的地方，也是唯一知道**几何顺序**的地方。
 * 清单里排最后 —— 它要等所有模块都注册完才开工。
 *
 * ⚠️ 桥的订阅不在这里做：ipcRenderer 的监听一旦错过就永远错过（preload 没给取消订阅），
 *    所以由 hud.js（引导，解析期就执行）先订阅并缓存最后一份数据，加载完再把缓存交过来。
 *    见 start(buf)。
 */
;(function () {
  const C = globalThis.OphHudCtx;
  const H = globalThis.OphHud;
  const V = globalThis.OphHudViewport;
  const A = globalThis.OphHudAppearance;

  let rafId = 0;

  /**
   * 几何顺序是刻意固定的：
   *   applyBounds 算出新 scale → applyEffects 的辉光半径要按新 scale 重算
   *   → applyShowFlags 最后收起被关掉的块。
   */
  function applyGeometry(cfg, bounds) {
    const b = bounds || { width: window.innerWidth, height: window.innerHeight };
    V.applyBounds(cfg, V.previewAwareBounds(b));
    A.applyEffects(cfg);
    V.applyShowFlags();
  }

  function onConfig(cfg, bounds) {
    if (!cfg) return;
    C.currentCfg = cfg;
    C.showFlags = cfg.show || {};
    const hudCfg = cfg.hud || {};
    C.lowHealthThreshold = hudCfg.lowHealthThreshold ?? 25;
    C.healthRedThreshold = hudCfg.healthRedThreshold ?? 50;
    C.moneyHoldMs = hudCfg.moneyDeltaHoldMs ?? 1800;
    C.aliveCountMode = hudCfg.aliveCountMode ?? 'label';
    C.root.classList.toggle('mark-off', hudCfg.factionMark === false);
    C.root.classList.toggle('woutline', hudCfg.weaponTextOutline === true);
    // 忽略系统减少动态：挂到 :root 上，CSS 侧用 :root:not(.force-motion) 让
    // prefers-reduced-motion 的关闭规则整体失效；JS 侧读 C.forceMotion（见 ammo.js）。
    C.forceMotion = hudCfg.ignoreReducedMotion === true;
    document.documentElement.classList.toggle('force-motion', C.forceMotion);

    C.textMap = Object.assign({
      weaponNames: {}, grenadeChars: {}, grenadeSep: '・',
      labels: { alive: '存活', ct: 'CT', t: 'T' },
    }, cfg.text || {});
    C.textMap.labels = Object.assign({ alive: '存活', ct: 'CT', t: 'T' }, cfg.text?.labels || {});

    C.rosterCfg = cfg.roster || {};
    C.eventsCfg = cfg.events || {};
    C.advCfg = cfg.adv || {};
    C.devEventKind = cfg.devEvent || null;   // 仅截图模式会带这个字段

    // 自定义图标库按 id 建索引；形状元素随后重建
    C.iconLib = {};
    for (const it of (Array.isArray(cfg.icons) ? cfg.icons : [])) {
      if (it && it.id) C.iconLib[it.id] = it;
    }

    A.applyModules(cfg);
    H.apply(cfg);   // 各模块按配置重建自身（存活标签 / 自定义元素 / 画图 / 失效缓存）

    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--bar-alpha', String(hudCfg.barAlpha ?? 0.5));
    if (hudCfg.moneyGainColor) rootStyle.setProperty('--money-gain', hudCfg.moneyGainColor);
    if (hudCfg.moneySpendColor) rootStyle.setProperty('--money-spend', hudCfg.moneySpendColor);
    if (cfg.shotBg) document.body.style.background = cfg.shotBg;

    applyGeometry(cfg, bounds);   // 必须在 applyEffects 之前把 scale 算出来
    H.render(C.pending);          // 配置改了立刻按最近一份快照重画
  }

  function onBounds(bounds) {
    if (!C.currentCfg) return;
    applyGeometry(C.currentCfg, bounds);   // 分辨率变了 scale 也变，辉光半径要跟着重算
  }

  function onSnapshot(s) {
    // 预览「暂停」：只把最近一份快照记下来，不重绘（画面就此冻结）
    if (C.PREVIEW && C.pvPaused) { C.pvLastSnap = s; return; }
    C.pending = s;
    if (!rafId) rafId = requestAnimationFrame(() => { rafId = 0; H.render(C.pending); });
  }

  /** 引导在脚本加载完之后调这里；buf 是解析期就开始缓存的最后一份桥数据 */
  function start(buf) {
    // 加载 SVG 图标（武器 / 刀 / 投掷物剪影）；到货后再渲染一次武器栏
    if (typeof C.BRIDGE.equipIcons === 'function') {
      C.BRIDGE.equipIcons().then((m) => {
        C.equipIconMap = (m && typeof m === 'object') ? m : {};
        if (C.lastSnap) H.render(C.lastSnap);
      }).catch(() => {});
    }

    if (buf && buf.cfg) onConfig(buf.cfg, buf.bounds);
    if (buf && buf.snap) onSnapshot(buf.snap);
  }

  globalThis.OphHudHost = { start, onConfig, onBounds, onSnapshot, applyGeometry };
})();
