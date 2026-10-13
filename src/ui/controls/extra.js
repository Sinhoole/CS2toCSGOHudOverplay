'use strict';

/**
 * OphControlsExtra · 通用库
 *
 * 由 src/settings/settings.js（重构前巨石）机械拆分而来，代码原样保留。
 * 依赖通过头部解构显式声明 —— 不依赖加载顺序之外的东西，也不往全局挂散名。
 */
;(function () {
  const { getPath } = globalThis.OphPath;
  const { commit, state } = globalThis.OphCtx;
  const { el } = globalThis.OphDOM;
  const { markDirty, schedulePreview } = globalThis.OphApp;


/** 三态控件：继承默认 / 开启 / 关闭。「继承」= 把该键从配置里删掉，回落全局默认。 */
function triControl(path, onLabel, offLabel) {
  const cur = getPath(state.cfg, path);
  const sel = el('select', 'sel');
  const opts = [['', '继承默认'], ['true', onLabel || '开启'], ['false', offLabel || '关闭']];
  const curV = (cur === undefined || cur === null) ? '' : String(cur === true);
  for (const [v, label] of opts) {
    const o = el('option', null, label);
    o.value = v;
    if (v === curV) o.selected = true;
    sel.append(o);
  }
  sel.addEventListener('change', () => {
    if (sel.value === '') {
      const parent = getPath(state.cfg, path.split('.').slice(0, -1).join('.'));
      if (parent && typeof parent === 'object') {
        delete parent[path.split('.').pop()];
        markDirty();
        schedulePreview();
      }
    } else {
      commit(path, sel.value === 'true');
    }
  });
  return sel;
}
/** 独立的小控件（画图工具栏用，不走 state.cfg 的 commit 机制） */
function colorControl2(label, value, onChange, allowNone) {
  const wrap = el('span', 'mini-ctl');
  wrap.append(el('span', 'note', label));
  const picker = el('input');
  picker.type = 'color';
  picker.value = /^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff';
  picker.addEventListener('input', () => onChange(picker.value));
  wrap.append(picker);
  if (allowNone) {
    const none = el('button', 'mini', '无');
    none.addEventListener('click', () => onChange('none'));
    wrap.append(none);
  }
  return wrap;
}
function numControl2(label, value, min, max, step, onChange) {
  const wrap = el('span', 'mini-ctl');
  wrap.append(el('span', 'note', label));
  const inp = el('input', 'num');
  inp.type = 'text';
  inp.style.width = '52px';
  inp.value = String(value);
  const apply = () => {
    let n = Number(inp.value);
    if (!Number.isFinite(n)) n = value;
    n = Math.max(min, Math.min(max, n));
    inp.value = String(n);
    onChange(n);
  };
  inp.addEventListener('change', apply);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { apply(); inp.blur(); } });
  wrap.append(inp);
  return wrap;
}

  globalThis.OphControlsExtra = Object.assign(globalThis.OphControlsExtra || {}, {
    triControl, colorControl2, numControl2
  });
})();
