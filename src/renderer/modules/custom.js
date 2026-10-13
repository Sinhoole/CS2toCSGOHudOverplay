'use strict';

/**
 * custom · 自定义文本元素 + 画图形状
 *
 * 由 src/renderer/hud.js（重构前巨石，1665 行）机械拆分而来，正文逐字保留。
 * 共享可变状态走 C（globalThis.OphHudCtx），纯函数走 K（globalThis.OphHudKit）。
 * 想加/删这块功能：改 src/renderer/hud-manifest.js 里的一行即可。
 */
;(function () {
  const C = globalThis.OphHudCtx;
  const K = globalThis.OphHudKit;

  /** 每帧渲染：快照到达时由宿主分发调用 */
  function render(s) {
  // ---- 用户自定义文本元素 ----
  renderCustom(s);

  // ---- 用户画图生成的形状元素（只刷新里面的 {变量} 文字）----
  renderShapes(s);
  }

/**
 * 按配置重建自定义文本元素的 DOM。
 * 只在配置变化时调用；逐帧渲染只改 textContent，不重建节点。
 */
function buildCustom(list) {
  const layer = document.getElementById('customLayer');
  if (!layer) return;

  layer.textContent = '';
  C.customEls = [];

  (Array.isArray(list) ? list : []).forEach((item, srcIndex) => {
    if (!item || typeof item !== 'object') return;

    const anchor = K.CUSTOM_ANCHORS.indexOf(item.anchor) >= 0 ? item.anchor : 'bl';
    const align = K.CUSTOM_ALIGNS.indexOf(item.align) >= 0 ? item.align : 'left';

    const el = document.createElement('div');
    el.className = 'custom-item a-' + anchor + ' al-' + align
      + (item.enabled === false ? ' off' : '')
      + (item.bar === true ? ' has-bar' : '')
      + (item.outline === false ? ' thin' : '');

    el.style.setProperty('--ci-x', `${Number(item.offsetX) || 0}px`);
    el.style.setProperty('--ci-y', `${Number(item.offsetY) || 0}px`);
    el.style.setProperty('--ci-scale', String(Number(item.scale) || 1));
    el.style.setProperty('--ci-rot', `${Number(item.rotate) || 0}deg`);
    el.style.setProperty('--ci-size', `${Number(item.fontSize) || 28}px`);
    el.style.setProperty('--ci-color', item.color || '#FFFFFF');

    if (item.barColor) {
      const rgb = K.toRgbTriplet(item.barColor);
      if (rgb) el.style.setProperty('--ci-bar', rgb);
    }
    if (item.barAlpha != null) el.style.setProperty('--ci-bar-a', String(Number(item.barAlpha)));

    // 每元素进阶：只有该元素显式写了覆盖、且没被「不用」关掉时才生效。
    // 有图标时把文字放进内层 span，逐帧刷新只改内层文字，不会把图标抹掉。
    let txtNode = null;
    if (C.advCfg && C.advCfg.enabled && C.advCfg.elements
        && C.advCfg.elements['custom.' + srcIndex] && C.OPH_ADV) {
      const R = C.OPH_ADV.resolveStyle(C.advCfg, 'custom.' + srcIndex);
      if (R.enabled) {
        el.classList.add('ci-adv');
        el.style.setProperty('--ci-weight', String(R.weight));
        el.style.setProperty('--ci-ls', `${R.letterSpacing}em`);
        el.style.setProperty('--ci-gap', `${R.iconGap}px`);
        el.style.setProperty('--ci-icon-size', String(R.iconSize));
        if (R.italic) el.classList.add('ci-italic');
        if (R.outlineOn) {
          el.classList.add('ci-outline');
          el.style.setProperty('--ci-ol-w', `${R.outlineWidth}px`);
          el.style.setProperty('--ci-ol-c', R.outlineColor);
        }
        const ico = K.makeIconNode(R.icon, R.iconRef);
        if (ico) {
          ico.classList.add('ci-ico');
          if (R.iconSide === 'right') el.classList.add('ci-ico-right');
          el.appendChild(ico);
        }
        txtNode = document.createElement('span');
        txtNode.className = 'ci-txt';
        el.appendChild(txtNode);
      }
    }

    layer.appendChild(el);
    // srcIndex 记住它在 config.custom 里的下标，applyEffects 要靠它取辉光/不透明度
    C.customEls.push({ el, srcIndex, tpl: String(item.text == null ? '' : item.text), last: null, txtNode });
  });
}

/** 每帧刷新自定义文本的内容 */
function renderCustom(s) {
  if (!C.customEls.length) return;
  const helpers = { weaponLabel: K.weaponLabel, textMap: C.textMap };
  for (const item of C.customEls) {
    const text = K.fillTemplate(item.tpl, s, helpers);
    if (text !== item.last) {
      // 有进阶图标时文字在内层 span，不能整块 textContent 覆盖（会抹掉图标）
      if (item.txtNode) item.txtNode.textContent = text;
      else item.el.textContent = text;
      item.last = text;
    }
  }
}

/**
 * 按配置重建形状元素的 DOM。只在配置变化时调用；逐帧由 renderShapes 刷新其中的文字。
 * 文本图元支持 {变量} 插值，所以这里记下原始模板与对应的 <text> 节点，逐帧只改文字。
 */
function buildShapes(list) {
  const layer = document.getElementById('shapeLayer');
  if (!layer) return;

  layer.textContent = '';
  C.shapeEls = [];

  (Array.isArray(list) ? list : []).forEach((item, srcIndex) => {
    if (!item || typeof item !== 'object') return;

    const sc = Number(item.scale) || 1;
    const w = Math.max(1, Number(item.w) || 120);
    const h = Math.max(1, Number(item.h) || 60);

    const el = document.createElement('div');
    el.className = 'shape-item' + (item.enabled === false ? ' off' : '');
    K.applyAnchor(el, item.anchor, Number(item.offsetX) || 0, Number(item.offsetY) || 0,
      sc, Number(item.rotate) || 0);
    el.style.width = `calc(${w}px * var(--scale))`;
    el.style.height = `calc(${h}px * var(--scale))`;

    // 每元素进阶：只有该元素显式写了覆盖、且没被关掉才生效
    if (C.advCfg && C.advCfg.enabled && C.advCfg.elements && C.advCfg.elements['shape.' + srcIndex] && C.OPH_ADV) {
      const R = C.OPH_ADV.resolveStyle(C.advCfg, 'shape.' + srcIndex);
      if (R.enabled) {
        el.style.setProperty('--si-weight', String(R.weight));
        el.style.setProperty('--si-ls', `${R.letterSpacing}em`);
        if (R.italic) el.classList.add('si-italic');
        if (R.outlineOn) {
          el.classList.add('si-outline');
          el.style.setProperty('--si-ol-w', `${R.outlineWidth}px`);
          el.style.setProperty('--si-ol-c', R.outlineColor);
        }
      }
    }

    if (!C.OPH_ADV || typeof C.OPH_ADV.shapeToSVG !== 'function') return;
    const svg = C.OPH_ADV.shapeToSVG({ w, h, items: item.items }, {
      cls: 'shape-svg',
      resolveText: (t) => K.fillTemplate(t, C.pending || {}, { weaponLabel: K.weaponLabel, textMap: C.textMap }),
    });
    el.insertAdjacentHTML('beforeend', svg);

    // 文本图元：按顺序对应 <text> 节点（一个形状只有一张 svg，节点顺序与数组顺序一致）
    const raws = (Array.isArray(item.items) ? item.items : [])
      .filter((p) => p && p.type === 'text')
      .map((p) => String(p.text == null ? '' : p.text));
    const txNodes = Array.from(el.querySelectorAll('text'));

    layer.appendChild(el);
    C.shapeEls.push({ el, srcIndex, raws, nodes: txNodes });
  });
}

/** 每帧刷新形状里的文字（只有含 {变量} 的文本才会真的变） */
function renderShapes(s) {
  if (!C.shapeEls.length) return;
  const helpers = { weaponLabel: K.weaponLabel, textMap: C.textMap };
  for (const sh of C.shapeEls) {
    for (let i = 0; i < sh.raws.length; i++) {
      const node = sh.nodes[i];
      if (!node) continue;
      const t = K.fillTemplate(sh.raws[i], s, helpers);
      if (node.textContent !== t) node.textContent = t;
    }
  }
}

  globalThis.OphHud.register({
    id: 'custom',
    render,
    apply(cfg) {
      buildCustom(cfg.custom || []);
      buildShapes(cfg.shapes || []);
    },
  });
})();
