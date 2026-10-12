'use strict';

const $ = (id) => document.getElementById(id);

// ---------- 预览模式（设置窗口里「预览」开的那个窗口）----------
// 真实覆盖层不带 ?preview=1，下面所有分支都不会进入，行为与以前逐行一致。
const PREVIEW = (() => {
  try { return new URLSearchParams(location.search).get('preview') === '1'; }
  catch (e) { return false; }
})();
const PREVIEW_BAR = 34;    // 顶部工具条高度（px）：预览时 HUD 画布整体往下让这么多
let pvPaused = false;      // 暂停：停止重绘（画面冻结），模拟数据继续跑
let pvLastSnap = null;     // 暂停期间最近一份快照，继续时补画
let pvEvSeq = 0;           // 试播报用的假事件 id 序号

// 桥：正常窗口由 preload 提供；万一没有（例如被当普通网页打开）也不能整脚本崩掉。
const BRIDGE = window.overplayhud || {
  onConfig() {}, onBounds() {}, onSnapshot() {}, onPreviewReset() {},
};
if (!window.overplayhud) {
  console.error('[hud] 未找到 overplayhud 桥（preload 没生效？）——HUD 收不到任何数据');
}

const root = $('hud');
const nodes = {
  bottomBar: $('bottomBar'),
  moneyModule: $('moneyModule'),
  rightBar: $('rightBar'),
  weaponBar: $('weaponBar'),
  aliveCT: $('aliveCT'),
  aliveT: $('aliveT'),
  scoreCT: $('scoreCT'),
  scoreT: $('scoreT'),
  timerBlock: $('timerBlock'),
  timerText: $('timerText'),
  hp: $('hp'),
  hpIcon: $('hpIcon'),
  hpFill: $('hpFill'),
  healthBlock: $('healthBlock'),
  ar: $('ar'),
  arFill: $('arFill'),
  armorBlock: $('armorBlock'),
  armorIcon: $('armorIcon'),
  kitBlock: $('kitBlock'),
  clipWrap: $('clipWrap'),
  clip: $('clip'),
  reserve: $('reserve'),
  killsBlock: $('killsBlock'),
  roundKills: $('roundKills'),
  money: $('money'),
  rewardWrap: $('rewardWrap'),
  rewardLine: $('rewardLine'),
  rewardAmt: $('rewardAmt'),
  spendWrap: $('spendWrap'),
  spendLine: $('spendLine'),
  spendAmt: $('spendAmt'),
  rosterPanel: $('rosterPanel'),
  eventLayer: $('eventLayer'),
};

// 设计分辨率 → 真实屏幕的映射。算法在 src/fit.js（与自检共用同一份）。
// 渲染层 nodeIntegration 关闭，用 <script> 引入后读全局 OphFit。
// ⚠️ 绝不能写成 `const { computeFit } = globalThis.OphFit`：fit.js 是经典脚本，
//    顶层同名标识符会落在全局对象上，这句 const 会撞名并抛
//    「Identifier 'computeFit' has already been declared」——整个脚本一行都不执行、
//    HUD 彻底黑掉（踩过的坑）。这里用唯一名字，并加兜底防黑屏。
const OPH_FIT = globalThis.OphFit;
if (!OPH_FIT || typeof OPH_FIT.computeFit !== 'function') {
  console.error('[hud] OphFit 未加载，缩放暂用等比兜底（检查 index.html 是否引入了 ../fit.js）');
}

// 播报「进阶外观」的纯计算。缺失时降级为「关闭进阶」，基础播报不受影响。
const OPH_ADV = globalThis.OphAdv;
if (!OPH_ADV || typeof OPH_ADV.resolveKind !== 'function') {
  console.warn('[hud] OphAdv 未加载，进阶外观自动关闭（检查 index.html 是否引入了 ../advstyle.js）');
}

/** 缩放计算：优先用 fit.js，缺失时用等比兜底，保证 HUD 绝不黑屏 */
function ophComputeFit(cfg, bounds) {
  if (OPH_FIT && typeof OPH_FIT.computeFit === 'function') return OPH_FIT.computeFit(cfg, bounds);
  const k = Math.min(bounds.width / (Number(cfg.designWidth) || 1920),
                     bounds.height / (Number(cfg.designHeight) || 1080)) * (Number(cfg.scale) || 1);
  return { scale: k, stretchX: 1, virtW: bounds.width, virtH: bounds.height, insetX: 26 * k, insetY: 22 * k };
}
let scale = 1;
let showFlags = {};
let pending = null;
let rafId = 0;
let currentCfg = null;
let lowHealthThreshold = 25;
let healthRedThreshold = 50;
let aliveCountMode = 'label';
let moneyHoldMs = 1800;
let moneyFadeMs = 240;
let lastDeltaSeq = 0;
const deltaTimers = { reward: [], spend: [] };
const prevAlive = { ct: undefined, t: undefined };
const prevScore = { ct: undefined, t: undefined };
let prevKills = 0;
let badgeEls = [];
let slotEls = [];
let prevGrenades = [];
let prevGrenadeSep = '';

// 用户自定义文本（改 config.json 的 text 段或走设置界面）
let textMap = {
  weaponNames: {},
  grenadeChars: {},
  grenadeSep: '・',
  labels: { alive: '存活', ct: 'CT', t: 'T' },
};

// 自定义文本元素（模板 + 变量）
let customEls = [];

// 自定义图标库（按 id 索引，来自 config.icons）
let iconLib = {};

// 画图生成的形状元素（来自 config.shapes）
let shapeEls = [];

// 队友 / 对手名单面板
let rosterCfg = {};
let rosterSig = '';        // 名单内容的指纹，没变就不重建 DOM（否则每帧重建会闪）
let rosterOffWhy = '';     // 上一次「面板为什么没显示」的原因，去重用（诊断）
let rosterShown = null;    // 上一次面板是否显示过（诊断，用于只打一次「已显示」）

// 击杀 / 死亡播报
let eventsCfg = {};
let advCfg = {};           // 进阶外观配置（config.adv），enabled=false 时完全不参与
let lastEventId = 0;
let evInited = false;      // 第一份快照只建立基线，不补播历史事件
let evPlaying = false;
const evQueue = [];
let curveSeq = 0;          // 弯字 SVG 的路径 id 计数器（一页里多条会并存，必须唯一）
let devEventKind = null;   // 开发截图用：强制播一条（--shot-event=<kind>，只在截图模式存在）
let devEventFired = false;


// ---------- 配置 ----------
badgeEls = Array.from(document.querySelectorAll('#killsBlock .badge'));
slotEls = Array.from(document.querySelectorAll('#weaponBar .slot'));

BRIDGE.onConfig(({ cfg, bounds }) => {
  currentCfg = cfg;
  showFlags = cfg.show || {};
  const hudCfg = cfg.hud || {};
  lowHealthThreshold = hudCfg.lowHealthThreshold ?? 25;
  healthRedThreshold = hudCfg.healthRedThreshold ?? 50;
  moneyHoldMs = hudCfg.moneyDeltaHoldMs ?? 1800;
  aliveCountMode = hudCfg.aliveCountMode ?? 'label';
  root.classList.toggle('mark-off', hudCfg.factionMark === false);
  root.classList.toggle('woutline', hudCfg.weaponTextOutline === true);

  textMap = Object.assign({
    weaponNames: {}, grenadeChars: {}, grenadeSep: '・',
    labels: { alive: '存活', ct: 'CT', t: 'T' },
  }, cfg.text || {});
  textMap.labels = Object.assign({ alive: '存活', ct: 'CT', t: 'T' }, cfg.text?.labels || {});
  prevGrenades = [];   // 文本改了要整串重绘

  rosterCfg = cfg.roster || {};
  rosterSig = '';      // 配置变了（比如改了排序 / 显示字段）要重建
  eventsCfg = cfg.events || {};
  advCfg = cfg.adv || {};
  devEventKind = cfg.devEvent || null;   // 仅截图模式会带这个字段

  // 自定义图标库按 id 建索引；形状元素随后重建
  iconLib = {};
  for (const it of (Array.isArray(cfg.icons) ? cfg.icons : [])) {
    if (it && it.id) iconLib[it.id] = it;
  }

  applyModules(cfg);
  applyTextLabels();
  buildCustom(cfg.custom || []);
  buildShapes(cfg.shapes || []);
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--bar-alpha', String(hudCfg.barAlpha ?? 0.5));
  if (hudCfg.moneyGainColor) rootStyle.setProperty('--money-gain', hudCfg.moneyGainColor);
  if (hudCfg.moneySpendColor) rootStyle.setProperty('--money-spend', hudCfg.moneySpendColor);
  if (cfg.shotBg) document.body.style.background = cfg.shotBg;
  applyBounds(cfg, previewAwareBounds(bounds));
  applyEffects(cfg);          // 辉光/不透明度要用算好的 scale，必须放在 applyBounds 之后
  applyShowFlags();

  if (pending) render(pending);
});

BRIDGE.onBounds((bounds) => {
  if (!currentCfg) return;
  applyBounds(currentCfg, previewAwareBounds(bounds));
  applyEffects(currentCfg);   // 分辨率变了 scale 也变，辉光半径要跟着重算
});

/**
 * 预览窗口里窗口本身就能随意缩放，所以屏幕尺寸直接以自身视口为准，
 * 主进程传什么都不影响；再扣掉顶部工具条的高度。
 * 非预览模式原样返回，一行逻辑都不改。
 */
function previewAwareBounds(bounds) {
  if (!PREVIEW) return bounds;
  return {
    width: window.innerWidth,
    height: Math.max(1, window.innerHeight - PREVIEW_BAR),
  };
}

/**
 * 纯计算在 src/fit.js（与自检共用），这里只负责把结果写进 CSS 变量和 DOM。
 */
function applyBounds(cfg, bounds) {
  const f = ophComputeFit(cfg, bounds);
  scale = f.scale;

  const fill = cfg.fit === 'fill';

  // 位移量单位跟着模式走：
  //   fill            —— 虚拟画布内一切长度都是「设计像素」，位移只乘用户缩放；
  //   contain/stretch —— 屏幕坐标系，位移乘 scale（屏幕像素 / 设计像素）。
  const unit = fill ? (Number(cfg.scale) || 1) : scale;

  const s = document.documentElement.style;
  s.setProperty('--scale', String(scale));
  s.setProperty('--offx', `${(cfg.layout?.offsetX || 0) * unit}px`);
  s.setProperty('--offy', `${(cfg.layout?.offsetY || 0) * unit}px`);
  s.setProperty('--inset-x', `${f.insetX}px`);
  s.setProperty('--inset-y', `${f.insetY}px`);

  // 预览模式：顶部留给工具条，画布整体往下让一行
  const topPx = PREVIEW ? `${PREVIEW_BAR}px` : null;

  if (fill) {
    // 虚拟画布按设计分辨率排版，再整体二维拉伸铺满真实屏幕。
    root.style.transformOrigin = 'left top';
    root.style.transform = `scale(${f.stretchX}, ${f.stretchY})`;
    root.style.left = '0px';
    root.style.top = topPx || '0px';
    root.style.right = 'auto';
    root.style.bottom = 'auto';
    root.style.width = `${f.virtW}px`;
    root.style.height = `${f.virtH}px`;
  } else {
    root.style.transform = '';
    root.style.left = '';
    root.style.top = topPx || '';      // 非预览时清回 ''，沿用 CSS 的 inset:0
    root.style.right = '';
    root.style.bottom = '';
    root.style.width = '';
    root.style.height = '';
  }
}

function applyShowFlags() {
  for (const node of document.querySelectorAll('[data-show]')) {
    const key = node.getAttribute('data-show');
    node.classList.toggle('off', showFlags[key] === false);
  }
}

// ---------- 渲染 ----------
BRIDGE.onSnapshot((s) => {
  // 预览「暂停」：只把最近一份快照记下来，不重绘（画面就此冻结）
  if (PREVIEW && pvPaused) { pvLastSnap = s; return; }
  pending = s;
  if (!rafId) rafId = requestAnimationFrame(() => { rafId = 0; render(pending); });
});

function render(s) {
  if (!s) return;

  root.classList.toggle('hidden', !s.visible);

  // ---- 血量：白 → 红 → 红+发光，三级按阈值切换 ----
  nodes.hp.textContent = s.health;
  nodes.hpFill.style.width = `${pct(s.health)}%`;

  const critical = s.health <= lowHealthThreshold;
  nodes.healthBlock.classList.toggle('is-hurt', s.health <= healthRedThreshold);
  nodes.healthBlock.classList.toggle('is-critical', critical);
  nodes.bottomBar.classList.toggle('is-critical', critical);

  // 血量越低发光越强：25 血 → 0，0 血 → 1
  const glow = critical
    ? Math.min(1, (lowHealthThreshold - s.health) / Math.max(1, lowHealthThreshold))
    : 0;
  document.documentElement.style.setProperty('--glow', glow.toFixed(3));
  applyHealthGlow(critical, glow);

  // ---- 护甲 / 护甲槽：0 甲时保留整块，只把盾牌变灰、槽放空 ----
  nodes.ar.textContent = s.armor;
  nodes.arFill.style.width = `${pct(s.armor)}%`;
  nodes.armorBlock.classList.toggle('off', showFlags.armor === false);
  nodes.armorBlock.classList.toggle('is-empty', s.armor <= 0);
  nodes.armorIcon.classList.toggle('has-helmet', !!s.helmet && s.armor > 0);

  nodes.kitBlock.classList.toggle('off', showFlags.defuseKit === false || !s.defusekit);

  nodes.money.textContent = formatMoney(s.money);

  // 金钱变动提示：同一次变动只弹一次（refresh 会重复推送同一份快照）
  const delta = s.moneyDelta;
  if (delta && delta.seq !== lastDeltaSeq) {
    lastDeltaSeq = delta.seq;
    showMoneyDelta(delta.amount < 0 ? 'spend' : 'reward', delta.amount);
  }

  // ---- 弹药 ----
  const w = s.weapon;
  if (!w || w.clip == null) {
    nodes.clipWrap.classList.add('off');
  } else {
    nodes.clipWrap.classList.remove('off');
    nodes.clip.textContent = w.clip;
    nodes.reserve.textContent = w.reserve == null ? '' : w.reserve;
    nodes.clip.classList.toggle('is-empty', w.clip === 0);   // 空弹匣转红
  }

  // ---- 连杀骷髅：每击杀 1 人加 1 枚，最多 5 枚，死亡清空 ----
  renderKills(s);

  // ---- 右侧武器栏 ----
  renderWeaponBar(s);

  // ---- 比分（变化时一帧放大提亮）----
  setScore(nodes.scoreCT, s.scoreCT, 'ct');
  setScore(nodes.scoreT, s.scoreT, 't');

  // ---- 存活人数：GSI 对本地玩家不提供 allplayers，拿不到就压暗显示占位 ----
  setAlive(nodes.aliveCT, s.aliveCT ?? null, 'ct');
  setAlive(nodes.aliveT, s.aliveT ?? null, 't');

  // ---- 计时器 ----
  const t = s.timer || { mode: 'none', text: '' };
  nodes.timerText.textContent = t.text;
  nodes.timerBlock.classList.toggle('empty', !t.text);
  nodes.timerBlock.classList.toggle('is-bomb', t.mode === 'bomb');
  nodes.timerBlock.classList.toggle('is-freeze', t.mode === 'freeze');
  nodes.timerBlock.classList.toggle('is-low', t.mode !== 'none' && t.remain <= 10);

  // ---- 队友 / 对手名单（只有观战拿得到 allplayers 时才有内容）----
  renderRoster(s);

  // ---- 击杀 / 死亡播报 ----
  renderEvents(s);
  maybeFireDevEvent(s);

  // ---- 用户自定义文本元素 ----
  renderCustom(s);

  // ---- 用户画图生成的形状元素（只刷新里面的 {变量} 文字）----
  renderShapes(s);
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
  const enabled = showFlags.roster !== false;   // 名单面板功能总开关（默认已取消）
  const on = enabled && s.rosterReady === true && list.length > 0;

  nodes.rosterPanel.classList.toggle('off', !on);

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
    myTeam, rosterCfg.scope, rosterCfg.rowsPerTeam, rosterCfg.sortBy,
    rosterCfg.hideDead, rosterCfg.showSelf,
    rosterCfg.showHealth, rosterCfg.showArmor, rosterCfg.showWeapon,
    rosterCfg.showKda, rosterCfg.showMoney,
    groups.map((g) => ({
      t: g.title,
      rows: g.rows.map((p) => [p.key, p.alive, p.health, p.armor, p.weapon, p.kills, p.deaths, p.assists, p.money, p.hasBomb, p.isSelf]),
    })),
  ]);

  if (sig === rosterSig) return;   // 名单没变化，不重建节点
  rosterSig = sig;

  nodes.rosterPanel.textContent = '';
  for (const g of groups) {
    if (g.title) nodes.rosterPanel.append(elSpan('roster-group', g.title));
    for (const p of g.rows) nodes.rosterPanel.append(buildRosterRow(p));
  }
}

/** 按 scope / 分组 / 排序 / 截断，算出真正要画的行 */
function buildRosterGroups(list, myTeam) {
  const cfg = rosterCfg;
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
  const cfg = rosterCfg;
  const cls = ['roster-row'];
  if (!p.alive) cls.push('dead');
  if (p.isSelf) cls.push('self');
  if (p.alive && p.health > 0 && p.health <= 25) cls.push('hurt');

  const row = elSpan(cls.join(' '), '');
  row.append(elSpan('roster-dot', ''));
  row.append(elSpan('roster-name', p.name || '—'));
  if (p.hasBomb) row.append(elSpan('roster-bomb', 'C4'));
  if (cfg.showWeapon !== false) {
    row.append(elSpan('roster-weapon', weaponLabel({ name: p.weapon, label: p.weaponLabel }) || '—'));
  }
  if (cfg.showHealth !== false) row.append(elSpan('roster-hp', p.alive ? String(p.health) : '—'));
  if (cfg.showArmor) row.append(elSpan('roster-armor', p.alive ? String(p.armor) : '—'));
  if (cfg.showKda !== false) row.append(elSpan('roster-kda', `${p.kills}-${p.deaths}-${p.assists}`));
  if (cfg.showMoney) row.append(elSpan('roster-money', '$' + formatMoney(p.money)));
  return row;
}

function elSpan(cls, text) {
  const n = document.createElement('span');
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
}

// ============================================================
// 击杀 / 死亡播报
// ============================================================

// 同一帧里可能同时涨了好几个数（一次三杀 = 击杀 +1 + 连杀 3），
// 全播会糊满屏幕，所以按这个优先级只挑一条最有信息量的。
const EV_PRIORITY = ['multi', 'kill', 'death', 'assist', 'mvp'];

/**
 * 开发截图专用：--shot-event=<kind> 时，第一份快照到达后强制播一条播报，
 * 这样没有真实击杀事件也能截到「进阶外观」长什么样。生产运行不会带 devEvent。
 */
function maybeFireDevEvent(s) {
  if (!devEventKind || devEventFired) return;
  if (eventsCfg.enabled === false) return;
  devEventFired = true;
  const kind = EV_PRIORITY.indexOf(devEventKind) >= 0 ? devEventKind : 'kill';
  const conf = Object.assign({ on: true, text: '测试播报  +1', color: '#A6D94A' }, eventsCfg[kind] || {});
  enqueueEvent({ kind, ev: { id: 1e9, value: 3 }, conf });
}

function renderEvents(s) {
  if (!eventsCfg.enabled) return;

  const list = Array.isArray(s.events) ? s.events : [];

  // 第一份快照只记基线：这时候游戏里可能已经有 14 次击杀了，
  // 不能把它们当成「刚刚发生」一次性全播出来。
  if (!evInited) {
    evInited = true;
    lastEventId = list.length ? list[list.length - 1].id : 0;
    return;
  }
  if (!list.length) return;

  const fresh = list.filter((e) => e.id > lastEventId);
  lastEventId = Math.max(lastEventId, list[list.length - 1].id);
  if (!fresh.length) return;

  const pick = pickEvent(fresh);
  if (pick) enqueueEvent(pick);
}

function pickEvent(fresh) {
  for (const kind of EV_PRIORITY) {
    const conf = eventsCfg[kind];
    if (!conf || conf.on === false) continue;
    const ev = fresh.find((e) => e.kind === kind);
    if (ev) return { kind, ev, conf };
  }
  return null;
}

function enqueueEvent(pick) {
  evQueue.push(pick);
  if (evQueue.length > 3) evQueue.shift();   // 只留最近三条，别积压
  if (!evPlaying) playNextEvent();
}

function playNextEvent() {
  const item = evQueue.shift();
  if (!item) {
    evPlaying = false;
    return;
  }
  evPlaying = true;

  const layer = nodes.eventLayer;
  const el = document.createElement('div');
  el.className = 'ev-item a-' + (eventsCfg.anchor || 'tc');
  el.style.setProperty('--ev-size', String(Number(eventsCfg.fontSize) || 30));
  el.style.setProperty('--ev-color', item.conf.color || '#FFFFFF');
  el.style.setProperty('--ev-x', `${Number(eventsCfg.offsetX) || 0}px`);
  el.style.setProperty('--ev-y', `${Number(eventsCfg.offsetY) || 0}px`);
  el.style.setProperty('--ev-fade', `${Math.max(0, Number(eventsCfg.fadeMs) || 240)}ms`);

  // 播报文字也走 {变量} 插值：连杀那条用的是「触发时刻」的本回合击杀数，
  // 不能用当前快照 —— 排队播放时快照可能已经翻到下一回合了。
  const src = Object.assign({}, pending || {}, { roundKills: item.ev.value });
  const text = fillTemplate(item.conf.text || '', src, { weaponLabel, textMap });

  // ---- 进阶外观：只有总开关打开、本模块加载成功、且该类没被关掉时才走 ----
  // 否则走下面这条「和以前一模一样」的基础路径，保证默认零变化、可回退。
  const advOn = !!(advCfg && advCfg.enabled && OPH_ADV
    && typeof OPH_ADV.resolveKind === 'function');
  const R = advOn ? OPH_ADV.resolveKind(advCfg, item.kind) : null;
  const useAdv = advOn && R && R.enabled;

  if (useAdv) {
    buildAdvEvent(el, text, R, item.conf);
    layer.textContent = '';       // 串行播放，一次只留一条
    layer.appendChild(el);
    runAdvEvent(el, R, item.conf);
  } else {
    el.textContent = text;
    layer.textContent = '';
    layer.appendChild(el);
    void el.offsetWidth;          // 强制回流，让过渡重新开始
    el.classList.add('is-on');
  }

  const hold = useAdv
    ? Math.max(200, Number(R.holdMs) || 1500)
    : Math.max(200, Number(eventsCfg.holdMs) || 1500);
  const fade = useAdv
    ? Math.max(0, Number(R.outDur) || 240)
    : Math.max(0, Number(eventsCfg.fadeMs) || 240);

  setTimeout(() => {
    if (useAdv && el.animate) {
      try {
        el.animate([{ opacity: 1 }, { opacity: 0 }],
          { duration: fade, easing: 'ease-out', fill: 'forwards' });
      } catch (e) { el.classList.remove('is-on'); }
    } else {
      el.classList.remove('is-on');
    }
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
      playNextEvent();
    }, fade);
  }, hold);
}

/**
 * 组好进阶外观的 DOM：图标 + 文字（或弯字 SVG）。
 * 位置/锚点仍由基础段的 CSS 类负责，这里只管「内容长什么样」。
 */
function buildAdvEvent(el, text, R, conf) {
  el.classList.add('ev-adv', 'is-on');
  el.style.setProperty('--ev-weight', String(R.weight));
  el.style.setProperty('--ev-ls', `${R.letterSpacing}em`);
  el.style.setProperty('--ev-gap', `${Math.max(0, R.iconGap)}px`);
  el.style.setProperty('--ev-icon-size', String(R.iconSize));
  if (R.italic) el.classList.add('ev-italic');
  if (R.outlineOn) {
    el.classList.add('ev-outline');
    el.style.setProperty('--ev-ol-w', `${Math.max(0, R.outlineWidth)}px`);
    el.style.setProperty('--ev-ol-c', R.outlineColor || '#000000');
  }
  if (R.iconSide === 'right') el.classList.add('ev-ico-right');

  const ico = makeIconNode(R.icon, R.iconRef);
  if (ico) el.appendChild(ico);

  if (R.curveOn && OPH_ADV && typeof OPH_ADV.buildCurveSVG === 'function') {
    const id = 'evp' + (++curveSeq);
    el.insertAdjacentHTML('beforeend', OPH_ADV.buildCurveSVG(
      text, Object.assign({ color: conf.color || '#FFFFFF', fontSize: eventsCfg.fontSize }, R), id,
    ));
  } else {
    const txt = document.createElement('span');
    txt.className = 'ev-txt';
    txt.textContent = text;
    el.appendChild(txt);
  }
}

/**
 * 造一个图标节点。优先级：图标库引用（iconRef）> 内联 emoji / 文字（icon）。
 *
 * 图标库条目有三种来源，全部走「白名单图元重建 / dataURL 校验」，
 * 不存在把外部字符串直接注入 DOM 的路径：
 *   draw  —— SVG 图元，由 OPH_ADV.iconSVG 重建
 *   image —— data:image/...;base64，经 safeDataURL 校验
 *   text  —— 一段文字或 emoji
 */
function makeIconNode(value, ref) {
  const ic = ref ? iconLib[ref] : null;
  if (ic) {
    if (ic.kind === 'draw' && OPH_ADV && typeof OPH_ADV.iconSVG === 'function') {
      const wrap = document.createElement('span');
      wrap.className = 'ev-ico ev-ico-svg';
      wrap.insertAdjacentHTML('afterbegin', OPH_ADV.iconSVG(ic, {
        resolveText: (t) => fillTemplate(t, pending || {}, { weaponLabel, textMap }),
      }));
      return wrap;
    }
    if (ic.kind === 'image' && OPH_ADV && typeof OPH_ADV.safeDataURL === 'function') {
      const url = OPH_ADV.safeDataURL(ic.data);
      if (url) {
        const img = document.createElement('img');
        img.className = 'ev-ico ev-ico-img';
        img.src = url;
        img.alt = '';
        return img;
      }
    }
    if (ic.kind === 'text' && ic.text) {
      const span = document.createElement('span');
      span.className = 'ev-ico';
      span.textContent = ic.text;
      return span;
    }
  }
  const v = String(value == null ? '' : value);
  if (!v) return null;
  const span = document.createElement('span');
  span.className = 'ev-ico';
  span.textContent = v;
  return span;
}

/** 播放：入场缩放 / 停留脉冲 / HUD 抖动 / 手柄震动。全部用原生 API，失败静默。 */
function runAdvEvent(el, R, conf) {
  if (el.animate) {
    // 入场：透明 + 缩放。用独立的 `scale` 属性（而非 transform），
    // 这样不会覆盖锚点类里用来居中的 transform: translate(-50%, -50%)。
    const inKf = [{ opacity: 0 }];
    if (Math.abs(R.inScale - 1) > 0.001) inKf[0].scale = String(R.inScale);
    inKf.push({ opacity: 1, scale: '1' });
    try {
      el.animate(inKf, {
        duration: Math.max(1, R.inDur),
        easing: OPH_ADV.easingOf(R.inEase),
      });
    } catch (e) { /* 忽略 */ }

    // 停留脉冲（"大小会不会变化"）
    if (R.pulseOn && Math.abs(R.pulseTo - 1) > 0.001) {
      const iter = R.pulseRepeat < 0 ? Infinity : Math.max(1, Math.floor(R.pulseRepeat));
      try {
        el.animate([{ scale: '1' }, { scale: String(R.pulseTo) }, { scale: '1' }], {
          duration: Math.max(60, R.pulseDur),
          iterations: iter,
          easing: 'ease-in-out',
          delay: Math.max(0, R.inDur),
        });
      } catch (e) { /* 忽略 */ }
    }
  }

  if (R.shakeOn) shakeHud(R.shakeAmp, R.shakeDur, R.shakeAxis);
  if (R.rumbleOn) rumbleGamepad(R.rumbleStrong, R.rumbleWeak, R.rumbleDur);
}

/**
 * HUD 抖动。用独立的 `translate` 属性播放，**不动 transform** ——
 * fill 模式给根元素设了 scale 的 transform，动它会把整个 HUD 弄歪。
 */
function shakeHud(amp, dur, axis) {
  const a = Math.max(0, Number(amp) || 0);
  if (!a || !root || !root.animate) return;
  const N = 8;
  const kf = [];
  for (let i = 0; i <= N; i++) {
    const k = i / N;
    const decay = 1 - k;                       // 末尾收敛，避免残留偏移
    const wave = Math.sin(k * Math.PI * 6);
    const dx = axis === 'y' ? 0 : a * wave * decay;
    const dy = axis === 'x' ? 0 : a * Math.sin(k * Math.PI * 6 + 1.1) * decay;
    kf.push({ translate: `${dx.toFixed(2)}px ${dy.toFixed(2)}px` });
  }
  try { root.animate(kf, { duration: Math.max(60, dur), easing: 'ease-out' }); } catch (e) { /* 忽略 */ }
}

/**
 * 手柄震动。走浏览器原生 Gamepad API 的 vibrationActuator ——
 * 由浏览器直接驱动手柄，**不经过游戏、不注入任何输入**（VAC 底线）。
 * 浏览器通常要求先有一次「用户手势」才允许震动，所以按了没反应时先用一下手柄。
 */
function rumbleGamepad(strong, weak, dur) {
  try {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    for (const p of pads) {
      if (!p || !p.vibrationActuator || typeof p.vibrationActuator.playEffect !== 'function') continue;
      const d = Math.max(40, Math.floor(Number(dur) || 160));
      Promise.resolve(p.vibrationActuator.playEffect('dual-rumble', {
        startDelay: 0,
        duration: d,
        weakMagnitude: Math.min(1, Math.max(0, Number(weak) || 0)),
        strongMagnitude: Math.min(1, Math.max(0, Number(strong) || 0)),
      })).catch(() => {});
    }
  } catch (e) { /* 没有手柄 / 不支持时静默 */ }
}

/**
 * 存活人数。GSI 对本地玩家不提供 allplayers_*（仅 GOTV / 观察者可用），
 * 所以拿不到数据时显示占位横杠并压暗，拿到时数字直接切换 + 一次变暗微反馈。
 */
function setAlive(node, n, key) {
  const block = node.closest('.team-block');
  const hasCount = aliveCountMode !== 'label' && typeof n === 'number';

  // 默认只显示阵营名（GSI 对本地玩家不给存活人数，不去编一个假数字）
  const L = textMap.labels || {};
  node.textContent = hasCount ? String(n) : (key === 'ct' ? (L.ct || 'CT') : (L.t || 'T'));
  block.classList.toggle('show-count', hasCount);

  if (hasCount && prevAlive[key] !== undefined && prevAlive[key] !== n) {
    node.classList.remove('dim');
    void node.offsetWidth;
    node.classList.add('dim');
    setTimeout(() => node.classList.remove('dim'), 120);
  }
  prevAlive[key] = n;
}

/**
 * 连杀骷髅徽章。
 * 数据源是 player.state.round_kills（本回合击杀数），但 GSI 在玩家死亡后不会清零，
 * 而规范要求「死亡立即清空」，所以死亡时按 0 显示。
 * 上限 5 枚；新增的那一枚播 0.2 秒淡入回弹，已存在的保持静止。
 */
function renderKills(s) {
  const n = s.health > 0 ? Math.min(5, Math.max(0, s.roundKills | 0)) : 0;

  badgeEls.forEach((el, i) => {
    const on = i < n;
    el.classList.toggle('on', on);
    if (on && i === n - 1 && n > prevKills) {
      el.classList.remove('fresh');
      void el.offsetWidth;
      el.classList.add('fresh');
    }
  });

  nodes.killsBlock.classList.toggle('off', showFlags.roundKills === false || n === 0);
  prevKills = n;
}

/**
 * 右侧武器栏。五个槽位固定存在，只切换内容与状态类：
 *   active → 白 + 粗体；非 active → 灰 + 常规；空槽 → 文字隐藏、编号浅灰
 */
function renderWeaponBar(s) {
  const list = s.slots || [];

  slotEls.forEach((el, i) => {
    const info = list[i];
    const isGrenade = info && info.slot === 4;
    const empty = !info || (isGrenade ? (info.chars || []).length === 0 : !info.label);

    el.classList.toggle('empty', empty);
    el.classList.toggle('active', !!info && !!info.active);

    const textEl = el.querySelector('.wtext');
    if (isGrenade) {
      renderGrenadeText(textEl, info);
    } else {
      textEl.classList.remove('grenades');
      textEl.textContent = empty ? '' : weaponLabel(info);
    }
  });
}

/**
 * 武器显示名。用户自定义的名字（config 的 text.weaponNames）优先，
 * 没配就用 GSI 层算好的默认中文名。
 */
function weaponLabel(info) {
  if (!info) return '';
  const custom = textMap.weaponNames && textMap.weaponNames[info.name];
  if (custom) return custom;
  if (info.label) return info.label;
  return String(info.name || '').replace(/^weapon_/, '');
}

/** 投掷物单字：用户改了字就用用户的，没配就用默认 */
function grenadeCharsOf(info) {
  const ids = info.ids || [];
  const base = info.chars || [];
  const map = textMap.grenadeChars || {};
  return base.map((c, i) => {
    const v = ids[i] != null ? map[ids[i]] : undefined;
    return v == null || v === '' ? c : v;
  });
}

/**
 * 投掷物：按「火・烟・雷・闪・诱」顺位拼接，缺失的直接跳过、分隔符自动增减。
 * 新出现的单字淡入；消失的整串重排（分隔符会自动补位）。
 */
function renderGrenadeText(el, info) {
  el.classList.add('grenades');

  const chars = grenadeCharsOf(info || {});
  const sep = textMap.grenadeSep == null ? '・' : textMap.grenadeSep;
  const activeIndex = info && typeof info.activeIndex === 'number' ? info.activeIndex : -1;

  const same = prevGrenadeSep === sep
    && prevGrenades.length === chars.length
    && prevGrenades.every((c, i) => c === chars[i]);

  if (!same) {
    const fresh = chars.filter((c) => !prevGrenades.includes(c));
    el.textContent = '';

    chars.forEach((c, i) => {
      if (i > 0) {
        const s = document.createElement('span');
        s.className = 'gsep';
        s.textContent = sep;
        el.appendChild(s);
      }
      const sp = document.createElement('span');
      sp.className = fresh.includes(c) ? 'gchar g-in' : 'gchar';
      sp.textContent = c;
      el.appendChild(sp);
    });

    prevGrenades = chars.slice();
    prevGrenadeSep = sep;
  }

  // 每帧刷新高亮：只点亮当前手持的那一颗，其余保持暗色
  const nodes = el.querySelectorAll('.gchar');
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].classList.toggle('hot', i === activeIndex);
  }
}

// ============================================================
// 自定义文本元素
// ============================================================

const CUSTOM_ANCHORS = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];
const CUSTOM_ALIGNS = ['left', 'center', 'right'];

// 变量表来自 src/vars.js（和设置界面共用同一份定义）
const VAR_FNS = (() => {
  const m = {};
  const defs = (typeof OPH_VARS !== 'undefined' && Array.isArray(OPH_VARS)) ? OPH_VARS : [];
  for (const d of defs) m[d.key] = d.get;
  return m;
})();

/** 把模板里的 {变量} 换成当前数据；认不出的变量原样留着，方便排查拼写 */
function fillTemplate(tpl, s, helpers) {
  return String(tpl || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (whole, key) => {
    const fn = VAR_FNS[key] || VAR_FNS[key.toLowerCase()];
    if (!fn) return whole;
    let v;
    try { v = fn(s, helpers); } catch (e) { v = ''; }
    return v == null ? '' : String(v);
  });
}

/**
 * 按配置重建自定义文本元素的 DOM。
 * 只在配置变化时调用；逐帧渲染只改 textContent，不重建节点。
 */
function buildCustom(list) {
  const layer = document.getElementById('customLayer');
  if (!layer) return;

  layer.textContent = '';
  customEls = [];

  (Array.isArray(list) ? list : []).forEach((item, srcIndex) => {
    if (!item || typeof item !== 'object') return;

    const anchor = CUSTOM_ANCHORS.indexOf(item.anchor) >= 0 ? item.anchor : 'bl';
    const align = CUSTOM_ALIGNS.indexOf(item.align) >= 0 ? item.align : 'left';

    const el = document.createElement('div');
    el.className = 'custom-item a-' + anchor + ' al-' + align
      + (item.enabled === false ? ' off' : '')
      + (item.bar === true ? ' has-bar' : '')
      + (item.outline === false ? ' thin' : '');

    el.style.setProperty('--ci-x', `${Number(item.offsetX) || 0}px`);
    el.style.setProperty('--ci-y', `${Number(item.offsetY) || 0}px`);
    el.style.setProperty('--ci-scale', String(Number(item.scale) || 1));
    el.style.setProperty('--ci-rot', `${Number(item.rotate) || 0}deg`);
    el.style.setProperty('--ci-size', `${Number(item.fontSize) || 28}px`);
    el.style.setProperty('--ci-color', item.color || '#FFFFFF');

    if (item.barColor) {
      const rgb = toRgbTriplet(item.barColor);
      if (rgb) el.style.setProperty('--ci-bar', rgb);
    }
    if (item.barAlpha != null) el.style.setProperty('--ci-bar-a', String(Number(item.barAlpha)));

    // 每元素进阶：只有该元素显式写了覆盖、且没被「不用」关掉时才生效。
    // 有图标时把文字放进内层 span，逐帧刷新只改内层文字，不会把图标抹掉。
    let txtNode = null;
    if (advCfg && advCfg.enabled && advCfg.elements
        && advCfg.elements['custom.' + srcIndex] && OPH_ADV) {
      const R = OPH_ADV.resolveStyle(advCfg, 'custom.' + srcIndex);
      if (R.enabled) {
        el.classList.add('ci-adv');
        el.style.setProperty('--ci-weight', String(R.weight));
        el.style.setProperty('--ci-ls', `${R.letterSpacing}em`);
        el.style.setProperty('--ci-gap', `${R.iconGap}px`);
        el.style.setProperty('--ci-icon-size', String(R.iconSize));
        if (R.italic) el.classList.add('ci-italic');
        if (R.outlineOn) {
          el.classList.add('ci-outline');
          el.style.setProperty('--ci-ol-w', `${R.outlineWidth}px`);
          el.style.setProperty('--ci-ol-c', R.outlineColor);
        }
        const ico = makeIconNode(R.icon, R.iconRef);
        if (ico) {
          ico.classList.add('ci-ico');
          if (R.iconSide === 'right') el.classList.add('ci-ico-right');
          el.appendChild(ico);
        }
        txtNode = document.createElement('span');
        txtNode.className = 'ci-txt';
        el.appendChild(txtNode);
      }
    }

    layer.appendChild(el);
    // srcIndex 记住它在 config.custom 里的下标，applyEffects 要靠它取辉光/不透明度
    customEls.push({ el, srcIndex, tpl: String(item.text == null ? '' : item.text), last: null, txtNode });
  });
}

/** 每帧刷新自定义文本的内容 */
function renderCustom(s) {
  if (!customEls.length) return;
  const helpers = { weaponLabel, textMap };
  for (const item of customEls) {
    const text = fillTemplate(item.tpl, s, helpers);
    if (text !== item.last) {
      // 有进阶图标时文字在内层 span，不能整块 textContent 覆盖（会抹掉图标）
      if (item.txtNode) item.txtNode.textContent = text;
      else item.el.textContent = text;
      item.last = text;
    }
  }
}

// ============================================================
// 画图生成的形状元素（config.shapes）
// 每一块是一张自绘 SVG（图元重建），锚点 / 位移 / 缩放 / 旋转与自定义文本元素同一套语言。
// ============================================================

/** 按锚点写内联定位（和 .custom-item 的 9 锚点公式一致，避免复制一大段 CSS）。 */
function applyAnchor(el, anchor, offX, offY, scale, rot) {
  const a = CUSTOM_ANCHORS.indexOf(anchor) >= 0 ? anchor : 'tl';
  const h = a[1];   // l / c / r
  const v = a[0];   // t / m / b
  const parts = [];
  let ox = 'left', oy = 'top';

  if (h === 'l') { el.style.left = `calc(var(--inset-x, 0px) + ${offX}px)`; ox = 'left'; }
  else if (h === 'c') { el.style.left = `calc(50% + ${offX}px)`; parts.push('translateX(-50%)'); ox = 'center'; }
  else { el.style.right = `calc(var(--inset-x, 0px) - ${offX}px)`; ox = 'right'; }

  if (v === 't') { el.style.top = `calc(var(--inset-y, 0px) + ${offY}px)`; oy = 'top'; }
  else if (v === 'm') { el.style.top = `calc(50% + ${offY}px)`; parts.push('translateY(-50%)'); oy = 'center'; }
  else { el.style.bottom = `calc(var(--inset-y, 0px) - ${offY}px)`; oy = 'bottom'; }

  if (Math.abs(rot) > 0.001) parts.push(`rotate(${rot}deg)`);
  if (Math.abs(scale - 1) > 0.001) parts.push(`scale(${scale})`);
  el.style.transform = parts.join(' ');
  el.style.transformOrigin = `${ox} ${oy}`;
}

/**
 * 按配置重建形状元素的 DOM。只在配置变化时调用；逐帧由 renderShapes 刷新其中的文字。
 * 文本图元支持 {变量} 插值，所以这里记下原始模板与对应的 <text> 节点，逐帧只改文字。
 */
function buildShapes(list) {
  const layer = document.getElementById('shapeLayer');
  if (!layer) return;

  layer.textContent = '';
  shapeEls = [];

  (Array.isArray(list) ? list : []).forEach((item, srcIndex) => {
    if (!item || typeof item !== 'object') return;

    const scale = Number(item.scale) || 1;
    const w = Math.max(1, Number(item.w) || 120);
    const h = Math.max(1, Number(item.h) || 60);

    const el = document.createElement('div');
    el.className = 'shape-item' + (item.enabled === false ? ' off' : '');
    applyAnchor(el, item.anchor, Number(item.offsetX) || 0, Number(item.offsetY) || 0,
      scale, Number(item.rotate) || 0);
    el.style.width = `calc(${w}px * var(--scale))`;
    el.style.height = `calc(${h}px * var(--scale))`;

    // 每元素进阶：只有该元素显式写了覆盖、且没被关掉才生效
    if (advCfg && advCfg.enabled && advCfg.elements && advCfg.elements['shape.' + srcIndex] && OPH_ADV) {
      const R = OPH_ADV.resolveStyle(advCfg, 'shape.' + srcIndex);
      if (R.enabled) {
        el.style.setProperty('--si-weight', String(R.weight));
        el.style.setProperty('--si-ls', `${R.letterSpacing}em`);
        if (R.italic) el.classList.add('si-italic');
        if (R.outlineOn) {
          el.classList.add('si-outline');
          el.style.setProperty('--si-ol-w', `${R.outlineWidth}px`);
          el.style.setProperty('--si-ol-c', R.outlineColor);
        }
      }
    }

    if (!OPH_ADV || typeof OPH_ADV.shapeToSVG !== 'function') return;
    const svg = OPH_ADV.shapeToSVG({ w, h, items: item.items }, {
      cls: 'shape-svg',
      resolveText: (t) => fillTemplate(t, pending || {}, { weaponLabel, textMap }),
    });
    el.insertAdjacentHTML('beforeend', svg);

    // 文本图元：按顺序对应 <text> 节点（一个形状只有一张 svg，节点顺序与数组顺序一致）
    const raws = (Array.isArray(item.items) ? item.items : [])
      .filter((p) => p && p.type === 'text')
      .map((p) => String(p.text == null ? '' : p.text));
    const nodes = Array.from(el.querySelectorAll('text'));

    layer.appendChild(el);
    shapeEls.push({ el, srcIndex, raws, nodes });
  });
}

/** 每帧刷新形状里的文字（只有含 {变量} 的文本才会真的变） */
function renderShapes(s) {
  if (!shapeEls.length) return;
  const helpers = { weaponLabel, textMap };
  for (const sh of shapeEls) {
    for (let i = 0; i < sh.raws.length; i++) {
      const node = sh.nodes[i];
      if (!node) continue;
      const t = fillTemplate(sh.raws[i], s, helpers);
      if (node.textContent !== t) node.textContent = t;
    }
  }
}

/** 「存活」这类静态标签也走用户自定义 */
function applyTextLabels() {
  const L = textMap.labels || {};
  for (const el of document.querySelectorAll('.team-block .label')) {
    el.textContent = L.alive || '存活';
  }
}

/**
 * 每块 HUD 的位移 / 缩放 / 配色 / 字体。
 *
 * 位移是相对默认锚点的屏幕像素（不受缩放影响）；
 * scaleX / scaleY 分开设，两个值不一样就是非等比拉伸。
 * 配色按模块下发：色块类走 CSS 变量，"#RRGGBB" 会转成 "r, g, b"
 * 三元组，好让底栏那条 rgba(var(--bar-color), alpha) 渐变继续能用。
 */
function applyModules(cfg) {
  const M = cfg.modules || {};
  const n = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const root = document.documentElement.style;

  const keys = {
    scoreboard: '--m-scoreboard',
    money: '--m-money',
    vitals: '--m-vitals',
    ammo: '--m-ammo',
    weaponList: '--m-weaponList',
    roster: '--m-roster',
  };

  for (const [key, prefix] of Object.entries(keys)) {
    const m = M[key] || {};
    root.setProperty(`${prefix}-x`, `${n(m.offsetX, 0)}px`);
    root.setProperty(`${prefix}-y`, `${n(m.offsetY, 0)}px`);
    root.setProperty(`${prefix}-sx`, String(n(m.scaleX, 1)));
    root.setProperty(`${prefix}-sy`, String(n(m.scaleY, 1)));
    root.setProperty(`${prefix}-rot`, `${n(m.rotate, 0)}deg`);
  }

  const sb = M.scoreboard || {};
  const scorebar = document.querySelector('.scoreboard');
  if (scorebar) {
    if (sb.ctColor) scorebar.style.setProperty('--ct-block', sb.ctColor);
    if (sb.tColor) scorebar.style.setProperty('--t-block', sb.tColor);
    if (sb.centerColor) scorebar.style.setProperty('--center-block', sb.centerColor);
  }

  const bars = { money: nodes.moneyModule, vitals: nodes.bottomBar, ammo: nodes.rightBar };
  for (const [key, el] of Object.entries(bars)) {
    const m = M[key] || {};
    if (!el) continue;
    const rgb = toRgbTriplet(m.barColor);
    if (rgb) el.style.setProperty('--bar-color', rgb);
    if (m.barAlpha != null) el.style.setProperty('--bar-alpha', String(n(m.barAlpha, 0.5)));
  }

  const wb = M.weaponList || {};
  if (nodes.weaponBar) {
    if (wb.textColor) nodes.weaponBar.style.setProperty('--wtext-color', wb.textColor);
    if (wb.dimColor) nodes.weaponBar.style.setProperty('--wtext-dim', wb.dimColor);
  }

  // 名单面板：底栏浓度走 barAlpha，其余是各类文字的颜色
  const rp = M.roster || {};
  if (nodes.rosterPanel) {
    const st = nodes.rosterPanel.style;
    const rgb = toRgbTriplet(rp.barColor);
    if (rgb) st.setProperty('--roster-bar', rgb);
    if (rp.barAlpha != null) st.setProperty('--roster-bar-a', String(n(rp.barAlpha, 0.5)));
    if (rp.textColor) st.setProperty('--roster-text', rp.textColor);
    if (rp.dimColor) st.setProperty('--roster-dim', rp.dimColor);
    if (rp.aliveColor) st.setProperty('--roster-alive', rp.aliveColor);
    if (rp.deadColor) st.setProperty('--roster-dead', rp.deadColor);
    if (rp.selfColor) st.setProperty('--roster-self', rp.selfColor);
    if (rp.accentColor) st.setProperty('--roster-accent', rp.accentColor);
  }

  // 字体：预设 + 自定义覆盖都收在 OphAdv.fontStack 里（设置界面读同一份，所见即所得）
  if (OPH_ADV && typeof OPH_ADV.fontStack === 'function') {
    const stack = OPH_ADV.fontStack(cfg.font);
    if (stack) root.setProperty('--font-hud', stack);
  } else if (cfg.font && cfg.font.family) {
    root.setProperty('--font-hud', cfg.font.family);
  }
}

/** 各模块对应的 DOM 元素（辉光和不透明度要直接写在元素上） */
const MODULE_ELS = {
  scoreboard: () => document.querySelector('.scoreboard'),
  money: () => nodes.moneyModule,
  vitals: () => nodes.bottomBar,
  ammo: () => nodes.rightBar,
  weaponList: () => nodes.weaponBar,
  roster: () => nodes.rosterPanel,
};

/**
 * 辉光的 filter 字符串。
 *
 * ⚠️ `drop-shadow()` 里不能出现 `calc()` —— Chromium 会把整条声明判为无效、
 * 一个像素都不渲染（这个坑在低血量辉光那次踩过）。所以这里先在 JS 里
 * 算成真实像素值，再拼成字符串塞进去。
 *
 * 强度 0~1 映射成三层由紧到松的投影，越大越"外扩"。
 */
function glowFilter(glow, color, u) {
  const g = Math.max(0, Math.min(1, Number(glow) || 0));
  if (g <= 0) return '';

  const rgb = toRgbTriplet(color) || '255, 255, 255';
  const px = (v) => `${(v * u).toFixed(1)}px`;
  const a = (v) => Math.max(0, Math.min(1, v)).toFixed(2);

  return [
    `drop-shadow(0 0 ${px(2 + 10 * g)} rgba(${rgb}, ${a(0.35 + 0.45 * g)}))`,
    `drop-shadow(0 0 ${px(7 + 26 * g)} rgba(${rgb}, ${a(0.16 + 0.34 * g)}))`,
    `drop-shadow(0 0 ${px(16 + 52 * g)} rgba(${rgb}, ${a(0.07 + 0.22 * g)}))`,
  ].join(' ');
}

/**
 * 每块 HUD 和每个自定义文本元素的「不透明度 + 辉光」。
 * 必须在 applyBounds() 之后调用 —— 辉光半径是按当前 scale 算的。
 */
function applyEffects(cfg) {
  const u = scale;
  const M = cfg.modules || {};

  const opOf = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n < 1 ? String(Math.max(0, n)) : '';
  };

  for (const [key, getEl] of Object.entries(MODULE_ELS)) {
    const el = getEl();
    if (!el) continue;
    const m = M[key] || {};
    el.style.opacity = opOf(m.opacity);
    el.style.filter = glowFilter(m.glow, m.glowColor, u);
  }

  const list = Array.isArray(cfg.custom) ? cfg.custom : [];
  for (const item of customEls) {
    const m = list[item.srcIndex] || {};
    item.el.style.opacity = opOf(m.opacity);
    item.el.style.filter = glowFilter(m.glow, m.glowColor, u);
  }

  const shapes = Array.isArray(cfg.shapes) ? cfg.shapes : [];
  for (const item of shapeEls) {
    const m = shapes[item.srcIndex] || {};
    item.el.style.opacity = opOf(m.opacity);
    item.el.style.filter = glowFilter(m.glow, m.glowColor, u);
  }
}

/** "#1F4A78" → "31, 74, 120"，供 rgba(var(--bar-color), a) 使用 */
function toRgbTriplet(hex) {
  if (!hex) return null;
  const m = String(hex).trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const v = parseInt(h, 16);
  return `${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}`;
}

/** 比分变化时给一帧放大提亮的强调 */
function setScore(node, n, key) {
  node.textContent = n;
  if (prevScore[key] !== undefined && prevScore[key] !== n) {
    node.classList.remove('bump');
    void node.offsetWidth;
    node.classList.add('bump');
    setTimeout(() => node.classList.remove('bump'), 240);
  }
  prevScore[key] = n;
}

function formatMoney(n) {
  return Number(n || 0).toLocaleString('en-US');
}

function pct(v) {
  return Math.max(0, Math.min(100, Number(v) || 0));
}

/**
 * 金钱变动提示。
 *
 * 扣除行走主金额下方、奖励行走主金额上方，两者互不干扰，各自最多一行。
 * 连续触发时直接覆盖刷新当前那一行，不叠加多行。
 *
 * @param {'spend'|'reward'} kind
 * @param {number} amount 带符号的变动值
 */
function showMoneyDelta(kind, amount) {
  const isReward = kind === 'reward';
  const wrap = isReward ? nodes.rewardWrap : nodes.spendWrap;
  const line = isReward ? nodes.rewardLine : nodes.spendLine;
  const amt = isReward ? nodes.rewardAmt : nodes.spendAmt;

  for (const t of deltaTimers[kind]) clearTimeout(t);
  deltaTimers[kind] = [];

  amt.textContent = formatMoney(Math.abs(amount));

  // 已经在显示就只刷新数字，不重播出现动画（避免闪一下）
  const alreadyOn = wrap.classList.contains('is-on');
  line.classList.remove('is-out');
  wrap.classList.add('is-on');
  if (!alreadyOn || !line.classList.contains('is-in')) {
    line.classList.remove('is-in');
    void line.offsetWidth;            // 强制回流，让过渡重新开始
    line.classList.add('is-in');
  }

  deltaTimers[kind].push(setTimeout(() => {
    line.classList.remove('is-in');
    line.classList.add('is-out');
    deltaTimers[kind].push(setTimeout(() => {
      wrap.classList.remove('is-on');
      line.classList.remove('is-out');
    }, moneyFadeMs));
  }, moneyHoldMs));
}

/**
 * 低血量辉光。
 *
 * 为什么不写在 CSS 里：Chromium 会把 calc() 出现在 text-shadow / drop-shadow 中的
 * 整条声明判为无效（同样的 calc 放进 box-shadow 就正常），导致辉光整个不渲染。
 * 这里直接算出最终像素值再注入，绕开解析器这个坑。
 *
 * @param {boolean} critical 是否处于低血量预警
 * @param {number}  glow     0~1，血量越低越大
 */
function applyHealthGlow(critical, glow) {
  if (!critical) {
    nodes.hp.style.textShadow = '';
    if (nodes.hpIcon) nodes.hpIcon.style.filter = '';
    return;
  }

  const u = scale;                 // 缩放后的像素单位
  const px = (n) => `${(n * u).toFixed(1)}px`;
  const a = (base, span) => (base + span * glow).toFixed(2);
  const rgb = '255, 46, 36';

  nodes.hp.style.textShadow = [
    '0 1px 2px rgba(0, 0, 0, 0.75)',
    `0 0 ${px(3)} rgba(255, 84, 66, ${a(0.85, 0.15)})`,
    `0 0 ${px(10)} rgba(255, 58, 45, ${a(0.70, 0.30)})`,
    `0 0 ${px(22)} rgba(${rgb}, ${a(0.50, 0.45)})`,
    `0 0 ${px(40)} rgba(255, 38, 28, ${a(0.30, 0.50)})`,
  ].join(', ');

  if (nodes.hpIcon) {
    nodes.hpIcon.style.filter = [
      `drop-shadow(0 0 ${px(4)} rgba(255, 62, 48, ${a(0.80, 0.20)}))`,
      `drop-shadow(0 0 ${px(13)} rgba(${rgb}, ${a(0.55, 0.45)}))`,
    ].join(' ');
  }
}

// ============================================================
// 预览模式：顶部工具条
//
// 目的：在设置界面调参数时能立刻看到效果。数据来自主进程的模拟数据源
// （独立 GSI hub + mock 时间线），不碰真实对局，也不写任何游戏输入。
// 只有带 ?preview=1 的窗口才会走到这里。
// ============================================================

// 试播报用的兜底文案（和 config.js DEFAULTS.events 保持一致）
const PV_EV_TEXT = {
  kill: '击杀  +1',
  multi: '{round_kills} 连杀',
  death: '阵 亡',
  assist: '助攻  +1',
  mvp: 'MVP',
};

if (PREVIEW) {
  document.body.classList.add('preview-mode');

  const pvNote = $('pvNote');
  const pvSay = (t) => { if (pvNote) pvNote.textContent = t || ''; };

  // ---- 暂停 / 继续：只冻结画面，模拟数据继续在跑 ----
  const btnPause = $('pvPause');
  if (btnPause) {
    btnPause.addEventListener('click', () => {
      pvPaused = !pvPaused;
      btnPause.textContent = pvPaused ? '▶ 继续' : '⏸ 暂停';
      btnPause.classList.toggle('on', pvPaused);
      pvSay(pvPaused ? '已暂停（画面冻结）' : '');
      if (!pvPaused && pvLastSnap) {
        pending = pvLastSnap;
        render(pending);
      }
    });
  }

  // ---- 重播 / 跳到某个阶段：交给主进程重启模拟时间线 ----
  const btnRestart = $('pvRestart');
  if (btnRestart) {
    btnRestart.addEventListener('click', () => {
      previewCmd('restart', 0);
      pvSay('时间线已归零');
    });
  }
  for (const b of document.querySelectorAll('[data-pv-seek]')) {
    b.addEventListener('click', () => {
      const t = Number(b.getAttribute('data-pv-seek')) || 0;
      previewCmd('seek', t);
      pvSay(`已跳到第 ${t} 秒`);
    });
  }

  // ---- 试播报：直接压进播报队列，立刻能看到图标 / 弯曲 / 抖动 / 震动 ----
  for (const b of document.querySelectorAll('[data-pv-ev]')) {
    b.addEventListener('click', () => firePreviewEvent(b.getAttribute('data-pv-ev')));
  }

  // 预览窗口可以随意缩放 —— 尺寸变了重新映射一次（相当于换了一台显示器）
  window.addEventListener('resize', () => {
    if (!currentCfg) return;
    applyBounds(currentCfg, previewAwareBounds(null));
    applyEffects(currentCfg);
  });
}

/** 给主进程发一条预览命令（preload 里暴露的 previewCmd） */
function previewCmd(cmd, arg) {
  if (BRIDGE && typeof BRIDGE.previewCmd === 'function') BRIDGE.previewCmd(cmd, arg);
}

/** 时间线重置后要把「播报基线」清掉，否则新一轮的击杀会被当成旧事件吞掉 */
if (typeof BRIDGE.onPreviewReset === 'function') {
  BRIDGE.onPreviewReset(() => {
    evInited = false;
    lastEventId = 0;
    evQueue.length = 0;
    evPlaying = false;
    prevKills = 0;
    lastDeltaSeq = 0;
    if (nodes.eventLayer) nodes.eventLayer.textContent = '';
    const n = $('pvNote');
    if (n) n.textContent = '时间线已归零';
  });
}

/**
 * 试播报：强制播一条，不受「该类是否勾选」影响 —— 这里的目的就是看外观。
 * 走的是和真实播报完全相同的那条渲染路径，所以看到的即为实际效果。
 */
function firePreviewEvent(kind) {
  const k = PV_EV_TEXT[kind] ? kind : 'kill';
  const conf = Object.assign({}, (eventsCfg && eventsCfg[k]) || {});
  conf.on = true;
  if (!conf.text) conf.text = PV_EV_TEXT[k];
  pvEvSeq += 1;
  enqueueEvent({ kind: k, ev: { id: 1e9 + pvEvSeq, value: k === 'multi' ? 3 : 1 }, conf });
}
