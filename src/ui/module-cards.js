'use strict';

/**
 * OphModuleCards · 通用库
 *
 * 由 src/settings/settings.js（重构前巨石）机械拆分而来，代码原样保留。
 * 依赖通过头部解构显式声明 —— 不依赖加载顺序之外的东西，也不往全局挂散名。
 */
;(function () {
  const { fieldRow, newCard } = globalThis.OphLayout;
  const { colorControl, numControl, selectControl, switchControl, textControl } = globalThis.OphControls;
  const { el } = globalThis.OphDOM;
  const { state } = globalThis.OphCtx;
  const { markDirty, rebuild, schedulePreview, toast } = globalThis.OphApp;
  const { getPath, setPath } = globalThis.OphPath;
  const { clampNum } = globalThis.OphSchema;


/** 按 field 定义生成一个普通字段卡片（font / safezone / 显示器 等） */
function buildPlainField(f) {
  const card = newCard(null, null);
  let ctl = null;
  if (f.type === 'text') ctl = textControl(f);
  else if (f.type === 'num') ctl = numControl(f);
  else if (f.type === 'switch') ctl = switchControl(f);
  else if (f.type === 'select') ctl = selectControl(f);
  else if (f.type === 'color') ctl = colorControl(f);
  if (!ctl) return el('div');
  card.body.append(fieldRow(f.label, ctl, f.note));
  return card.card;
}
function transformCard(mod) {
  const p = `modules.${mod.key}`;
  const card = el('div', 'card');

  const head = el('div', 'card-head');
  const titleBox = el('div');
  titleBox.append(el('div', 'card-title', '位置 / 大小 / 旋转'));
  titleBox.append(el('div', 'card-hint',
    '位移是屏幕像素，不随缩放变化。「整体大小」同时改横纵；横向和纵向填不同值就是非等比拉伸，'
    + '再配合旋转角度能做出伪 3D 的倾斜感'));
  head.append(titleBox);

  const resetBtn = el('button', 'mini', '重置本模块');
  resetBtn.addEventListener('click', () => {
    const d = state.defaults.modules[mod.key];
    Object.assign(state.cfg.modules[mod.key], JSON.parse(JSON.stringify(d)));
    rebuild();
    markDirty();
    schedulePreview();
    toast('已重置「' + mod.name + '」', 'ok');
  });
  const tools = el('div', 'head-tools');
  tools.append(resetBtn);
  head.append(tools);
  card.append(head);

  const body = el('div', 'card-body');

  const sx = numControl({ path: `${p}.scaleX`, min: 0.3, max: 3, step: 0.01, unit: '×' });
  const sy = numControl({ path: `${p}.scaleY`, min: 0.3, max: 3, step: 0.01, unit: '×' });

  body.append(fieldRow('整体大小', uniformSizeControl(`${p}.scaleX`, sx, sy)));
  body.append(fieldRow('横向缩放', sx));
  body.append(fieldRow('纵向缩放', sy));
  body.append(fieldRow('旋转角度', numControl({ path: `${p}.rotate`, min: -180, max: 180, step: 1, unit: '°' })));
  body.append(fieldRow('水平位移', numControl({ path: `${p}.offsetX`, min: -800, max: 800, step: 1, unit: 'px' })));
  body.append(fieldRow('垂直位移', numControl({ path: `${p}.offsetY`, min: -800, max: 800, step: 1, unit: 'px' })));

  card.append(body);
  return card;
}
/**
 * 「整体大小」：一个控件同时写 scaleX / scaleY。
 * 横向或纵向单独改动时，这里跟着显示横向的值（不对它俩做联动，只做回显）。
 */
function uniformSizeControl(scaleXPath, sx, sy) {
  const scaleYPath = scaleXPath.replace(/scaleX$/, 'scaleY');
  const wrap = el('div', 'num-wrap');

  const range = el('input');
  range.type = 'range';
  range.min = 0.3; range.max = 3; range.step = 0.01;

  const num = el('input', 'num');
  num.type = 'text';

  const read = () => {
    const v = Number(getPath(state.cfg, scaleXPath));
    return Number.isFinite(v) ? v : 1;
  };

  const setCtl = (ctl, v) => {
    ctl.querySelector('input[type="range"]').value = v;
    ctl.querySelector('.num').value = String(v);
  };

  const apply = (v) => {
    const n = clampNum(v, { min: 0.3, max: 3 });
    range.value = n;
    num.value = String(n);
    setPath(state.cfg, scaleXPath, n);
    setPath(state.cfg, scaleYPath, n);
    setCtl(sx, n);
    setCtl(sy, n);
    markDirty();
    schedulePreview();
  };

  const mirror = () => { const v = read(); range.value = v; num.value = String(v); };

  range.value = read();
  num.value = String(read());

  range.addEventListener('input', () => apply(range.value));
  num.addEventListener('change', () => apply(num.value));
  num.addEventListener('keydown', (e) => { if (e.key === 'Enter') { apply(num.value); num.blur(); } });

  sx.querySelector('input[type="range"]').addEventListener('input', mirror);
  sx.querySelector('.num').addEventListener('change', mirror);

  wrap.append(range, num, el('span', 'unit', '×'));
  return wrap;
}
/** 每块 HUD 的整体不透明度与辉光 */
function effectsCard(mod) {
  const p = `modules.${mod.key}`;
  const { card, body } = newCard('不透明度与辉光',
    '不透明度影响整个模块（和底栏浓度是两回事）；辉光会给模块里的图形和文字加一圈外发光');

  body.append(fieldRow('整体不透明度', numControl({ path: `${p}.opacity`, min: 0, max: 1, step: 0.01 })));
  body.append(fieldRow('辉光强度', numControl({ path: `${p}.glow`, min: 0, max: 1, step: 0.01 }),
    '设 0 = 关闭。强度越大发光范围越宽、越亮。'));
  body.append(fieldRow('辉光颜色', colorControl({ path: `${p}.glowColor`, fallback: '#FFFFFF' })));

  return card;
}

  globalThis.OphModuleCards = Object.assign(globalThis.OphModuleCards || {}, {
    buildPlainField, transformCard, uniformSizeControl, effectsCard
  });
})();
