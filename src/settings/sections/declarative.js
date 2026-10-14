'use strict';

/**
 * 声明式页面 · 金钱 / 血量护甲 / 弹药连杀 / 武器栏文字态
 *
 * 这四页没有任何自绘代码 —— 一行 schema 就够宿主渲染出整页。
 * 它们是「加功能有多省事」的样板：想改一个开关，改下面一行字即可；
 * 想加一页同类设置，复制一个 register 改改路径。
 *
 * （重构前这些 entry 混在 3938 行的 settings.js 顶部的大型 SECTIONS 数组里。）
 */
;(function () {

  globalThis.OphSections.register({
    id: 'money',
    ico: 'money',
    name: '金钱',
    module: 'money',
    keywords: ['money', '经济', '收入', '支出'],
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
  });

  globalThis.OphSections.register({
    id: 'vitals',
    ico: 'vitals',
    name: '血量 / 护甲',
    module: 'vitals',
    keywords: ['health', 'armor', '血', '护甲', '低血', '预警'],
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
        note: '血量低于或等于该值时，血条填充由白转红。' },
      { type: 'num',    label: '低血预警',   path: 'hud.lowHealthThreshold', min: 1, max: 100, step: 1,
        note: '血量低于或等于该值时触发红色发光与底栏左侧红渐变，血量越低发光越强。' },
    ],
  });

  globalThis.OphSections.register({
    id: 'ammo',
    ico: 'ammo',
    name: '弹药 / 连杀',
    module: 'ammo',
    keywords: ['ammo', '弹药', '连杀', '子弹'],
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
  });

  globalThis.OphSections.register({
    id: 'weaponListText',
    ico: 'weapon',
    name: '武器栏文字态',
    module: 'weaponList',
    keywords: ['weapon', '武器栏', '文字', '槽位'],
    colors: [
      { label: '手持文字色', path: 'modules.weaponList.textColor' },
      { label: '未手持文字色', path: 'modules.weaponList.dimColor', withAlpha: true },
    ],
    fields: [
      { type: 'switch', label: '显示武器栏',   path: 'show.weaponList' },
      { type: 'switch', label: '文字描边',     path: 'show.weaponTextOutline',
        note: '在武器名与编号外描一圈深色边，便于在明亮背景上辨识。' },
      { type: 'num',    label: '武器名字号',   path: 'modules.weaponList.textSize', min: 8, max: 80, step: 1, unit: 'px',
        note: '投掷物那一行的单字自动取该值的 2/3。' },
      { type: 'num',    label: '武器名位置 X', path: 'modules.weaponList.textOffsetX', min: -300, max: 300, step: 1, unit: 'px',
        note: '负值向左，正值向右。位置微调不参与布局，不会挤动右侧编号。' },
      { type: 'num',    label: '武器名位置 Y', path: 'modules.weaponList.textOffsetY', min: -300, max: 300, step: 1, unit: 'px',
        note: '负值向上，正值向下。' },
      { type: 'num',    label: '编号字号',     path: 'modules.weaponList.numSize', min: 8, max: 60, step: 1, unit: 'px' },
      { type: 'num',    label: '编号位置 X',   path: 'modules.weaponList.numOffsetX', min: -300, max: 300, step: 1, unit: 'px' },
      { type: 'num',    label: '编号位置 Y',   path: 'modules.weaponList.numOffsetY', min: -300, max: 300, step: 1, unit: 'px',
        note: '编号与武器名各自独立定位，互不推挤，允许重叠。' },
    ],
  });
})();
