'use strict';

/**
 * 进阶配置 · 设置页模块
 *
 * 由 src/settings/settings.js（重构前巨石）机械拆分而来，代码原样保留。
 * 依赖通过头部解构显式声明 —— 不依赖加载顺序之外的东西，也不往全局挂散名。
 */
;(function () {
  const { el } = globalThis.OphDOM;
  const { fieldRow, newCard, sectionHead } = globalThis.OphLayout;
  const { colorControl, numControl, selectControl, switchRow } = globalThis.OphControls;
  const { getPath } = globalThis.OphPath;
  const { commit, state } = globalThis.OphCtx;
  const { markDirty, schedulePreview } = globalThis.OphApp;
  const { clampNum } = globalThis.OphSchema;
  const { triControl } = globalThis.OphControlsExtra;
  const { advMod } = globalThis.OphAdvBridge;


const ADV_ROADMAP = [
  ['① 事件引擎', '把 GSI 快照的增量统一成「事件」（击杀 / 阵亡 / 连杀 / 下包 / 低血 …），所有展示都挂在事件上'],
  ['② 积木规则', '每条规则 = 触发条件 → 动作，连线式拼装；不写代码也能做「三杀时弹图标 + 抖动」'],
  ['③ 展示单元', '内容（文字 / 图标 / 图片）+ 样式（字体、描边）+ 时间轴（进入 / 停留 / 退出、时长、缩放脉冲）'],
  ['④ 效果层',   'HUD 抖动、手柄震动（Gamepad API）、音效'],
  ['⑤ 代码层',   '允许在面板里写受限 JS 表达式做高阶逻辑，沙箱执行、不接触文件与网络'],
];
const EASE_OPTIONS = [
  ['backOut',  '回弹（backOut，推荐）'],
  ['easeOut',  '渐出（easeOut）'],
  ['easeIn',   '渐入（easeIn）'],
  ['easeInOut','缓入缓出（easeInOut）'],
  ['linear',   '匀速（linear）'],
];
function buildAdvancedSection(sec) {
  const wrap = el('div', 'section');
  wrap.dataset.section = sec.id;
  wrap.append(sectionHead('进阶配置 · 全局默认',
    '基础配置管「文字 / 颜色 / 位置 / 停留时长」；这里管所有元素共享的默认视觉：图标、字重字距、'
    + '描边、弯曲、入场缩放与脉冲、HUD 抖动、手柄震动。总开关关闭时，一切与现在完全一致。'
    + '想给某个元素单独覆盖，去「进阶 · 每元素」。'));

  // ---- 总开关 + 引擎 ----
  const m = newCard('总开关与队列', '关闭 = 退回基础播报，本页所有设置都不生效（可随时改回）');
  m.body.append(switchRow('启用进阶外观', 'adv.enabled'));
  m.body.append(fieldRow('队列上限', numControl({ path: 'adv.engine.maxQueue', min: 1, max: 8, step: 1, integer: true }),
    '同时最多排队几条播报，超出的丢弃最早的。'));
  m.body.append(fieldRow('去重窗口', numControl({ path: 'adv.engine.dedupeMs', min: 0, max: 2000, step: 50, unit: 'ms' }),
    '同一条播报在这个时间窗内重复触发时只算一次，防止抖动刷屏。'));
  wrap.append(m.card);

  // ---- 图标 ----
  const ic = newCard('图标', '这里管所有元素的默认图标表现。要放自定义 SVG / 图片 / 手绘图标，'
    + '先去「进阶 · 图标库」或「进阶 · 画图」建好，再到「进阶 · 每元素」引用。');
  ic.body.append(switchRow('默认显示图标', 'adv.style.iconOn'));
  ic.body.append(fieldRow('默认位置', selectControl({ path: 'adv.style.iconSide',
    options: [['left', '在文字左侧'], ['right', '在文字右侧']] })));
  ic.body.append(fieldRow('间距', numControl({ path: 'adv.style.iconGap', min: 0, max: 40, step: 1, unit: 'px' })));
  ic.body.append(fieldRow('大小', numControl({ path: 'adv.style.iconSize', min: 0.4, max: 2.5, step: 0.05, unit: '×' }),
    '相对字号的大小。1 = 和文字一样高。'));
  ic.body.append(el('div', 'note',
    '「默认显示图标」关掉后，所有元素都不再显示图标；'
    + '只想关掉某一个（比如阵亡不想要骷髅），去「进阶 · 每元素」把那个元素的图标选成「⊘ 无图标」。'));
  wrap.append(ic.card);

  // ---- 文字样式 ----
  const st = newCard('文字样式', '只影响进阶外观下的播报文字');
  st.body.append(fieldRow('字重', numControl({ path: 'adv.style.weight', min: 300, max: 900, step: 100 })));
  st.body.append(fieldRow('字距', numControl({ path: 'adv.style.letterSpacing', min: 0, max: 0.4, step: 0.01, unit: 'em' })));
  st.body.append(switchRow('斜体', 'adv.style.italic'));
  st.body.append(switchRow('深色描边', 'adv.style.outlineOn'));
  st.body.append(fieldRow('描边宽度', numControl({ path: 'adv.style.outlineWidth', min: 1, max: 6, step: 0.5, unit: 'px' })));
  st.body.append(fieldRow('描边颜色', colorControl({ path: 'adv.style.outlineColor', fallback: '#000000' })));
  wrap.append(st.card);

  // ---- 弯曲 ----
  const cv = newCard('文字弯曲', '用 SVG textPath 把文字排成一段圆弧；图标仍可挂在两端');
  cv.body.append(switchRow('启用弯曲', 'adv.style.curveOn'));
  cv.body.append(fieldRow('弯曲半径', numControl({ path: 'adv.style.curveRadius', min: 40, max: 600, step: 10, unit: 'px' }),
    '半径越小弯得越急。'));
  cv.body.append(fieldRow('弯曲张角', numControl({ path: 'adv.style.curveArc', min: -320, max: 320, step: 5, unit: '°' }),
    '正数 = 拱形（中间高），负数 = 谷形（中间低），0 = 直线。'));
  wrap.append(cv.card);

  // ---- 时间轴 ----
  const tl = newCard('时间轴（时长 / 大小变化）', '入场 → 停留 → 淡出。停留时长的最终值以这里为准（覆盖基础段）');
  tl.body.append(fieldRow('入场起始缩放', numControl({ path: 'adv.timeline.inScale', min: 0.3, max: 1.5, step: 0.01, unit: '×' }),
    '1 = 不缩放。小于 1 = 由小变大弹出来。'));
  tl.body.append(fieldRow('入场时长', numControl({ path: 'adv.timeline.inDur', min: 0, max: 800, step: 10, unit: 'ms' })));
  tl.body.append(fieldRow('入场缓动', selectControl({ path: 'adv.timeline.inEase', options: EASE_OPTIONS })));
  tl.body.append(switchRow('停留脉冲（大小变化）', 'adv.timeline.pulseOn'));
  tl.body.append(fieldRow('脉冲峰值缩放', numControl({ path: 'adv.timeline.pulseTo', min: 1, max: 1.6, step: 0.01, unit: '×' })));
  tl.body.append(fieldRow('单次脉冲时长', numControl({ path: 'adv.timeline.pulseDur', min: 100, max: 2000, step: 20, unit: 'ms' })));
  tl.body.append(fieldRow('脉冲重复次数', numControl({ path: 'adv.timeline.pulseRepeat', min: 1, max: 20, step: 1, integer: true })));
  tl.body.append(fieldRow('停留时长', numControl({ path: 'adv.timeline.holdMs', min: 200, max: 6000, step: 50, unit: 'ms' })));
  tl.body.append(fieldRow('淡出时长', numControl({ path: 'adv.timeline.outDur', min: 0, max: 1200, step: 20, unit: 'ms' })));
  wrap.append(tl.card);

  // ---- 效果 ----
  const ef = newCard('效果（抖动 / 震动）',
    '全部走浏览器原生能力，不经过游戏、不注入任何输入。手柄震动需先按一下手柄授权。');
  ef.body.append(switchRow('HUD 抖动', 'adv.effects.shakeOn'));
  ef.body.append(fieldRow('抖动幅度', numControl({ path: 'adv.effects.shakeAmp', min: 1, max: 20, step: 1, unit: 'px' })));
  ef.body.append(fieldRow('抖动时长', numControl({ path: 'adv.effects.shakeDur', min: 60, max: 800, step: 10, unit: 'ms' })));
  ef.body.append(fieldRow('抖动方向', selectControl({ path: 'adv.effects.shakeAxis',
    options: [['xy', '水平 + 垂直'], ['x', '仅水平'], ['y', '仅垂直']] })));
  ef.body.append(switchRow('手柄震动', 'adv.effects.rumbleOn'));
  ef.body.append(fieldRow('强马达强度', numControl({ path: 'adv.effects.rumbleStrong', min: 0, max: 1, step: 0.05 })));
  ef.body.append(fieldRow('弱马达强度', numControl({ path: 'adv.effects.rumbleWeak', min: 0, max: 1, step: 0.05 })));
  ef.body.append(fieldRow('震动时长', numControl({ path: 'adv.effects.rumbleDur', min: 40, max: 1000, step: 20, unit: 'ms' })));
  wrap.append(ef.card);

  // ---- 指路：每个元素的独立设置挪到「进阶 · 每元素」页 ----
  const go = newCard('本页是「全局默认」', '想在某一类播报 / 某个元素上单独覆盖，去左侧「进阶 · 每元素」');
  go.body.append(el('div', 'note',
    '这里调的是**所有元素共享的默认外观**。想让「只有阵亡才抖动」「只有连杀才脉冲」这类，'
    + '或者给某个自定义元素 / 形状单独配图标与字重，去「进阶 · 每元素」页，'
    + '那里可以一个元素一个元素地覆盖，不必重复填。'));
  wrap.append(go.card);

  // ---- 后续规划 ----
  const b = newCard('后续规划', '这一版是「展示单元 + 效果层 + 图标/画图」的可视化编辑；下面是还没做的部分');
  for (const [t, h] of ADV_ROADMAP) {
    const row = el('div', 'adv-row');
    row.append(el('b', null, t), el('div', 'note', h));
    b.body.append(row);
  }
  b.body.append(el('div', 'note',
    '已可编辑：全局外观（图标 / 文字样式 / 弯曲 / 时间轴 / 抖动 / 手柄震动）、'
    + '每个元素独立覆盖、自定义图标库（emoji / 粘贴 SVG / 上传图片 / 手绘）、'
    + '以及画图生成的 HUD 形状元素。\n'
    + '尚未实现（详见项目根目录 ADVANCED-CONFIG-PLAN.md）：任意触发器 / 条件的积木规则、'
    + '音效、以及面板内写代码的脚本层。'));
  wrap.append(b.card);

  return wrap;
}
function parentOf(path) {
  const parts = String(path).split('.');
  const key = parts.pop();
  return { parent: getPath(state.cfg, parts.join('.')), key };
}
/** 有没有显式写过这个键 */
function hasPath(path) {
  const v = getPath(state.cfg, path);
  return v !== undefined && v !== null;
}
/** 删掉一个覆盖键（回落继承）。只有确实存在才标脏。 */
function clearPath(path) {
  const { parent, key } = parentOf(path);
  if (parent && typeof parent === 'object' && Object.prototype.hasOwnProperty.call(parent, key)) {
    delete parent[key];
    markDirty();
    schedulePreview();
  }
}
/** 「覆盖」勾选 + 数值：不勾 = 删键回落全局默认 */
function ovNum(path, f) {
  const wrap = el('div', 'ov');
  const lab = el('label', 'ov-toggle');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = hasPath(path);
  lab.append(cb, el('span', null, '覆盖'));
  const holder = el('div', 'ov-body');

  const def = f.def != null ? f.def : 0;

  const build = () => {
    holder.textContent = '';
    const cur = hasPath(path) ? Number(getPath(state.cfg, path)) : def;

    const rng = document.createElement('input');
    rng.type = 'range';
    rng.min = f.min; rng.max = f.max; rng.step = f.step != null ? f.step : 1;
    rng.value = cur;

    const num = el('input', 'num');
    num.type = 'text';
    num.value = String(cur);

    const write = (v) => {
      const n = clampNum(v, f);
      rng.value = n; num.value = String(n);
      commit(path, n);
    };
    rng.addEventListener('input', () => write(rng.value));
    num.addEventListener('change', () => write(num.value));
    num.addEventListener('keydown', (e) => { if (e.key === 'Enter') { write(num.value); num.blur(); } });

    rng.disabled = num.disabled = !cb.checked;
    holder.classList.toggle('disabled', !cb.checked);
    holder.append(rng, num);
    if (f.unit) holder.append(el('span', 'unit', f.unit));
  };

  cb.addEventListener('change', () => {
    if (cb.checked) commit(path, clampNum(def, f));
    else clearPath(path);
    build();
  });

  build();
  wrap.append(lab, holder);
  return wrap;
}
/** 「覆盖」勾选 + 下拉 */
function ovSelect(path, options, def) {
  const wrap = el('div', 'ov');
  const lab = el('label', 'ov-toggle');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = hasPath(path);
  lab.append(cb, el('span', null, '覆盖'));

  const sel = el('select', 'sel');
  const cur = hasPath(path) ? String(getPath(state.cfg, path)) : String(def);
  for (const [v, l] of options) {
    const o = el('option', null, l);
    o.value = v;
    if (v === cur) o.selected = true;
    sel.append(o);
  }
  sel.disabled = !cb.checked;
  sel.addEventListener('change', () => commit(path, sel.value));
  cb.addEventListener('change', () => {
    if (cb.checked) commit(path, String(def));
    else clearPath(path);
    sel.disabled = !cb.checked;
  });

  wrap.append(lab, sel);
  return wrap;
}
/** 「覆盖」勾选 + 颜色 */
function ovColor(path, fallback) {
  const wrap = el('div', 'ov');
  const lab = el('label', 'ov-toggle');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = hasPath(path);
  lab.append(cb, el('span', null, '覆盖'));

  const holder = el('div', 'ov-body');
  const ctl = colorControl({ path, fallback });
  holder.append(ctl);

  const sync = () => {
    holder.classList.toggle('disabled', !cb.checked);
    ctl.querySelectorAll('input').forEach((i) => { i.disabled = !cb.checked; });
  };
  cb.addEventListener('change', () => {
    if (cb.checked) commit(path, getPath(state.cfg, path) ?? fallback);
    else clearPath(path);
    sync();
  });

  sync();
  wrap.append(lab, holder);
  return wrap;
}
/** 覆写开关（继承 / 开 / 关）—— 与 triControl 同一语义，包一层便于对齐命名 */
function ovSwitch(path, onLabel, offLabel) {
  return triControl(path, onLabel, offLabel);
}
/** 当前有哪些「元素」可以单独配置：内置注册表 + 自定义元素 + 形状元素 */
function elementList() {
  const A = advMod();
  const out = [];
  const base = Array.isArray(A.ELEMENTS) ? A.ELEMENTS : [];
  for (const e of base) out.push({ id: e.id, label: e.label, group: e.group || '元素' });

  (Array.isArray(state.cfg.custom) ? state.cfg.custom : []).forEach((it, i) => {
    const t = it && it.text ? String(it.text).slice(0, 16) : '';
    out.push({ id: 'custom.' + i, label: '自定义元素 ' + (i + 1) + (t ? '（' + t + '）' : ''), group: '自定义元素' });
  });
  (Array.isArray(state.cfg.shapes) ? state.cfg.shapes : []).forEach((it, i) => {
    out.push({ id: 'shape.' + i, label: (it && it.name) || ('形状 ' + (i + 1)), group: '形状元素' });
  });
  return out;
}

  // 自注册：上架与否只由 sections/manifest.js 决定，这里不写死顺序
  globalThis.OphSections.register({
    id: "adv", ico: "adv", name: "进阶配置",
    group: "basic",
    build: buildAdvancedSection,
  });
  // ⚠️ 未列入 manifest → 不会加载。重新上架：在 manifest 里加一行即可。

  globalThis.OphAdvCore = Object.assign(globalThis.OphAdvCore || {}, {
    ADV_ROADMAP, EASE_OPTIONS, buildAdvancedSection, parentOf, hasPath, clearPath, ovNum, ovSelect, ovColor, ovSwitch, elementList
  });
})();
