'use strict';

/**
 * 设置界面。
 *
 * 用 schema 声明每个分区有哪些字段，控件统一生成 —— 手写几十个 input 太容易漏。
 * 改动即时推给覆盖层预览（不写文件），点「保存」才落盘到 config.json。
 */

const state = {
  cfg: null,        // 当前编辑中的配置（工作副本）
  defaults: null,   // 出厂默认值，用于「重置本模块」
  dirty: false,
  vars: [],         // 自定义文本可用的变量（来自 src/vars.js）
  weaponNames: {},  // 默认武器名表
  grenadeKinds: [], // 投掷物种类
  status: null,     // 主进程推来的运行状态（首页用）
};


// ============================================================
// schema
// ============================================================

const MODULES = [
  { key: 'scoreboard', ico: 'ct',     name: '顶部比分面板', hint: '屏幕顶部居中：CT 块 / 时间+比分 / T 块' },
  { key: 'money',      ico: 'money',  name: '金钱',        hint: '左侧信息组，排在血量护甲上方' },
  { key: 'vitals',     ico: 'vitals', name: '血量 / 护甲',  hint: '左下角，含血量槽与护甲槽' },
  { key: 'ammo',       ico: 'ammo',   name: '弹药 / 连杀',  hint: '右下角，连杀骷髅 + 弹匣/备弹 + 子弹' },
  { key: 'weaponList', ico: 'weapon', name: '武器栏（文字态）', hint: '右侧 1–5 号槽位，纯文字方案' },
  { key: 'roster',     ico: 'roster', name: '名单面板',     hint: '队友 / 对手的血量、武器、KDA —— 只有死亡观战时才有数据' },
];

const SECTIONS = [
  { id: 'home', ico: 'home', name: '首页', group: 'home', build: buildHomeSection },

  // 装完 GSI 之后第一件该做的事：把原生 HUD 关掉、把雷达和队友标识留住。
  // 命令目录来自主进程 src/gamecmds.js（唯一权威）。
  { id: 'gamecmds', ico: 'gamecmds', name: '原生 HUD 命令', build: buildGamecmdsSection },

  // 「顶部比分面板」设置页已于 10-13 应用户要求下线（HUD 渲染与 config 键保留）。
  {
    id: 'money',
    ico: 'money',
    name: '金钱',
    module: 'money',
    colors: [
      { label: '底栏颜色', path: 'modules.money.barColor' },
    ],
    alphas: [
      { label: '羽化底栏不透明度', path: 'modules.money.barAlpha' },
    ],
    fields: [
      { type: 'switch', label: '显示金钱', path: 'show.money' },
      { type: 'color',  label: '收入颜色', path: 'hud.moneyGainColor' },
      { type: 'color',  label: '支出颜色', path: 'hud.moneySpendColor' },
      { type: 'num',    label: '提示停留', path: 'hud.moneyDeltaHoldMs', min: 500, max: 5000, step: 100, unit: 'ms' },
    ],
  },

  {
    id: 'vitals',
    ico: 'vitals',
    name: '血量 / 护甲',
    module: 'vitals',
    colors: [
      { label: '底栏颜色', path: 'modules.vitals.barColor' },
    ],
    alphas: [
      { label: '羽化底栏不透明度', path: 'modules.vitals.barAlpha' },
    ],
    fields: [
      { type: 'switch', label: '显示血量',   path: 'show.health' },
      { type: 'switch', label: '显示护甲',   path: 'show.armor' },
      { type: 'switch', label: '显示拆弹器', path: 'show.defuseKit' },
      { type: 'num',    label: '血条转红',   path: 'hud.healthRedThreshold', min: 1, max: 100, step: 1,
        note: '血量低于等于此值时，血色进度条的填充由白转红。' },
      { type: 'num',    label: '低血预警',   path: 'hud.lowHealthThreshold', min: 1, max: 100, step: 1,
        note: '血量低于等于此值时触发红色发光 + 底栏左侧红渐变，血量越低发光越强。' },
    ],
  },

  {
    id: 'ammo',
    ico: 'ammo',
    name: '弹药 / 连杀',
    module: 'ammo',
    colors: [
      { label: '底栏颜色', path: 'modules.ammo.barColor' },
    ],
    alphas: [
      { label: '羽化底栏不透明度', path: 'modules.ammo.barAlpha' },
    ],
    fields: [
      { type: 'switch', label: '显示弹药',   path: 'show.ammo' },
      { type: 'switch', label: '显示连杀',   path: 'show.roundKills' },
    ],
  },

  {
    id: 'weaponListText',
    ico: 'weapon',
    name: '武器栏文字态',
    module: 'weaponList',
    colors: [
      { label: '手持文字色', path: 'modules.weaponList.textColor' },
      { label: '未手持文字色', path: 'modules.weaponList.dimColor', withAlpha: true },
    ],
    fields: [
      { type: 'switch', label: '显示武器栏',   path: 'show.weaponList' },
      { type: 'switch', label: '文字描边',     path: 'show.weaponTextOutline',
        note: '默认关闭。开启后会在武器名和编号外描一圈深色边，方便压在明亮背景上读。' },
    ],
  },
  {
    id: 'weaponListSvg',
    ico: 'weapon',
    name: '武器栏SVG态',
    build: buildWeaponListSvgCard,
  },

  // 「名单面板」设置页已于 10-13 应用户要求下线（HUD 渲染与 config 键保留）。
  { id: 'text',   ico: 'text',   name: '文字替换',   build: buildTextSection },
  { id: 'custom', ico: 'custom', name: '自定义元素', build: buildCustomSection },
  // 「击杀播报」「购买轮盘」设置页已于 10-13 应用户要求下线（代码与 config 键保留）。

  {
    id: 'global',
    ico: 'global',
    name: '全局',
    build: buildGlobalSection,
    fields: [
      { type: 'num',    label: '整体缩放', path: 'scale', min: 0.5, max: 2, step: 0.01,
        note: '在设计分辨率之上再乘一个倍率，影响全部模块。单块微调用各模块自己的缩放。' },
      { type: 'num',    label: '安全区 X', path: 'safezone.x', min: 0.7, max: 1, step: 0.005,
        note: '与 CS2 的 safezonex 保持一致，否则 HUD 会和游戏原生元素错位。' },
      { type: 'num',    label: '安全区 Y', path: 'safezone.y', min: 0.7, max: 1, step: 0.005 },
      { type: 'num',    label: '羽化底栏浓度', path: 'hud.barAlpha', min: 0, max: 1, step: 0.01,
        note: '全局默认的底栏不透明度。设 0 等于关掉所有半透明底条（各模块自己的设置优先）。' },
      { type: 'num',    label: '失效延迟', path: 'staleTimeoutMs', min: 3000, max: 120000, step: 1000, unit: 'ms',
        note: '超过这么久没收到数据就认为不在对局里、把 HUD 收起来。'
            + '必须大于 cfg 里 heartbeat 的两倍，否则站着不动时 GSI 不发包会被误判成退出了。' },
      { type: 'switch', label: '鼠标可交互', path: 'enableInteraction',
        note: '调试用。开启后鼠标能点到 HUD，但会挡住游戏操作，正常玩请关闭。' },
      { type: 'switch', label: '启动时打开设置', path: 'openSettingsOnStart',
        note: '默认开。关掉之后，程序启动只留一个托盘图标（右下角），点它才打开设置。' },
      { type: 'num',    label: '显示器序号', path: 'displayIndex', min: 0, max: 3, step: 1, integer: true,
        note: '多屏用户：0 = 主显示器。改完保存，覆盖层会挪到对应屏幕。' },
    ],
  },

  // 「进阶配置」四页（adv / adv-elements / adv-icons / adv-draw）已于 10-13 应用户要求下线：
  // 侧栏不再出现，build 函数与 config.adv 逻辑保留（可随时恢复）。
  { id: 'profiles', ico: 'profiles', name: '配置方案', group: 'tools', build: buildProfilesSection },
  // 「教程」「关于」页已于 10-13 下线：文档 TUTORIAL.md 与渲染/IPC 代码保留。
];

// 侧边导航分组
const NAV_GROUPS = [
  { id: 'home',     label: '总览' },
  { id: 'basic',    label: '基础配置' },
  { id: 'tools',    label: '工具与帮助' },
];
// 没写 group 的分区一律归入基础配置（新增分区不用再手动标注）
for (const s of SECTIONS) if (!s.group) s.group = 'basic';

// 常见分辨率预设。value 为 null 表示「自定义」，此时直接用下面两个宽高输入框。
const RES_PRESETS = [
  ['1920x1080', '1920 × 1080（16:9）'],
  ['1280x960',  '1280 × 960（4:3，CS:GO 经典拉伸）'],
  ['1024x768',  '1024 × 768（4:3）'],
  ['1600x1200', '1600 × 1200（4:3）'],
  ['1440x1080', '1440 × 1080（4:3）'],
  ['custom',    '自定义（用下面的宽 / 高）'],
];

/** 「全局」页：额外插入分辨率 + 适配模式卡片 */
function buildGlobalSection(sec) {
  const wrap = el('div', 'section');
  wrap.dataset.section = sec.id;
  wrap.append(sectionHead('全局',
    '字体、缩放、安全区等整体参数。分辨率决定 HUD 的「虚拟屏幕」大小，'
    + '适配模式决定这个虚拟屏幕怎么映射到你的真实显示器。'));

  wrap.append(buildResolutionCard());
  wrap.append(buildFontCard());
  for (const f of sec.fields || []) wrap.append(buildPlainField(f));
  return wrap;
}

/**
 * 全局字体：预设网格 + 自定义覆盖 + 实时预览。
 *
 * 设计上刻意"预览即所见"——字体这种东西看名字没用，得看它把
 * 「匕首」「M4A1消音型」这些真实会出现的字渲染成什么样。
 */
function buildFontCard() {
  const A = advMod();
  const fonts = Array.isArray(A.FONTS) ? A.FONTS : [];

  const { card, body } = newCard('HUD 字体',
    '改的是 HUD 上全部文字的字型。这些全是系统自带字体，不联网下载 —— '
    + '覆盖层盖在游戏画面上，不能为了显示一行字去等字体。');

  // ---- 预览 ----
  const preview = el('div', 'font-preview');
  const pMain = el('div', 'fp-main', '击杀 +1　匕首　M4A1消音型');
  const pSub = el('div', 'fp-sub', 'CT 7 : 9 T　存活 3　$4,350　20 / 120');
  preview.append(pMain, pSub);
  body.append(preview);

  const hint = el('div', 'font-hint');
  body.append(hint);

  // ---- 预设网格 ----
  const grid = el('div', 'font-grid');
  body.append(grid);

  const refresh = () => {
    const f = getPath(state.cfg, 'font') || {};
    const stack = (typeof A.fontStack === 'function') ? A.fontStack(f) : '';
    if (stack) preview.style.fontFamily = stack;

    const custom = String(f.family || '').trim();
    for (const btn of grid.querySelectorAll('.font-chip')) {
      btn.classList.toggle('on', !custom && btn.dataset.id === f.preset);
    }
    hint.textContent = custom
      ? '当前用的是自定义字体栈（下面的输入框非空，会盖过上面的选择）'
      : '当前生效：' + ((fonts.find((x) => x.id === f.preset) || {}).label || '默认');
    hint.classList.toggle('warn', !!custom);
  };

  for (const f of fonts) {
    const btn = el('button', 'font-chip');
    btn.dataset.id = f.id;
    const sample = el('span', 'fc-sample', 'Aa 匕首 128');
    sample.style.fontFamily = f.stack;
    const name = el('span', 'fc-name', f.label);
    btn.append(sample, name);
    btn.title = f.note || '';
    btn.addEventListener('click', () => {
      // 选预设时顺手清掉自定义：不清的话自定义一直盖在上面，点了像没反应
      setPath(state.cfg, 'font.preset', f.id);
      setPath(state.cfg, 'font.family', '');
      const box = document.getElementById('fontCustom');
      if (box) box.value = '';
      markDirty();
      schedulePreview();
      refresh();
    });
    grid.append(btn);
  }

  // ---- 自定义（高级）----
  const row = el('div', 'row');
  const box = el('input', 'txt');
  box.type = 'text';
  box.id = 'fontCustom';
  box.placeholder = '自定义 CSS font-family，例如 Consolas, monospace';
  box.value = String(getPath(state.cfg, 'font.family') || '');
  box.style.flex = '1 1 auto';
  box.addEventListener('change', () => {
    setPath(state.cfg, 'font.family', box.value.trim());
    markDirty();
    schedulePreview();
    refresh();
  });
  row.append(box);
  body.append(fieldRow('自定义字体栈', row,
    '留空就用上面选的那套。填了就以你为准（老的 font.family 配置也走这里，不会丢）。'));

  refresh();
  return card;
}

/** 分辨率 + 适配模式卡片 */
function buildResolutionCard() {
  const card = newCard('分辨率与适配',
    '分辨率 = HUD 的虚拟屏幕基准。想还原 CS:GO 的 4:3 拉伸，选 1280×960 再把适配模式设为「拉伸铺满」。');

  // 当前是否命中某个预设
  const curW = Number(getPath(state.cfg, 'designWidth')) || 1920;
  const curH = Number(getPath(state.cfg, 'designHeight')) || 1080;
  const hit = RES_PRESETS.find((p) => p[0] !== 'custom' && p[0] === `${curW}x${curH}`);

  const sel = el('select', 'sel');
  const opts = hit ? [[hit[0], hit[1]]] : [];
  opts.push(...RES_PRESETS.filter((p) => !hit || p[0] !== hit[0]));
  for (const [v, label] of opts) {
    const o = el('option', null, label);
    o.value = v;
    if (v === (hit ? hit[0] : 'custom')) o.selected = true;
    sel.append(o);
  }
  sel.addEventListener('change', () => {
    if (sel.value === 'custom') { rebuild(); return; }
    const [w, h] = sel.value.split('x').map(Number);
    commit('designWidth', w);
    commit('designHeight', h);
    rebuild();
  });
  card.body.append(fieldRow('分辨率预设', sel));

  card.body.append(fieldRow('设计宽度', numControl({
    path: 'designWidth', min: 320, max: 7680, step: 1, integer: true, unit: 'px',
  }), 'HUD 内部排版用的虚拟屏宽。改成 1280 就是按 1280 宽来布局。'));
  card.body.append(fieldRow('设计高度', numControl({
    path: 'designHeight', min: 240, max: 4320, step: 1, integer: true, unit: 'px',
  }), '虚拟屏高。1280×960 是标准的 4:3 比例。'));

  card.body.append(fieldRow('适配模式', selectControl({
    path: 'fit',
    options: [
      ['fill',    '拉伸铺满（4:3 怀旧：非等比拉伸）'],
      ['stretch', '等比填满（等比放大，溢出裁掉）'],
      ['contain', '完整显示（等比缩小，不裁切）'],
    ],
  }), '想要 CS:GO 那种 4:3 拉宽的怀旧感，就用「拉伸铺满」。'));

  card.body.append(fieldRow('整体缩放', numControl({
    path: 'scale', min: 0.5, max: 2, step: 0.01,
  }), '在适配结果之上再乘一个倍率。想整体放大一点就往上调。'));

  return card.card;
}

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

// ============================================================
// 取值 / 写值
// ============================================================

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, path, val) {
  const ks = path.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) {
    if (typeof o[ks[i]] !== 'object' || o[ks[i]] === null) o[ks[i]] = {};
    o = o[ks[i]];
  }
  o[ks[ks.length - 1]] = val;
}

// ---- 颜色工具 ----

function hexToRgb(hex) {
  const m = String(hex || '').trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const v = parseInt(h, 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

/** 支持 "#RRGGBB" 与 "rgba(r, g, b, a)" 两种写法 */
function parseColor(v) {
  const s = String(v || '').trim();
  const rgba = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (rgba) {
    return {
      r: Math.round(Number(rgba[1])), g: Math.round(Number(rgba[2])), b: Math.round(Number(rgba[3])),
      a: rgba[4] == null ? 1 : Number(rgba[4]),
    };
  }
  const rgb = hexToRgb(s);
  return rgb ? { ...rgb, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
}

function toHex({ r, g, b }) {
  return '#' + [r, g, b].map((n) => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function toCss({ r, g, b, a }) {
  return a >= 0.999 ? toHex({ r, g, b }) : `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(2))})`;
}

// ============================================================
// 小工具
// ============================================================

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function clampNum(v, f) {
  let n = Number(v);
  if (!Number.isFinite(n)) n = 0;
  if (f.integer) n = Math.round(n);
  if (f.min != null) n = Math.max(f.min, n);
  if (f.max != null) n = Math.min(f.max, n);
  if (f.step && f.step < 1) n = Math.round(n * 1000) / 1000;
  return n;
}

// ============================================================
// 字段控件
// ============================================================

/** 写值 + 标脏 + 推送预览 */
function commit(path, val) {
  setPath(state.cfg, path, val);
  markDirty();
  schedulePreview();
}

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

/** 一行字段：标签 + 控件，可选地在下方跟一段说明 */
function fieldRow(label, control, note) {
  const field = el('div', 'field');
  const row = el('div', 'row');
  row.append(el('div', 'row-label', label), control);
  field.append(row);
  if (note) field.append(el('div', 'note', note));
  return field;
}

// ============================================================
// 位置与缩放
// ============================================================

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

// ============================================================
// 「文字替换」页
// ============================================================

const ANCHORS = [
  ['tl', '左上'], ['tc', '顶中'], ['tr', '右上'],
  ['ml', '左中'], ['mc', '正中'], ['mr', '右中'],
  ['bl', '左下'], ['bc', '底中'], ['br', '右下'],
];

const ALIGNS = [['left', '左对齐'], ['center', '居中'], ['right', '右对齐']];

/**
 * 九宫格锚点选择器：比下拉直观得多 —— 点哪个格子，图形就从屏幕哪个位置贴上去。
 * 用在「形状元素」这种位置语义最强的场景。
 */
function anchorGrid(value, onPick) {
  const wrap = el('div', 'anchor-grid');
  const label = {
    tl: '左上', tc: '顶中', tr: '右上',
    ml: '左中', mc: '正中', mr: '右中',
    bl: '左下', bc: '底中', br: '右下',
  };
  for (const [v] of ANCHORS) {
    const b = el('button', 'ag-cell' + (v === value ? ' on' : ''));
    b.type = 'button';
    b.title = label[v] || v;
    b.dataset.anchor = v;
    b.addEventListener('click', () => {
      for (const o of wrap.children) o.classList.toggle('on', o.dataset.anchor === v);
      onPick(v);
    });
    wrap.append(b);
  }
  return wrap;
}

/** 分区标题卡片（只有标题，没有内容） */
function sectionHead(title, hint) {
  const card = el('div', 'card');
  const head = el('div', 'card-head');
  const box = el('div');
  box.append(el('div', 'card-title', title));
  if (hint) box.append(el('div', 'card-hint', hint));
  head.append(box);
  card.append(head);
  return card;
}

/** 带标题与内容区的卡片 */
function newCard(title, hint) {
  const card = el('div', 'card');
  const head = el('div', 'card-head');
  const box = el('div');
  box.append(el('div', 'card-title', title));
  if (hint) box.append(el('div', 'card-hint', hint));
  head.append(box);
  const body = el('div', 'card-body');
  card.append(head, body);
  return { card, head, body };
}

/** 通用文本输入：读写都走回调，方便接数组下标这类路径 */
function freeText(getVal, setVal, opts) {
  const o = opts || {};
  const inp = el('input', 'txt');
  inp.type = 'text';
  const v = getVal();
  inp.value = v == null ? '' : String(v);
  if (o.placeholder) inp.placeholder = o.placeholder;
  if (o.width) inp.style.flex = `0 0 ${o.width}px`;
  inp.addEventListener('change', () => setVal(inp.value));
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { setVal(inp.value); inp.blur(); } });
  return inp;
}

function buildTextSection(sec) {
  const wrap = el('div', 'section');
  wrap.dataset.section = sec.id;
  wrap.append(sectionHead('文字替换', '改的是「显示出来的字」。留空 = 用内置默认值，逻辑完全不受影响'));

  // ---- 投掷物单字 ----
  const g = newCard('投掷物单字', '顺位固定为 火 → 烟 → 雷 → 闪 → 诱，改字不会改变顺位');
  for (const k of state.grenadeKinds) {
    g.body.append(fieldRow(k.label, freeText(
      () => getPath(state.cfg, `text.grenadeChars.${k.id}`) ?? k.char,
      (v) => commit(`text.grenadeChars.${k.id}`, v),
      { placeholder: k.char, width: 96 },
    )));
  }
  g.body.append(fieldRow('分隔符', freeText(
    () => getPath(state.cfg, 'text.grenadeSep') ?? '・',
    (v) => commit('text.grenadeSep', v),
    { placeholder: '・', width: 96 },
  )));
  wrap.append(g.card);

  // ---- 比分面板标签 ----
  const l = newCard('比分面板标签', '顶部面板显示的文字');
  const labelFields = [
    ['存活', 'alive', '存活'],
    ['CT 阵营', 'ct', 'CT'],
    ['T 阵营', 't', 'T'],
  ];
  for (const [name, key, def] of labelFields) {
    l.body.append(fieldRow(name, freeText(
      () => getPath(state.cfg, `text.labels.${key}`) ?? def,
      (v) => commit(`text.labels.${key}`, v),
      { placeholder: def, width: 150 },
    )));
  }
  wrap.append(l.card);

  // ---- 武器名 ----
  wrap.append(buildWeaponNamesCard());

  return wrap;
}

function buildWeaponNamesCard() {
  const { card, body } = newCard('武器名称', '左边是 GSI 的内部名，中间是当前名字，右边填你想显示的字');

  const srow = el('div', 'search-row');
  const search = el('input', 'txt');
  search.type = 'text';
  search.placeholder = '搜索武器（内部名或显示名都行）…';
  const resetAll = el('button', 'mini', '全部恢复默认');
  resetAll.addEventListener('click', () => {
    setPath(state.cfg, 'text.weaponNames', {});
    rebuild();
    markDirty();
    schedulePreview();
    toast('武器名已全部恢复默认', 'ok');
  });
  srow.append(search, resetAll);
  body.append(srow);

  const list = el('div', 'wlist');
  const rows = [];

  for (const [key, def] of Object.entries(state.weaponNames)) {
    const map = getPath(state.cfg, 'text.weaponNames') || {};
    const row = el('div', 'wrow');

    const cur = el('div', 'wcur', map[key] || def);

    const inp = el('input', 'txt');
    inp.type = 'text';
    inp.value = map[key] || '';
    inp.placeholder = def;

    const clr = el('button', 'wclear', '清除');
    clr.classList.toggle('hidden', !map[key]);

    const sync = () => {
      const next = Object.assign({}, getPath(state.cfg, 'text.weaponNames') || {});
      const v = inp.value.trim();
      if (v) next[key] = v; else delete next[key];
      setPath(state.cfg, 'text.weaponNames', next);
      cur.textContent = v || def;
      clr.classList.toggle('hidden', !v);
      markDirty();
      schedulePreview();
    };

    inp.addEventListener('input', sync);
    clr.addEventListener('click', () => { inp.value = ''; sync(); });

    row.append(el('div', 'wkey', key === '_knife' ? '匕首（所有刀具）' : key), cur, inp, clr);
    list.append(row);
    rows.push({ row, key, def });
  }

  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    for (const r of rows) {
      const hit = !q || r.key.toLowerCase().includes(q) || r.def.toLowerCase().includes(q);
      r.row.classList.toggle('hidden', !hit);
    }
  });

  body.append(list);
  return card;
}

// ============================================================
// 「自定义元素」页
// ============================================================

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
    '自己加任意数量的文本框，内容用 {变量} 插值。位移 / 缩放和其它模块一样，位移不受缩放影响'));

  ensureCustomArray();

  // ---- 变量速查：点一下插到正在编辑的文本框里，没有就复制 ----
  const vc = newCard('可用变量', '点一下插入到正在编辑的文本框；没有在编辑就复制到剪贴板');
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
    toast('已添加，往下滚到最底部即可编辑', 'ok');
  });
  addRow.append(addBtn);
  wrap.append(addRow);

  // ---- 常用示例：一键添加 ----
  const tplCard = newCard('常用示例',
    '点一下直接加进来，模板 / 位置 / 字号都配好了，加完再按自己的习惯改。');
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
      toast('已添加「' + t.name + '」，往下滚到最底部编辑', 'ok');
    });
    tplGrid.append(b);
  }
  tplCard.body.append(tplGrid);
  wrap.append(tplCard.card);

  if (!state.cfg.custom.length) {
    wrap.append(el('div', 'empty-hint',
      '还没有自定义文本元素。\n点上面的按钮加一个，模板可以写成 {weapon}  {clip} / {reserve} 这种。'));
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

// ============================================================
// 「击杀播报」页
// ============================================================

const EV_KINDS = [
  ['kill', '击杀', '每次击杀播一次。本回合爆头数同时上涨时，说明这次是爆头'],
  ['multi', '连杀', '本回合击杀达到 2 人起播。文字里可以用 {round_kills} 这类变量'],
  ['death', '阵亡', '每次死亡播一次'],
  ['assist', '助攻', '默认关闭 —— 助攻比击杀频繁，开着容易吵'],
  ['mvp', 'MVP', '默认关闭'],
];

function buildEventsSection(sec) {
  const wrap = el('div', 'section');
  wrap.dataset.section = sec.id;
  wrap.append(sectionHead('击杀 / 死亡播报',
    '同一帧只播一条，优先级 连杀 > 击杀 > 阵亡 > 助攻 > MVP，不会一次三杀弹出四条把屏幕糊满'));

  const base = newCard('播报行为', '位置用的是和自定义文本元素同一套锚点与位移约定，正数向右 / 向下');
  base.body.append(switchRow('开启播报', 'events.enabled'));
  base.body.append(fieldRow('屏幕锚点', selectControl({ path: 'events.anchor', options: ANCHORS })));
  base.body.append(fieldRow('水平位移', numControl({ path: 'events.offsetX', min: -900, max: 900, step: 1, unit: 'px' })));
  base.body.append(fieldRow('垂直位移', numControl({ path: 'events.offsetY', min: -900, max: 900, step: 1, unit: 'px' })));
  base.body.append(fieldRow('字号', numControl({ path: 'events.fontSize', min: 12, max: 96, step: 1, unit: 'px' })));
  base.body.append(fieldRow('停留时长', numControl({ path: 'events.holdMs', min: 300, max: 6000, step: 50, unit: 'ms' })));
  base.body.append(fieldRow('淡出时长', numControl({ path: 'events.fadeMs', min: 0, max: 1200, step: 20, unit: 'ms' })));
  wrap.append(base.card);

  for (const [key, name, hint] of EV_KINDS) {
    const c = newCard(name + ' 播报', hint);
    c.body.append(switchRow('开启', `events.${key}.on`));
    c.body.append(fieldRow('文字', freeText(
      () => getPath(state.cfg, `events.${key}.text`),
      (v) => commit(`events.${key}.text`, v),
      { placeholder: '写点什么', width: 280 },
    )));
    c.body.append(fieldRow('颜色', colorControl({ path: `events.${key}.color`, fallback: '#FFFFFF' })));
    wrap.append(c.card);
  }

  return wrap;
}

/** 开关行：开关在左、标题在右（和分区页里的写法保持一致） */
function switchRow(label, path) {
  const row = el('div', 'row');
  row.append(switchControl({ path }), el('span', 'switch-label', label));
  return row;
}

// ============================================================
// 「购买轮盘」页（两级方案）
// 一级轮盘 = 5 个分类扇区；点分类时 CS2 exec 对应阵营 × 分类的 cfg，
// 该 cfg 先 unbind 再把同一组购买键 bind 到该分类勾选的武器上（键复用）。
// ============================================================

const BUY_TEAMS = [
  { id: 'CT', label: 'CT（反恐精英）' },
  { id: 'T',  label: 'T（恐怖分子）' },
];

function buyCategories() {
  return (state.buyCatalog && state.buyCatalog.categories) || [];
}

function buyWeaponsFor(team, catId) {
  return ((state.buyCatalog && state.buyCatalog.weapons) || [])
    .filter((w) => w.cat === catId && (w.teams === 'both' || w.teams === team));
}

function ensureBuywheel() {
  if (!state.cfg.buywheel) state.cfg.buywheel = {};
  const b = state.cfg.buywheel;
  const keys = Array.isArray(b.keys) ? b.keys.map((k) => String(k || '')) : [];
  while (keys.length < 5) keys.push('');
  b.keys = keys.slice(0, 5);
  if (!b.teams || typeof b.teams !== 'object') b.teams = {};
  for (const t of BUY_TEAMS) {
    if (!b.teams[t.id] || typeof b.teams[t.id] !== 'object') b.teams[t.id] = {};
    for (const c of buyCategories()) {
      if (!Array.isArray(b.teams[t.id][c.id])) b.teams[t.id][c.id] = [];
    }
  }
}

function buildBuywheelSection(sec) {
  const wrap = el('div', 'section');
  wrap.dataset.section = sec.id;
  wrap.append(sectionHead('购买轮盘',
    '冻结时间 / 热身自动弹出两级轮盘：一级是 5 个分类（装备/手枪/冲锋枪/主武器/道具），'
    + '点分类时向 CS2 控制台注入 exec 指令激活对应 cfg —— 那份 cfg 先解绑购买键，再把同一组键'
    + '绑定到该分类勾选的武器（键在分类间复用）。二级菜单按真键购买由游戏自己完成，点格子则注入 buy 命令。'
    + '⚠️ 点选会向游戏注入按键（路线 B），是唯一被批准突破「不模拟输入」红线的地方，'
    + '只在购买时间、仅本地玩家自用。右键从二级退回一级，Esc 关闭轮盘。'));

  ensureBuywheel();
  const b = state.cfg.buywheel;

  const c = newCard('行为', '是否自动弹出、Esc 关闭、中心是否显示资金');
  c.body.append(switchRow('启用购买轮盘', 'buywheel.enabled'));
  c.body.append(switchRow('购买时间自动弹出', 'buywheel.openOnBuyTime'));
  c.body.append(switchRow('Esc 关闭并恢复穿透', 'buywheel.closeOnEsc'));
  c.body.append(switchRow('中心显示资金', 'buywheel.showMoney'));
  c.body.append(switchRow('关闭轮盘时解绑购买键', 'buywheel.unbindOnClose'));
  wrap.append(c.card);

  const a = newCard('执行方式',
    '激活分类 cfg 固定走控制台注入；这里的模式只影响二级菜单里「点格子下单」');
  a.body.append(fieldRow('中心文字', freeText(
    () => b.centerLabel,
    (v) => commit('buywheel.centerLabel', v),
    { placeholder: 'BUY', width: 160 },
  )));
  a.body.append(fieldRow('执行模式', selectControl({
    path: 'buywheel.execMode',
    options: [['auto', 'auto'], ['console', 'console'], ['key', 'key']],
  })));
  a.body.append(fieldRow('控制台键', freeText(
    () => b.consoleKey,
    (v) => commit('buywheel.consoleKey', v),
    { placeholder: '`', width: 60 },
  ), 'CS2 打开控制台的键，默认反引号，和你游戏里设的一致'));
  wrap.append(a.card);

  // ---- 购买键（5 个，所有分类复用）----
  const k = newCard('购买键',
    '同一组键在所有阵营 × 分类之间复用：激活分类时 cfg 会先 unbind 再重新 bind，'
    + '所以二级菜单里按这几个键就买对应位置的武器。推荐 F1–F5 或小键盘 kp_1–kp_5');
  b.keys.forEach((key, i) => {
    k.body.append(fieldRow(`购买键 ${i + 1}`, freeText(
      () => b.keys[i],
      (v) => { b.keys[i] = v; markDirty(); schedulePreview(); },
      { placeholder: i === 0 ? 'F1' : '', width: 90 },
    )));
  });
  wrap.append(k.card);

  // ---- 武器勾选：2 阵营 × 5 分类，每类最多 5 件 ----
  const s = newCard('武器配置',
    '每个阵营 × 分类最多勾 5 件（对应 5 个购买键）。保存设置时会自动生成 10 份分类 cfg '
    + '+ 1 份解绑 cfg 写进 CS2。⚠️ CS2 的配装系统：bind buy 只对「当前配装里装上了的武器」生效，'
    + '记得在游戏内配装界面把这些枪放进对应槽位');
  for (const t of BUY_TEAMS) {
    const teamBlock = el('div', 'buy-team');
    teamBlock.append(el('div', 'buy-team-name' + (t.id === 'T' ? ' t' : ''), t.label));
    for (const cat of buyCategories()) {
      teamBlock.append(buyChipRow(t.id, cat));
    }
    s.body.append(teamBlock);
  }
  wrap.append(s.card);

  // ---- cfg 输出 ----
  const g = newCard('cfg 输出',
    '默认自动探测 CS2 安装目录（game/csgo/cfg 与 game/core/cfg 都会写入）。'
    + '手填路径停在哪一层都行：cfg 目录 / csgo / game / CSGO 根 / Steam 库根均可，会自动归一。'
    + '保存设置时自动生成；也可以手动点一次立即生成');
  g.body.append(fieldRow('输出目录（留空自动探测）', freeText(
    () => b.cfgDir,
    (v) => commit('buywheel.cfgDir', v),
    { placeholder: '自动探测', width: 320 },
  )));
  const genBtn = el('button', 'btn primary', '立即生成 cfg 到 CS2');
  genBtn.addEventListener('click', async () => {
    genBtn.disabled = true;
    try {
      const r = await window.oph.generateBuycfg();
      if (r && r.ok) {
        toast(`已生成 ${r.copied} 份 cfg（CS2 目录 ${r.roots} 处）`, 'ok');
      } else if (r && r.error) {
        toast('生成失败：' + r.error, 'warn');
      } else {
        toast('没找到 CS2 目录——请填上面的输出目录，或检查 Steam 安装位置', 'warn');
      }
    } finally {
      genBtn.disabled = false;
    }
  });
  g.body.append(genBtn);
  wrap.append(g.card);

  return wrap;
}

/** 一个阵营 × 分类的勾选行：分类名 + 已选 n/5 + 武器 chip */
function buyChipRow(team, cat) {
  const selected = state.cfg.buywheel.teams[team][cat.id] || [];

  const row = el('div', 'buy-row');
  row.append(el('span', 'buy-cat', cat.label));
  row.append(el('span', 'buy-count', `${Math.min(selected.length, 5)}/5`));

  const chips = el('div', 'buy-chips');
  for (const w of buyWeaponsFor(team, cat.id)) {
    const on = selected.includes(w.id);
    const chip = el('button', 'buy-chip' + (on ? ' on' : ''), w.label);
    chip.addEventListener('click', () => {
      const arr = state.cfg.buywheel.teams[team][cat.id];
      const idx = arr.indexOf(w.id);
      if (idx >= 0) {
        arr.splice(idx, 1);
      } else {
        if (arr.length >= 5) {
          toast('每个分类最多 5 件——只有 5 个购买键，先取消一件再勾', 'warn');
          return;
        }
        arr.push(w.id);
      }
      markDirty();
      schedulePreview();
      rebuild();
    });
    chips.append(chip);
  }
  row.append(chips);
  return row;
}

// ============================================================
// 「进阶配置」组
//   进阶 · 全局默认  buildAdvancedSection        —— 所有元素共享的默认外观
//   进阶 · 每元素    buildAdvElementsSection      —— 每个元素单独覆盖
//   进阶 · 图标库    buildAdvIconsSection         —— emoji / SVG / 上传
//   进阶 · 画图      buildAdvDrawSection          —— 矢量编辑器 → 图标 / 形状元素
// 完整设计见项目根目录 ADVANCED-CONFIG-PLAN.md。
// ============================================================

const ADV_ROADMAP = [
  ['① 事件引擎', '把 GSI 快照的增量统一成「事件」（击杀 / 阵亡 / 连杀 / 下包 / 低血 …），所有展示都挂在事件上'],
  ['② 积木规则', '每条规则 = 触发条件 → 动作，连线式拼装；不写代码也能做「三杀时弹图标 + 抖动」'],
  ['③ 展示单元', '内容（文字 / 图标 / 图片）+ 样式（字体、描边）+ 时间轴（进入 / 停留 / 退出、时长、缩放脉冲）'],
  ['④ 效果层',   'HUD 抖动、手柄震动（Gamepad API）、音效'],
  ['⑤ 代码层',   '允许在面板里写受限 JS 表达式做高阶逻辑，沙箱执行、不接触文件与网络'],
];

// 进阶外观的元素清单与合并逻辑统一在 src/advstyle.js（设置界面与 HUD 共用同一份）：
//   OphAdv.ELEMENTS      —— 内置可配置元素（mod.* / ev.*）
//   OphAdv.resolveStyle  —— 「全局默认 + 每元素覆盖」合并
// 自定义元素（custom.N）与形状元素（shape.N）由 elementList() 动态补上。

const EASE_OPTIONS = [
  ['backOut',  '回弹（backOut，推荐）'],
  ['easeOut',  '渐出（easeOut）'],
  ['easeIn',   '渐入（easeIn）'],
  ['easeInOut','缓入缓出（easeInOut）'],
  ['linear',   '匀速（linear）'],
];

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

// ============================================================
// 进阶配置 · 辅助：覆盖式控件（继承 / 显式值）
// 「继承」= 把该键从配置里删掉，回落「进阶 · 全局默认」。
// 进阶外观的纯计算在 src/advstyle.js（与 HUD 渲染层共用同一份）。
// ============================================================

function advMod() { return globalThis.OphAdv || {}; }

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

// ============================================================
// 进阶配置 · 每元素
// ============================================================

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

// ============================================================
// 进阶配置 · 图标库
// ============================================================

function newId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
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

function readDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ''));
    fr.onerror = () => reject(new Error('读取文件失败'));
    fr.readAsDataURL(file);
  });
}

function buildAdvIconsSection(sec) {
  const wrap = el('div', 'section');
  wrap.dataset.section = sec.id;
  wrap.append(sectionHead('进阶配置 · 图标库',
    '攒一套自己的图标，播报 / 自定义元素都能引用。三种来源：内联 emoji、粘贴或上传 SVG、'
    + '以及手绘（去「进阶 · 画图」画好直接存进来）。'));

  ensureIcons();

  // ---- 新增：emoji / 文字 ----
  const c1 = newCard('新增 · emoji / 文字', '直接填一个字符，最简单');
  const emojiName = el('input', 'txt'); emojiName.type = 'text'; emojiName.placeholder = '图标名'; emojiName.style.flex = '0 0 150px';
  const emojiChar = el('input', 'txt'); emojiChar.type = 'text'; emojiChar.placeholder = '💀'; emojiChar.style.flex = '0 0 90px';
  const emojiPrev = el('span', 'icon-prev');
  emojiChar.addEventListener('input', () => { emojiPrev.textContent = emojiChar.value; });
  const addEmoji = el('button', 'btn primary', '加入图标库');
  addEmoji.addEventListener('click', () => {
    const t = emojiChar.value.trim();
    if (!t) { toast('先填一个 emoji / 字符', 'err'); return; }
    addIcon({ id: newId('ic'), name: emojiName.value.trim() || t, kind: 'text', text: t });
  });
  const row1 = el('div', 'search-row');
  row1.append(emojiName, emojiChar, emojiPrev, addEmoji);
  c1.body.append(row1);
  wrap.append(c1.card);

  // ---- 新增：粘贴 SVG ----
  const c2 = newCard('新增 · 粘贴 SVG',
    '把 SVG 源码粘进来。只保留图形本身，脚本 / 事件 / 外链会被丢弃。');
  const svgName = el('input', 'txt'); svgName.type = 'text'; svgName.placeholder = '图标名'; svgName.style.flex = '0 0 150px';
  const svgTa = document.createElement('textarea');
  svgTa.className = 'tpl';
  svgTa.placeholder = '<svg viewBox="0 0 24 24">…</svg>';
  const svgPrev = el('span', 'icon-prev-box');
  const addSvg = el('button', 'btn primary', '解析并加入');
  addSvg.addEventListener('click', () => {
    const A = advMod();
    if (typeof A.parseSVG !== 'function') { toast('解析模块没加载', 'err'); return; }
    const parsed = A.parseSVG(svgTa.value);
    if (!parsed.items.length) { toast('没解析出图形，检查一下 SVG', 'err'); return; }
    addIcon({ id: newId('ic'), name: svgName.value.trim() || 'SVG 图标', kind: 'draw',
      w: parsed.w, h: parsed.h, items: parsed.items });
  });
  svgTa.addEventListener('input', () => {
    const A = advMod();
    if (typeof A.parseSVG !== 'function') return;
    const parsed = A.parseSVG(svgTa.value);
    svgPrev.textContent = '';
    if (parsed.items.length && typeof A.shapeToSVG === 'function') {
      svgPrev.insertAdjacentHTML('beforeend', A.shapeToSVG({ w: parsed.w, h: parsed.h, items: parsed.items }, {}));
    }
  });
  const row2 = el('div', 'row');
  row2.style.display = 'block';
  row2.append(svgName, svgTa, svgPrev, addSvg);
  c2.body.append(row2);
  wrap.append(c2.card);

  // ---- 新增：上传文件 ----
  const c3 = newCard('新增 · 上传文件', '支持 .svg / .png / .jpg / .webp / .gif');
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.svg,image/svg+xml,image/png,image/jpeg,image/webp,image/gif';
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const A = advMod();
    const name = file.name.replace(/\.[^.]+$/, '');
    try {
      if (/\.svg$/i.test(file.name) || file.type === 'image/svg+xml') {
        const text = await file.text();
        const parsed = (typeof A.parseSVG === 'function') ? A.parseSVG(text) : { items: [] };
        if (!parsed.items.length) { toast('这个 SVG 没解析出图形', 'err'); return; }
        addIcon({ id: newId('ic'), name, kind: 'draw', w: parsed.w, h: parsed.h, items: parsed.items });
      } else if (/^image\//.test(file.type)) {
        const url = await readDataURL(file);
        if (!(A.safeDataURL && A.safeDataURL(url))) { toast('图片格式不支持', 'err'); return; }
        addIcon({ id: newId('ic'), name, kind: 'image', data: url });
      } else {
        toast('只支持 SVG 与图片文件', 'err');
      }
    } catch (e) {
      toast('读取失败：' + e.message, 'err');
    } finally {
      fileInput.value = '';
    }
  });
  c3.body.append(fileInput);
  wrap.append(c3.card);

  // ---- 图标列表 ----
  const c4 = newCard('图标库', state.cfg.icons.length ? `现有 ${state.cfg.icons.length} 个图标` : '还没有图标');
  if (!state.cfg.icons.length) {
    c4.body.append(el('div', 'empty-hint', '还没有图标。用上面任意一种方式加一个吧。'));
  }
  for (const ic of state.cfg.icons) {
    const row = el('div', 'icon-row');
    row.append(iconPreview(ic));

    const nameInp = el('input', 'txt');
    nameInp.type = 'text';
    nameInp.value = ic.name || '';
    nameInp.style.flex = '0 0 160px';
    nameInp.addEventListener('change', () => { ic.name = nameInp.value.trim() || ic.name; markDirty(); schedulePreview(); });

    const kindTag = el('span', 'tag', { text: '文字', draw: 'SVG', image: '图片' }[ic.kind] || ic.kind);
    const idTag = el('span', 'note', ic.id);

    const del = el('button', 'mini danger', '删除');
    del.addEventListener('click', () => {
      const idx = state.cfg.icons.indexOf(ic);
      if (idx >= 0) state.cfg.icons.splice(idx, 1);
      rebuild(); markDirty(); schedulePreview();
      toast('已删除图标', 'ok');
    });

    row.append(nameInp, kindTag, idTag, del);
    c4.body.append(row);
  }
  wrap.append(c4.card);

  return wrap;
}

// ============================================================
// 进阶配置 · 画图（矢量编辑器 → 图标 / HUD 形状元素）
// ============================================================

// 画图会话状态（不落盘，仅本页编辑期间用）
const drawState = {
  w: 240, h: 120,
  items: [],
  tool: 'rect',
  stroke: '#E8C46A',
  strokeWidth: 3,
  fill: 'none',
  text: '文字',
};

function buildAdvDrawSection(sec) {
  const wrap = el('div', 'section');
  wrap.dataset.section = sec.id;
  wrap.append(sectionHead('进阶配置 · 画图',
    '用矩形 / 椭圆 / 直线 / 自由笔 / 文字拼出一张矢量图，可以存成图标，也可以直接做成贴在 HUD 上的形状元素。'
    + '文字图元支持 {变量} 插值，例如 {money}、{weapon}。'));

  ensureShapes();

  // ---- 工具栏 ----
  const c1 = newCard('画笔', '选好工具在下面画布上拖拽即可');
  const tools = el('div', 'tools');
  const TOOLS = [['rect', '矩形'], ['ellipse', '椭圆'], ['line', '直线'], ['pen', '自由笔'], ['text', '文字']];
  const toolBtns = {};
  const syncTool = () => { for (const [k, b] of Object.entries(toolBtns)) b.classList.toggle('active', k === drawState.tool); };
  for (const [k, label] of TOOLS) {
    const b = el('button', 'tool', label);
    b.addEventListener('click', () => { drawState.tool = k; syncTool(); });
    toolBtns[k] = b;
    tools.append(b);
  }
  syncTool();
  c1.body.append(tools);

  const row = el('div', 'search-row');
  const strokeCtl = colorControl2('描边色', drawState.stroke, (v) => { drawState.stroke = v; });
  const fillCtl = colorControl2('填充色', drawState.fill, (v) => { drawState.fill = v; }, true);
  const widthCtl = numControl2('线宽', drawState.strokeWidth, 1, 20, 1, (v) => { drawState.strokeWidth = v; });
  const sizeW = numControl2('画布宽', drawState.w, 40, 1920, 1, (v) => { drawState.w = v; redraw(); });
  const sizeH = numControl2('画布高', drawState.h, 24, 1080, 1, (v) => { drawState.h = v; redraw(); });
  row.append(strokeCtl, fillCtl, widthCtl, sizeW, sizeH);
  c1.body.append(row);

  const rowT = el('div', 'search-row');
  const textInp = el('input', 'txt');
  textInp.type = 'text';
  textInp.value = drawState.text;
  textInp.placeholder = '文字内容（可用 {变量}）';
  textInp.style.flex = '0 0 220px';
  textInp.addEventListener('input', () => { drawState.text = textInp.value; });
  rowT.append(el('span', 'note', '文字内容：'), textInp);
  c1.body.append(rowT);
  wrap.append(c1.card);

  // ---- 画布 ----
  // ⚠️ 画布必须与 viewBox 严格同比例。
  //    以前的写法是 canvas 固定 height:264px、viewBox 是 240×120（2:1），
  //    配合 preserveAspectRatio="xMidYMid meet" 会把内容等比缩进中间留白，
  //    而取点 localPoint() 却按整块 bounding rect 线性映射 —— 于是
  //    「鼠标画在哪」和「图元落在哪」整体错位（用户反馈的「位置不精准」）。
  //    现在用 aspect-ratio 让 SVG 盒子本身就等于 viewBox 比例，取点与绘制一一对应。
  const c2 = newCard('画布', '按住鼠标拖拽绘制。画布比例 = 导出比例，画在哪就落在哪');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'draw-canvas');
  const canvasWrap = el('div', 'draw-wrap');
  canvasWrap.append(svg);
  c2.body.append(canvasWrap);

  const readout = el('div', 'draw-readout');
  const rdSize = el('span', 'rd-item');
  const rdPos = el('span', 'rd-item');
  readout.append(rdSize, rdPos);
  c2.body.append(readout);

  const bar = el('div', 'search-row');
  const undo = el('button', 'btn', '撤销');
  undo.addEventListener('click', () => { drawState.items.pop(); redraw(); });
  const clear = el('button', 'btn', '清空');
  clear.addEventListener('click', () => { if (drawState.items.length && confirm('清空当前画布？')) { drawState.items = []; redraw(); } });
  bar.append(undo, clear);
  c2.body.append(bar);
  wrap.append(c2.card);

  // ---- 输出 ----
  const c3 = newCard('输出', '存成图标库条目，或做成贴在 HUD 上的形状元素');
  const outName = el('input', 'txt');
  outName.type = 'text'; outName.placeholder = '名称'; outName.style.flex = '0 0 170px';
  const toIcon = el('button', 'btn', '存为图标');
  toIcon.addEventListener('click', () => {
    if (!drawState.items.length) { toast('画布还是空的', 'err'); return; }
    addIcon({ id: newId('ic'), name: outName.value.trim() || '手绘图标', kind: 'draw',
      w: drawState.w, h: drawState.h, items: clone(drawState.items) });
  });
  const toShape = el('button', 'btn primary', '添加为 HUD 形状元素');
  toShape.addEventListener('click', () => {
    if (!drawState.items.length) { toast('画布还是空的', 'err'); return; }
    addShape({
      id: newId('sh'), name: outName.value.trim() || '形状', enabled: true,
      anchor: 'tl', offsetX: 40, offsetY: 40, scale: 1, rotate: 0,
      opacity: 1, glow: 0, glowColor: '#FFFFFF',
      w: drawState.w, h: drawState.h, items: clone(drawState.items),
    });
  });
  const row3 = el('div', 'search-row');
  row3.append(outName, toIcon, toShape);
  c3.body.append(row3);
  wrap.append(c3.card);

  // ---- 已有形状元素 ----
  const c4 = newCard('HUD 形状元素', '这些会直接画在覆盖层上；位置 / 缩放 / 辉光都能单独调');
  if (!state.cfg.shapes.length) {
    c4.body.append(el('div', 'empty-hint', '还没有形状元素。画好点「添加为 HUD 形状元素」即可。'));
  }
  state.cfg.shapes.forEach((it, i) => c4.body.append(shapeCard(it, i, redraw)));
  wrap.append(c4.card);

  // ---- 载入已有形状回画布 ----
  if (state.cfg.shapes.length) {
    const c5 = newCard('继续编辑', '把已有形状载入画布修改');
    const sel = el('select', 'sel');
    state.cfg.shapes.forEach((it, i) => {
      const o = el('option', null, (it.name || '形状 ' + (i + 1)));
      o.value = String(i);
      sel.append(o);
    });
    const load = el('button', 'btn', '载入画布');
    load.addEventListener('click', () => {
      const it = state.cfg.shapes[Number(sel.value)];
      if (!it) return;
      drawState.w = Number(it.w) || 120;
      drawState.h = Number(it.h) || 60;
      drawState.items = clone(it.items || []);
      rebuild();
      toast('已载入画布', 'ok');
    });
    const back = el('button', 'btn primary', '写回该形状');
    back.addEventListener('click', () => {
      const it = state.cfg.shapes[Number(sel.value)];
      if (!it) return;
      it.w = drawState.w; it.h = drawState.h; it.items = clone(drawState.items);
      rebuild(); markDirty(); schedulePreview();
      toast('已写回形状', 'ok');
    });
    const row5 = el('div', 'search-row');
    row5.append(sel, load, back);
    c5.body.append(row5);
    wrap.append(c5.card);
  }

  // ================= 画布交互与重绘 =================
  let drafting = null;   // 正在拖拽的图元

  function localPoint(ev) {
    const r = svg.getBoundingClientRect();
    const x = (ev.clientX - r.left) / Math.max(1, r.width) * drawState.w;
    const y = (ev.clientY - r.top) / Math.max(1, r.height) * drawState.h;
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  }

  /** 网格步长：按画布短边自适应，落在 5 / 10 / 20 / 50 … 这类好读的数上 */
  function gridStepOf(w, h) {
    const raw = Math.max(1, Math.min(w, h) / 10);
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    return Math.max(4, Math.round(raw / pow) * pow);
  }

  /**
   * 画布背景网格：细格 + 每 5 格一条主格线 + 中心十字。
   * 线宽用 vector-effect="non-scaling-stroke" 固定为视觉 1px，缩放画布时不会变粗。
   */
  function gridSVG(w, h) {
    const step = gridStepOf(w, h);
    const nv = (v) => String(Math.round(v * 100) / 100);
    const line = (x1, y1, x2, y2, major) => `<line x1="${nv(x1)}" y1="${nv(y1)}" x2="${nv(x2)}" y2="${nv(y2)}"`
      + ` stroke="${major ? '#111111' : '#8A8A8A'}" stroke-width="1" vector-effect="non-scaling-stroke"`
      + ` opacity="${major ? 0.26 : 0.14}"/>`;
    let s = '';
    for (let x = step; x < w - 0.001; x += step) s += line(x, 0, x, h, Math.round(x / step) % 5 === 0);
    for (let y = step; y < h - 0.001; y += step) s += line(0, y, w, y, Math.round(y / step) % 5 === 0);
    s += `<rect x="0.5" y="0.5" width="${nv(Math.max(0, w - 1))}" height="${nv(Math.max(0, h - 1))}"`
      + ' fill="none" stroke="#111111" stroke-width="1" vector-effect="non-scaling-stroke" opacity="0.45"/>';
    s += line(w / 2, 0, w / 2, h, false).replace('#8A8A8A', '#CC0000');
    s += line(0, h / 2, w, h / 2, false).replace('#8A8A8A', '#CC0000');
    return `<g class="dw-grid">${s}</g>`;
  }

  function redraw() {
    const A = advMod();
    const items = draftPreview ? drawState.items.concat([draftPreview]) : drawState.items;
    const body = (typeof A.primitivesToSVG === 'function') ? A.primitivesToSVG(items, {}) : '';
    svg.setAttribute('viewBox', `0 0 ${drawState.w} ${drawState.h}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    // 让 SVG 盒子严格等于 viewBox 比例（关键修复：不再产生 letterbox 内缩）
    svg.style.aspectRatio = `${drawState.w} / ${drawState.h}`;
    svg.innerHTML = gridSVG(drawState.w, drawState.h) + body;
    svg.classList.toggle('empty', !body);
    rdSize.textContent = `画布 ${Math.round(drawState.w)} × ${Math.round(drawState.h)}`
      + `　·　网格 ${gridStepOf(drawState.w, drawState.h)} 单位`;
  }

  let draftPreview = null;

  svg.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    svg.setPointerCapture(ev.pointerId);
    const [x, y] = localPoint(ev);
    const t = drawState.tool;

    if (t === 'text') {
      const txt = drawState.text || '文字';
      drawState.items.push({
        type: 'text', x, y: y + 16, text: txt,
        fontSize: 20, fill: drawState.stroke === 'none' ? '#FFFFFF' : drawState.stroke,
      });
      redraw();
      return;
    }
    if (t === 'pen') {
      drafting = { type: 'polyline', points: [[x, y]], fill: 'none', stroke: drawState.stroke, strokeWidth: drawState.strokeWidth };
      draftPreview = drafting;
      redraw();
      return;
    }
    const proto = {
      type: t, x, y, w: 0, h: 0,
      fill: drawState.fill, stroke: drawState.stroke, strokeWidth: drawState.strokeWidth,
      x1: x, y1: y, x2: x, y2: y, cx: x, cy: y, rx: 0, ry: 0, _sx: x, _sy: y,
    };
    drafting = proto;
    draftPreview = proto;
    redraw();
  });

  svg.addEventListener('pointermove', (ev) => {
    const [x, y] = localPoint(ev);
    rdPos.textContent = `x ${x}　y ${y}`;
    if (!drafting) return;
    if (drafting.type === 'polyline') {
      drafting.points.push([x, y]);
    } else if (drafting.type === 'line') {
      drafting.x2 = x; drafting.y2 = y;
    } else if (drafting.type === 'ellipse') {
      drafting.cx = (drafting._sx + x) / 2; drafting.cy = (drafting._sy + y) / 2;
      drafting.rx = Math.abs(x - drafting._sx) / 2; drafting.ry = Math.abs(y - drafting._sy) / 2;
    } else {
      drafting.x = Math.min(drafting._sx, x); drafting.y = Math.min(drafting._sy, y);
      drafting.w = Math.abs(x - drafting._sx); drafting.h = Math.abs(y - drafting._sy);
    }
    redraw();
  });

  const finish = (ev) => {
    if (!drafting) return;
    const d = drafting;
    drafting = null;
    draftPreview = null;
    // 太小的点/短笔忽略，避免误点留下垃圾
    const tiny = (d.type === 'rect' && d.w < 2 && d.h < 2)
      || (d.type === 'ellipse' && d.rx < 1 && d.ry < 1)
      || (d.type === 'line' && Math.abs(d.x2 - d.x1) < 2 && Math.abs(d.y2 - d.y1) < 2)
      || (d.type === 'polyline' && d.points.length < 2);
    if (!tiny) {
      const item = clone(d);
      delete item._sx; delete item._sy;
      if (item.type === 'polyline') item.type = 'polyline';
      drawState.items.push(item);
    }
    redraw();
    if (ev && ev.pointerId != null) { try { svg.releasePointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ } }
  };
  svg.addEventListener('pointerup', finish);
  svg.addEventListener('pointercancel', finish);
  svg.addEventListener('pointerleave', () => { rdPos.textContent = ''; });

  redraw();

  return wrap;
}

function clone(v) { return JSON.parse(JSON.stringify(v)); }

function ensureShapes() {
  if (!Array.isArray(state.cfg.shapes)) state.cfg.shapes = [];
}

function addShape(sh) {
  ensureShapes();
  state.cfg.shapes.push(sh);
  rebuild();
  markDirty();
  schedulePreview();
  toast('已加入 HUD 形状元素', 'ok');
}

/** 形状元素的位置 / 外观卡片 */
function shapeCard(it, idx, onChanged) {
  const p = `shapes.${idx}`;
  const card = el('div', 'card');

  const head = el('div', 'card-head');
  const hrow = el('div', 'ci-head');
  const sw = el('div', 'switch' + (it.enabled === false ? '' : ' on'));
  sw.addEventListener('click', () => {
    const next = !sw.classList.contains('on');
    sw.classList.toggle('on', next);
    commit(`${p}.enabled`, next);
    if (onChanged) onChanged();
  });
  const del = el('button', 'ci-del', '删除');
  del.addEventListener('click', () => {
    if (!confirm('删除「' + (it.name || '形状 ' + (idx + 1)) + '」？')) return;
    state.cfg.shapes.splice(idx, 1);
    rebuild(); markDirty(); schedulePreview();
  });
  hrow.append(sw, el('div', 'ci-title', it.name || ('形状 ' + (idx + 1))), del);
  head.append(hrow);
  card.append(head);

  const body = el('div', 'card-body');

  const nameInp = el('input', 'txt');
  nameInp.type = 'text'; nameInp.value = it.name || '';
  nameInp.addEventListener('change', () => { it.name = nameInp.value.trim(); markDirty(); schedulePreview(); });
  body.append(fieldRow('名称', nameInp));

  const sel = el('div', 'sel');
  sel.append(anchorGrid(it.anchor || 'tl', (v) => commit(`${p}.anchor`, v)));
  body.append(fieldRow('屏幕锚点', sel,
    '图形从这个位置贴上屏幕：「左上」= 贴安全区左上角，「正中」= 屏幕中心。'));

  const num = (key, label, min, max, step, unit, note) => {
    const c = numControl({ path: `${p}.${key}`, min, max, step, unit });
    body.append(fieldRow(label, c, note));
  };
  num('offsetX', '水平位移', -900, 900, 1, 'px', '相对锚点的像素位移，正数向右。');
  num('offsetY', '垂直位移', -600, 600, 1, 'px', '正数向下。');
  num('scale', '缩放', 0.2, 4, 0.01, '×');
  num('rotate', '旋转角度', -180, 180, 1, '°');
  num('opacity', '整体不透明度', 0, 1, 0.01);
  num('glow', '辉光强度', 0, 1, 0.01, null, '0 = 关闭；辉光颜色在下一行。');
  body.append(fieldRow('辉光颜色', colorControl({ path: `${p}.glowColor`, fallback: '#FFFFFF' })));

  card.append(body);
  return card;
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

// ============================================================
// 首页
// ============================================================

// 首页的重绘函数。状态每秒推一次，每次重建 section 都会换成新的。
let homePaint = null;
// 预览按钮的同步函数（init 里赋真身），首页也要能改它的状态
let applyPreviewBtn = null;

/** 立刻向主进程要一份最新状态并重绘首页 */
async function pushStatusNow() {
  try {
    const st = await window.oph.status();
    state.status = st;
    if (homePaint) homePaint(st);
  } catch (e) { /* 主进程没就绪时忽略 */ }
}

function buildHomeSection(sec) {
  const wrap = el('div', 'section');
  wrap.dataset.section = sec.id;
  wrap.append(sectionHead('总览', '一眼看清当前在跑什么、游戏连上没有，以及最常用的几个操作'));

  // ---------------- 状态带 ----------------
  const band = el('div', 'hs-band');
  const dot = el('span', 'hs-dot');
  const hsMain = el('div', 'hs-main');
  const hsTitle = el('div', 'hs-title', '正在读取状态…');
  const hsSub = el('div', 'hs-sub', '');
  hsMain.append(hsTitle, hsSub);
  const hsBadge = el('span', 'hs-badge', '—');
  band.append(dot, hsMain, hsBadge);
  wrap.append(band);

  // ---------------- 关键信息 ----------------
  wrap.append(el('div', 'home-sub', '关键信息'));
  const info = el('div', 'stat-grid');
  wrap.append(info);
  const infoVal = {};
  const statBox = (host, key, label) => {
    const box = el('div', 'stat');
    box.append(el('div', 'stat-k', label));
    const v = el('div', 'stat-v', '—');
    box.append(v);
    host.append(box);
    return v;
  };
  infoVal.mode = statBox(info, 'mode', '运行模式');
  infoVal.port = statBox(info, 'port', '数据端口');
  infoVal.res = statBox(info, 'res', '设计分辨率');
  infoVal.fit = statBox(info, 'fit', '屏幕适配');
  infoVal.scale = statBox(info, 'scale', '整体缩放');
  infoVal.display = statBox(info, 'display', '显示器');

  // ---------------- 快捷操作 ----------------
  wrap.append(el('div', 'home-sub', '快捷操作'));
  const quick = el('div', 'quick-grid');
  wrap.append(quick);

  const qcard = (host, title, desc, fn, accent) => {
    const b = el('button', 'qcard' + (accent ? ' accent' : ''));
    b.type = 'button';
    b.append(el('span', 'qc-t', title), el('span', 'qc-d', desc));
    b.addEventListener('click', fn);
    host.append(b);
    return b;
  };

  const gsiNote = el('div', 'home-note', '');
  const refreshGsi = async () => {
    try {
      const r = await window.oph.gsiInfo();
      if (!r.ok) { gsiNote.textContent = '无法检查 GSI 安装状态：' + (r.error || '未知错误'); gsiNote.className = 'home-note warn'; return; }
      if (!r.roots || !r.roots.length) {
        gsiNote.textContent = '⚠ 没有自动探测到 CS2 —— 需要手动把 cfg 复制到 <CS2>\\game\\csgo\\cfg\\ 与 game\\core\\cfg\\';
        gsiNote.className = 'home-note warn';
      } else {
        gsiNote.textContent = `已找到 ${r.roots.length} 处 CS2 配置目录`
          + (r.running ? '；CS2 正在运行，装完要完全退出游戏再重开才生效。' : '。');
        gsiNote.className = 'home-note';
      }
    } catch (e) { gsiNote.textContent = ''; }
  };

  const gsiBtn = qcard(quick, '安装 GSI 配置', '把 Valve 官方 GSI 配置写进 CS2 目录（等同托盘里那一项）', async () => {
    gsiBtn.disabled = true;
    let r = null;
    try { r = await window.oph.installCfg(); } catch (e) { r = { ok: false, reason: e.message }; }
    gsiBtn.disabled = false;
    if (r && r.ok) {
      toast(`已写入 ${r.copied.length} 处，完全重启 CS2 后生效${r.running ? '（CS2 正在运行，请先退出）' : ''}`, 'ok');
    } else if (r && r.reason === 'no_cs2') {
      toast('自动探测不到 CS2 安装目录，需要手动复制 cfg', 'err');
    } else if (r && r.reason === 'no_source') {
      toast('程序里没找到 GSI 配置文件', 'err');
    } else {
      toast('安装失败：' + ((r && r.reason) || '未知原因'), 'err');
    }
    refreshGsi();
  }, true);

  qcard(quick, '原生 HUD 命令', '把「关原生 HUD / 保留雷达与队友标识」那组命令写进 CS2', () => activate('gamecmds'));

  qcard(quick, '实时预览', '开一个用模拟数据的窗口，边调边看', async () => {
    let on = false;
    try { on = await window.oph.togglePreview(); } catch (e) { return; }
    if (applyPreviewBtn) applyPreviewBtn(on);
    toast(on ? '预览窗口已打开（数据是模拟的）' : '预览窗口已关闭', 'ok');
    pushStatusNow();
  });

  qcard(quick, '显示 / 隐藏 HUD', '和托盘菜单里那一项一样', async () => {
    const r = await window.oph.toggleHud();
    toast(r && r.visible ? 'HUD 已显示' : 'HUD 已隐藏', 'ok');
  });

  qcard(quick, '重新读取配置', '丢弃未保存的改动，从 config.json 重读一遍', async () => {
    const r = await window.oph.reloadConfig();
    if (r && r.cfg) {
      state.cfg = r.cfg;
      state.dirty = false;
      document.getElementById('dirty').hidden = true;
      rebuild();
      window.oph.preview(state.cfg);
    }
    toast('已重新读取配置', 'ok');
  });

  qcard(quick, '配置文件位置', '在资源管理器里定位 config.json', () => window.oph.reveal());
  qcard(quick, '方案目录', '打开本地配置方案的存放文件夹', () => window.oph.profiles.reveal());
  qcard(quick, '开发者工具', '排查渲染问题时用（挂在 HUD 窗口上）', () => window.oph.openDevTools());

  wrap.append(gsiNote);

  // ---------------- 配置概览 ----------------
  wrap.append(el('div', 'home-sub', '当前配置概览'));
  const sum = el('div', 'stat-grid');
  wrap.append(sum);
  const sumVal = {};
  // 10-13：击杀播报 / 进阶外观 / 画图 / 图标库 / 购买轮盘 已下线，概览格一并移除
  sumVal.custom = statBox(sum, 'custom', '自定义文本');
  sumVal.gamecmds = statBox(sum, 'gamecmds', '游戏命令');

  // ---------------- 继续 ----------------
  wrap.append(el('div', 'home-sub', '继续'));
  const more = el('div', 'quick-grid');
  const go = (id, title, desc) => qcard(more, title, desc, () => activate(id));
  go('gamecmds', '原生 HUD 命令', '关原生 HUD、把雷达与队友标识留住');
  go('profiles', '配置方案', '保存 / 切换多套配置');
  // 「教程」「进阶 · 每元素」「进阶 · 画图」入口已随对应设置页一同下线（10-13）
  wrap.append(more);

  // ---------------- 绘制 ----------------
  const setStat = (host, key, v, cls) => {
    const n = host[key];
    if (!n) return;
    n.textContent = v;
    n.className = 'stat-v' + (cls ? ' ' + cls : '');
  };
  const FIT_LABEL = {
    fill: '拉伸铺满（4:3 怀旧）',
    stretch: '等比铺满 Cover',
    contain: '等比完整 Contain',
  };

  const paint = (s) => {
    if (!s) return;
    const live = s.connected && s.inMatch;
    const connected = !!s.connected;
    band.classList.toggle('ok', live);
    band.classList.toggle('warn', connected && !live);
    band.classList.toggle('off', !connected);
    hsTitle.textContent = !s.running ? '覆盖层没有在运行'
      : live ? '正在对局中'
        : connected ? '已连上，但当前不在对局里'
          : '等待游戏数据';
    hsSub.textContent = !s.running ? '检查一下覆盖层进程是否被关掉了'
      : live ? 'GSI 数据正常，HUD 正在显示'
        : connected ? 'HUD 会在进入对局时自动出现'
          : '没开 CS2，或者 GSI 配置还没装到 CS2 目录里';
    hsBadge.textContent = s.mock ? '模拟数据' : '真实 GSI';
    hsBadge.classList.toggle('mock', !!s.mock);

    setStat(infoVal, 'mode', s.mock ? '模拟数据' : '真实 GSI');
    setStat(infoVal, 'port', String(s.port));
    setStat(infoVal, 'res', s.design);
    setStat(infoVal, 'fit', FIT_LABEL[s.fit] || s.fit);
    setStat(infoVal, 'scale', String(s.scale));
    setStat(infoVal, 'display', s.mock ? '—' : '#' + (Number(s.displayIndex) + 1));

    setStat(sumVal, 'custom', String(s.custom));
    setStat(sumVal, 'gamecmds',
      (s.gamecmds == null ? '—' : (s.gamecmds + ' / ' + (s.gamecmdsAll || 0) + ' 条')),
      s.gamecmds && s.gamecmds === s.gamecmdsAll ? 'ok' : 'dim');
  };

  homePaint = paint;
  if (state.status) paint(state.status);
  refreshGsi();

  return wrap;
}

// ============================================================
// 原生 HUD / 游戏命令
//
// 命令目录的权威定义在主进程的 src/gamecmds.js，界面只负责把它列出来 ——
// 不在渲染层重写一份，免得两边说法不一致。
// 勾选直接落在 state.cfg.gamecmds.enabled 上，跟别的设置一样随「保存」落盘；
// 「写入 CS2」会连当前未保存的勾选一起写进 CS2 的 cfg 目录。
// ⚠️ 只写文本文件，不模拟按键 —— 和项目底线一致。
// ============================================================

/** 把 state.cfg.gamecmds 补成完整结构（旧配置 / 手改坏的 config.json 都兜住） */
function ensureGamecmds() {
  if (!state.cfg.gamecmds || typeof state.cfg.gamecmds !== 'object') state.cfg.gamecmds = {};
  const gc = state.cfg.gamecmds;
  if (!gc.enabled || typeof gc.enabled !== 'object') gc.enabled = {};
  for (const c of ((state.gamecmds && state.gamecmds.catalog) || [])) {
    if (typeof gc.enabled[c.id] !== 'boolean') gc.enabled[c.id] = true;
  }
  if (typeof gc.autoexec !== 'boolean') gc.autoexec = false;
  return gc;
}

/** 重新问主进程要一次状态（写完 / 移除后刷新用） */
async function refreshGameCmds() {
  try {
    state.gamecmds = await window.oph.gamecmds.info();
    ensureGamecmds();
    rebuild();
  } catch (e) {
    toast('读取 CS2 状态失败：' + e.message, 'err');
  }
}

function gcCopyBtn(text, label) {
  const b = el('button', 'mini', label || '复制');
  b.type = 'button';
  b.addEventListener('click', () => {
    window.oph.copyText(text);
    toast('已复制：' + text, 'ok');
  });
  return b;
}

function buildGamecmdsSection(sec) {
  const info = state.gamecmds;
  const wrap = el('div', 'section');
  wrap.dataset.section = sec.id;

  wrap.append(sectionHead('原生 HUD 与游戏命令',
    '覆盖层要看得清，前提是先把 CS2 的原生 HUD 关掉；但雷达和队友头顶标识 GSI 拿不到，'
    + '必须把原生那两个单独留住 —— 下面这组命令就是干这个的。勾选完点「写入 CS2」，'
    + '程序会把命令写成一份独立 cfg 放进 CS2 的 cfg 目录。'
    + '⚠️ 本页只写文本文件，不模拟按键、不注入进程。'));

  if (!info || !info.catalog) {
    const c = newCard('读不到命令目录', '');
    c.body.append(el('div', 'note err', '主进程没有返回命令目录，可能是设置窗口和主程序版本对不上。'));
    wrap.append(c.card);
    return wrap;
  }

  const gc = ensureGamecmds();
  const catalog = info.catalog || [];
  const groups = info.groups || [];
  const roots = info.roots || [];
  const installedDirs = roots.reduce((n, r) => n + ((r.dirs || []).filter((d) => d.installed).length), 0);
  const blockOn = roots.some((r) => r.autoexecHasBlock);
  const execLine = info.execLine || 'exec overplayhud_gamesetup';

  // ---------------- 状态 + 操作 ----------------
  const sc = newCard('CS2 状态', '每次打开这一页都现查，不是缓存的');

  const grid = el('div', 'gc-stat');
  const stat = (k, v, cls) => {
    const b = el('div', 'gc-stat-item');
    b.append(el('div', 'gc-stat-k', k), el('div', 'gc-stat-v' + (cls ? ' ' + cls : ''), v));
    grid.append(b);
  };
  stat('CS2 安装目录', roots.length ? roots.length + ' 处' : '没探测到', roots.length ? 'ok' : 'warn');
  stat('命令 cfg', installedDirs ? '已写入 ' + installedDirs + ' 处' : '还没写入', installedDirs ? 'ok' : 'dim');
  stat('开机自动执行', blockOn ? '已挂在 autoexec' : '未启用', blockOn ? 'ok' : 'dim');
  stat('游戏进程', info.running == null ? '查不到' : (info.running ? '正在运行' : '没在跑'),
    info.running ? 'warn' : 'dim');
  sc.body.append(grid);

  const act = el('div', 'gc-actions');
  const btnWrite = el('button', 'btn primary', '写入 CS2');
  const btnRemove = el('button', 'btn', '移除已写入');
  const btnReveal = el('button', 'btn', '在文件夹中显示');
  const btnExec = el('button', 'btn', '复制 exec 指令');
  act.append(btnWrite, btnRemove, btnReveal, btnExec);
  sc.body.append(act);

  const onNow = catalog.filter((c) => gc.enabled[c.id] !== false).length;
  const hint = el('div', 'home-note', roots.length
    ? (installedDirs
      ? (blockOn
        ? '已写入，并且挂在 autoexec 上 —— 每局启动游戏会自动生效，不用管了。'
        : '已写入。还差最后一步：在 CS2 控制台执行一次 ' + execLine
          + '（或勾上下面的「开机自动执行」，以后就不用管了）。')
      : '还没写入 CS2。点「写入 CS2」把上面勾选的 ' + onNow + ' 条命令存成一份独立 cfg。')
    : '⚠ 没探测到 CS2 安装目录（自定义 Steam 路径可能探测不到）。'
      + '可以点「在文件夹中显示」看程序期望的位置，手动复制过去。');
  hint.className = roots.length ? 'home-note' : 'home-note warn';
  sc.body.append(hint);
  wrap.append(sc.card);

  btnWrite.addEventListener('click', async () => {
    btnWrite.disabled = true;
    let r = null;
    try { r = await window.oph.gamecmds.write(state.cfg); } catch (e) { r = { ok: false, error: e.message }; }
    btnWrite.disabled = false;
    if (r && r.copied && r.copied.length) {
      toast(`已写入 ${r.copied.length} 处`
        + (r.running ? '（CS2 正在运行，要完全退出游戏再重开才生效）' : ''), 'ok');
      state.dirty = false;
      document.getElementById('dirty').hidden = true;
      setStatus('已保存并写入 CS2', 'ok');
    } else if (r && r.error) {
      toast('写入失败：' + r.error, 'err');
    } else {
      toast('没找到可写入的 CS2 cfg 目录', 'err');
    }
    if (r && r.failed && r.failed.length) console.warn('[gamecmds] 部分失败：', r.failed.join(' | '));
    await refreshGameCmds();
  });

  btnRemove.addEventListener('click', async () => {
    if (!confirm('把程序写进 CS2 的这份命令 cfg 删掉？\n'
      + '如果挂在 autoexec 上，那一段也会一并摘除（你自己写在 autoexec 里的内容不受影响）。')) return;
    btnRemove.disabled = true;
    try { await window.oph.gamecmds.remove(); } catch (e) { /* 忽略 */ }
    btnRemove.disabled = false;
    toast('已移除写入的命令 cfg 与 autoexec 区块', 'ok');
    await refreshGameCmds();
  });

  btnReveal.addEventListener('click', () => window.oph.gamecmds.reveal());
  btnExec.addEventListener('click', async () => {
    try { await window.oph.gamecmds.copyExec(); } catch (e) { window.oph.copyText(execLine); }
    toast('已复制：' + execLine, 'ok');
  });

  // ---------------- 命令清单 ----------------
  const pre = el('pre', 'gc-pre', '');
  const previewTimerBox = { t: 0 };

  const repaintCfg = () => {
    const map = {};
    for (const c of catalog) map[c.id] = gc.enabled[c.id] !== false;
    window.oph.gamecmds.text(map)
      .then((txt) => { pre.textContent = typeof txt === 'string' ? txt : ''; })
      .catch(() => { pre.textContent = ''; });
  };
  const scheduleCfg = () => {
    clearTimeout(previewTimerBox.t);
    previewTimerBox.t = setTimeout(repaintCfg, 60);
  };

  for (const g of groups) {
    const items = catalog.filter((c) => c.group === g.id);
    if (!items.length) continue;
    const card = newCard(g.label, g.hint);
    for (const c of items) {
      const row = el('div', 'gc-row');
      const cb = el('input', 'gc-cb');
      cb.type = 'checkbox';
      cb.checked = gc.enabled[c.id] !== false;
      cb.addEventListener('change', () => {
        gc.enabled[c.id] = cb.checked;
        markDirty();
        scheduleCfg();
      });
      row.append(cb);

      const main = el('div', 'gc-main');
      const head = el('div', 'gc-head');
      head.append(el('span', 'gc-label', c.label));
      if (c.required) head.append(el('span', 'gc-tag', '必开'));
      head.append(el('code', 'gc-cmd', c.cmd), gcCopyBtn(c.cmd));
      main.append(head);
      if (c.note) main.append(el('div', 'gc-note', c.note));
      row.append(main);
      card.body.append(row);
    }
    wrap.append(card.card);
  }

  // ---------------- 执行方式 ----------------
  const ax = newCard('执行方式', '命令要生效，总得让 CS2 读到它 —— 两种方式任选');
  const axField = el('div', 'field');
  const axRow = el('div', 'row');
  axRow.append(switchControl({ path: 'gamecmds.autoexec' }),
    el('span', 'switch-label', '开机自动执行（写进 autoexec.cfg）'));
  axField.append(axRow);
  axField.append(el('div', 'note',
    '勾上之后会在 CS2 的 autoexec.cfg 里维护一段带标记的区块，每次启动游戏自动生效，不用手打 exec。'
    + '这段区块随时可以「移除已写入」摘掉，你自己写在 autoexec 里的其它内容一个字都不会动。'
    + '（如果本来没有 autoexec.cfg，程序会建一个。）'));
  ax.body.append(axField);

  const manField = el('div', 'field');
  const manRow = el('div', 'row');
  manRow.append(el('div', 'row-label', '手动执行'));
  const execBox = el('div', 'gc-exec');
  execBox.append(el('code', 'gc-cmd', execLine));
  manRow.append(execBox, gcCopyBtn(execLine));
  manField.append(manRow);
  manField.append(el('div', 'note',
    '不想让程序碰 autoexec 的话：每次进游戏后在控制台执行一次这一行就行。'
    + '服务器如果锁了 cvar，进服后可能被重置，那就只能每局执行一次。'));
  ax.body.append(manField);
  wrap.append(ax.card);

  // ---------------- 将要写进 cfg 的内容 ----------------
  const pv = newCard('将要写进 cfg 的内容',
    '勾选变了这里就跟着变。cfg 里只写 ASCII 注释 —— Source 引擎的 cfg 解析不保证非 ASCII 编码，'
    + '中文说明留在这一页。');
  pv.body.append(pre);
  pv.body.append(el('div', 'note',
    '这份文件叫 ' + (info.cfgName || 'overplayhud_gamesetup.cfg')
    + '，会被放进 CS2 的 game\\csgo\\cfg\\ 与 game\\core\\cfg\\ 两处。'
    + '它是程序生成的独立文件，删掉不会影响游戏本体。'));
  wrap.append(pv.card);

  repaintCfg();
  return wrap;
}

// ============================================================
// 配置方案（本地多套存档）
// ============================================================

function buildProfilesSection(sec) {
  const wrap = el('div', 'section');
  wrap.dataset.section = sec.id;
  wrap.append(sectionHead('配置方案',
    '把整套设置存成本地方案，随时切换。方案文件是一份完整的 config.json 快照，'
    + '放在配置目录下的 profiles 文件夹里。'));

  // ---- 保存当前 ----
  const c1 = newCard('把当前配置存成方案', '会以此刻“已保存”的配置为准；如果还有未保存的改动，先点底部的「保存」。');
  const nameInp = el('input', 'txt');
  nameInp.type = 'text';
  nameInp.placeholder = '方案名，例如「纯净」「花哨」';
  nameInp.style.flex = '0 0 200px';
  const noteInp = el('input', 'txt');
  noteInp.type = 'text';
  noteInp.placeholder = '备注（可留空）';
  const saveBtn = el('button', 'btn primary', '保存为新方案');
  saveBtn.addEventListener('click', async () => {
    const name = nameInp.value.trim();
    if (!name) { toast('先填一个方案名', 'err'); return; }
    const r = await window.oph.profiles.saveAs(name, noteInp.value.trim());
    if (!r.ok) { toast(r.error || '保存失败', 'err'); return; }
    nameInp.value = '';
    noteInp.value = '';
    renderList(r.list, r.active);
    toast('已保存方案「' + name + '」', 'ok');
  });
  const row1 = el('div', 'row');
  row1.append(nameInp, noteInp, saveBtn);
  c1.body.append(row1);
  wrap.append(c1.card);

  // ---- 方案列表 ----
  const c2 = newCard('已有方案', '「启用」会用该方案覆盖当前配置（config.json 会被改写）。');
  const listBody = el('div', 'card-body');
  c2.body = listBody;
  c2.card.append(listBody);
  wrap.append(c2.card);

  const renderList = (list, active) => {
    listBody.textContent = '';
    if (!list || !list.length) {
      listBody.append(el('div', 'empty-hint', '还没有任何方案。'));
      return;
    }
    for (const p of list) {
      const row = el('div', 'prof-row' + (p.active ? ' on' : ''));
      const info = el('div', 'prof-info');
      const title = el('div', 'prof-name');
      title.append(el('span', null, p.name));
      if (p.active) title.append(el('span', 'tag on', '当前'));
      if (p.builtin) title.append(el('span', 'tag', '内置'));
      info.append(title);
      const meta = [];
      if (p.note) meta.push(p.note);
      if (p.savedAt) meta.push('保存于 ' + String(p.savedAt).slice(0, 16).replace('T', ' '));
      info.append(el('div', 'prof-meta', meta.join('　·　') || '—'));
      row.append(info);

      const acts = el('div', 'prof-acts');
      const useBtn = el('button', 'btn primary', p.active ? '重新应用' : '启用');
      useBtn.addEventListener('click', async () => {
        if (!confirm('用方案「' + p.name + '」覆盖当前配置？\n\n当前 config.json 会被改写。')) return;
        const r = await window.oph.profiles.apply(p.name);
        if (!r.ok) { toast(r.error || '切换失败', 'err'); return; }
        state.cfg = r.cfg;
        state.dirty = false;
        document.getElementById('dirty').hidden = true;
        rebuild();
        window.oph.preview(state.cfg);
        toast('已切换到「' + p.name + '」', 'ok');
      });
      const ovBtn = el('button', 'btn', '用当前配置覆盖');
      ovBtn.addEventListener('click', async () => {
        if (!confirm('用当前配置覆盖方案「' + p.name + '」？')) return;
        const r = await window.oph.profiles.update(p.name);
        if (!r.ok) { toast(r.error || '覆盖失败', 'err'); return; }
        renderList(r.list, r.active);
        toast('已覆盖「' + p.name + '」', 'ok');
      });
      const rnBtn = el('button', 'btn', '重命名');
      rnBtn.addEventListener('click', async () => {
        const nn = prompt('新名字：', p.name);
        if (nn == null) return;
        const r = await window.oph.profiles.rename(p.name, nn.trim());
        if (!r.ok) { toast(r.error || '重命名失败', 'err'); return; }
        renderList(r.list, r.active);
        toast('已重命名', 'ok');
      });
      const delBtn = el('button', 'btn danger', '删除');
      delBtn.addEventListener('click', async () => {
        if (!confirm('删除方案「' + p.name + '」？此操作不可撤销。')) return;
        const r = await window.oph.profiles.remove(p.name);
        if (!r.ok) { toast(r.error || '删除失败', 'err'); return; }
        renderList(r.list, r.active);
        toast('已删除', 'ok');
      });
      acts.append(useBtn, ovBtn, rnBtn, delBtn);
      row.append(acts);
      listBody.append(row);
    }
  };

  const dirNote = el('div', 'home-note', '');
  window.oph.profiles.list().then((r) => {
    dirNote.textContent = '方案目录：' + (r.dir || '—');
    renderList(r.list, r.active);
  }).catch(() => {});

  wrap.append(dirNote);
  return wrap;
}

// ============================================================
// 教程
// ============================================================

/**
 * 极简 Markdown → HTML（只为教程服务，不引外部库）。
 * 先把文本整体做 HTML 转义再拼标签，所以文档里写什么都不会变成可执行标记。
 */
/**
 * 极简 Markdown 渲染，只认教程里真正用到的那几种语法。
 *
 * baseDir 是 TUTORIAL.md 所在的目录。教程里的图片写的是相对路径（docs/xxx.png），
 * 得拼成 file:// 绝对地址才能显示 —— 打包后也一样，asar 内的 file:// 由 Electron 解析。
 */
function mdToHtml(md, baseDir) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const imgURL = (src) => {
    const s = String(src || '').trim();
    if (/^https?:\/\//i.test(s) || /^data:image\//i.test(s)) return s;
    if (!baseDir) return '';
    const joined = String(baseDir).replace(/\\/g, '/').replace(/\/+$/, '')
      + '/' + s.replace(/^\.\//, '');
    return encodeURI('file:///' + joined.replace(/^\/+/, ''));
  };
  const imgTag = (alt, src) => {
    const u = imgURL(src);
    return u ? `<img class="md-img" src="${u}" alt="${esc(alt || '')}" loading="lazy">` : esc(alt || '');
  };

  const inline = (s) => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // ⚠️ 图片规则必须排在链接前面：反过来的话 "![a](b)" 会先被链接规则吃掉，剩个孤零零的 "!"
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt, src) => imgTag(alt, src))
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const isSep = (s) => s.indexOf('-') >= 0 && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(s);

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      out.push('<pre class="md-code"><code>' + esc(buf.join('\n')) + '</code></pre>');
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lv = h[1].length;
      out.push(`<h${lv} class="md-h md-h${lv}">${inline(h[2])}</h${lv}>`);
      i++;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { out.push('<hr class="md-hr">'); i++; continue; }
    if (/^\s*>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      out.push('<blockquote class="md-quote">' + inline(buf.join(' ')) + '</blockquote>');
      continue;
    }
    if (line.indexOf('|') >= 0 && i + 1 < lines.length && isSep(lines[i + 1])) {
      const cells = (s) => s.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].indexOf('|') >= 0) { rows.push(cells(lines[i])); i++; }
      out.push('<div class="md-tablewrap"><table class="md-table"><thead><tr>'
        + head.map((c) => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>'
        + rows.map((r) => '<tr>' + r.map((c) => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('')
        + '</tbody></table></div>');
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const tag = ordered ? 'ol' : 'ul';
      const buf = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        buf.push(inline(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, '')));
        i++;
      }
      out.push(`<${tag} class="md-list">` + buf.map((t) => '<li>' + t + '</li>').join('') + `</${tag}>`);
      continue;
    }
    if (/^\s*$/.test(line)) { i++; continue; }

    const buf = [];
    while (i < lines.length && !/^\s*$/.test(lines[i])
      && !/^(#{1,4}\s|```|\s*[-*]\s|\s*\d+\.\s|\s*>)/.test(lines[i])
      && lines[i].indexOf('|') < 0) { buf.push(lines[i]); i++; }
    if (buf.length) out.push('<p class="md-p">' + inline(buf.join(' ')) + '</p>');
    else i++;
  }
  return out.join('');
}

// ============================================================
// 「关于」页
// ============================================================

const BLOG_URL = 'https://blog.taoxi.ink';

function buildAboutSection(sec) {
  const wrap = el('div', 'section');
  wrap.dataset.section = sec.id;
  wrap.append(sectionHead('关于', 'OverplayHUD —— 把 CS2 的 HUD 还原成 CS:GO 的样子'));

  // ---- 作者博客：整页最大的那一块，也是全页唯一用编辑红的地方 ----
  const blog = el('div', 'about-blog');
  blog.append(el('div', 'ab-kicker', '作者博客'));

  const link = el('a', 'ab-url', 'blog.taoxi.ink');
  link.href = BLOG_URL;
  link.addEventListener('click', (e) => {
    e.preventDefault();
    window.oph.openExternal(BLOG_URL);
  });
  blog.append(link);
  blog.append(el('div', 'ab-url-full', BLOG_URL));
  blog.append(el('div', 'ab-note',
    '更新公告、折腾记录、以及这个 HUD 是怎么一步步做出来的，都写在这儿。'));

  const acts = el('div', 'ab-acts');
  const go = el('button', 'btn primary', '在浏览器中打开');
  go.addEventListener('click', () => window.oph.openExternal(BLOG_URL));
  const cp = el('button', 'btn', '复制网址');
  cp.addEventListener('click', () => { window.oph.copyText(BLOG_URL); toast('网址已复制', 'ok'); });
  acts.append(go, cp);
  blog.append(acts);
  wrap.append(blog);

  // ---- 程序本身 ----
  const info = newCard('这个程序', '');
  const grid = el('div', 'ab-grid');

  const verOut = el('div', 'ab-v', '…');
  grid.append(abCell('版本', verOut, 'main'));
  grid.append(abCell('定位', el('div', 'ab-v', 'CS:GO 时代的 HUD 复刻'), 'main'));
  grid.append(abCell('数据来源', el('div', 'ab-v', 'Valve 官方 GSI'), 'main'));
  const envOut = el('div', 'ab-v', '…');
  grid.append(abCell('运行环境', envOut, 'main'));

  info.body.append(grid);
  wrap.append(info.card);

  window.oph.appInfo().then((i) => {
    if (!i || !i.ok) return;
    verOut.textContent = 'v' + i.version;
    envOut.textContent = 'Electron ' + i.electron;
  }).catch(() => { verOut.textContent = '—'; envOut.textContent = '—'; });

  // ---- 底线：这段刻意写得直白，因为它是这个项目唯一不能松口的地方 ----
  const safe = newCard('它不做什么',
    '这条线是这个项目存在的前提，不会为了任何功能挪动。');
  const ul = el('div', 'ab-safe');
  for (const t of [
    '只接收 Valve 官方 GSI 主动发到 127.0.0.1 的数据，不读游戏内存',
    '不注入 DLL、不 hook 渲染、不改任何游戏文件',
    '不模拟按键、不代替你操作游戏',
    '只显示普通玩家本来就看得到的信息，没有任何额外情报',
  ]) ul.append(el('div', 'ab-safe-item', t));
  safe.body.append(ul);
  safe.body.append(el('div', 'ab-warn',
    '不要在有第三方反作弊的平台（Faceit / ESEA / 5E / B5 等）上使用。'));
  wrap.append(safe.card);

  // ---- 去哪儿找东西 ----
  const more = newCard('其它', '');
  const row = el('div', 'ab-acts');
  const b1 = el('button', 'btn', '看使用教程');
  b1.addEventListener('click', () => activate('tutorial'));
  const b2 = el('button', 'btn', '打开配置文件夹');
  b2.addEventListener('click', () => window.oph.reveal());
  row.append(b1, b2);
  more.body.append(row);
  wrap.append(more.card);

  return wrap;
}

function abCell(k, vEl, cls) {
  const d = el('div', 'ab-cell' + (cls ? ' ' + cls : ''));
  d.append(el('div', 'ab-k', k), vEl);
  return d;
}

function buildTutorialSection(sec) {
  const wrap = el('div', 'section');
  wrap.dataset.section = sec.id;
  wrap.append(sectionHead('教程',
    '一份中文使用说明，同时以 Markdown 文件（TUTORIAL.md）保存在程序目录里，可随时打开或分享。'));

  const bar = el('div', 'search-row');
  const openBtn = el('button', 'btn primary', '用系统程序打开 .md');
  openBtn.addEventListener('click', async () => {
    const r = await window.oph.openTutorial();
    toast(r.ok ? '已用系统默认程序打开教程' : '没找到默认打开方式，已在文件夹中定位', r.ok ? 'ok' : 'err');
  });
  const revealBtn = el('button', 'btn', '在文件夹中显示');
  revealBtn.addEventListener('click', () => window.oph.revealTutorial());
  const copyBtn = el('button', 'btn', '复制全文');
  copyBtn.addEventListener('click', async () => {
    const r = await window.oph.tutorial();
    if (!r.ok) { toast('读不到教程文件', 'err'); return; }
    await window.oph.copyText(r.text);
    toast('教程全文已复制到剪贴板', 'ok');
  });
  bar.append(openBtn, revealBtn, copyBtn);
  wrap.append(bar);

  const pathNote = el('div', 'note', '');
  wrap.append(pathNote);

  const doc = el('div', 'md-doc');
  doc.append(el('div', 'empty-hint', '正在载入教程…'));
  wrap.append(doc);

  window.oph.tutorial().then((r) => {
    doc.textContent = '';
    pathNote.textContent = r.path || '';
    if (!r.ok) {
      doc.append(el('div', 'empty-hint', '读不到教程文件：' + (r.error || '未知错误')));
      return;
    }
    const base = r.path ? String(r.path).replace(/[\\/][^\\/]*$/, '') : '';
    doc.innerHTML = mdToHtml(r.text, base);
  }).catch((e) => {
    doc.textContent = '';
    doc.append(el('div', 'empty-hint', '载入失败：' + e.message));
  });

  return wrap;
}

// ============================================================
// 分区构建
// ============================================================

// ---- 武器栏 SVG 态：纯色剪影图标方案，与文字态各自独立开关、可并存 ----
function buildWeaponListSvgCard() {
  const wrap = el('div', 'section');
  wrap.dataset.section = 'weaponListSvg';

  const title = el('div', 'card');
  const th = el('div', 'card-head');
  th.append(el('div', 'card-title', '武器栏 SVG 态'));
  th.append(el('div', 'card-hint', '用纯色剪影图标显示 1–5 号武器，可与「武器栏文字态」并存显示'));
  title.append(th);
  wrap.append(title);

  // ---- 开关 ----
  const onCard = el('div', 'card');
  const onHead = el('div', 'card-head'); onHead.append(el('div', 'card-title', '显示')); onCard.append(onHead);
  const onBody = el('div', 'card-body');
  {
    const f = { type: 'switch', label: '启用 SVG 图标武器栏', path: 'modules.weaponList.svgMode' };
    const field = el('div', 'field');
    const row = el('div', 'row');
    row.append(switchControl(f), el('span', 'switch-label', f.label));
    field.append(row);
    onBody.append(field);
  }
  onCard.append(onBody);
  wrap.append(onCard);

  const files = Array.isArray(state.equipIconFiles) ? state.equipIconFiles : [];
  const fileOptions = [['', '自动（按武器名）'], ...files.map((f) => [f, f])];
  // 刀型文件：从图标清单里挑出刀具相关的文件名
  const knifeFiles = files.filter((f) => /knife|bayonet|melee|kukri/i.test(f));

  const base = 'modules.weaponList.svg';

  // ---- 位置与大小 ----
  const posCard = el('div', 'card');
  const posHead = el('div', 'card-head'); posHead.append(el('div', 'card-title', '位置与大小')); posCard.append(posHead);
  const posBody = el('div', 'card-body');
  const posFields = [
    { type: 'num', label: '位移 X', path: base + '.offsetX', min: -2000, max: 2000, step: 1, unit: 'px' },
    { type: 'num', label: '位移 Y', path: base + '.offsetY', min: -2000, max: 2000, step: 1, unit: 'px' },
    { type: 'num', label: '缩放 X', path: base + '.scaleX', min: 0.3, max: 3, step: 0.01 },
    { type: 'num', label: '缩放 Y', path: base + '.scaleY', min: 0.3, max: 3, step: 0.01 },
    { type: 'num', label: '旋转', path: base + '.rotate', min: -180, max: 180, step: 1, unit: '°' },
    { type: 'num', label: '不透明度', path: base + '.opacity', min: 0, max: 1, step: 0.01 },
  ];
  for (const f of posFields) posBody.append(fieldRow(f.label, numControl(f)));
  posCard.append(posBody);
  wrap.append(posCard);

  // ---- 颜色与辉光 ----
  const styleCard = el('div', 'card');
  const styleHead = el('div', 'card-head'); styleHead.append(el('div', 'card-title', '颜色与辉光')); styleCard.append(styleHead);
  const styleBody = el('div', 'card-body');
  styleBody.append(fieldRow('剪影颜色', colorControl({ type: 'color', label: '剪影颜色', path: base + '.color', fallback: '#3b82f6' })));
  styleBody.append(fieldRow('选中剪影颜色', colorControl({ type: 'color', label: '选中剪影颜色', path: base + '.activeColor', fallback: '#FFFFFF' })));
  styleBody.append(fieldRow('选中辉光半径', numControl({ type: 'num', label: '辉光半径', path: base + '.glow', min: 0, max: 40, step: 1, unit: 'px' })));
  styleBody.append(fieldRow('辉光颜色', colorControl({ type: 'color', label: '辉光颜色', path: base + '.glowColor', fallback: '#3b82f6' })));
  // 每槽位独立辉光颜色（留空 = 回落上面的全局辉光颜色）
  const glowFallback = getPath(state.cfg, base + '.glowColor') || '#3b82f6';
  for (let i = 1; i <= 5; i++) {
    styleBody.append(fieldRow(`${i} 号槽位辉光`, colorControl({
      type: 'color', label: `${i} 号槽位辉光`, path: `${base}.glowColors.${i}`, fallback: glowFallback,
    })));
  }
  styleBody.append(fieldRow('开局显示毫秒（预留）', numControl({ type: 'num', label: 'idleHideMs', path: base + '.idleHideMs', min: 0, max: 10000, step: 100, unit: 'ms' })));
  styleCard.append(styleBody);
  wrap.append(styleCard);

  // ---- 槽位图标覆盖 ----
  const slotCard = el('div', 'card');
  const slotHead = el('div', 'card-head'); slotHead.append(el('div', 'card-title', '槽位图标覆盖（留空 = 自动）')); slotCard.append(slotHead);
  const slotBody = el('div', 'card-body');
  for (let i = 1; i <= 5; i++) {
    const f = { type: 'select', label: `${i} 号槽位`, path: `${base}.icons.${i}`, options: fileOptions };
    slotBody.append(fieldRow(f.label, selectControl(f)));
  }
  slotCard.append(slotBody);
  wrap.append(slotCard);

  // ---- 刀型对照表 ----
  const knifeCard = el('div', 'card');
  const knifeHead = el('div', 'card-head'); knifeHead.append(el('div', 'card-title', '刀型对照表（每种刀选一个剪影）')); knifeCard.append(knifeHead);
  const knifeBody = el('div', 'card-body');
  const knifeOptions = [['', '用同名刀形（默认）'], ...knifeFiles.map((f) => [f, f.replace(/\.svg$/, '')])];
  for (const kf of knifeFiles) {
    const internal = 'weapon_' + kf.replace(/\.svg$/, '');
    const f = { type: 'select', label: internal, path: `${base}.knives.${internal}`, options: knifeOptions };
    knifeBody.append(fieldRow(internal, selectControl(f)));
  }
  knifeCard.append(knifeBody);
  wrap.append(knifeCard);

  return wrap;
}

function buildSection(sec) {
  if (typeof sec.build === 'function') return sec.build(sec);
  const wrap = el('div', 'section');
  wrap.dataset.section = sec.id;

  const mod = MODULES.find((m) => m.key === sec.module);

  // ---- 标题 ----
  const title = el('div', 'card');
  const th = el('div', 'card-head');
  const tb = el('div');
  tb.append(el('div', 'card-title', sec.name));
  if (mod) tb.append(el('div', 'card-hint', mod.hint));
  th.append(tb);
  title.append(th);
  wrap.append(title);

  // ---- 位置 / 大小 / 旋转 ----
  if (mod) wrap.append(transformCard(mod));

  // ---- 配色 ----
  const colorFields = [
    ...(sec.colors || []).map((c) => ({ type: 'color', label: c.label, path: c.path, withAlpha: !!c.withAlpha })),
    ...(sec.alphas || []).map((a) => ({ type: 'num', label: a.label, path: a.path, min: 0, max: 1, step: 0.01 })),
  ];
  if (colorFields.length) {
    const card = el('div', 'card');
    const head = el('div', 'card-head');
    head.append(el('div', 'card-title', '配色'));
    card.append(head);
    const body = el('div', 'card-body');
    for (const f of colorFields) {
      const ctl = f.type === 'color' ? colorControl(f) : numControl(f);
      body.append(fieldRow(f.label, ctl));
    }
    card.append(body);
    wrap.append(card);
  }

  // ---- 不透明度与辉光 ----
  if (mod) wrap.append(effectsCard(mod));

  // ---- 其它字段（开关 / 数值 / 下拉 / 文本）----
  if (sec.fields && sec.fields.length) {
    const card = el('div', 'card');
    const head = el('div', 'card-head');
    head.append(el('div', 'card-title', sec.id === 'global' ? '通用设置' : '显示与行为'));
    card.append(head);
    const body = el('div', 'card-body');

    for (const f of sec.fields) {
      if (f.type === 'switch') {
        // 开关行：开关在左（占标签列），说明文字在右
        const field = el('div', 'field');
        const row = el('div', 'row');
        row.append(switchControl(f), el('span', 'switch-label', f.label));
        field.append(row);
        if (f.note) field.append(el('div', 'note', f.note));
        body.append(field);
      } else {
        let ctl;
        if (f.type === 'select') ctl = selectControl(f);
        else if (f.type === 'text') ctl = textControl(f);
        else if (f.type === 'color') ctl = colorControl(f);
        else ctl = numControl(f);
        body.append(fieldRow(f.label, ctl, f.note));
      }
    }

    card.append(body);
    wrap.append(card);
  }

  return wrap;
}

function buildNav() {
  const side = document.getElementById('side');
  side.innerHTML = '';
  let first = true;
  const multi = NAV_GROUPS.length > 1;
  for (const g of NAV_GROUPS) {
    const items = SECTIONS.filter((s) => (s.group || 'basic') === g.id);
    if (!items.length) continue;
    // 只有一个分组时不画组标题，保持界面干净
    if (multi) side.append(el('div', 'nav-group', g.label));
    for (const sec of items) {
      const b = el('button', 'nav-item' + (first ? ' active' : ''));
      first = false;
      b.dataset.target = sec.id;
      b.append(el('span', 'nav-ico ' + sec.ico), el('span', null, sec.name));
      b.addEventListener('click', () => activate(sec.id));
      side.append(b);
    }
  }
}

function activate(id) {
  for (const b of document.querySelectorAll('.nav-item')) {
    b.classList.toggle('active', b.dataset.target === id);
  }
  for (const s of document.querySelectorAll('.section')) {
    s.classList.toggle('active', s.dataset.section === id);
  }
}

function rebuild() {
  const content = document.getElementById('content');
  const keep = document.querySelector('.nav-item.active')?.dataset.target;
  content.innerHTML = '';
  for (const sec of SECTIONS) content.append(buildSection(sec));
  activate(keep || SECTIONS[0].id);
}

// ============================================================
// 预览 / 保存
// ============================================================

let previewTimer = 0;

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    window.oph.preview(state.cfg);
  }, 70);
}

function markDirty() {
  state.dirty = true;
  document.getElementById('dirty').hidden = false;
  setStatus('有未保存的改动');
}

function setStatus(text, cls) {
  const s = document.getElementById('status');
  s.textContent = text || '';
  s.className = 'status' + (cls ? ' ' + cls : '');
}

let toastTimer = 0;

function toast(msg, cls) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (cls ? ' ' + cls : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast' + (cls ? ' ' + cls : ''); }, 1900);
}

async function doSave() {
  try {
    const saved = await window.oph.save(state.cfg);
    state.cfg = saved;
    state.dirty = false;
    document.getElementById('dirty').hidden = true;
    setStatus('已保存', 'ok');
    toast('已保存到 config.json', 'ok');
  } catch (e) {
    setStatus('保存失败：' + e.message, 'err');
    toast('保存失败：' + e.message, 'err');
  }
}

async function doReload() {
  const data = await window.oph.get();
  state.cfg = data.cfg;
  state.defaults = data.defaults;
  state.dirty = false;
  document.getElementById('dirty').hidden = true;
  setStatus('已重新读取');
  rebuild();
  window.oph.preview(state.cfg);
  toast('已放弃改动，重新读取配置');
}

async function doExport() {
  const r = await window.oph.exportCfg();
  if (r.canceled) return;
  if (!r.ok) { toast('导出失败：' + r.error, 'err'); return; }
  toast('已导出到 ' + r.file, 'ok');
  setStatus('已导出', 'ok');
}

async function doCopy() {
  await window.oph.copyCfg();
  toast('配置 JSON 已复制到剪贴板', 'ok');
}

async function doImport() {
  if (state.dirty && !confirm('当前有未保存的改动，导入会直接覆盖掉。\n\n继续导入？')) return;

  const r = await window.oph.importCfg();
  if (r.canceled) return;
  if (!r.ok) {
    toast('导入失败：' + r.error, 'err');
    setStatus('导入失败：' + r.error, 'err');
    return;
  }

  // 主进程已经写盘了，这里同步界面
  state.cfg = r.cfg;
  normalizeCustom();
  state.dirty = false;
  document.getElementById('dirty').hidden = true;
  rebuild();
  window.oph.preview(state.cfg);
  setStatus('已导入', 'ok');
  toast('已从 ' + r.file + ' 导入', 'ok');
}

async function doReset() {
  if (!confirm('把所有设置恢复成出厂默认？\n当前 config.json 会被覆盖。')) return;
  const saved = await window.oph.reset();
  state.cfg = saved;
  state.dirty = false;
  document.getElementById('dirty').hidden = true;
  setStatus('已恢复默认', 'ok');
  rebuild();
  window.oph.preview(state.cfg);
  toast('已恢复出厂默认', 'ok');
}

// ============================================================
// 启动
// ============================================================

(async function init() {
  const data = await window.oph.get();
  state.cfg = data.cfg;
  state.defaults = data.defaults;

  // 变量表和可改名的武器清单（来自主进程，和 HUD 层共用 src/vars.js）
  const vd = await window.oph.vars();
  state.vars = vd.vars || [];
  state.weaponNames = vd.weaponNames || {};
  state.grenadeKinds = vd.grenadeKinds || [];
  state.buyCatalog = vd.buyCatalog || { categories: [], weapons: [] };

  // 武器 / 刀 / 投掷物 SVG 图标清单（供「武器栏SVG态」页下拉选择）
  try {
    state.equipIcons = (await window.oph.equipIcons()) || {};
    state.equipIconFiles = Object.keys(state.equipIcons);
  } catch (e) { state.equipIcons = {}; state.equipIconFiles = []; }

  normalizeCustom();

  // 游戏侧命令目录 + CS2 状态（主进程是唯一权威，渲染层不另写一份）
  try {
    state.gamecmds = await window.oph.gamecmds.info();
  } catch (e) { state.gamecmds = null; }
  ensureGamecmds();

  document.getElementById('cfgPath').textContent = data.file;

  buildNav();
  rebuild();

  // 支持 #global 这样的深链，直接跳到某个分页
  const hash = location.hash.replace('#', '');
  if (hash && SECTIONS.some((s) => s.id === hash)) activate(hash);

  setStatus('就绪');

  document.getElementById('btnSave').addEventListener('click', doSave);
  document.getElementById('btnReload').addEventListener('click', doReload);
  document.getElementById('btnReset').addEventListener('click', doReset);
  document.getElementById('btnReveal').addEventListener('click', () => window.oph.reveal());
  document.getElementById('btnExport').addEventListener('click', doExport);
  document.getElementById('btnImport').addEventListener('click', doImport);
  document.getElementById('btnCopy').addEventListener('click', doCopy);
  // ---- 实时预览：开一个「模拟数据」窗口，边调边看 ----
  const btnPreview = document.getElementById('btnPreview');
  const setPreviewBtn = (on) => {
    if (!btnPreview) return;
    btnPreview.classList.toggle('on', !!on);
    btnPreview.textContent = on ? '预览中' : '预览';
    btnPreview.title = on
      ? '预览窗口已打开（模拟数据）。再点一下关掉。'
      : '开一个预览窗口，用模拟数据实时看效果';
  };
  if (btnPreview) {
    btnPreview.addEventListener('click', async () => {
      let on = false;
      try { on = await window.oph.togglePreview(); } catch (e) { return; }
      setPreviewBtn(on);
      if (on) {
        // 把「当前正在编辑、还没保存」的配置也推过去，预览立刻就是眼前这套参数
        window.oph.preview(state.cfg);
        toast('预览窗口已打开：数据是模拟的，改设置会实时反映过去', 'ok');
      }
    });
  }
  applyPreviewBtn = setPreviewBtn;
  if (window.oph.onPreviewState) window.oph.onPreviewState(setPreviewBtn);
  window.oph.getPreviewState().then(setPreviewBtn).catch(() => {});

  // ---- 首页的运行状态：主进程每秒推一次，打开时先主动拉一份 ----
  if (window.oph.onStatus) {
    window.oph.onStatus((st) => { state.status = st; if (homePaint) homePaint(st); });
  }
  pushStatusNow();

  document.getElementById('btnMin').addEventListener('click', () => window.oph.minimize());
  document.getElementById('btnClose').addEventListener('click', () => {
    if (state.dirty && !confirm('有未保存的改动。\n关闭后会丢弃这些改动、并让 HUD 恢复成配置文件里的样子。\n\n确定关闭？')) return;
    window.oph.close();
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      doSave();
    }
  });

})();
