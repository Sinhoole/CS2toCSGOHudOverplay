'use strict';

/**
 * 进阶配置的纯计算模块（唯一权威）。
 *
 * 为什么单独成文件：
 *   - 它要同时被三个环境用 —— HUD 渲染层（index.html）、设置界面（settings/index.html）
 *     和无头自检（tools/selftest.mjs）都用 <script>/require 引入同一份逻辑，
 *     才不会出现「设置界面里能调、HUD 里认不出来」。
 *   - 全是纯函数（不碰 DOM、不碰 window），所以能被 selftest 直接断言 ——
 *     照 src/fit.js 的做法。
 *
 * 本模块负责三件事：
 *   1) 每元素外观：resolveStyle(adv, id) 把「全局默认 + 该元素覆盖」合并成一份参数；
 *      向后兼容旧的 resolveKind(adv, kind)。
 *   2) 图元（primitive）模型：把「画」出来的图形表示成一组白名单图元，
 *      再由 primitivesToSVG 重新生成为 SVG —— **永远不把外部字符串直接塞进 DOM**，
 *      所以粘贴 SVG / 上传文件都不可能有脚本注入。
 *   3) parseSVG：把用户粘贴的 SVG 解析成同一套图元（白名单过滤后重建）。
 *
 * ⚠️ 与 fit.js 同样的坑：这是「经典脚本」，顶层不能出现会和渲染层其它脚本
 *    撞名的 const/function。所以整体包在 IIFE 里，只往外挂一个 globalThis.OphAdv。
 */
(function () {
  const KINDS = ['kill', 'multi', 'death', 'assist', 'mvp'];

  // 可单独做进阶配置的「元素」注册表。
  // id 命名约定：mod.<模块> / ev.<播报> / custom.<下标> / shape.<下标>（后两者由设置界面动态列出）
  const ELEMENTS = [
    { id: 'mod.scoreboard', group: 'HUD 栏位', label: '顶部比分面板' },
    { id: 'mod.money',      group: 'HUD 栏位', label: '金钱' },
    { id: 'mod.vitals',     group: 'HUD 栏位', label: '血量 / 护甲' },
    { id: 'mod.ammo',       group: 'HUD 栏位', label: '弹药 / 连杀' },
    { id: 'mod.weaponList', group: 'HUD 栏位', label: '武器栏' },
    { id: 'mod.roster',     group: 'HUD 栏位', label: '名单面板' },
    { id: 'ev.kill',   group: '播报元素', label: '击杀' },
    { id: 'ev.multi',  group: '播报元素', label: '连杀' },
    { id: 'ev.death',  group: '播报元素', label: '阵亡' },
    { id: 'ev.assist', group: '播报元素', label: '助攻' },
    { id: 'ev.mvp',    group: '播报元素', label: 'MVP' },
  ];

  // 全局默认（与 config.js 的 DEFAULTS.adv.* 保持一致；这里再放一份是为了
  // 让本模块能独立被 selftest 断言，且当配置里缺字段时有兜底）
  const DEF_STYLE = {
    iconOn: true,              // 全局：默认是否显示图标（关掉 = 所有元素都不显示，可单独开回来）
    iconSide: 'left', iconGap: 10, iconSize: 1,
    weight: 700, letterSpacing: 0.06, italic: false,
    outlineOn: false, outlineWidth: 2, outlineColor: '#000000',
    curveOn: false, curveRadius: 160, curveArc: -120,
  };
  const DEF_TIMELINE = {
    inScale: 0.85, inDur: 120, inEase: 'backOut',
    pulseOn: false, pulseTo: 1.08, pulseDur: 450, pulseRepeat: 2,
    holdMs: 1500, outDur: 240,
  };
  const DEF_EFFECTS = {
    shakeOn: false, shakeAmp: 4, shakeDur: 180, shakeAxis: 'xy',
    rumbleOn: false, rumbleStrong: 0.5, rumbleWeak: 0.25, rumbleDur: 160,
  };

  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

  /** 把「全局默认 + 该元素覆盖」合并成一份可直接用的外观参数。 */
  function resolveStyle(adv, id) {
    const a = adv || {};
    const s = Object.assign({}, DEF_STYLE, a.style || {});
    const t = Object.assign({}, DEF_TIMELINE, a.timeline || {});
    const e = Object.assign({}, DEF_EFFECTS, a.effects || {});

    const els = (a.elements && typeof a.elements === 'object') ? a.elements : {};
    let k = els[id] || {};
    // 向后兼容：ev.<kind> 也可以从旧的 adv.kinds[kind] 读，新的 adv.elements 优先
    if (typeof id === 'string' && id.indexOf('ev.') === 0) {
      const legacy = (a.kinds && a.kinds[id.slice(3)]) || {};
      k = Object.assign({}, legacy, k);
    }

    // 用 `!== undefined` 而不是 `||`：false / 0 也是合法覆盖值
    const pick = (kk, v) => (kk === undefined || kk === null ? v : kk);
    const enabled = pick(k.enabled, pick(k.on, true)) !== false;

    // 图标总开关：元素自己的 iconOn 优先，其次看全局默认 adv.style.iconOn。
    // ⚠️ 这一条是被用户报过的 bug：以前只有 icon / iconRef 两个「有值」来源，
    //    想「关掉图标」根本无从表达 —— 清空 emoji 只会回落旧的 kinds emoji，
    //    全局默认也没有图标开关。所以需要一个能压过一切的「停用」语义。
    const iconOn = pick(k.iconOn, s.iconOn !== false) !== false;

    return {
      id: id || '',
      kind: (typeof id === 'string' && id.indexOf('ev.') === 0) ? id.slice(3) : (id || ''),
      enabled,
      iconOn,
      icon: (iconOn && typeof k.icon === 'string') ? k.icon : '',
      iconRef: (iconOn && typeof k.iconRef === 'string') ? k.iconRef : '',
      iconSide: pick(k.iconSide, s.iconSide),
      iconGap: num(pick(k.iconGap, s.iconGap), 10),
      iconSize: num(pick(k.iconSize, s.iconSize), 1),

      weight: num(pick(k.weight, s.weight), 700),
      letterSpacing: num(pick(k.letterSpacing, s.letterSpacing), 0.06),
      italic: pick(k.italic, s.italic) === true,
      outlineOn: pick(k.outlineOn, s.outlineOn) === true,
      outlineWidth: num(pick(k.outlineWidth, s.outlineWidth), 2),
      outlineColor: pick(k.outlineColor, s.outlineColor) || '#000000',

      curveOn: pick(k.curveOn, s.curveOn) === true,
      curveRadius: num(pick(k.curveRadius, s.curveRadius), 160),
      curveArc: num(pick(k.curveArc, s.curveArc), -120),

      inScale: num(pick(k.inScale, t.inScale), 0.85),
      inDur: num(pick(k.inDur, t.inDur), 120),
      inEase: pick(k.inEase, t.inEase) || 'backOut',
      pulseOn: pick(k.pulseOn, t.pulseOn) === true,
      pulseTo: num(pick(k.pulseTo, t.pulseTo), 1.08),
      pulseDur: num(pick(k.pulseDur, t.pulseDur), 450),
      pulseRepeat: num(pick(k.pulseRepeat, t.pulseRepeat), 2),
      holdMs: num(pick(k.holdMs, t.holdMs), 1500),
      outDur: num(pick(k.outDur, t.outDur), 240),

      shakeOn: pick(k.shakeOn, e.shakeOn) === true,
      shakeAmp: num(pick(k.shakeAmp, e.shakeAmp), 4),
      shakeDur: num(pick(k.shakeDur, e.shakeDur), 180),
      shakeAxis: pick(k.shakeAxis, e.shakeAxis) || 'xy',
      rumbleOn: pick(k.rumbleOn, e.rumbleOn) === true,
      rumbleStrong: num(pick(k.rumbleStrong, e.rumbleStrong), 0.5),
      rumbleWeak: num(pick(k.rumbleWeak, e.rumbleWeak), 0.25),
      rumbleDur: num(pick(k.rumbleDur, e.rumbleDur), 160),
    };
  }

  /** 旧签名：resolveKind(adv, 'kill') === resolveStyle(adv, 'ev.kill') */
  function resolveKind(adv, kind) {
    return resolveStyle(adv, 'ev.' + String(kind || ''));
  }

  /** 缓动名 → CSS/WAAPI 缓动值。backOut 是回弹入场，观感更"跳"。 */
  function easingOf(name) {
    switch (name) {
      case 'backOut':  return 'cubic-bezier(0.34, 1.56, 0.64, 1)';
      case 'easeOut':  return 'ease-out';
      case 'easeIn':   return 'ease-in';
      case 'easeInOut':return 'ease-in-out';
      case 'linear':   return 'linear';
      default:         return 'ease-out';
    }
  }

  // ============================================================
  // 弯字（SVG textPath）
  // ============================================================

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /**
   * 把文字排成一段圆弧路径。
   * @returns {{d:string, w:number, h:number, straight:boolean}}
   */
  function curvePath(o) {
    let R = num(o && o.radius, 160);
    R = Math.max(20, Math.min(4000, R));
    let arc = num(o && o.arc, -120);
    if (Math.abs(arc) > 320) arc = arc < 0 ? -320 : 320;

    const h = Math.abs(arc) * Math.PI / 360;   // 半张角的弧度
    if (h < 0.02) {                            // 张角太小 → 当直线处理
      return { d: 'M 0 0 L 1 0', w: 1, h: 1, straight: true };
    }
    const dir = arc >= 0 ? 1 : -1;             // 正 = 拱形(中间高)，负 = 谷形(中间低)

    const N = 24;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const phi = -h + (2 * h) * (i / N);
      const x = R * Math.sin(phi);
      const y = dir * (R - R * Math.cos(phi));
      pts.push([x, y]);
    }
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    for (const [x, y] of pts) {
      if (x < xmin) xmin = x; if (x > xmax) xmax = x;
      if (y < ymin) ymin = y; if (y > ymax) ymax = y;
    }
    const w = xmax - xmin;
    const hh = ymax - ymin;
    const d = pts.map(([x, y], i) =>
      `${i === 0 ? 'M' : 'L'} ${(x - xmin).toFixed(2)} ${(y - ymin).toFixed(2)}`).join(' ');
    return { d, w, h: hh, straight: false };
  }

  /** 生成沿圆弧排字的 SVG 片段（用 <textPath>）。 */
  function buildCurveSVG(text, r, id) {
    const { d, w, h } = curvePath({ radius: r.curveRadius, arc: r.curveArc });
    const fs = Math.max(8, num(r.fontSize, 30));
    const weight = num(r.weight, 700);
    const ls = num(r.letterSpacing, 0.06);
    const fill = esc(sanitizeColor(r.color) || '#FFFFFF');
    const ol = r.outlineOn
      ? ` stroke="${esc(sanitizeColor(r.outlineColor) || '#000000')}" stroke-width="${num(r.outlineWidth, 2)}" paint-order="stroke"`
      : '';
    const W = w.toFixed(2);
    const H = h.toFixed(2);
    return `<svg class="ev-curve" viewBox="0 0 ${W} ${H}"`
      + ` style="width:calc(${W}px * var(--scale, 1));height:calc(${H}px * var(--scale, 1))"`
      + ` aria-hidden="true">`
      + `<path id="${esc(id)}" d="${d}" fill="none" stroke="none"/>`
      + `<text font-size="${fs}" font-weight="${weight}" letter-spacing="${(ls).toFixed(3)}em"`
      + ` fill="${fill}"${ol}>`
      + `<textPath href="#${esc(id)}" startOffset="50%" text-anchor="middle">${esc(text)}</textPath>`
      + `</text></svg>`;
  }

  // ============================================================
  // 图元（primitive）模型 —— 「画图」与「粘贴 SVG」共用的一套中间表示
  // ============================================================

  /**
   * 颜色白名单：只放行安全的 CSS 颜色写法，其余一律丢弃（防注入）。
   * 危险写法都带括号（url()/expression()），所以「纯字母单词」可以整体放行，
   * 这样 CSS 命名色（steelblue 之类）也不会被误杀。
   */
  function sanitizeColor(v) {
    if (typeof v !== 'string') return '';
    const s = v.trim();
    if (!s) return '';
    if (/^[a-zA-Z]+$/.test(s)) return s;                     // 命名色 / none / transparent
    if (/^#[0-9a-f]{3,8}$/i.test(s)) return s;               // 十六进制
    if (/^(rgb|rgba|hsl|hsla)\(\s*[-0-9.,%\s/]+\)$/i.test(s)) return s;
    return '';
  }

  const f = (v, d) => {
    const n = Number(v);
    return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : String(d == null ? 0 : d);
  };
  const clamp01 = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(Math.max(0, Math.min(1, n)) * 100) / 100 : 1;
  };

  /** 公共描边/填充属性 */
  function paintAttrs(p, o) {
    const out = [];
    const fill = sanitizeColor(p.fill);
    const stroke = sanitizeColor(p.stroke);
    if (fill) out.push(`fill="${esc(fill)}"`);
    else if (o && o.forceFill) out.push('fill="none"');
    if (stroke) out.push(`stroke="${esc(stroke)}"`);
    if (stroke && p.strokeWidth != null) out.push(`stroke-width="${f(p.strokeWidth, 1)}"`);
    if (p.strokeLinecap && /^(butt|round|square)$/.test(p.strokeLinecap)) out.push(`stroke-linecap="${p.strokeLinecap}"`);
    if (p.strokeLinejoin && /^(miter|round|bevel)$/.test(p.strokeLinejoin)) out.push(`stroke-linejoin="${p.strokeLinejoin}"`);
    if (p.dash && /^[0-9.,\s]+$/.test(String(p.dash))) out.push(`stroke-dasharray="${esc(String(p.dash).replace(/[^0-9.,\s]/g, ''))}"`);
    if (p.opacity != null && Number(p.opacity) < 1) out.push(`opacity="${clamp01(p.opacity)}"`);
    return out.join(' ');
  }

  function pts(points) {
    if (!Array.isArray(points)) return '';
    const arr = points
      .filter((pt) => Array.isArray(pt) && pt.length >= 2)
      .map((pt) => `${f(pt[0], 0)},${f(pt[1], 0)}`);
    return arr.join(' ');
  }

  /** 单个图元 → SVG 片段。文本走 resolveText 做变量插值，再做 XML 转义。 */
  function primitiveSVG(p, resolveText) {
    if (!p || typeof p !== 'object') return '';
    const rt = typeof resolveText === 'function' ? resolveText : (t) => t;
    switch (p.type) {
      case 'rect':
        return `<rect x="${f(p.x, 0)}" y="${f(p.y, 0)}" width="${f(p.w, 0)}" height="${f(p.h, 0)}"`
          + (p.rx ? ` rx="${f(p.rx, 0)}"` : '') + ' ' + paintAttrs(p) + '/>';
      case 'ellipse':
        return `<ellipse cx="${f(p.cx, 0)}" cy="${f(p.cy, 0)}" rx="${f(p.rx, 0)}" ry="${f(p.ry, 0)}" `
          + paintAttrs(p) + '/>';
      case 'line':
        return `<line x1="${f(p.x1, 0)}" y1="${f(p.y1, 0)}" x2="${f(p.x2, 0)}" y2="${f(p.y2, 0)}" `
          + paintAttrs(p, { forceFill: true }) + '/>';
      case 'polyline':
      case 'polygon':
        return `<${p.type} points="${esc(pts(p.points))}" ${paintAttrs(p)}/>`;
      case 'path': {
        const d = safePathD(p.d);
        if (!d) return '';
        return `<path d="${esc(d)}" ${paintAttrs(p)}/>`;
      }
      case 'text': {
        const txt = String(rt(p.text == null ? '' : p.text));
        const anchor = /^(start|middle|end)$/.test(p.anchor) ? p.anchor : 'start';
        const base = /^(auto|middle|hanging|alphabetic|ideographic|central|mathematical)$/.test(p.baseline) ? p.baseline : '';
        return `<text x="${f(p.x, 0)}" y="${f(p.y, 0)}"`
          + ` font-size="${f(p.fontSize, 24)}"`
          + (p.weight ? ` font-weight="${f(p.weight, 400)}"` : '')
          + (p.fontFamily ? ` font-family="${esc(String(p.fontFamily).replace(/["'<>]/g, ''))}"` : '')
          + ` text-anchor="${anchor}"`
          + (base ? ` dominant-baseline="${base}"` : '')
          + ` fill="${esc(sanitizeColor(p.fill) || '#FFFFFF')}"`
          + (p.stroke ? ` stroke="${esc(sanitizeColor(p.stroke))}" stroke-width="${f(p.strokeWidth, 1)}" paint-order="stroke"` : '')
          + (p.italic ? ' font-style="italic"' : '')
          + (p.letterSpacing != null ? ` letter-spacing="${f(p.letterSpacing, 0)}"` : '')
          + (p.opacity != null && Number(p.opacity) < 1 ? ` opacity="${clamp01(p.opacity)}"` : '')
          + `>${esc(txt)}</text>`;
      }
      default:
        return '';
    }
  }

  /** 一组图元 → SVG 片段（不含外层 <svg>）。 */
  function primitivesToSVG(items, opts) {
    const o = opts || {};
    const list = Array.isArray(items) ? items : [];
    return list.map((p) => primitiveSVG(p, o.resolveText)).join('');
  }

  /** 形状/图标 → 完整 <svg>（自绘重建，绝不透传外部标记）。 */
  function shapeToSVG(shape, opts) {
    const o = opts || {};
    const w = Math.max(1, num(shape && shape.w, 100));
    const h = Math.max(1, num(shape && shape.h, 100));
    const body = primitivesToSVG(shape && shape.items, { resolveText: o.resolveText });
    const cls = o.cls ? ` class="${esc(o.cls)}"` : '';
    return `<svg${cls} viewBox="0 0 ${f(w, 1)} ${f(h, 1)}"`
      + ` xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
  }

  // ---- parseSVG：把用户给的 SVG 解析成白名单图元（重建用）----

  /** path 的 d：只允许路径指令与数字，其余字符剔除。 */
  function safePathD(d) {
    if (typeof d !== 'string') return '';
    const s = d.replace(/[^MmLlHhVvCcSsQqTtAaZz0-9.,\-\s]/g, '').trim();
    if (!s) return '';
    if (!/^[Mm]/.test(s)) return '';   // 必须以 moveto 开头，否则丢弃
    if (s.length > 4000) return s.slice(0, 4000);
    return s;
  }

  function parseAttrs(str) {
    const o = {};
    const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    let m;
    while ((m = re.exec(str || ''))) o[m[1].toLowerCase()] = (m[3] != null ? m[3] : (m[4] != null ? m[4] : m[5])) || '';
    return o;
  }

  function parsePoints(v) {
    if (typeof v !== 'string') return [];
    const nums = v.trim().split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
    const out = [];
    for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
    return out;
  }

  const norm = (a) => String(a == null ? '' : a).toLowerCase();

  function tagToPrimitive(tag, a) {
    const common = {
      fill: a.fill, stroke: a.stroke, opacity: a['opacity'],
      strokeWidth: a['stroke-width'] != null ? Number(a['stroke-width']) : undefined,
    };
    switch (tag) {
      case 'rect':
        return Object.assign({ type: 'rect', x: Number(a.x) || 0, y: Number(a.y) || 0,
          w: Number(a.width) || 0, h: Number(a.height) || 0, rx: Number(a.rx) || 0 }, common);
      case 'circle': {
        const r = Number(a.r) || 0;
        return Object.assign({ type: 'ellipse', cx: Number(a.cx) || 0, cy: Number(a.cy) || 0, rx: r, ry: r }, common);
      }
      case 'ellipse':
        return Object.assign({ type: 'ellipse', cx: Number(a.cx) || 0, cy: Number(a.cy) || 0,
          rx: Number(a.rx) || 0, ry: Number(a.ry) || 0 }, common);
      case 'line':
        return Object.assign({ type: 'line', x1: Number(a.x1) || 0, y1: Number(a.y1) || 0,
          x2: Number(a.x2) || 0, y2: Number(a.y2) || 0,
          strokeLinecap: norm(a['stroke-linecap']) || undefined }, common);
      case 'polyline':
      case 'polygon': {
        const points = parsePoints(a.points);
        if (points.length < 2) return null;
        return Object.assign({ type: tag, points }, common);
      }
      case 'path': {
        const d = safePathD(a.d);
        if (!d) return null;
        return Object.assign({ type: 'path', d }, common);
      }
      default:
        return null;
    }
  }

  /**
   * 解析粘贴进来的 SVG → { w, h, items }。
   * 只认白名单标签与属性，解析结果会被「自绘重建」，因此脚本/事件/外链一律进不来。
   */
  function parseSVG(raw) {
    const out = { w: 100, h: 100, items: [] };
    if (typeof raw !== 'string' || !raw.trim()) return out;

    let s = raw
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, '')
      .replace(/<\s*defs[\s\S]*?<\s*\/\s*defs\s*>/gi, '')
      .replace(/<\s*(foreignObject|style|metadata|title|desc|image|use|animate|set)[\s\S]*?(?:<\s*\/\s*\1\s*>|\/>)/gi, '');

    const vb = s.match(/viewBox\s*=\s*["']([^"']+)["']/i);
    if (vb) {
      const parts = vb[1].trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4) {
        if (Number.isFinite(parts[2]) && parts[2] > 0) out.w = parts[2];
        if (Number.isFinite(parts[3]) && parts[3] > 0) out.h = parts[3];
      }
    } else {
      const w = s.match(/\bwidth\s*=\s*["']?\s*([\d.]+)/i);
      const h = s.match(/\bheight\s*=\s*["']?\s*([\d.]+)/i);
      if (w) out.w = Number(w[1]) || out.w;
      if (h) out.h = Number(h[1]) || out.h;
    }

    // <text> 单独抓（含内部文字）
    s = s.replace(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi, (all, attrs, inner) => {
      const a = parseAttrs(attrs);
      const t = String(inner)
        .replace(/<[^>]*>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'").replace(/&amp;/g, '&')
        .trim();
      if (t) {
        out.items.push({
          type: 'text', x: Number(a.x) || 0, y: Number(a.y) || 0, text: t,
          fontSize: Number(a['font-size']) || 24,
          weight: a['font-weight'] ? Number(a['font-weight']) || undefined : undefined,
          anchor: norm(a['text-anchor']) || undefined,
          baseline: norm(a['dominant-baseline']) || undefined,
          fill: a.fill || '#FFFFFF',
          italic: norm(a['font-style']) === 'italic' || undefined,
        });
      }
      return '';
    });

    const re = /<\s*([a-zA-Z][\w:-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*?)\/?\s*>/g;
    let m;
    while ((m = re.exec(s))) {
      const tag = m[1].toLowerCase();
      if (tag === 'svg' || tag === 'g' || tag === 'svg:svg') continue;
      const it = tagToPrimitive(tag, parseAttrs(m[2]));
      if (it) out.items.push(it);
    }
    return out;
  }

  // ---- HUD 字体预设 ----
  /**
   * 内置字体栈。
   *
   * ⚠️ 全部只用「系统自带字体」，一个网络字体也不引 ——
   *    HUD 是叠在游戏画面上的，绝不能为了显示一行字去等字体下载。
   *
   * ⚠️ 每套都写成「主字体 → 中文兜底 → 通用族」三段。
   *    只写一个西文字体名（比如 Impact）的话，遇到「匕首」这种中文会掉到
   *    浏览器默认衬线体上，同一行里两种字型，非常难看。
   */
  const FONTS = [
    { id: 'default', label: '军事窄体（默认）',
      stack: '"Bahnschrift", "DIN Alternate", "Segoe UI Variable Display", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
      note: 'Win10 起自带。数字瘦高，最接近记分牌' },
    { id: 'yahei', label: '微软雅黑',
      stack: '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif',
      note: '中文最稳的一套，小字号也清楚' },
    { id: 'heiti', label: '黑体',
      stack: '"SimHei", "Heiti SC", "Microsoft YaHei", sans-serif',
      note: '笔画更粗更方正，远距离看得清' },
    { id: 'songti', label: '宋体 / 衬线',
      stack: '"SimSun", "Songti SC", "Times New Roman", serif',
      note: '老式印刷感，配怀旧底栏正好' },
    { id: 'kaiti', label: '楷体',
      stack: '"KaiTi", "Kaiti SC", "STKaiti", "SimSun", serif',
      note: '手写味，中文书法感' },
    { id: 'fangsong', label: '仿宋',
      stack: '"FangSong", "STFangsong", "SimSun", serif',
      note: '公文 / 胶片味，笔画偏细' },
    { id: 'youyuan', label: '幼圆',
      stack: '"YouYuan", "Yuanti SC", "Microsoft YaHei", sans-serif',
      note: '圆头笔画，观感轻松' },
    { id: 'mono', label: '等宽（终端感）',
      stack: '"Consolas", "Cascadia Mono", "SF Mono", "Courier New", monospace',
      note: '数字等宽，血量金钱跳动时不会左右晃' },
    { id: 'impact', label: '超粗（冲击力）',
      stack: '"Impact", "Arial Black", "Franklin Gothic Heavy", "Microsoft YaHei", sans-serif',
      note: '极粗，适合大号击杀播报' },
    { id: 'stencil', label: '窄体模板字',
      stack: '"Bahnschrift Condensed", "Bahnschrift SemiCondensed", "Arial Narrow", "Microsoft YaHei", sans-serif',
      note: '像军事喷涂模板，窄而硬' },
    { id: 'segoe', label: 'Segoe UI（系统现代）',
      stack: '"Segoe UI Variable Display", "Segoe UI", "Microsoft YaHei UI", system-ui, sans-serif',
      note: 'Windows 界面同款，最不容易出错' },
    { id: 'georgia', label: 'Georgia（西文衬线）',
      stack: '"Georgia", "Times New Roman", "SimSun", serif',
      note: '西文优雅，中文回落宋体' },
  ];

  const DEFAULT_FONT_ID = 'default';

  /**
   * 配置 → 可直接用的 CSS font-family。
   * 优先级：自定义 family（用户手填）> preset > 默认。
   *
   * 自定义放最高是有意的：老配置里 font.family 存的就是一整串字体栈，
   * 让它继续生效，用户才不会「升个版本字体就变了」。
   */
  function fontStack(font) {
    const f = font || {};
    const custom = typeof f.family === 'string' ? f.family.trim() : '';
    if (custom) return custom;
    const hit = FONTS.find((x) => x.id === f.preset);
    return (hit || FONTS[0]).stack;
  }

  // ---- 图标 ----

  /**
   * 图标条目 → 可直接插入的 DOM 片段描述。
   * kind：'text'（emoji/文字）/ 'draw'（图元）/ 'image'（dataURL）。
   */
  function iconSVG(icon, opts) {
    if (!icon || icon.kind !== 'draw') return '';
    return shapeToSVG(icon, Object.assign({ cls: 'icon-svg' }, opts || {}));
  }

  /** dataURL 校验：只放行图片，杜绝 data:text/html 之类 */
  function safeDataURL(v) {
    return (typeof v === 'string' && /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(v)) ? v : '';
  }

  const api = {
    KINDS, ELEMENTS,
    FONTS, DEFAULT_FONT_ID, fontStack,
    DEF_STYLE, DEF_TIMELINE, DEF_EFFECTS,
    resolveStyle, resolveKind, easingOf,
    curvePath, buildCurveSVG, esc,
    sanitizeColor, sanitizePath: safePathD, safeDataURL,
    primitiveSVG, primitivesToSVG, shapeToSVG,
    parseSVG, iconSVG,
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof globalThis === 'object') globalThis.OphAdv = api;
})();
