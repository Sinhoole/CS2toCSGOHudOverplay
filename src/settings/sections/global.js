'use strict';

/**
 * 全局 · 设置页模块
 *
 * 由 src/settings/settings.js（重构前巨石）机械拆分而来，代码原样保留。
 * 依赖通过头部解构显式声明 —— 不依赖加载顺序之外的东西，也不往全局挂散名。
 */
;(function () {
  const { el } = globalThis.OphDOM;
  const { fieldRow, newCard, sectionHead } = globalThis.OphLayout;
  const { buildPlainField } = globalThis.OphModuleCards;
  const { advMod } = globalThis.OphAdvBridge;
  const { getPath, setPath } = globalThis.OphPath;
  const { commit, state } = globalThis.OphCtx;
  const { markDirty, rebuild, schedulePreview } = globalThis.OphApp;
  const { numControl, selectControl } = globalThis.OphControls;


/** 「全局」页：额外插入分辨率 + 适配模式卡片 */
function buildGlobalSection(sec) {
  const wrap = el('div', 'section');
  wrap.dataset.section = sec.id;
  wrap.append(sectionHead('全局',
    '字体、缩放、安全区等整体参数。分辨率决定 HUD 虚拟屏幕的尺寸，'
    + '适配模式决定该虚拟屏幕如何映射到显示器。'));

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
    '设置 HUD 上全部文字的字型。均为系统自带字体，不联网下载。');

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
      ? '当前使用自定义字体栈（下方输入框非空，优先生效）'
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
    '留空则使用上方所选预设，填写后以自定义为准。'));

  refresh();
  return card;
}
/** 分辨率 + 适配模式卡片 */
function buildResolutionCard() {
  const card = newCard('分辨率与适配',
    '分辨率即 HUD 虚拟屏幕基准。还原 CS:GO 的 4:3 拉伸效果，可选用 1280×960 并将适配模式设为「拉伸铺满」。');

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
  }), 'HUD 内部排版使用的虚拟屏宽度。'));
  card.body.append(fieldRow('设计高度', numControl({
    path: 'designHeight', min: 240, max: 4320, step: 1, integer: true, unit: 'px',
  }), 'HUD 内部排版使用的虚拟屏高度；1280×960 为标准 4:3 比例。'));

  card.body.append(fieldRow('适配模式', selectControl({
    path: 'fit',
    options: [
      ['fill',    '拉伸铺满（4:3 怀旧：非等比拉伸）'],
      ['stretch', '等比填满（等比放大，溢出裁掉）'],
      ['contain', '完整显示（等比缩小，不裁切）'],
    ],
  }), '还原 CS:GO 的 4:3 拉伸效果请选「拉伸铺满」。'));

  card.body.append(fieldRow('整体缩放', numControl({
    path: 'scale', min: 0.5, max: 2, step: 0.01,
  }), '在适配结果之上再乘一个倍率。'));

  return card.card;
}
// 常见分辨率预设。value 为 null 表示「自定义」，此时直接用下面两个宽高输入框。
const RES_PRESETS = [
  ['1920x1080', '1920 × 1080（16:9）'],
  ['1280x960',  '1280 × 960（4:3，CS:GO 经典拉伸）'],
  ['1024x768',  '1024 × 768（4:3）'],
  ['1600x1200', '1600 × 1200（4:3）'],
  ['1440x1080', '1440 × 1080（4:3）'],
  ['custom',    '自定义（用下面的宽 / 高）'],
];

  // 自注册：上架与否只由 sections/manifest.js 决定，这里不写死顺序
  globalThis.OphSections.register({
    id: "global", ico: "global", name: "全局",
    group: "basic",
    keywords: ['缩放', '分辨率', '安全区', '显示器', '字体'],
    build: buildGlobalSection,
    // 这些字段由宿主按 schema 渲染，追加在自绘的三张卡片后面
    fields: [
      { type: 'num',    label: '整体缩放', path: 'scale', min: 0.5, max: 2, step: 0.01,
        note: '在设计分辨率之上再乘一个倍率，影响全部模块；单模块微调请用各模块自身的缩放。' },
      { type: 'num',    label: '安全区 X', path: 'safezone.x', min: 0.7, max: 1, step: 0.005,
        note: '需与 CS2 的 safezonex 保持一致，否则 HUD 会与游戏原生元素错位。' },
      { type: 'num',    label: '安全区 Y', path: 'safezone.y', min: 0.7, max: 1, step: 0.005 },
      { type: 'num',    label: '羽化底栏浓度', path: 'hud.barAlpha', min: 0, max: 1, step: 0.01,
        note: '全局默认的底栏不透明度；设为 0 即关闭全部半透明底条，各模块自身设置优先。' },
      { type: 'num',    label: '失效延迟', path: 'staleTimeoutMs', min: 3000, max: 120000, step: 1000, unit: 'ms',
        note: '超过该时长未收到数据即视为不在对局中，并隐藏 HUD。'
            + '必须大于 cfg 中 heartbeat 的两倍，否则静止时 GSI 不发包会被误判为已退出。' },
      { type: 'switch', label: '鼠标可交互', path: 'enableInteraction',
        note: '调试用途。开启后鼠标可点击 HUD，但会阻挡游戏操作，正常游玩时请关闭。' },
      { type: 'switch', label: '启动时打开设置', path: 'openSettingsOnStart',
        note: '关闭后程序启动仅保留托盘图标，点击图标才打开设置。' },
      { type: 'num',    label: '显示器序号', path: 'displayIndex', min: 0, max: 3, step: 1, integer: true,
        note: '0 表示主显示器。保存后覆盖层将移动到对应屏幕。' },
    ],
  });
})();
