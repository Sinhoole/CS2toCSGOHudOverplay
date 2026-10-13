'use strict';

/**
 * roster · 队友 / 对手名单面板
 *
 * 由 src/renderer/hud.js（重构前巨石，1665 行）机械拆分而来，正文逐字保留。
 * 共享可变状态走 C（globalThis.OphHudCtx），纯函数走 K（globalThis.OphHudKit）。
 * 想加/删这块功能：改 src/renderer/hud-manifest.js 里的一行即可。
 */
;(function () {
  const C = globalThis.OphHudCtx;
  const K = globalThis.OphHudKit;

  let rosterSig = '';        // 名单内容的指纹，没变就不重建 DOM（否则每帧重建会闪）
  let rosterOffWhy = '';     // 上一次「面板为什么没显示」的原因，去重用（诊断）
  let rosterShown = null;    // 上一次面板是否显示过（诊断，用于只打一次「已显示」）
  /** 每帧渲染：快照到达时由宿主分发调用 */
  function render(s) {
  // ---- 队友 / 对手名单（只有观战拿得到 allplayers 时才有内容）----
  renderRoster(s);
  }

/**
 * 队友 / 对手名单。
 *
 * ⚠️ 数据源 allplayers 只在死亡观战 / GOTV / 回放时才有 —— 你还活着的时候
 * 游戏不会下发队友的血量和位置（Valve 故意这么设计的）。所以这里的关键是
 * 「没数据就把面板收起来」，绝不能编个假数据糊弄。
 */
function renderRoster(s) {
  const list = Array.isArray(s.roster) ? s.roster : [];
  const enabled = C.showFlags.roster !== false;   // 名单面板功能总开关（默认已取消）
  const on = enabled && s.rosterReady === true && list.length > 0;

  C.nodes.rosterPanel.classList.toggle('off', !on);

  // 功能已取消：面板保持隐藏，且不再打诊断日志（之前会引起刷屏）。
  // 保留其余代码，日后要重新启用只要把 show.roster 改回 true。
  if (!enabled) {
    rosterShown = false;
    rosterOffWhy = '';
    rosterSig = '';
    return;
  }

  // 侦测：面板显示 / 隐藏的翻转都记一行（渲染层日志会转发到终端），
  // 这样「数据没到」和「到了但没画」一眼可分。
  if (!on) {
    const why = s.rosterReady !== true
      ? 'GSI 没给 allplayers（活着时本来就没有；观战时若持续没有则是 Valve 的限制）'
      : 'allplayers 到了但名单为空';
    rosterShown = false;
    if (why !== rosterOffWhy) { rosterOffWhy = why; console.log('[hud:roster] 面板隐藏：' + why); }
    rosterSig = '';
    return;
  }
  rosterOffWhy = '';
  if (rosterShown !== true) {
    rosterShown = true;
    console.log(`[hud:roster] 面板显示：${list.length} 人（观战数据已到）`);
  }

  const myTeam = s.team || (list.find((p) => p.isSelf) || {}).team || '';
  const groups = buildRosterGroups(list, myTeam);

  const sig = JSON.stringify([
    myTeam, C.rosterCfg.scope, C.rosterCfg.rowsPerTeam, C.rosterCfg.sortBy,
    C.rosterCfg.hideDead, C.rosterCfg.showSelf,
    C.rosterCfg.showHealth, C.rosterCfg.showArmor, C.rosterCfg.showWeapon,
    C.rosterCfg.showKda, C.rosterCfg.showMoney,
    groups.map((g) => ({
      t: g.title,
      rows: g.rows.map((p) => [p.key, p.alive, p.health, p.armor, p.weapon, p.kills, p.deaths, p.assists, p.money, p.hasBomb, p.isSelf]),
    })),
  ]);

  if (sig === rosterSig) return;   // 名单没变化，不重建节点
  rosterSig = sig;

  C.nodes.rosterPanel.textContent = '';
  for (const g of groups) {
    if (g.title) C.nodes.rosterPanel.append(K.elSpan('roster-group', g.title));
    for (const p of g.rows) C.nodes.rosterPanel.append(buildRosterRow(p));
  }
}

/** 按 scope / 分组 / 排序 / 截断，算出真正要画的行 */
function buildRosterGroups(list, myTeam) {
  const cfg = C.rosterCfg;
  const scope = cfg.scope || 'team';

  const mine = list.filter((p) => p.team === myTeam);
  const theirs = list.filter((p) => p.team !== myTeam);

  const prep = (arr) => {
    let a = arr.slice();
    if (cfg.showSelf === false) a = a.filter((p) => !p.isSelf);
    if (cfg.hideDead) a = a.filter((p) => p.alive);
    a = sortRoster(a, cfg.sortBy);
    const n = Number(cfg.rowsPerTeam);
    return n > 0 ? a.slice(0, n) : a;
  };

  if (scope === 'enemy') return [{ title: '', rows: prep(theirs) }];
  if (scope === 'all') {
    return [
      { title: (myTeam || 'CT') + ' · 我方', rows: prep(mine) },
      { title: (myTeam === 'CT' ? 'T' : 'CT') + ' · 敌方', rows: prep(theirs) },
    ].filter((g) => g.rows.length);
  }
  return [{ title: '', rows: prep(mine) }];
}

function sortRoster(arr, by) {
  const a = arr.slice();
  if (by === 'kills') {
    a.sort((x, y) => y.kills - x.kills || y.score - x.score);
  } else if (by === 'slot') {
    a.sort((x, y) => String(x.key).localeCompare(String(y.key), undefined, { numeric: true }));
  } else if (by === 'alive') {
    a.sort((x, y) => (y.alive ? 1 : 0) - (x.alive ? 1 : 0) || y.score - x.score);
  } else {
    a.sort((x, y) => y.score - x.score || y.kills - x.kills);
  }
  return a;
}

function buildRosterRow(p) {
  const cfg = C.rosterCfg;
  const cls = ['roster-row'];
  if (!p.alive) cls.push('dead');
  if (p.isSelf) cls.push('self');
  if (p.alive && p.health > 0 && p.health <= 25) cls.push('hurt');

  const row = K.elSpan(cls.join(' '), '');
  row.append(K.elSpan('roster-dot', ''));
  row.append(K.elSpan('roster-name', p.name || '—'));
  if (p.hasBomb) row.append(K.elSpan('roster-bomb', 'C4'));
  if (cfg.showWeapon !== false) {
    row.append(K.elSpan('roster-weapon', K.weaponLabel({ name: p.weapon, label: p.weaponLabel }) || '—'));
  }
  if (cfg.showHealth !== false) row.append(K.elSpan('roster-hp', p.alive ? String(p.health) : '—'));
  if (cfg.showArmor) row.append(K.elSpan('roster-armor', p.alive ? String(p.armor) : '—'));
  if (cfg.showKda !== false) row.append(K.elSpan('roster-kda', `${p.kills}-${p.deaths}-${p.assists}`));
  if (cfg.showMoney) row.append(K.elSpan('roster-money', '$' + K.formatMoney(p.money)));
  return row;
}

  globalThis.OphHud.register({
    id: 'roster',
    render,
    apply() { rosterSig = ''; },   // 配置变了（排序 / 显示字段）要重建
  });
})();
