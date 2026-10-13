'use strict';

/**
 * 自定义元素 · 设置页模块
 *
 * 由 src/settings/settings.js（重构前巨石）机械拆分而来，代码原样保留。
 * 依赖通过头部解构显式声明 —— 不依赖加载顺序之外的东西，也不往全局挂散名。
 */
;(function () {
  const { commit, state } = globalThis.OphCtx;
  const { el } = globalThis.OphDOM;
  const { ALIGNS, ANCHORS, fieldRow, newCard, sectionHead } = globalThis.OphLayout;
  const { markDirty, rebuild, schedulePreview, toast } = globalThis.OphApp;
  const { getPath } = globalThis.OphPath;
  const { colorControl, numControl } = globalThis.OphControls;


let lastTpl = null;   // 最后聚焦过的模板输入框，变量按钮往这里插
function ensureCustomArray() {
  if (!Array.isArray(state.cfg.custom)) state.cfg.custom = [];
}
/**
 * 补齐自定义元素缺的字段。
 * custom 是数组，deepMerge 不会给数组元素补默认值，
 * 所以手写 config.json 或导入旧配置时可能缺字段，这里统一兜一遍。
 */
function normalizeCustom() {
  ensureCustomArray();
  state.cfg.custom = state.cfg.custom
    .filter((it) => it && typeof it === 'object')
    .map((it) => Object.assign(defaultCustomItem(), it));
}
function defaultCustomItem() {
  return {
    enabled: true,
    text: '{weapon}  {clip} / {reserve}',
    anchor: 'tr', align: 'left',
    offsetX: 0, offsetY: 0,
    scale: 1, rotate: 0, fontSize: 26,
    color: '#FFFFFF',
    opacity: 1, glow: 0, glowColor: '#FFFFFF',
    outline: true,
    bar: false, barColor: '#0E131A', barAlpha: 0.5,
  };
}
/** 用变量表里的示例值把模板渲染一遍，让用户在设置界面里就能看到大概长什么样 */
function previewTemplate(tpl) {
  const sample = {};
  for (const v of state.vars) sample[v.key] = v.sample;
  return String(tpl || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (whole, k) => (
    Object.prototype.hasOwnProperty.call(sample, k) ? String(sample[k]) : whole
  ));
}
/**
 * 「常用示例」模板。
 *
 * 加这些不是为了好看，是因为「自定义元素」页以前是一张白纸：
 * 新用户点进来只看到一句「模板可以写成 {weapon} {clip} / {reserve}」，
 * 还得自己翻译一遍。给几条现成的，改起来比从零写快得多。
 *
 * item() 每次返回新对象，避免多个元素共享同一个引用。
 * ⚠️ 位置/字号是按 1920×1080 基准给的，用户换分辨率后可能要微调 —— 这是有意的，
 *    默认值太"保守"的话，加进来一片空白反而更困惑。
 */
const CUSTOM_PRESETS = [
  {
    name: '匕首 / 当前武器',
    sample: '匕首',
    hint: '显示手里拿的武器。拿刀时就是「匕首」，拿枪时是枪名。',
    item: () => ({ text: '{weapon}', anchor: 'bl', offsetX: 40, offsetY: -150, fontSize: 30 }),
  },
  {
    name: '武器 + 弹药',
    sample: 'AK-47  30 / 90',
    hint: '武器名 + 弹匣 / 备弹，放在右上角。',
    item: () => ({ text: '{weapon}  {clip} / {reserve}', anchor: 'tr', offsetX: -40, offsetY: 40, fontSize: 26 }),
  },
  {
    name: '战绩 K / D / A',
    sample: 'K 14   D 9   A 3',
    hint: '总击杀、死亡、助攻。',
    item: () => ({ text: 'K {kills}   D {deaths}   A {assists}', anchor: 'tl', offsetX: 40, offsetY: 40, fontSize: 24 }),
  },
  {
    name: 'K/D 比',
    sample: 'K/D 1.56',
    hint: '自动算出来的比值，死亡为 0 时直接显示击杀数。',
    item: () => ({ text: 'K/D {kd}', anchor: 'tl', offsetX: 40, offsetY: 76, fontSize: 22 }),
  },
  {
    name: '比分',
    sample: 'CT 7 : 9 T',
    hint: '两边比分。',
    item: () => ({ text: '{ct_score} : {t_score}', anchor: 'tc', offsetY: 40, fontSize: 34 }),
  },
  {
    name: '存活人数',
    sample: '4 v 3',
    hint: '我方存活 v 敌方存活。只在死亡观战 / GOTV 时有数据。',
    item: () => ({ text: '{team_alive} v {enemy_alive}', anchor: 'tc', offsetY: 84, fontSize: 22 }),
  },
  {
    name: '回合 + 计时',
    sample: 'R16   1 : 37',
    hint: '第几回合 + 回合计时。',
    item: () => ({ text: 'R{round_no}   {time}', anchor: 'tr', offsetX: -40, offsetY: 40, fontSize: 24 }),
  },
  {
    name: '金钱',
    sample: '$4,350',
    hint: '带千分位。想不带逗号就用 {money_raw}。',
    item: () => ({ text: '${money}', anchor: 'bl', offsetX: 40, offsetY: -40, fontSize: 28 }),
  },
  {
    name: '血量 / 护甲',
    sample: 'HP 76   AP 57',
    hint: '想知道戴没戴头盔可以再加 {helmet}。',
    item: () => ({ text: 'HP {health}   AP {armor}', anchor: 'tl', offsetX: 40, offsetY: 112, fontSize: 22 }),
  },
  {
    name: '回合阶段',
    sample: '进行中',
    hint: '冻结 / 进行中 / 已结束 / 热身。',
    item: () => ({ text: '{phase}', anchor: 'bc', offsetY: -40, fontSize: 20 }),
  },
];
function buildCustomSection(sec) {
  const wrap = el('div', 'section');
  wrap.dataset.section = sec.id;
  wrap.append(sectionHead('自定义元素',
    '可添加任意数量的文本元素，内容支持 {变量} 插值。位移与缩放规则同其它模块，位移不受缩放影响。'));

  ensureCustomArray();

  // ---- 变量速查：点一下插到正在编辑的文本框里，没有就复制 ----
  const vc = newCard('可用变量', '点击插入到正在编辑的文本框；未在编辑时复制到剪贴板。');
  const vars = el('div', 'vars');
  let lastGroup = null;
  for (const v of state.vars) {
    if (v.group !== lastGroup) {
      lastGroup = v.group;
      vars.append(el('div', 'vgroup', v.group));
    }
    const chip = el('button', 'vchip');
    chip.append(document.createTextNode('{' + v.key + '}'), el('i', null, v.label));
    chip.title = `${v.label}　示例：${v.sample || '—'}`;
    chip.addEventListener('click', () => {
      const token = '{' + v.key + '}';
      const ta = lastTpl;
      if (ta && document.body.contains(ta) && ta.closest('.section.active')) {
        const s = ta.selectionStart == null ? ta.value.length : ta.selectionStart;
        const e2 = ta.selectionEnd == null ? ta.value.length : ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + token + ta.value.slice(e2);
        ta.selectionStart = ta.selectionEnd = s + token.length;
        ta.focus();
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        // 没有正在编辑的文本框就复制走，方便去别处粘贴
        window.oph.copyText(token);
        toast('已复制 ' + token, 'ok');
      }
    });
    vars.append(chip);
  }
  vc.body.append(vars);
  wrap.append(vc.card);

  // ---- 新增 ----
  const addRow = el('div', 'search-row');
  const addBtn = el('button', 'btn primary', '＋ 添加一个文本元素');
  addBtn.addEventListener('click', () => {
    state.cfg.custom.push(defaultCustomItem());
    rebuild();
    markDirty();
    schedulePreview();
    toast('已添加，可在页面底部编辑', 'ok');
  });
  addRow.append(addBtn);
  wrap.append(addRow);

  // ---- 常用示例：一键添加 ----
  const tplCard = newCard('常用示例',
    '点击即可添加，模板、位置与字号已预设，添加后可自行调整。');
  const tplGrid = el('div', 'tpl-grid');
  for (const t of CUSTOM_PRESETS) {
    const b = el('button', 'tpl-chip');
    b.append(el('span', 'tc-sample', t.sample), el('span', 'tc-name', t.name));
    b.title = t.hint || '';
    b.addEventListener('click', () => {
      ensureCustomArray();
      state.cfg.custom.push(Object.assign(defaultCustomItem(), t.item()));
      rebuild();
      markDirty();
      schedulePreview();
      toast('已添加「' + t.name + '」，可在页面底部编辑', 'ok');
    });
    tplGrid.append(b);
  }
  tplCard.body.append(tplGrid);
  wrap.append(tplCard.card);

  if (!state.cfg.custom.length) {
    wrap.append(el('div', 'empty-hint',
      '暂无自定义文本元素。\n点击上方按钮添加，模板示例：{weapon}  {clip} / {reserve}。'));
  }

  state.cfg.custom.forEach((item, i) => wrap.append(customItemCard(item, i)));
  return wrap;
}
function customItemCard(item, idx) {
  const p = `custom.${idx}`;
  const card = el('div', 'card');

  // ---- 头部：启用开关 + 标题 + 删除 ----
  const head = el('div', 'card-head');
  const hrow = el('div', 'ci-head');

  const sw = el('div', 'switch' + (item.enabled === false ? '' : ' on'));
  sw.addEventListener('click', () => {
    const next = !sw.classList.contains('on');
    sw.classList.toggle('on', next);
    commit(`${p}.enabled`, next);
  });

  const del = el('button', 'ci-del', '删除');
  del.addEventListener('click', () => {
    if (!confirm(`删除「文本元素 ${idx + 1}」？`)) return;
    state.cfg.custom.splice(idx, 1);
    rebuild();
    markDirty();
    schedulePreview();
  });

  hrow.append(sw, el('div', 'ci-title', `文本元素 ${idx + 1}`), del);
  head.append(hrow);
  card.append(head);

  const body = el('div', 'card-body');

  // ---- 模板 ----
  const ta = document.createElement('textarea');
  ta.className = 'tpl';
  ta.placeholder = '{weapon}  {clip} / {reserve}';
  ta.value = item.text || '';

  const prevNote = el('div', 'note');
  const syncPrev = () => { prevNote.textContent = '预览：' + previewTemplate(ta.value); };
  syncPrev();

  ta.addEventListener('focus', () => { lastTpl = ta; });
  ta.addEventListener('input', () => {
    commit(`${p}.text`, ta.value);
    syncPrev();
  });

  const tRow = el('div', 'row');
  tRow.style.display = 'block';
  tRow.append(ta, prevNote);
  body.append(tRow);

  // ---- 位置与外观 ----
  const sel = (path, options, def) => {
    const cur = String(getPath(state.cfg, path) ?? def);
    const s = el('select', 'sel');
    for (const [v, label] of options) {
      const o = el('option', null, label);
      o.value = v;
      if (v === cur) o.selected = true;
      s.append(o);
    }
    s.addEventListener('change', () => commit(path, s.value));
    return s;
  };

  body.append(fieldRow('屏幕锚点', sel(`${p}.anchor`, ANCHORS, 'tl')));
  body.append(fieldRow('文本对齐', sel(`${p}.align`, ALIGNS, 'left')));
  body.append(fieldRow('水平位移', numControl({ path: `${p}.offsetX`, min: -900, max: 900, step: 1, unit: 'px' })));
  body.append(fieldRow('垂直位移', numControl({ path: `${p}.offsetY`, min: -600, max: 600, step: 1, unit: 'px' })));
  body.append(fieldRow('缩放', numControl({ path: `${p}.scale`, min: 0.3, max: 3, step: 0.01, unit: '×' })));
  body.append(fieldRow('字号', numControl({ path: `${p}.fontSize`, min: 8, max: 96, step: 1, unit: 'px' })));
  body.append(fieldRow('颜色', colorControl({ path: `${p}.color` })));

  // 描边开关
  const olOn = item.outline !== false;
  const olSw = el('div', 'switch' + (olOn ? ' on' : ''));
  olSw.addEventListener('click', () => {
    const next = !olSw.classList.contains('on');
    olSw.classList.toggle('on', next);
    commit(`${p}.outline`, next);
  });
  const olRow = el('div', 'row');
  olRow.append(olSw, el('span', 'switch-label', '深色描边（压在明亮画面上也能读）'));
  body.append(olRow);

  // 底栏开关
  const barOn = item.bar === true;
  const barSw = el('div', 'switch' + (barOn ? ' on' : ''));
  barSw.addEventListener('click', () => {
    const next = !barSw.classList.contains('on');
    barSw.classList.toggle('on', next);
    commit(`${p}.bar`, next);
  });
  const barRow = el('div', 'row');
  barRow.append(barSw, el('span', 'switch-label', '加一条两端渐隐的暗色底栏'));
  body.append(barRow);

  body.append(fieldRow('底栏颜色', colorControl({ path: `${p}.barColor`, fallback: '#0E131A' })));
  body.append(fieldRow('底栏不透明度', numControl({ path: `${p}.barAlpha`, min: 0, max: 1, step: 0.01 })));

  // ---- 旋转 / 辉光 / 整体不透明度 ----
  body.append(fieldRow('旋转角度', numControl({ path: `${p}.rotate`, min: -180, max: 180, step: 1, unit: '°' }),
    '配合缩放可以做伪 3D 的倾斜。'));
  body.append(fieldRow('整体不透明度', numControl({ path: `${p}.opacity`, min: 0, max: 1, step: 0.01 })));
  body.append(fieldRow('辉光强度', numControl({ path: `${p}.glow`, min: 0, max: 1, step: 0.01 }),
    '设 0 = 关闭。'));
  body.append(fieldRow('辉光颜色', colorControl({ path: `${p}.glowColor`, fallback: '#FFFFFF' })));

  card.append(body);
  return card;
}

  // 自注册：上架与否只由 sections/manifest.js 决定，这里不写死顺序
  globalThis.OphSections.register({
    id: "custom", ico: "custom", name: "自定义元素",
    group: "basic",
    build: buildCustomSection,
  });

  // 宿主要用它：启动与「导入配置」之后都要把自定义元素补齐成完整结构
  globalThis.OphSecCustom = Object.assign(globalThis.OphSecCustom || {}, {
    normalizeCustom, ensureCustomArray,
  });
})();
