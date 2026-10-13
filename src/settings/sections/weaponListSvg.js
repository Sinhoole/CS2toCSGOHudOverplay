'use strict';

/**
 * 武器栏SVG态 · 设置页模块
 *
 * 由 src/settings/settings.js（重构前巨石）机械拆分而来，代码原样保留。
 * 依赖通过头部解构显式声明 —— 不依赖加载顺序之外的东西，也不往全局挂散名。
 */
;(function () {
  const { el } = globalThis.OphDOM;
  const { colorControl, numControl, selectControl, switchControl, textControl } = globalThis.OphControls;
  const { state } = globalThis.OphCtx;
  const { fieldRow } = globalThis.OphLayout;
  const { getPath } = globalThis.OphPath;
  const { activate } = globalThis.OphApp;


// ---- 武器栏 SVG 态：纯色剪影图标方案，与文字态各自独立开关、可并存 ----
function buildWeaponListSvgCard() {
  const wrap = el('div', 'section');
  wrap.dataset.section = 'weaponListSvg';

  const title = el('div', 'card');
  const th = el('div', 'card-head');
  th.append(el('div', 'card-title', '武器栏 SVG 态'));
  th.append(el('div', 'card-hint', '以纯色剪影图标显示 1–5 号武器，可与「武器栏文字态」并存。'));
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
  styleBody.append(fieldRow('剪影颜色', colorControl({ type: 'color', label: '剪影颜色', path: base + '.color', fallback: '#3b82f6' }),
    '默认剪影颜色，所有槽位共用；如需单独设置可在下方逐槽覆盖。'));
  // 每槽位独立剪影颜色（留空 = 回落上面的默认剪影颜色）
  const silFallback = getPath(state.cfg, base + '.color') || '#3b82f6';
  for (let i = 1; i <= 5; i++) {
    styleBody.append(fieldRow(`${i} 号槽位剪影`, colorControl({
      type: 'color', label: `${i} 号槽位剪影`, path: `${base}.colors.${i}`, fallback: silFallback,
    }), i === 1 ? '留空则使用上方默认剪影颜色。仅影响未选中状态，选中状态仍使用「选中剪影颜色」。' : ''));
  }
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

  // ---- 名称与行距 ----
  const nameCard = el('div', 'card');
  const nameHead = el('div', 'card-head');
  {
    const box = el('div');
    box.append(el('div', 'card-title', '名称与行距'));
    box.append(el('div', 'card-hint', '图标下方可显示名称：选中栏显示武器名，其余栏可填写「常显名称」作为固定标签。'));
    nameHead.append(box);
  }
  nameCard.append(nameHead);
  const nameBody = el('div', 'card-body');

  nameBody.append(fieldRow('行间距', numControl({ type: 'num', label: '行间距', path: base + '.gap', min: 0, max: 60, step: 1, unit: 'px' })));
  nameBody.append(fieldRow('编号间距', numControl({ type: 'num', label: '编号间距', path: base + '.numGap', min: 0, max: 80, step: 1, unit: 'px' }),
    '图标右缘到右侧编号（1～5）的水平距离。'));
  nameBody.append(fieldRow('选中放大倍数', numControl({ type: 'num', label: '选中放大倍数', path: base + '.activeScale', min: 1, max: 1.6, step: 0.01 })));
  {
    const f = { type: 'switch', label: '选中时显示武器名称', path: base + '.showName' };
    const field = el('div', 'field');
    const row = el('div', 'row');
    row.append(switchControl(f), el('span', 'switch-label', f.label));
    field.append(row);
    field.append(el('div', 'note', '仅显示当前手持的那一件；投掷物行只显示手持那一颗的名称。'));
    nameBody.append(field);
  }
  nameBody.append(fieldRow('名称字号', numControl({ type: 'num', label: '名称字号', path: base + '.nameSize', min: 8, max: 28, step: 1, unit: 'px' })));
  nameBody.append(fieldRow('名称颜色', colorControl({ type: 'color', label: '名称颜色', path: base + '.nameColor', fallback: '#FFFFFF' })));
  nameBody.append(fieldRow('名称位置 X', numControl({ type: 'num', label: '名称位置 X', path: base + '.nameOffsetX', min: -100, max: 100, step: 1, unit: 'px' }),
    '在默认位置基础上微调；单图标栏默认在图标下方，投掷物行默认在手持那一颗下方。'));
  nameBody.append(fieldRow('名称位置 Y', numControl({ type: 'num', label: '名称位置 Y', path: base + '.nameOffsetY', min: -100, max: 100, step: 1, unit: 'px' }),
    '负值向上，正值向下。'));
  {
    const f = { type: 'switch', label: '名称辉光', path: base + '.nameGlow' };
    const field = el('div', 'field');
    const row = el('div', 'row');
    row.append(switchControl(f), el('span', 'switch-label', f.label));
    field.append(row);
    field.append(el('div', 'note', '仅作用于选中武器的名称；辉光半径复用「选中辉光半径」。'));
    nameBody.append(field);
  }
  nameBody.append(fieldRow('名称辉光颜色', colorControl({ type: 'color', label: '名称辉光颜色', path: base + '.nameGlowColor', fallback: getPath(state.cfg, base + '.glowColor') || '#3b82f6' }),
    '留空则跟随「颜色与辉光」中该槽位的辉光颜色。'));
  for (let i = 1; i <= 5; i++) {
    nameBody.append(fieldRow(`${i} 号栏常显名称`, textControl({
      type: 'text', label: `${i} 号栏常显名称`, path: `${base}.slotNames.${i}`, placeholder: '留空 = 不常显',
    }), i === 1 ? '填写后常驻显示（该栏为空时仍保留）；该栏选中时显示实际武器名。' : ''));
  }
  {
    const jump = el('button', 'mini', '去自定义武器名称');
    jump.addEventListener('click', () => activate('text'));
    nameBody.append(fieldRow('武器名称', jump,
      '选中时显示武器名。如需修改特定武器名称（含闪光弹、诱饵弹等投掷物），请在「文字替换 → 武器名称」中按内部名修改，文字态与 SVG 态共用。'));
  }
  nameCard.append(nameBody);
  wrap.append(nameCard);

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

  // 自注册：上架与否只由 sections/manifest.js 决定，这里不写死顺序
  globalThis.OphSections.register({
    id: "weaponListSvg", ico: "weapon", name: "武器栏SVG态",
    group: "basic",
    build: buildWeaponListSvgCard,
  });
})();
