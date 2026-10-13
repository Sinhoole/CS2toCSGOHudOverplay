'use strict';

/**
 * hud-kit · 渲染层纯函数与常量（K）
 *
 * 这里只放「不持有状态」的东西：模板插值、颜色换算、锚点定位、图标文件名解析、
 * 显示名解析、辉光滤镜拼接…… 谁都可能用到，所以集中在最底层，模块按需引用。
 *
 * ⚠️ 这些函数**不写任何 DOM**（applyAnchor 只算不出手，写 DOM 的那句在调用方）。
 *    必须写 DOM 的（自定义元素、画图）留在各自的模块里 —— 那里的安全白名单逻辑更关键。
 * 模块里一律用 K.xxx 调，K 本身在 IIFE 结尾才挂上 globalThis。
 */
;(function () {
  const C = globalThis.OphHudCtx;

  const $ = (id) => document.getElementById(id);

  /** 缩放计算：优先用 fit.js，缺失时用等比兜底，保证 HUD 绝不黑屏 */
  function ophComputeFit(cfg, bounds) {
    if (C.OPH_FIT && typeof C.OPH_FIT.computeFit === 'function') return C.OPH_FIT.computeFit(cfg, bounds);
    const k = Math.min(bounds.width / (Number(cfg.designWidth) || 1920),
                       bounds.height / (Number(cfg.designHeight) || 1080)) * (Number(cfg.scale) || 1);
    return { scale: k, stretchX: 1, virtW: bounds.width, virtH: bounds.height, insetX: 26 * k, insetY: 22 * k };
  }

  // ---------- 锚点 / 对齐（自定义文本元素与画图形状共用同一套语言）----------
  const CUSTOM_ANCHORS = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];
  const CUSTOM_ALIGNS = ['left', 'center', 'right'];

  // 变量表来自 src/vars.js（和设置界面共用同一份定义）
  const VAR_FNS = (() => {
    const m = {};
    const defs = (typeof OPH_VARS !== 'undefined' && Array.isArray(OPH_VARS)) ? OPH_VARS : [];
    for (const d of defs) m[d.key] = d.get;
    return m;
  })();

  /** 把模板里的 {变量} 换成当前数据；认不出的变量原样留着，方便排查拼写 */
  function fillTemplate(tpl, s, helpers) {
    return String(tpl || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (whole, key) => {
      const fn = VAR_FNS[key] || VAR_FNS[key.toLowerCase()];
      if (!fn) return whole;
      let v;
      try { v = fn(s, helpers); } catch (e) { v = ''; }
      return v == null ? '' : String(v);
    });
  }

  /** "#1F4A78" → "31, 74, 120"，供 rgba(var(--bar-color), a) 使用 */
  function toRgbTriplet(hex) {
    if (!hex) return null;
    const m = String(hex).trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return null;
    let h = m[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const v = parseInt(h, 16);
    return `${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}`;
  }

  function formatMoney(n) {
    return Number(n || 0).toLocaleString('en-US');
  }

  function pct(v) {
    return Math.max(0, Math.min(100, Number(v) || 0));
  }

  function elSpan(cls, text) {
    const n = document.createElement('span');
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  /** 按锚点写内联定位（和 .custom-item 的 9 锚点公式一致，避免复制一大段 CSS）。 */
  function applyAnchor(el, anchor, offX, offY, k, rot) {
    const a = CUSTOM_ANCHORS.indexOf(anchor) >= 0 ? anchor : 'tl';
    const h = a[1];   // l / c / r
    const v = a[0];   // t / m / b
    const parts = [];
    let ox = 'left', oy = 'top';

    if (h === 'l') { el.style.left = `calc(var(--inset-x, 0px) + ${offX}px)`; ox = 'left'; }
    else if (h === 'c') { el.style.left = `calc(50% + ${offX}px)`; parts.push('translateX(-50%)'); ox = 'center'; }
    else { el.style.right = `calc(var(--inset-x, 0px) - ${offX}px)`; ox = 'right'; }

    if (v === 't') { el.style.top = `calc(var(--inset-y, 0px) + ${offY}px)`; oy = 'top'; }
    else if (v === 'm') { el.style.top = `calc(50% + ${offY}px)`; parts.push('translateY(-50%)'); oy = 'center'; }
    else { el.style.bottom = `calc(var(--inset-y, 0px) - ${offY}px)`; oy = 'bottom'; }

    if (Math.abs(rot) > 0.001) parts.push(`rotate(${rot}deg)`);
    if (Math.abs(k - 1) > 0.001) parts.push(`scale(${k})`);
    el.style.transform = parts.join(' ');
    el.style.transformOrigin = `${ox} ${oy}`;
  }

  /**
   * 辉光的 filter 字符串。
   *
   * ⚠️ `drop-shadow()` 里不能出现 `calc()` —— Chromium 会把整条声明判为无效、
   * 一个像素都不渲染（这个坑在低血量辉光那次踩过）。所以这里先在 JS 里
   * 算成真实像素值，再拼成字符串塞进去。
   *
   * 强度 0~1 映射成三层由紧到松的投影，越大越"外扩"。
   */
  function glowFilter(glow, color, u) {
    const g = Math.max(0, Math.min(1, Number(glow) || 0));
    if (g <= 0) return '';

    const rgb = toRgbTriplet(color) || '255, 255, 255';
    const px = (v) => `${(v * u).toFixed(1)}px`;
    const a = (v) => Math.max(0, Math.min(1, v)).toFixed(2);

    return [
      `drop-shadow(0 0 ${px(2 + 10 * g)} rgba(${rgb}, ${a(0.35 + 0.45 * g)}))`,
      `drop-shadow(0 0 ${px(7 + 26 * g)} rgba(${rgb}, ${a(0.16 + 0.34 * g)}))`,
      `drop-shadow(0 0 ${px(16 + 52 * g)} rgba(${rgb}, ${a(0.07 + 0.22 * g)}))`,
    ].join(' ');
  }

  /**
   * 武器显示名。用户自定义的名字（config 的 text.weaponNames）优先，
   * 没配就用 GSI 层算好的默认中文名。
   */
  function weaponLabel(info) {
    if (!info) return '';
    const custom = C.textMap.weaponNames && C.textMap.weaponNames[info.name];
    if (custom) return custom;
    const name = String(info.name || '');
    // 匕首全家桶（weapon_knife* / *bayonet*）共用一个自定义名：text.weaponNames._knife
    if (/^weapon_knife/.test(name) || /bayonet/.test(name)) {
      const k = C.textMap.weaponNames && C.textMap.weaponNames._knife;
      if (k) return k;
    }
    if (info.label) return info.label;
    return name.replace(/^weapon_/, '');
  }

  /** 投掷物单字：用户改了字就用用户的，没配就用默认 */
  function grenadeCharsOf(info) {
    const ids = info.ids || [];
    const base = info.chars || [];
    const map = C.textMap.grenadeChars || {};
    return base.map((c, i) => {
      const v = ids[i] != null ? map[ids[i]] : undefined;
      return v == null || v === '' ? c : v;
    });
  }

  /**
   * 武器图标文件名解析（与 src/equip-icons.js 同一套规则，渲染层内联一份，
   * 因为渲染层不能 require）。
   */
  function isKnifeName(name) {
    if (!name) return false;
    return /^weapon_knife/.test(name)
      || /bayonet/.test(name)
      || name === 'weapon_melee'
      || name === 'weapon_knifegg';
  }
  function weaponIconFile(name) {
    if (!name) return '';
    let n = String(name).replace(/^weapon_/, '');
    if (n === 'c4') return 'c4.svg';
    return n + '.svg';
  }
  function grenadeIconFile(id) {
    const m = { flame: 'incgrenade.svg', smoke: 'smokegrenade.svg', flash: 'flashbang.svg', he: 'hegrenade.svg', decoy: 'decoy.svg' };
    return m[id] || '';
  }

  /**
   * 造一个图标节点。优先级：图标库引用（iconRef）> 内联 emoji / 文字（icon）。
   *
   * 图标库条目有三种来源，全部走「白名单图元重建 / dataURL 校验」，
   * 不存在把外部字符串直接注入 DOM 的路径：
   *   draw  —— SVG 图元，由 C.OPH_ADV.iconSVG 重建
   *   image —— data:image/...;base64，经 safeDataURL 校验
   *   text  —— 一段文字或 emoji
   */
  function makeIconNode(value, ref) {
    const ic = ref ? C.iconLib[ref] : null;
    if (ic) {
      if (ic.kind === 'draw' && C.OPH_ADV && typeof C.OPH_ADV.iconSVG === 'function') {
        const wrap = document.createElement('span');
        wrap.className = 'ev-ico ev-ico-svg';
        wrap.insertAdjacentHTML('afterbegin', C.OPH_ADV.iconSVG(ic, {
          resolveText: (t) => fillTemplate(t, C.pending || {}, { weaponLabel, textMap: C.textMap }),
        }));
        return wrap;
      }
      if (ic.kind === 'image' && C.OPH_ADV && typeof C.OPH_ADV.safeDataURL === 'function') {
        const url = C.OPH_ADV.safeDataURL(ic.data);
        if (url) {
          const img = document.createElement('img');
          img.className = 'ev-ico ev-ico-img';
          img.src = url;
          img.alt = '';
          return img;
        }
      }
      if (ic.kind === 'text' && ic.text) {
        const span = document.createElement('span');
        span.className = 'ev-ico';
        span.textContent = ic.text;
        return span;
      }
    }
    const v = String(value == null ? '' : value);
    if (!v) return null;
    const span = document.createElement('span');
    span.className = 'ev-ico';
    span.textContent = v;
    return span;
  }

  // 同一帧里可能同时涨了好几个数（一次三杀 = 击杀 +1 + 连杀 3），
  // 全播会糊满屏幕，所以按这个优先级只挑一条最有信息量的。
  const EV_PRIORITY = ['multi', 'kill', 'death', 'assist', 'mvp'];

  // 试播报用的兜底文案（和 config.js DEFAULTS.events 保持一致）
  const PV_EV_TEXT = {
    kill: '击杀  +1',
    multi: '{round_kills} 连杀',
    death: '阵 亡',
    assist: '助攻  +1',
    mvp: 'MVP',
  };

  /** 各模块对应的 DOM 元素（辉光和不透明度要直接写在元素上） */
  const MODULE_ELS = {
    scoreboard: () => document.querySelector('.scoreboard'),
    money: () => C.nodes.moneyModule,
    vitals: () => C.nodes.bottomBar,
    ammo: () => C.nodes.rightBar,
    weaponList: () => C.nodes.weaponBar,
    roster: () => C.nodes.rosterPanel,
  };

  globalThis.OphHudKit = {
    $, ophComputeFit, CUSTOM_ANCHORS, CUSTOM_ALIGNS, VAR_FNS, fillTemplate,
    toRgbTriplet, formatMoney, pct, elSpan, applyAnchor, glowFilter,
    weaponLabel, grenadeCharsOf, isKnifeName, weaponIconFile, grenadeIconFile,
    makeIconNode, EV_PRIORITY, PV_EV_TEXT, MODULE_ELS,
  };
})();
