'use strict';

/**
 * 购买轮盘 · 设置页模块
 *
 * 由 src/settings/settings.js（重构前巨石）机械拆分而来，代码原样保留。
 * 依赖通过头部解构显式声明 —— 不依赖加载顺序之外的东西，也不往全局挂散名。
 */
;(function () {
  const { commit, state } = globalThis.OphCtx;
  const { el } = globalThis.OphDOM;
  const { fieldRow, freeText, newCard, sectionHead } = globalThis.OphLayout;
  const { selectControl, switchRow } = globalThis.OphControls;
  const { markDirty, rebuild, schedulePreview, toast } = globalThis.OphApp;


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

  // 自注册：上架与否只由 sections/manifest.js 决定，这里不写死顺序
  globalThis.OphSections.register({
    id: "buywheel", ico: "buywheel", name: "购买轮盘",
    group: "basic",
    build: buildBuywheelSection,
  });
  // ⚠️ 未列入 manifest → 不会加载。重新上架：在 manifest 里加一行即可。

  globalThis.OphSecBuywheel = Object.assign(globalThis.OphSecBuywheel || {}, {
    BUY_TEAMS, buyCategories, buyWeaponsFor, ensureBuywheel, buildBuywheelSection, buyChipRow
  });
})();
