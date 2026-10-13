'use strict';

/**
 * OphControls · 通用库
 *
 * 由 src/settings/settings.js（重构前巨石）机械拆分而来，代码原样保留。
 * 依赖通过头部解构显式声明 —— 不依赖加载顺序之外的东西，也不往全局挂散名。
 */
;(function () {
  const { el } = globalThis.OphDOM;
  const { getPath } = globalThis.OphPath;
  const { commit, state } = globalThis.OphCtx;
  const { clampNum } = globalThis.OphSchema;
  const { parseColor, toCss, toHex } = globalThis.OphColor;


/** 滑杆 + 数字框 */
function numControl(f) {
  const wrap = el('div', 'num-wrap');

  const range = el('input');
  range.type = 'range';
  if (f.min != null) range.min = f.min;
  if (f.max != null) range.max = f.max;
  range.step = f.step != null ? f.step : 1;
  range.value = getPath(state.cfg, f.path);

  const num = el('input', 'num');
  num.type = 'text';
  num.value = String(getPath(state.cfg, f.path));

  const sync = (v) => {
    const n = clampNum(v, f);
    range.value = n;
    num.value = String(n);
    commit(f.path, n);
  };

  range.addEventListener('input', () => sync(range.value));
  num.addEventListener('change', () => sync(num.value));
  num.addEventListener('keydown', (e) => { if (e.key === 'Enter') { sync(num.value); num.blur(); } });

  wrap.append(range, num);
  if (f.unit) wrap.append(el('span', 'unit', f.unit));
  return wrap;
}
/** 色板 + 十六进制输入（带透明度时多一条 alpha 滑杆） */
function colorControl(f) {
  const wrap = el('div', 'color-wrap');
  // 空串也当作「未设置」→ 显示 fallback（否则取色器会显示成黑色，看着像坏了）
  const raw = getPath(state.cfg, f.path);
  const cur = parseColor((raw === '' || raw == null) && f.fallback != null ? f.fallback : raw);

  const swatch = el('label', 'swatch');
  const picker = el('input');
  picker.type = 'color';
  picker.value = toHex(cur);
  swatch.append(picker);

  const hex = el('input', 'hex');
  hex.type = 'text';
  hex.value = toCss(cur);

  let alpha = cur.a;
  let alphaRange = null;
  let alphaVal = null;

  const write = () => {
    const c = parseColor(hex.value);
    c.a = f.withAlpha ? alpha : 1;
    picker.value = toHex(c);
    hex.value = toCss(c);
    if (alphaVal) alphaVal.textContent = c.a.toFixed(2);
    commit(f.path, toCss(c));
  };

  picker.addEventListener('input', () => {
    hex.value = picker.value.toUpperCase();
    write();
  });

  hex.addEventListener('change', write);
  hex.addEventListener('keydown', (e) => { if (e.key === 'Enter') { write(); hex.blur(); } });

  wrap.append(swatch, hex);

  if (f.withAlpha) {
    alphaRange = el('input', 'alpha-slider');
    alphaRange.type = 'range';
    alphaRange.min = 0; alphaRange.max = 1; alphaRange.step = 0.01;
    alphaRange.value = cur.a;

    alphaVal = el('span', 'alpha-val', cur.a.toFixed(2));

    alphaRange.addEventListener('input', () => {
      alpha = Number(alphaRange.value);
      write();
    });
    wrap.append(alphaRange, alphaVal);
  }

  return wrap;
}
function switchControl(f) {
  const on = getPath(state.cfg, f.path) !== false;
  const sw = el('div', 'switch' + (on ? ' on' : ''));
  sw.addEventListener('click', () => {
    const next = !sw.classList.contains('on');
    sw.classList.toggle('on', next);
    commit(f.path, next);
  });
  return sw;
}
function selectControl(f) {
  const sel = el('select', 'sel');
  const cur = String(getPath(state.cfg, f.path));
  for (const [v, label] of f.options) {
    const o = el('option', null, label);
    o.value = v;
    if (v === cur) o.selected = true;
    sel.append(o);
  }
  sel.addEventListener('change', () => commit(f.path, sel.value));
  return sel;
}
function textControl(f) {
  const inp = el('input', 'txt');
  inp.type = 'text';
  inp.placeholder = f.placeholder || '';
  inp.value = getPath(state.cfg, f.path) || '';
  inp.addEventListener('change', () => commit(f.path, inp.value.trim()));
  return inp;
}
/** 开关行：开关在左、标题在右（和分区页里的写法保持一致） */
function switchRow(label, path) {
  const row = el('div', 'row');
  row.append(switchControl({ path }), el('span', 'switch-label', label));
  return row;
}

  globalThis.OphControls = Object.assign(globalThis.OphControls || {}, {
    numControl, colorControl, switchControl, selectControl, textControl, switchRow
  });
})();
