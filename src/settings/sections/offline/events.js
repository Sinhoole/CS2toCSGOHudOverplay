'use strict';

/**
 * 击杀播报 · 设置页模块
 *
 * 由 src/settings/settings.js（重构前巨石）机械拆分而来，代码原样保留。
 * 依赖通过头部解构显式声明 —— 不依赖加载顺序之外的东西，也不往全局挂散名。
 */
;(function () {
  const { el } = globalThis.OphDOM;
  const { ANCHORS, fieldRow, freeText, newCard, sectionHead } = globalThis.OphLayout;
  const { colorControl, numControl, selectControl, switchRow } = globalThis.OphControls;
  const { getPath } = globalThis.OphPath;
  const { commit, state } = globalThis.OphCtx;


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

  // 自注册：上架与否只由 sections/manifest.js 决定，这里不写死顺序
  globalThis.OphSections.register({
    id: "events", ico: "events", name: "击杀播报",
    group: "basic",
    build: buildEventsSection,
  });
  // ⚠️ 未列入 manifest → 不会加载。重新上架：在 manifest 里加一行即可。

  globalThis.OphSecEvents = Object.assign(globalThis.OphSecEvents || {}, {
    EV_KINDS, buildEventsSection
  });
})();
