'use strict';

/**
 * 进阶元素 · 设置页模块
 *
 * 由 src/settings/settings.js（重构前巨石）机械拆分而来，代码原样保留。
 * 依赖通过头部解构显式声明 —— 不依赖加载顺序之外的东西，也不往全局挂散名。
 */
;(function () {
  const { el } = globalThis.OphDOM;
  const { advMod } = globalThis.OphAdvBridge;
  const { getPath } = globalThis.OphPath;
  const { commit, state } = globalThis.OphCtx;
  const { EASE_OPTIONS, clearPath, elementList, hasPath, ovColor, ovNum, ovSelect, ovSwitch } = globalThis.OphAdvCore;
  const { fieldRow, sectionHead } = globalThis.OphLayout;
  const { markDirty, rebuild, schedulePreview, toast } = globalThis.OphApp;


/** 图标小预览（图标库条目 → 一个 span） */
function iconPreview(ic) {
  const box = el('span', 'icon-prev-box');
  if (!ic) { box.textContent = '—'; return box; }
  if (ic.kind === 'text') { box.textContent = ic.text || ''; return box; }
  if (ic.kind === 'image') {
    const A = advMod();
    const url = A.safeDataURL ? A.safeDataURL(ic.data) : '';
    if (url) { const img = document.createElement('img'); img.src = url; img.alt = ''; box.append(img); }
    return box;
  }
  const A = advMod();
  if (typeof A.iconSVG === 'function') box.insertAdjacentHTML('beforeend', A.iconSVG(ic, {}));
  return box;
}
/**
 * 图标选择器：停用 / 继承全局 / 内联 emoji / 引用图标库。
 *
 * 「无图标（停用）」= 写 iconOn:false —— 这是唯一能压过「全局 / 旧版默认 emoji」的开关，
 * 没有它就没法真正关掉某个播报的图标（用户报过的 bug）。
 */
function ovIcon(basePath) {
  const iconPath = basePath + '.icon';
  const refPath = basePath + '.iconRef';
  const offPath = basePath + '.iconOn';
  const wrap = el('div', 'icon-pick');

  const sel = el('select', 'sel');
  const emoji = el('input', 'txt');
  emoji.type = 'text';
  emoji.placeholder = '内联 emoji / 文字，例如 💀';
  emoji.style.flex = '0 0 150px';
  const prev = el('span', 'icon-prev');

  const modeOf = () => {
    if (getPath(state.cfg, offPath) === false) return 'none';
    return hasPath(refPath) ? 'lib' : (hasPath(iconPath) ? 'emoji' : '');
  };

  const fillSel = () => {
    sel.textContent = '';
    const opts = [['', '继承全局'], ['none', '⊘ 无图标（停用）'], ['emoji', '内联 emoji / 文字']];
    const lib = Array.isArray(state.cfg.icons) ? state.cfg.icons : [];
    for (const ic of lib) {
      const kindTag = ic.kind === 'draw' ? '矢量' : (ic.kind === 'image' ? '图片' : '文字');
      opts.push(['lib:' + ic.id, '图标库 · ' + (ic.name || ic.id) + '（' + kindTag + '）']);
    }
    const m = modeOf();
    const curV = m === 'lib' ? 'lib:' + getPath(state.cfg, refPath)
      : (m === 'emoji' ? 'emoji' : (m === 'none' ? 'none' : ''));
    for (const [v, l] of opts) {
      const o = el('option', null, l);
      o.value = v;
      if (v === curV) o.selected = true;
      sel.append(o);
    }
    // 图标库空的时候给一句明确的去处提示，不然只能干瞪眼（用户反馈过「选不出来」）
    if (!lib.length) {
      const o = el('option', null, '（图标库还是空的 · 先去「进阶 · 图标库」或「画图」建一个）');
      o.value = '__empty';
      o.disabled = true;
      sel.append(o);
    }
  };

  const refresh = () => {
    fillSel();
    emoji.value = String(getPath(state.cfg, iconPath) || '');
    emoji.disabled = modeOf() !== 'emoji';
    prev.textContent = '';
    prev.className = 'icon-prev';
    const m = modeOf();
    if (m === 'lib') {
      const ic = (state.cfg.icons || []).find((x) => x.id === getPath(state.cfg, refPath));
      if (ic) prev.append(iconPreview(ic));
      else { prev.append(el('span', 'note', '图标已被删除')); prev.classList.add('warn'); }
    } else if (m === 'emoji') {
      prev.textContent = String(getPath(state.cfg, iconPath) || '');
    } else if (m === 'none') {
      prev.append(el('span', 'note', '已停用'));
    } else {
      prev.append(el('span', 'note', '继承'));
    }
  };

  sel.addEventListener('change', () => {
    const v = sel.value;
    clearPath(iconPath);
    clearPath(refPath);
    clearPath(offPath);
    if (v === 'none') commit(offPath, false);
    else if (v === 'emoji') commit(iconPath, emoji.value || '🎯');
    else if (v.startsWith('lib:')) commit(refPath, v.slice(4));
    refresh();
  });

  emoji.addEventListener('change', () => {
    clearPath(refPath);
    clearPath(offPath);
    if (emoji.value) commit(iconPath, emoji.value);
    else clearPath(iconPath);
    refresh();
  });

  const row = el('div', 'row');
  row.append(sel, emoji, prev);
  wrap.append(row);
  refresh();
  return wrap;
}
/** 单个元素的进阶覆盖卡片 */
function elementCard(id, label) {
  const base = `adv.elements.${id}`;
  const isEv = /^ev\./.test(id);
  const isMod = /^mod\./.test(id);
  const isCustom = /^custom\./.test(id);
  const isShape = /^shape\./.test(id);
  const hasIcon = isEv || isCustom;      // 图标对「播报」和「自定义文本元素」有意义
  const hasTimeline = isEv;              // 入场缩放 / 脉冲 / 淡出节奏只对播报适用
  const hasCurve = isEv;                 // 弯字只对播报文字适用

  const card = el('div', 'card');
  const head = el('div', 'card-head');
  const box = el('div');
  box.append(el('div', 'card-title', label));
  box.append(el('div', 'card-hint', '元素 id：' + id + '　·　'
    + (isEv ? '图标 / 样式 / 弯字 / 时间轴 / 抖动震动 全套'
      : isCustom ? '图标 / 文字样式'
        : isShape ? '文字样式（形状由画图页编辑）'
          : '位置 / 缩放 / 不透明度 / 辉光请在「基础配置」对应模块里调')));
  head.append(box);
  card.append(head);

  const body = el('div', 'card-body');

  // HUD 栏位（mod.*）：进阶外观这一层对它们不适用，给一张指路卡而不是一堆不生效的控件
  if (isMod) {
    body.append(el('div', 'note',
      'HUD 栏位的外观直接在它自己的基础配置页里改：「位置 / 缩放 / 旋转」走位移卡，'
      + '「不透明度 / 辉光」走效果卡，「配色」走配色卡。这里不再重复一套，免得两处打架。'));
    card.append(body);
    return card;
  }

  body.append(fieldRow('使用进阶外观', ovSwitch(`${base}.enabled`, '使用', '不用')));

  if (hasIcon) {
    body.append(fieldRow('图标', ovIcon(base)));
    body.append(fieldRow('图标位置', ovSwitch(`${base}.iconSide`, '左侧', '右侧')));
    body.append(fieldRow('图标间距', ovNum(`${base}.iconGap`, { min: 0, max: 40, step: 1, unit: 'px', def: 10 })));
    body.append(fieldRow('图标大小', ovNum(`${base}.iconSize`, { min: 0.4, max: 2.5, step: 0.05, unit: '×', def: 1 })));
  }

  // 文字样式（所有元素通用）
  body.append(fieldRow('字重', ovNum(`${base}.weight`, { min: 300, max: 900, step: 100, def: 700 })));
  body.append(fieldRow('字距', ovNum(`${base}.letterSpacing`, { min: 0, max: 0.4, step: 0.01, unit: 'em', def: 0.06 })));
  body.append(fieldRow('斜体', ovSwitch(`${base}.italic`)));
  body.append(fieldRow('深色描边', ovSwitch(`${base}.outlineOn`)));
  body.append(fieldRow('描边宽度', ovNum(`${base}.outlineWidth`, { min: 1, max: 6, step: 0.5, unit: 'px', def: 2 })));
  body.append(fieldRow('描边颜色', ovColor(`${base}.outlineColor`, '#000000')));

  if (hasCurve) {
    body.append(fieldRow('文字弯曲', ovSwitch(`${base}.curveOn`)));
    body.append(fieldRow('弯曲半径', ovNum(`${base}.curveRadius`, { min: 40, max: 600, step: 10, unit: 'px', def: 160 })));
    body.append(fieldRow('弯曲张角', ovNum(`${base}.curveArc`, { min: -320, max: 320, step: 5, unit: '°', def: -120 })));
  }

  if (hasTimeline) {
    body.append(fieldRow('入场起始缩放', ovNum(`${base}.inScale`, { min: 0.3, max: 1.5, step: 0.01, unit: '×', def: 0.85 })));
    body.append(fieldRow('入场时长', ovNum(`${base}.inDur`, { min: 0, max: 800, step: 10, unit: 'ms', def: 120 })));
    body.append(fieldRow('入场缓动', ovSelect(`${base}.inEase`, EASE_OPTIONS, 'backOut')));
    body.append(fieldRow('停留脉冲', ovSwitch(`${base}.pulseOn`)));
    body.append(fieldRow('脉冲峰值', ovNum(`${base}.pulseTo`, { min: 1, max: 1.6, step: 0.01, unit: '×', def: 1.08 })));
    body.append(fieldRow('脉冲时长', ovNum(`${base}.pulseDur`, { min: 100, max: 2000, step: 20, unit: 'ms', def: 450 })));
    body.append(fieldRow('脉冲次数', ovNum(`${base}.pulseRepeat`, { min: 1, max: 20, step: 1, integer: true, def: 2 })));
    body.append(fieldRow('停留时长', ovNum(`${base}.holdMs`, { min: 200, max: 6000, step: 50, unit: 'ms', def: 1500 })));
    body.append(fieldRow('淡出时长', ovNum(`${base}.outDur`, { min: 0, max: 1200, step: 20, unit: 'ms', def: 240 })));
    body.append(fieldRow('HUD 抖动', ovSwitch(`${base}.shakeOn`)));
    body.append(fieldRow('抖动幅度', ovNum(`${base}.shakeAmp`, { min: 1, max: 20, step: 1, unit: 'px', def: 4 })));
    body.append(fieldRow('抖动时长', ovNum(`${base}.shakeDur`, { min: 60, max: 800, step: 10, unit: 'ms', def: 180 })));
    body.append(fieldRow('抖动方向', ovSelect(`${base}.shakeAxis`,
      [['xy', '水平 + 垂直'], ['x', '仅水平'], ['y', '仅垂直']], 'xy')));
    body.append(fieldRow('手柄震动', ovSwitch(`${base}.rumbleOn`)));
    body.append(fieldRow('震动强马达', ovNum(`${base}.rumbleStrong`, { min: 0, max: 1, step: 0.05, def: 0.5 })));
    body.append(fieldRow('震动时长', ovNum(`${base}.rumbleDur`, { min: 40, max: 1000, step: 20, unit: 'ms', def: 160 })));
  }

  card.append(body);
  return card;
}
function buildAdvElementsSection(sec) {
  const wrap = el('div', 'section');
  wrap.dataset.section = sec.id;
  wrap.append(sectionHead('进阶配置 · 每元素',
    '给单个元素单独配图标与样式，不必动全局默认。留「继承」的项就跟着「进阶 · 全局默认」走。'
    + '⚠️ 需要先在「进阶 · 全局默认」里打开总开关，这些覆盖才会生效。'));

  const list = elementList();
  if (!list.length) {
    wrap.append(el('div', 'empty-hint', '没有可配置的元素。'));
    return wrap;
  }

  let lastGroup = null;
  for (const e of list) {
    if (e.group !== lastGroup) {
      lastGroup = e.group;
      wrap.append(el('div', 'grp-head', e.group));
    }
    wrap.append(elementCard(e.id, e.label));
  }
  return wrap;
}
function ensureIcons() {
  if (!Array.isArray(state.cfg.icons)) state.cfg.icons = [];
}
function addIcon(ic) {
  ensureIcons();
  state.cfg.icons.push(ic);
  rebuild();
  markDirty();
  schedulePreview();
  toast('已加入图标库：可在「进阶 · 每元素」的图标选择器里引用', 'ok');
}

  // 自注册：上架与否只由 sections/manifest.js 决定，这里不写死顺序
  globalThis.OphSections.register({
    id: "adv-elements", ico: "adv", name: "进阶元素",
    group: "basic",
    build: buildAdvElementsSection,
  });
  // ⚠️ 未列入 manifest → 不会加载。重新上架：在 manifest 里加一行即可。

  globalThis.OphAdvElements = Object.assign(globalThis.OphAdvElements || {}, {
    iconPreview, ovIcon, elementCard, buildAdvElementsSection, ensureIcons, addIcon
  });
})();
