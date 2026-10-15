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
      { type: 'switch', label: '显示弹药',   path: 'show.ammo',
        note: '含弹匣、备弹与子弹装饰。未持枪（空手或只拿刀）时自动隐去，击杀栏位置不受影响。' },
      { type: 'switch', label: '显示连杀',   path: 'show.roundKills' },
      { type: 'num',    label: '击杀栏位置 X', path: 'modules.ammo.killsOffsetX', min: -400, max: 400, step: 1, unit: 'px',
        note: '连杀骷髅相对默认位置的横向微调，负值向左。与子弹栏各自独立，允许重叠。' },
      { type: 'num',    label: '击杀栏位置 Y', path: 'modules.ammo.killsOffsetY', min: -400, max: 400, step: 1, unit: 'px',
        note: '负值向上。' },
      { type: 'num',    label: '击杀栏大小',   path: 'modules.ammo.killsScale', min: 0.3, max: 3, step: 0.01, unit: '×',
        note: '整块骷髅等比缩放，以右下角为原点向左上展开，不会顶出屏幕。' },
      { type: 'color',  label: '子弹颜色',     path: 'modules.ammo.bulletColor',
        note: '装饰子弹的常态颜色。' },
      { type: 'color',  label: '低弹量颜色',   path: 'modules.ammo.bulletLowColor',
        note: '弹匣数降到阈值以下时整条子弹带的颜色。' },
      { type: 'num',    label: '低弹量阈值',   path: 'modules.ammo.lowAmmoThreshold', min: 0, max: 30, step: 1, unit: '发',
        note: '弹匣数 ≤ 此值时子弹转红，且射击只掉出不补充，左端随之空出。' },
      { type: 'switch', label: '射击滚动动画', path: 'modules.ammo.bulletRoll',
        note: '射击时子弹带整体右移：右端掉出一颗、左端补入一颗。弹匣数多于显示颗数时数量恒定。' },
      { type: 'num',    label: '滚动时长',     path: 'modules.ammo.bulletRollMs', min: 0, max: 400, step: 10, unit: 'ms',
        note: '单次滚动的时长。一帧内掉多发时自动压缩（每多一发减 12ms，下限 70ms），避免动画积压。' },
      { type: 'num',    label: '滚动模糊',     path: 'modules.ammo.bulletRollBlur', min: 0, max: 6, step: 0.1, unit: 'px',
        note: '滚动过程中的运动模糊强度，0 = 关闭。连续扫射时模糊持续存在。' },
      { type: 'switch', label: '忽略系统减少动态', path: 'hud.ignoreReducedMotion',
        note: 'Windows 关闭「动画效果」时，系统会上报减少动态偏好，滚动、模糊与击杀徽章动画会被一并关闭。开启本项后 HUD 动画照常播放。' },
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
