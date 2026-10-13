#!/usr/bin/env node
/**
 * 无头自检：不开窗口，验证 GSI 解析与计时器状态机是否正确。
 *   node tools/selftest.mjs
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { load } = require('../src/config.js');
const { GsiHub } = require('../src/gsi.js');
const { buildPayload } = require('../src/mock.js');

const cfg = load();
const hub = new GsiHub(cfg);

let last = null;
hub.onSnapshot((s) => (last = s));

const feed = (t) => hub._ingest(JSON.stringify(buildPayload(t)), '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`); }
  else { fail += 1; console.log(`  ❌ ${name} ${extra}`); }
};

console.log('\n[1] 冻结时间');
feed(5);
check('mode = freeze', last.timer.mode === 'freeze', `实际 ${last.timer.mode}`);
check('剩余 ≈ 15s', Math.abs(last.timer.remain - 15) < 0.5, `实际 ${last.timer.remain.toFixed(2)}`);
check('显示 0:15', last.timer.text === '0 : 15', `实际 ${last.timer.text}`);

console.log('\n[2] 回合开始');
feed(20);
check('mode = round', last.timer.mode === 'round', `实际 ${last.timer.mode}`);
check('剩余 ≈ 115s', Math.abs(last.timer.remain - 115) < 0.5, `实际 ${last.timer.remain.toFixed(2)}`);
check('显示 1:55', last.timer.text === '1 : 55', `实际 ${last.timer.text}`);

console.log('\n[3] 计时器会自己走');
await sleep(1200);
hub.refresh();
check('1.2s 后剩余 ≈ 113.8', Math.abs(last.timer.remain - 113.8) < 0.4, `实际 ${last.timer.remain.toFixed(2)}`);

console.log('\n[4] 下包');
feed(70);
check('mode = bomb', last.timer.mode === 'bomb', `实际 ${last.timer.mode}`);
check('剩余 ≈ 40s', Math.abs(last.timer.remain - 40) < 0.5, `实际 ${last.timer.remain.toFixed(2)}`);

console.log('\n[5] 玩家数据');
const p30 = buildPayload(30);
feed(30);
check('血量与 payload 一致', last.health === Number(p30.player.state.health), `快照 ${last.health} / payload ${p30.player.state.health}`);
check('护甲与 payload 一致', last.armor === Number(p30.player.state.armor), `快照 ${last.armor} / payload ${p30.player.state.armor}`);
check('血量护甲都是数字', Number.isFinite(last.health) && Number.isFinite(last.armor));
check('头盔 true', last.helmet === true);
check('手持武器跟随 payload（30s 为 AK-47）', last.weapon?.name === 'weapon_ak47', `实际 ${last.weapon?.name}`);
check('弹匣是一个数字', Number.isFinite(last.weapon?.clip), `实际 ${last.weapon?.clip}`);
check('比分 7:9', last.scoreCT === 7 && last.scoreT === 9, `实际 ${last.scoreCT}:${last.scoreT}`);
check('地图 de_mirage', last.map === 'de_mirage', `实际 ${last.map}`);
check('HUD 可见', last.visible === true);

console.log('\n[5c] 金钱变动提示');
const seqBefore = last.moneyDelta?.seq;
feed(39);
check('39s 没有产生新的变动', last.moneyDelta?.seq === seqBefore, `seq ${last.moneyDelta?.seq} / 之前 ${seqBefore}`);
feed(41);
check('41s 检测到扣款 -350', last.moneyDelta?.amount === -350, `实际 ${last.moneyDelta?.amount}`);
check('seq 递增（同额变动也能重新触发）', last.moneyDelta.seq > (seqBefore ?? 0));
const spendSeq = last.moneyDelta.seq;
feed(42);
check('金额没变时不再重复推送新 seq', last.moneyDelta.seq === spendSeq);
feed(79);
check('79s 检测到奖励 +100', last.moneyDelta?.amount === 100, `实际 ${last.moneyDelta?.amount}`);

// 回合开始的经济重置发生在冻结时间，不应该弹成「获得奖励」
const hub2 = new GsiHub(cfg);
let s2 = null;
hub2.onSnapshot((s) => (s2 = s));
hub2._ingest(JSON.stringify({ ...buildPayload(140), player: { ...buildPayload(140).player, state: { ...buildPayload(140).player.state, money: 300 } } }), '');
hub2._ingest(JSON.stringify({ ...buildPayload(2), player: { ...buildPayload(2).player, state: { ...buildPayload(2).player.state, money: 1800 } } }), '');
check('冻结时间的经济重置不弹奖励', s2.moneyDelta == null, `实际 ${JSON.stringify(s2.moneyDelta)}`);

console.log('\n[5b] 极端状态可达（前端靠这两个状态验证红底板和灰盾牌）');
feed(110);
check('血量 ≤ 25', last.health <= 25, `实际 ${last.health}`);
check('护甲 = 0', last.armor === 0, `实际 ${last.armor}`);

console.log('\n[5d] 右侧武器栏槽位');
feed(20);
const sl = last.slots;
check('槽1 = AK-47', sl[0].label === 'AK-47', `实际 ${sl[0].label}`);
check('槽1 选中态', sl[0].active === true);
check('槽2 = 格洛克18型', sl[1].label === '格洛克18型', `实际 ${sl[1].label}`);
check('槽3 = 匕首', sl[2].label === '匕首', `实际 ${sl[2].label}`);
check('槽4 投掷物固定顺位 火烟雷闪诱', sl[3].chars.join('') === '火烟雷闪诱', `实际 ${sl[3].chars.join('')}`);
check('槽5 = 拆弹器（本 mock 是 CT 方，带拆弹器）', sl[4].label === '拆弹器', `实际 ${sl[4].label}`);

// 匪徒方：持 C4 → 槽5 = C4（拆弹器合成不会误填）
{
  const pT = buildPayload(20);
  pT.player.team = 'T';
  pT.player.state.defusekit = false;
  pT.player.weapons.weapon_c4 = { name: 'weapon_c4', type: 'C4', state: 'holstered' };
  const hubT = new GsiHub(cfg);
  let sT = null;
  hubT.onSnapshot((s) => (sT = s));
  hubT._ingest(JSON.stringify(pT), '');
  check('槽5 = C4（匪徒方持 C4）', sT.slots[4].label === 'C4', `实际 ${sT.slots[4].label}`);
}

feed(60);
const sl2 = last.slots;
check('60s 手持投掷物 → 槽4 选中', sl2[3].active === true);
check('60s 烟雾弹已消耗（「烟」消失）', !sl2[3].chars.includes('烟'), `实际 ${sl2[3].chars.join('')}`);
check('60s 剩余投掷物 = 火雷闪诱', sl2[3].chars.join('') === '火雷闪诱', `实际 ${sl2[3].chars.join('')}`);
check('60s 槽1 有主武器但非选中', sl2[0].label === 'AK-47' && sl2[0].active === false);

console.log('\n[5e] 自定义文本要用的原始名 / 投掷物 id');
const sl3 = last.slots;
check('槽1 带原始英文名', sl3[0].name === 'weapon_ak47', `实际 ${sl3[0].name}`);
check('槽2 带原始英文名', sl3[1].name === 'weapon_glock', `实际 ${sl3[1].name}`);
check('槽4 ids 与 chars 一一对应 = flame,he,flash,decoy',
  sl3[3].ids.join(',') === 'flame,he,flash,decoy', `实际 ${sl3[3].ids.join(',')}`);
check('60s 手持闪光弹 → activeIndex = 2', sl3[3].activeIndex === 2, `实际 ${sl3[3].activeIndex}`);

feed(20);
check('20s 手持 AK → 投掷物槽没有高亮项', last.slots[3].activeIndex === -1, `实际 ${last.slots[3].activeIndex}`);
check('20s 武器带上默认中文名（供自定义兜底）', last.weapon.label === 'AK-47', `实际 ${last.weapon.label}`);

console.log('\n[5f] 自定义文本变量表');
const VARS = require('../src/vars.js');
check('变量表非空', Array.isArray(VARS) && VARS.length > 0, `实际 ${VARS && VARS.length}`);
check('变量 key 不重复', new Set(VARS.map((v) => v.key)).size === VARS.length);
check('每个变量都有中文标签和示例值', VARS.every((v) => v.label && v.sample != null),
  VARS.filter((v) => !v.label || v.sample == null).map((v) => v.key).join(','));

const helpers = { weaponLabel: (w) => (w && w.label) || '' };
const broken = [];
for (const v of VARS) {
  if (typeof v.get !== 'function') { broken.push(v.key + '(没有 get)'); continue; }
  try {
    const val = v.get(last, helpers);
    if (val === undefined) broken.push(v.key + '(返回 undefined)');
  } catch (e) {
    broken.push(v.key + '(' + e.message + ')');
  }
}
check('所有变量都能从快照取值', broken.length === 0, broken.join(', '));

const byKey = Object.fromEntries(VARS.map((v) => [v.key, v]));
check('{health} 直接映射到血量', byKey.health.get(last, helpers) === last.health);
check('{equip} 在无甲时显示「无甲」', byKey.equip.get({ armor: 0, helmet: false }, helpers) === '无甲');
check('{equip} 在有甲有盔时显示「甲+盔」', byKey.equip.get({ armor: 100, helmet: true }, helpers) === '甲+盔');
check('{weapon} 走自定义名（用了就优先）',
  byKey.weapon.get({ weapon: { name: 'weapon_ak47', label: 'AK-47' } },
    { weaponLabel: () => '阿卡47' }) === '阿卡47');
check('{money} 带千分位', byKey.money.get({ money: 4350 }, helpers) === '4,350');
check('{time} 取计时器文本', byKey.time.get({ timer: { text: '1 : 37' } }, helpers) === '1 : 37');
check('{kd} 算 K/D 比', byKey.kd.get({ matchKills: 14, matchDeaths: 7 }, helpers) === '2.00',
  byKey.kd.get({ matchKills: 14, matchDeaths: 7 }, helpers));
check('{kd} 0 死亡时不除以零', byKey.kd.get({ matchKills: 14, matchDeaths: 0 }, helpers) === '14',
  byKey.kd.get({ matchKills: 14, matchDeaths: 0 }, helpers));
check('{kdr} 分开写', byKey.kdr.get({ matchKills: 14, matchDeaths: 9 }, helpers) === '14 / 9');
check('{team_alive} 拿不到数据时给空串（不是 0）',
  byKey.team_alive.get({ teamAlive: null }, helpers) === '');
check('{spectating} 在观战时显示「是」', byKey.spectating.get({ spectating: true }, helpers) === '是');

console.log('\n[5g] 模块的旋转 / 辉光 / 不透明度字段');
const DEF = require('../src/config.js').DEFAULTS;
const NEED = ['rotate', 'opacity', 'glow', 'glowColor'];
const missField = [];
for (const [k, m] of Object.entries(DEF.modules)) {
  for (const f of NEED) if (m[f] === undefined) missField.push(`${k}.${f}`);
}
check('每个模块都有 rotate / opacity / glow / glowColor', missField.length === 0, missField.join(', '));
check('默认全关（rotate=0 / glow=0 / opacity=1）',
  Object.values(DEF.modules).every((m) => m.rotate === 0 && m.glow === 0 && m.opacity === 1));

console.log('\n[5h] 队友 / 对手名单（allplayers）');
const hubR = new GsiHub(cfg);
let r = null;
hubR.onSnapshot((s) => (r = s));

// 存活时游戏不下发 allplayers，这里必须诚实地说「没有数据」——
// 编一个假人数出来是最不能接受的做法（等于骗用户）。
hubR._ingest(JSON.stringify({ ...buildPayload(20), allplayers: undefined }), '');
check('存活时 rosterReady = false', r.rosterReady === false, `实际 ${r.rosterReady}`);
check('存活时名单为空数组', Array.isArray(r.roster) && r.roster.length === 0);
check('存活时队伍存活数 = null（不编数字）', r.teamAlive === null && r.enemyAlive === null);
check('存活时 C4 携带者 = 空', r.bombCarrier === '');

hubR._ingest(JSON.stringify(buildPayload(20)), '');
check('有数据时 rosterReady = true', r.rosterReady === true);
check('名单 10 人（双方各 5）', r.roster.length === 10, `实际 ${r.roster.length}`);
check('自己只被认出来一次', r.roster.filter((p) => p.isSelf).length === 1,
  `实际 ${r.roster.filter((p) => p.isSelf).length}`);
const me = r.roster.find((p) => p.isSelf) || {};
check('自己那行有名字 / 武器 / 战绩', !!me.name && !!me.weapon && Number.isFinite(me.kills));
check('每个成员都带阵营', r.roster.every((p) => p.team === 'CT' || p.team === 'T'));
check('C4 携带者被识别出来', r.bombCarrier === 'Falcon', `实际 ${r.bombCarrier}`);
check('队内存活数 = 5', r.teamAlive === 5, `实际 ${r.teamAlive}`);
check('敌方存活数 = 5', r.enemyAlive === 5, `实际 ${r.enemyAlive}`);

// 推进到有人阵亡的时间点，检查标记与统计是否自洽
hubR._ingest(JSON.stringify(buildPayload(90)), '');
const deadRows = r.roster.filter((p) => !p.alive);
check('阵亡者被标记 alive = false', deadRows.length > 0, `实际 ${deadRows.length}`);
check('阵亡者血量为 0', deadRows.every((p) => p.health === 0));
check('存活统计与名单自洽',
  r.teamAlive === r.roster.filter((p) => p.team === 'CT' && p.alive).length,
  `统计 ${r.teamAlive}`);

// ⚠️ 回归：CS2 的 payload 是「部分下发」的 —— allplayers 常常只在名单变化时出现一次，
// 之后几十包都不带。若把「这一包没带」当成「名单没了」，观战面板会一闪即没
// （实机表现正是「死亡后观战面板根本不显示」）。缺失必须理解为「未变化 → 沿用」。
const hubR3 = new GsiHub(cfg);
let r3 = null;
hubR3.onSnapshot((s) => (r3 = s));

hubR3._ingest(JSON.stringify(buildPayload(20)), '');
check('观战首包：名单就位 10 人', r3.rosterReady === true && r3.roster.length === 10,
  `ready=${r3.rosterReady} n=${r3.roster.length}`);

// 死亡 / 观战中，这一包没带 allplayers → 必须沿用上次名单
const pDead = buildPayload(20);
pDead.player = { ...pDead.player, activity: 'spectating', state: { ...pDead.player.state, health: 0 } };
delete pDead.allplayers;
hubR3._ingest(JSON.stringify(pDead), '');
check('观战中缺 allplayers → 沿用上次名单（不闪没）',
  r3.rosterReady === true && r3.roster.length === 10,
  `ready=${r3.rosterReady} n=${r3.roster.length}`);

// 复活（满血 + playing）后缺 allplayers → 必须立刻清空，绝不显示陈旧名单
const pAlive = buildPayload(20);      // 血 ~94、activity = playing
delete pAlive.allplayers;
hubR3._ingest(JSON.stringify(pAlive), '');
check('复活后缺 allplayers → 名单清空（不显示陈旧数据）',
  r3.rosterReady === false && r3.roster.length === 0,
  `ready=${r3.rosterReady} n=${r3.roster.length}`);

// 显式给空 {} → 也按「名单清空」处理（sparse collection 语义）
hubR3._ingest(JSON.stringify({ ...buildPayload(20), allplayers: {} }), '');
check('allplayers = {} → 名单清空', r3.rosterReady === false, `实际 ${r3.rosterReady}`);

console.log('\n[5k] 存活人数用「死亡数加减法」计算');
const hubR2 = new GsiHub(cfg);
let r2 = null;
hubR2.onSnapshot((s) => (r2 = s));

// 第一次看到 allplayers：以当前死亡数为基线，全场满员 → 存活 5/5
hubR2._ingest(JSON.stringify(buildPayload(20)), '');
check('首见时按基线建表：队内存活 = 5', r2.teamAlive === 5, `实际 ${r2.teamAlive}`);
check('敌方存活 = 5', r2.enemyAlive === 5, `实际 ${r2.enemyAlive}`);
check('全场存活 = 10', r2.totalAlive === 10, `实际 ${r2.totalAlive}`);

// 推进到有人阵亡：CT 剩 3（2 人阵亡）、T 剩 4（1 人阵亡）
hubR2._ingest(JSON.stringify(buildPayload(90)), '');
check('CT 阵亡 2 人 → 队内存活 = 3', r2.teamAlive === 3, `实际 ${r2.teamAlive}`);
check('T 阵亡 1 人 → 敌方存活 = 4', r2.enemyAlive === 4, `实际 ${r2.enemyAlive}`);
check('全场存活 = 7', r2.totalAlive === 7, `实际 ${r2.totalAlive}`);
const deadRows2 = r2.roster.filter((p) => p.deadThisRound);
check('deadThisRound 正确标出 3 名阵亡者', deadRows2.length === 3, `实际 ${deadRows2.length}`);
check('阵亡者与血量 = 0 一致', deadRows2.every((p) => p.health === 0));
check('存活统计 = 名单人数 − 阵亡人数',
  r2.totalAlive === r2.roster.length - deadRows2.length,
  `统计 ${r2.totalAlive} / 名单 ${r2.roster.length} 阵亡 ${deadRows2.length}`);

// 进入新回合的冻结时间：死亡基线清零重算，回到满员
hubR2._ingest(JSON.stringify(buildPayload(5)), '');
check('新回合冻结后基线重置：队内存活 = 5', r2.teamAlive === 5, `实际 ${r2.teamAlive}`);
check('新回合冻结后敌方存活 = 5', r2.enemyAlive === 5, `实际 ${r2.enemyAlive}`);
check('新回合后 deadThisRound 全部清零', r2.roster.every((p) => p.deadThisRound === false));

console.log('\n[5i] 击杀 / 死亡事件检测');
const hubE = new GsiHub(cfg);
let e = null;
hubE.onSnapshot((s) => (e = s));

hubE._ingest(JSON.stringify(buildPayload(0)), '');
check('首包不产生事件（不会把已有的 14 杀当成刚发生的）', e.events.length === 0, `实际 ${e.events.length}`);

hubE._ingest(JSON.stringify(buildPayload(27)), '');
const kinds = e.events.map((x) => x.kind);
check('击杀数 14→15 触发击杀事件', kinds.includes('kill'), kinds.join(','));
check('击杀事件 value = 1', e.events.find((x) => x.kind === 'kill')?.value === 1);
check('事件 id 递增', e.events.every((x, i) => i === 0 || x.id > e.events[i - 1].id));

const evCount = e.events.length;
hubE._ingest(JSON.stringify(buildPayload(27)), '');
check('同一份数据重复推送不产生新事件（refresh 会重复推快照）',
  e.events.length === evCount, `${e.events.length} vs ${evCount}`);

hubE._ingest(JSON.stringify(buildPayload(48)), '');
check('死亡数 9→10 触发阵亡事件', e.events.some((x) => x.kind === 'death'),
  e.events.map((x) => x.kind).join(','));
check('本回合击杀 1→2 触发 2 连杀', e.events.some((x) => x.kind === 'multi' && x.value === 2),
  JSON.stringify(e.events.filter((x) => x.kind === 'multi')));

hubE._ingest(JSON.stringify(buildPayload(70)), '');
check('本回合击杀 2→3 触发 3 连杀', e.events.some((x) => x.kind === 'multi' && x.value === 3),
  JSON.stringify(e.events.filter((x) => x.kind === 'multi')));

// 新回合 round_kills 归零：这是「变小」，绝不能误报成连杀
const multiBefore = e.events.filter((x) => x.kind === 'multi').length;
hubE._ingest(JSON.stringify(buildPayload(152)), '');
check('新回合 round_kills 归零不误报连杀',
  e.events.filter((x) => x.kind === 'multi').length === multiBefore,
  `实际 ${e.events.filter((x) => x.kind === 'multi').length}`);

check('事件队列有上限（不会无限涨）', hubE.events.length <= 24, `实际 ${hubE.events.length}`);

console.log('\n[5j] 观战时的官方倒计时');
const hubT = new GsiHub(cfg);
let t2 = null;
hubT.onSnapshot((s) => (t2 = s));
hubT._ingest(JSON.stringify({ ...buildPayload(20), phase_countdowns: { phase: 'live', phase_ends_in: '88.4' } }), '');
check('有官方倒计时时采用它（而不是本地推算的 115）',
  Math.abs(t2.timer.remain - 88.4) < 0.01, `实际 ${t2.timer.remain}`);
check('标记为 official', t2.timer.official === true);
// 下包阶段仍用本地 40 秒：各家对 planted 后 phase_ends_in 的口径不一致
hubT._ingest(JSON.stringify({ ...buildPayload(70), phase_countdowns: { phase: 'live', phase_ends_in: '12.0' } }), '');
check('下包阶段不采用官方值，仍算 40 秒',
  Math.abs(t2.timer.remain - 40) < 0.5, `实际 ${t2.timer.remain}`);
check('下包阶段 official = false', t2.timer.official === false);

console.log('\n[7] 购买时间判定（驱动购买轮盘自动弹出）');
const hubB = new GsiHub(cfg);
let b = null;
hubB.onSnapshot((s) => (b = s));
hubB._ingest(JSON.stringify(buildPayload(5)), '');   // 冻结时间
check('冻结时间 → isBuyTime = true', b.isBuyTime === true, `实际 ${b.isBuyTime}`);
hubB._ingest(JSON.stringify(buildPayload(20)), '');  // 回合进行
check('回合进行 → isBuyTime = false', b.isBuyTime === false, `实际 ${b.isBuyTime}`);
hubB._ingest(JSON.stringify(buildPayload(120)), ''); // 回合结束（local=120 → over）
check('回合结束 → isBuyTime = false', b.isBuyTime === false, `实际 ${b.isBuyTime}`);
// 热身阶段：map.phase = warmup 也算购买时间
hubB._ingest(JSON.stringify({ ...buildPayload(20), map: { ...buildPayload(20).map, phase: 'warmup' } }), '');
check('热身阶段（warmup）→ isBuyTime = true', b.isBuyTime === true, `实际 ${b.isBuyTime}`);
// 有官方倒计时且 freeze 剩余 > 0 → true
hubB._ingest(JSON.stringify({ ...buildPayload(5), phase_countdowns: { phase: 'freezetime', phase_ends_in: '12.0' } }), '');
check('freezetime + 倒计时>0 → isBuyTime = true', b.isBuyTime === true, `实际 ${b.isBuyTime}`);
// freeze 倒计时归零的异常防护 → 不再算购买时间
hubB._ingest(JSON.stringify({ ...buildPayload(5), phase_countdowns: { phase: 'freezetime', phase_ends_in: '0' } }), '');
check('freezetime + 倒计时=0 → isBuyTime = false', b.isBuyTime === false, `实际 ${b.isBuyTime}`);
// round 组件「变化时才下发」：快照缺 round 时沿用上一次的 phase（实机踩坑：
// 冻结期间绝大多数快照不带 round，不沿用会让轮盘开了又关、关了又开）
const hubB2 = new GsiHub(cfg);
let b2 = null;
hubB2.onSnapshot((s) => (b2 = s));
hubB2._ingest(JSON.stringify(buildPayload(5)), '');   // 冻结时间
const { round: _omit, ...noRound } = buildPayload(5); // 下一包：round 缺失（未变化）
hubB2._ingest(JSON.stringify(noRound), '');
check('快照缺 round → 沿用 freezetime（isBuyTime = true）', b2.isBuyTime === true, `实际 ${b2.isBuyTime}`);
hubB2._ingest(JSON.stringify(buildPayload(20)), '');  // 真正进入 live
hubB2._ingest(JSON.stringify({ ...buildPayload(20), round: undefined }), '');
check('快照缺 round → 沿用 live（isBuyTime = false）', b2.isBuyTime === false, `实际 ${b2.isBuyTime}`);

console.log('\n[6] 数据过期后自动隐藏');
cfg.staleTimeoutMs = 0;
hub.refresh();
check('visible = false', last.visible === false);

console.log('\n[9] 分辨率适配（designWidth/Height + fit）');
{
  const { computeFit } = require('../src/fit.js');
  const B = { width: 1920, height: 1080 };
  const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

  // 默认 / 缺省：fit 缺失必须回落 contain，绝不能变成 undefined 参与运算
  const dflt = computeFit({ designWidth: 1920, designHeight: 1080, scale: 1 }, B);
  check('缺 fit → 回落 contain（scale=1）', near(dflt.scale, 1), `实际 ${dflt.scale}`);
  check('缺 fit → 无横向拉伸', near(dflt.stretchX, 1));
  check('缺 fit → 无纵向拉伸', near(dflt.stretchY, 1));

  // 同分辨率时三种模式等价（不拉伸、不裁切）
  for (const fit of ['contain', 'stretch', 'fill']) {
    const r = computeFit({ designWidth: 1920, designHeight: 1080, fit, scale: 1 }, B);
    check(`1920×1080 + ${fit} → scale=1`, near(r.scale, 1), `实际 ${r.scale}`);
  }

  // contain：等比取小 —— 4:3 设计放到 16:9 屏，按高度贴合，完整可见
  const ct = computeFit({ designWidth: 1280, designHeight: 960, fit: 'contain', scale: 1 }, B);
  check('1280×960 contain → 按高度 1.125', near(ct.scale, 1.125), `实际 ${ct.scale}`);
  check('1280×960 contain → 无横向拉伸', near(ct.stretchX, 1));

  // stretch：等比取大 —— 按宽度贴合，会超出设计高度（Cover）
  const st = computeFit({ designWidth: 1280, designHeight: 960, fit: 'stretch', scale: 1 }, B);
  check('1280×960 stretch → 按宽度 1.5', near(st.scale, 1.5), `实际 ${st.scale}`);

  // fill：虚拟画布 = 设计分辨率，再 scale(sx, sy) 整体拉满全屏（4:3 怀旧观感）
  const fl = computeFit({ designWidth: 1280, designHeight: 960, fit: 'fill', scale: 1 }, B);
  check('1280×960 fill → 元素尺寸倍率 = 用户缩放 1', near(fl.scale, 1), `实际 ${fl.scale}`);
  check('1280×960 fill → 横向拉伸 1.5', near(fl.stretchX, 1.5), `实际 ${fl.stretchX}`);
  check('1280×960 fill → 纵向拉伸 1.125', near(fl.stretchY, 1.125), `实际 ${fl.stretchY}`);
  check('fill → 虚拟画布 = 设计分辨率 1280×960',
    near(fl.virtW, 1280) && near(fl.virtH, 960), `${fl.virtW}×${fl.virtH}`);
  check('fill → 拉伸后精确占满全屏 1920×1080',
    near(fl.virtW * fl.stretchX, B.width) && near(fl.virtH * fl.stretchY, B.height),
    `${fl.virtW * fl.stretchX}×${fl.virtH * fl.stretchY}`);

  // 整体缩放只影响元素尺寸（--scale），不改变 fill 的画布几何，也不破坏铺满
  const z = computeFit({ designWidth: 1280, designHeight: 960, fit: 'fill', scale: 1.2 }, B);
  check('fill + scale1.2 → 拉伸几何不变',
    near(z.stretchX, 1.5) && near(z.stretchY, 1.125), `${z.stretchX}/${z.stretchY}`);
  check('fill + scale1.2 → --scale = 1.2（只作用于元素尺寸）', near(z.scale, 1.2), `实际 ${z.scale}`);
  check('fill + scale1.2 → 仍然精确铺满',
    near(z.virtW * z.stretchX, B.width) && near(z.virtH * z.stretchY, B.height));

  // 安全区要落在虚拟画布内（fill 用设计像素坐标系，否则左右会被推出画面）
  const fz = computeFit({ designWidth: 1280, designHeight: 960, fit: 'fill', safezone: { x: 0.9, y: 0.9 }, scale: 1 }, B);
  check('fill + safezone 0.9 → insetX 在画布内', fz.insetX > 0 && fz.insetX < fz.virtW, `insetX=${fz.insetX}`);
  check('fill + safezone 0.9 → insetY 在画布内', fz.insetY > 0 && fz.insetY < fz.virtH, `insetY=${fz.insetY}`);

  // ⚠️ 回归：scale≠1 时画布几何与「铺满」都不能被缩放污染
  // （曾因 scale 混进画布几何，导致 scale=0.85 时画布缩水、纵向铺不满）
  for (const sc of [0.85, 1, 1.5]) {
    const r = computeFit({ designWidth: 1280, designHeight: 960, fit: 'fill', scale: sc }, B);
    check(`fill + scale=${sc} → 画布恒为 1280×960`,
      near(r.virtW, 1280) && near(r.virtH, 960), `${r.virtW}×${r.virtH}`);
    check(`fill + scale=${sc} → 精确铺满 1920×1080`,
      near(r.virtW * r.stretchX, B.width) && near(r.virtH * r.stretchY, B.height),
      `${r.virtW * r.stretchX}×${r.virtH * r.stretchY}`);
  }

  // fill 在超宽屏上也要精确铺满（拉伸倍数随屏幕尺寸变化）
  const uw = computeFit({ designWidth: 1280, designHeight: 960, fit: 'fill', scale: 1 }, { width: 2560, height: 1440 });
  check('fill @2560×1440 → 拉伸 2.0 / 1.5 且铺满',
    near(uw.stretchX, 2) && near(uw.stretchY, 1.5)
    && near(uw.virtW * uw.stretchX, 2560) && near(uw.virtH * uw.stretchY, 1440),
    `stretchX=${uw.stretchX} stretchY=${uw.stretchY}`);
}

console.log('\n[8] 购买轮盘：cfg 生成（两级方案）');
const {
  CATEGORIES, CATALOG, CLEAR_NAME, catalogFor, cfgName, normKey, normalizeRoot,
  buildCfg, buildClearCfg, buildAll,
} = require('../src/buycfg.js');

// 目录完整性：每个分类在 CT/T 都有武器，所有默认勾选 id 都真实存在于目录
check('分类共 5 个（装备/手枪/冲锋枪/主武器/道具）', CATEGORIES.length === 5);
for (const t of ['CT', 'T']) {
  for (const c of CATEGORIES) {
    check(`${t}·${c.id} 目录非空`, catalogFor(t, c.id).length > 0);
  }
}
check('所有武器都带 buy 指令', CATALOG.every((w) => /^buy [a-z0-9_]+$/.test(w.buy)));

// cfgName 与键名归一化
check('cfgName: oph_bw_ct_pistol.cfg', cfgName('CT', 'pistol') === 'oph_bw_ct_pistol.cfg');
check('cfgName: oph_bw_t_rifle.cfg', cfgName('T', 'rifle') === 'oph_bw_t_rifle.cfg');
check('normKey: F1 → F1, f1 → F1', normKey('F1') === 'F1' && normKey('f1') === 'F1');
check('normKey: KP_1 → kp_1', normKey('KP_1') === 'kp_1');

// normalizeRoot：手填路径无论停在哪一层都归一到 CSGO 根（不依赖文件系统、纯字符串的用例）
{
  const root = 'C:\\Games\\Counter-Strike Global Offensive';
  check('normalizeRoot: cfg 目录 → 根',
    normalizeRoot(root + '\\game\\csgo\\cfg') === root);
  check('normalizeRoot: csgo 层 → 根',
    normalizeRoot(root + '\\game\\csgo') === root);
  check('normalizeRoot: game 层 → 根',
    normalizeRoot(root + '\\game') === root);
  check('normalizeRoot: 已是根 → 原样',
    normalizeRoot(root) === root);
  check('normalizeRoot: 路径中途含 CSGO 名 → 截到根',
    normalizeRoot(root + '\\screenshots') === root);
  check('normalizeRoot: 空 → 空', normalizeRoot('  ') === '');
}

// buildCfg：unbind 在前、bind 按顺序对应；阵营不符 / 不存在的 id 会被过滤
const ctPistol = buildCfg('CT', 'pistol',
  ['hkp2000', 'usp_silencer', 'p250', 'fiveseven', 'deagle'],
  ['F1', 'F2', 'F3', 'F4', 'F5']);
check('先解绑 5 个购买键', (ctPistol.match(/^unbind "F\d"$/gm) || []).length === 5);
check('再绑定 5 条 buy 指令', (ctPistol.match(/^bind "F\d" "buy [a-z0-9_]+"$/gm) || []).length === 5);
check('keys[0] → 第 1 件武器', ctPistol.includes('bind "F1" "buy hkp2000"'));
check('keys[4] → 第 5 件武器', ctPistol.includes('bind "F5" "buy deagle"'));
check('CT 的 cfg 不会出现 T 方武器', !ctPistol.includes('buy glock') && !ctPistol.includes('buy tec9'));

const tGearJunk = buildCfg('T', 'gear', ['vest', 'vesthelm', 'defuser', 'taser', 'not_a_gun', 'ak47'], ['F1', 'F2', 'F3', 'F4', 'F5', 'F6']);
check('T·装备自动过滤拆弹钳（CT 专属）', !tGearJunk.includes('buy defuser'));
check('T·装备自动过滤不存在的 id', !tGearJunk.includes('not_a_gun'));
check('T·装备自动过滤其他分类（ak47）', !tGearJunk.includes('buy ak47'));
check('T·装备最多 5 条 bind', (tGearJunk.match(/^bind /gm) || []).length === 3); // vest/vesthelm/taser

const fewerKeys = buildCfg('CT', 'smg', ['mp9', 'mp7', 'mp5sd', 'ump45', 'p90'], ['F1', '', 'F3']);
check('键位留空则跳过对应 bind', (fewerKeys.match(/^bind /gm) || []).length === 2);

// buildClearCfg / buildAll
const clear = buildClearCfg(['F1', 'F2', 'F3', 'F4', 'F5']);
check('清除 cfg 只 unbind 不 bind（按行首判断）',
  (clear.match(/^unbind "F\d"$/gm) || []).length === 5 && !/^bind /m.test(clear));

// config 默认值：每阵营每分类 ≤5 且都合法
const defBw = cfg.buywheel;
for (const t of ['CT', 'T']) {
  for (const c of CATEGORIES) {
    const ids = defBw.teams[t][c.id];
    check(`默认值 ${t}·${c.id} ≤5 件`, Array.isArray(ids) && ids.length <= 5);
    check(`默认值 ${t}·${c.id} 全部合法`, ids.every((id) => {
      const w = CATALOG.find((x) => x.id === id);
      return w && w.cat === c.id && (w.teams === 'both' || w.teams === t);
    }));
  }
}
check('默认购买键 5 个', Array.isArray(defBw.keys) && defBw.keys.length === 5);
const allFiles = buildAll(defBw);
check('共生成 11 份 cfg（10 分类 + 1 解绑）', allFiles.length === 11 && allFiles.some((f) => f.name === CLEAR_NAME));

console.log('\n[10] 进阶外观（advstyle + config.adv）');
const ADV = require('../src/advstyle.js');
const { merge: mergeCfg, DEFAULTS: ADVDEF } = require('../src/config.js');

// 默认值：总开关关、5 类齐全
check('adv.enabled 默认关闭', ADVDEF.adv.enabled === false);
for (const k of ADV.KINDS) check(`adv.kinds.${k} 存在`, !!ADVDEF.adv.kinds[k]);

// resolveKind：全局默认 + 每类覆盖
const rk = ADV.resolveKind(ADVDEF.adv, 'kill');
check('kill 继承全局 iconSide = left', rk.iconSide === 'left');
check('kill 图标 = 🎯', rk.icon === '🎯');
check('kill 继承 inScale = 0.85', Math.abs(rk.inScale - 0.85) < 1e-9);
check('death 覆盖 shakeOn = true', ADV.resolveKind(ADVDEF.adv, 'death').shakeOn === true);
check('multi 覆盖 pulseOn = true', ADV.resolveKind(ADVDEF.adv, 'multi').pulseOn === true);
check('assist 默认不用进阶外观', ADV.resolveKind(ADVDEF.adv, 'assist').enabled === false);
check('kill 默认使用进阶外观', ADV.resolveKind(ADVDEF.adv, 'kill').enabled === true);

// 覆盖优先级：kinds 里的显式 false 必须压过全局 true（不能用 || 合并）
{
  const adv = mergeCfg({
    adv: { effects: { shakeOn: true }, kinds: { kill: { shakeOn: false } } },
  }).adv;
  check('每类显式 false 覆盖全局 true', ADV.resolveKind(adv, 'kill').shakeOn === false);
  check('未覆盖的类跟随全局 true', ADV.resolveKind(adv, 'multi').shakeOn === true);
}

// curvePath：角度 0 退化成直线；张角越大越宽
check('curvePath arc=0 → 直线', ADV.curvePath({ radius: 160, arc: 0 }).straight === true);
{
  const p60 = ADV.curvePath({ radius: 160, arc: -60 });
  const p120 = ADV.curvePath({ radius: 160, arc: -120 });
  check('curvePath 半径/张角 → 正的包围盒', p60.w > 0 && p60.h > 0 && p120.w > 0 && p120.h > 0);
  check('curvePath 张角越大越宽', p120.w > p60.w, `${p60.w.toFixed(1)} → ${p120.w.toFixed(1)}`);
  check('curvePath 正/负张角只影响朝向、宽度对称',
    Math.abs(ADV.curvePath({ radius: 160, arc: 120 }).w - p120.w) < 1e-6);
}

// buildCurveSVG：结构正确、正文被转义
{
  const svg = ADV.buildCurveSVG('A<B & "C"', { curveRadius: 160, curveArc: -120, fontSize: 30, weight: 700, letterSpacing: 0.06, color: '#F0B23A' }, 'evpX');
  check('buildCurveSVG 含 textPath', svg.includes('<textPath') && svg.includes('href="#evpX"'));
  check('buildCurveSVG 转义 < & "', svg.includes('A&lt;B &amp; &quot;C&quot;') && !svg.includes('A<B'));
  check('buildCurveSVG 用 --scale 跟随 HUD 缩放', svg.includes('var(--scale'));
}

check('easingOf backOut → cubic-bezier', ADV.easingOf('backOut').startsWith('cubic-bezier'));
check('easingOf 未知 → 兜底 ease-out', ADV.easingOf('nope') === 'ease-out');

// config.merge 健壮性：坏掉的 adv 不能把程序搞崩
check('merge({adv:null}) → 还原成完整默认', !!mergeCfg({ adv: null }).adv.kinds.kill);
check('merge({adv:{kinds:null}}) → kinds 补回 5 类',
  ADVDEF.adv && ['kill', 'multi', 'death', 'assist', 'mvp']
    .every((k) => !!mergeCfg({ adv: { kinds: null } }).adv.kinds[k]));

console.log('\n[11] 每元素进阶 + 图元引擎 + 自定义图标');

// 元素注册表：模块与播报都在
check('ELEMENTS 含 6 个 mod.*', ADV.ELEMENTS.filter((e) => e.id.startsWith('mod.')).length === 6);
check('ELEMENTS 含 5 个 ev.*', ADV.ELEMENTS.filter((e) => e.id.startsWith('ev.')).length === 5);

// resolveStyle：每元素覆盖，且向后兼容 resolveKind（读 adv.kinds）
{
  const adv = mergeCfg({
    adv: {
      style: { weight: 700, italic: false },
      elements: { 'mod.money': { weight: 300, italic: true, outlineOn: false } },
    },
  }).adv;
  const r = ADV.resolveStyle(adv, 'mod.money');
  check('每元素覆盖 weight 生效', r.weight === 300);
  check('每元素覆盖 italic=true 生效', r.italic === true);
  check('每元素显式 false 压过全局', r.outlineOn === false);
  check('同 adv 下未覆盖元素跟随全局', ADV.resolveStyle(adv, 'mod.vitals').weight === 700);
}
check('resolveKind 与 resolveStyle(ev.*) 等价',
  ADV.resolveKind(ADVDEF.adv, 'kill').icon === ADV.resolveStyle(ADVDEF.adv, 'ev.kill').icon);
{
  const adv = mergeCfg({ adv: { elements: { 'ev.kill': { iconRef: 'ic1' } } } }).adv;
  const r = ADV.resolveStyle(adv, 'ev.kill');
  check('每元素可放 iconRef', r.iconRef === 'ic1');
  check('elements 未写 on 时默认启用', r.enabled === true);
}

// 颜色 / dataURL / path 白名单
check('sanitizeColor 放行命名色', ADV.sanitizeColor('steelblue') === 'steelblue');
check('sanitizeColor 放行 #rrggbb', ADV.sanitizeColor('#E8C46A') === '#E8C46A');
check('sanitizeColor 拒绝 url(javascript:)', ADV.sanitizeColor('url(javascript:alert(1))') === '');
check('safeDataURL 放行 png', ADV.safeDataURL('data:image/png;base64,AAA').startsWith('data:image/png'));
check('safeDataURL 拒绝 text/html', ADV.safeDataURL('data:text/html;base64,AAA') === '');
check('safePathD 拒绝非路径文本', ADV.sanitizePath('foo<script>') === '');
check('safePathD 放行 M/L', ADV.sanitizePath('M0 0 L5 5') === 'M0 0 L5 5');

// parseSVG：只留白名单图元，脚本 / 事件 / 外链全部丢弃
{
  const raw = '<svg viewBox="0 0 64 64"><script>alert(1)</script>'
    + '<rect x="4" y="4" width="56" height="56" rx="8" fill="none" stroke="#E8C46A" stroke-width="3" onclick="x()"/>'
    + '<circle cx="32" cy="32" r="10" fill="#fff"/>'
    + '<text x="8" y="58" font-size="16" fill="#fff">Hi &amp; {money}</text>'
    + '<path d="M0 0 L5 5"/></svg>';
  const p = ADV.parseSVG(raw);
  check('parseSVG 读出 viewBox 尺寸', p.w === 64 && p.h === 64);
  check('parseSVG 图元类型齐全', p.items.map((i) => i.type).join(',') === 'text,rect,ellipse,path');
  const out = ADV.shapeToSVG({ w: p.w, h: p.h, items: p.items },
    { resolveText: (t) => String(t).replace('{money}', '$4300') });
  check('重建结果不含 script/onclick', !/script|onclick/i.test(out));
  check('重建结果保留 textPath? 否 —— 文字按图元重建', out.includes('>Hi &amp; $4300</text>'));
  check('重建结果带 viewBox', out.includes('viewBox="0 0 64 64"'));
}

// shapeToSVG：文本被转义，数字被格式化
{
  const s = ADV.shapeToSVG({ w: 100, h: 40, items: [
    { type: 'text', x: 4, y: 20, text: '<b>&"', fontSize: 14, fill: '#fff' },
    { type: 'line', x1: 0, y1: 0, x2: 100, y2: 40, stroke: '#fff', strokeWidth: 2 },
  ] });
  check('shapeToSVG 转义文本', s.includes('&lt;b&gt;&amp;&quot;'));
}

// config.merge：icons / shapes 归一化，脏数据不崩
{
  const c = mergeCfg({
    icons: [{ id: 'a', kind: 'text', text: 'x' }, { id: '', kind: 'draw' }, { nope: 1 }],
    shapes: [{ name: 'x' }, 'bad', null],
  });
  check('merge 过滤掉无效图标', c.icons.length === 1 && c.icons[0].id === 'a');
  check('merge 补全形状必需字段', c.shapes.length === 1 && c.shapes[0].anchor === 'tl'
    && Array.isArray(c.shapes[0].items));
  check('merge adv.elements 默认是空对象',
    mergeCfg({}).adv.elements && typeof mergeCfg({}).adv.elements === 'object');
}

console.log('\n[12] 实时预览（设置里开「模拟数据」窗口）');

// ---- 模拟时间线的四个「跳到」预设必须真的落在预期阶段 ----
// 预览工具条上的按钮写死了 5 / 40 / 70 / 125，改了 mock.js 这里就会红，
// 免得按钮名字和实际画面对不上。
{
  const at = (t) => buildPayload(t);
  check('t=5 → 冻结时间', at(5).round.phase === 'freezetime');
  check('t=40 → 回合进行', at(40).round.phase === 'live' && !at(40).round.bomb);
  check('t=70 → 已下包', at(70).round.bomb === 'planted');
  check('t=125 → 回合结算', at(125).round.phase === 'over');
  check('t=40 之后有主武器（能看到武器栏变化）', !!at(40).player.weapons.weapon_1);
}

// ---- 静态检查：预览必须「只影响预览」，真实覆盖层一行都不能变 ----
{
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(import.meta.dirname, '..');
  const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

  const hudCss = read('src/renderer/hud.css');
  const hudJs = read('src/renderer/hud.js');
  const html = read('src/renderer/index.html');
  const preload = read('src/preload.js');
  const main = read('src/main.js');

  // 关键安全属性：工具条默认 display:none，只有 body.preview-mode 才显示
  check('工具条默认隐藏（.preview-bar{display:none}）',
    /\.preview-bar\s*\{\s*display:\s*none/.test(hudCss));
  check('工具条只在 body.preview-mode 下出现',
    hudCss.includes('body.preview-mode .preview-bar'));

  // 每一类「试播报」按钮都能在渲染层找到对应文案
  for (const k of ['kill', 'multi', 'death', 'assist', 'mvp']) {
    check(`试播报按钮 data-pv-ev=${k} 存在`, html.includes(`data-pv-ev="${k}"`));
  }
  check('渲染层有 5 类试播报兜底文案',
    ['kill', 'multi', 'death', 'assist', 'mvp'].every((k) => hudJs.includes(`${k}:`)));

  check('渲染层用 BRIDGE 兜底（缺 preload 也不整脚本崩）',
    hudJs.includes('const BRIDGE = window.overplayhud ||'));
  check('渲染层按 ?preview=1 判定预览模式',
    hudJs.includes("get('preview') === '1'"));

  check('preload 暴露 previewCmd', preload.includes("'preview:cmd'"));
  check('主进程处理 preview:cmd', main.includes("ipcMain.on('preview:cmd'"));
  check('主进程有实时预览窗口', main.includes('function createPreviewWindow'));
  check('主进程独立模拟数据源（不干扰真实 GSI）', main.includes('function startPrevFeed'));
  // ⚠️ 开发开关必须同时在 SHOT_MODE 白名单里，否则会被单实例锁挡掉（踩过的坑）
  check('--shot-preview= 在 SHOT_MODE 白名单内', main.includes("a.startsWith('--shot-preview=')"));
}

console.log('\n[13] 首页 / 配置方案 / 教程 / 图标开关 / 画布修复');
{
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(import.meta.dirname, '..');
  const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

  const setJs = read('src/settings/settings.js');
  const setCss = read('src/settings/settings.css');
  const setPre = read('src/settings/preload.js');
  const main = read('src/main.js');
  const cfgJs = read('src/config.js');

  // ---- 图标可停用（用户报过的 bug：以前根本没法关掉图标）----
  check('全局默认图标开关存在（adv.style.iconOn）', cfgJs.includes('iconOn: true'));
  check('每元素图标选择器有「无图标（停用）」', setJs.includes('无图标（停用）'));
  check('停用图标写的是 iconOn:false', /commit\(offPath,\s*false\)/.test(setJs));
  {
    const adv = mergeCfg({ adv: { elements: { 'ev.kill': { iconOn: false } } } }).adv;
    const r = ADV.resolveStyle(adv, 'ev.kill');
    check('iconOn=false → icon/iconRef 被清空', r.icon === '' && r.iconRef === '' && r.iconOn === false);
  }
  {
    const adv = mergeCfg({ adv: { style: { iconOn: false }, elements: { 'ev.multi': { iconOn: true } } } }).adv;
    check('全局关图标 → 未覆盖元素无图标', ADV.resolveStyle(adv, 'ev.kill').icon === '');
    check('全局关图标时每元素仍可开回来', ADV.resolveStyle(adv, 'ev.multi').icon === '🔥');
  }
  check('自定义元素也能配图标', /const hasIcon = isEv \|\| isCustom/.test(setJs));

  // ---- 画布坐标修复（用户反馈「位置不精准」）----
  check('画布 CSS 不再写死高度', !/\.draw-canvas\s*\{[^}]*height:\s*\d+px/.test(setCss));
  check('画布按 viewBox 比例设置 aspect-ratio', setJs.includes('svg.style.aspectRatio'));
  check('画布有网格辅助', setJs.includes('function gridSVG'));
  check('形状元素锚点用九宫格', setJs.includes('function anchorGrid'));

  // ---- 首页 ----
  check('设置界面有首页分区', /id: 'home'/.test(setJs));
  check('首页有运行状态带', setJs.includes('hs-band'));
  check('首页能安装 GSI 配置', setJs.includes('window.oph.installCfg()'));
  check('首页能开关 HUD（等同托盘项）', setJs.includes('window.oph.toggleHud()'));
  check('主进程提供 settings:status', main.includes("ipcMain.handle('settings:status'"));
  check('主进程每秒推送状态', main.includes('function startStatusPush'));
  check('安装 cfg 只有一份实现（托盘与首页共用）', main.includes('function doInstallCfg'));
  check('主进程提供 toggle-hud / reload-config',
    main.includes("ipcMain.handle('settings:toggle-hud'")
    && main.includes("ipcMain.handle('settings:reload-config'"));
  check('设置窗口渲染报错会转发到终端',
    /attachRendererDiagnostics\(settingsWin\.webContents/.test(main));

  // ---- 配置方案 ----
  check('设置侧有配置方案分区', /id: 'profiles'/.test(setJs));
  check('方案目录在配置目录下', main.includes("const PROFILE_DIR = 'profiles'"));
  check('内置「默认」方案去掉了播报与画图元素',
    /builtinProfileConfig[\s\S]{0,500}events\.enabled = false[\s\S]{0,300}shapes = \[\]/.test(main));
  for (const fn of ['list', 'save-as', 'update', 'apply', 'delete', 'rename']) {
    check(`主进程有 profiles:${fn}`, main.includes(`'profiles:${fn}'`));
  }
  check('preload 暴露 profiles 组', setPre.includes('profiles: {'));

  // ---- 教程 ----
  // 10-13 用户要求下线「教程 / 关于」设置页：文档 TUTORIAL.md 与渲染 / IPC 代码保留，
  // 仅侧栏入口消失 —— 所以这里断言的是「入口没了、代码还在」。
  check('教程设置页已下线（渲染代码保留）',
    !/id: 'tutorial'/.test(setJs) && setJs.includes('function mdToHtml'));
  check('关于设置页已下线（构建代码保留）',
    !/id: 'about'/.test(setJs) && setJs.includes('function buildAboutSection'));
  check('内置极简 Markdown 渲染', setJs.includes('function mdToHtml'));
  check('主进程能读教程文件', main.includes('function readTutorial'));
  check('主进程有 open-tutorial / reveal-tutorial',
    main.includes("ipcMain.handle('settings:open-tutorial'")
    && main.includes("ipcMain.handle('settings:reveal-tutorial'"));
  {
    let ok = false;
    let len = 0;
    try {
      const md = read('TUTORIAL.md');
      len = md.length;
      ok = md.length > 800 && md.includes('# OverplayHUD 使用');
    } catch (e) { ok = false; }
    check('TUTORIAL.md 存在且内容完整', ok, `${len} 字符`);
    check('打包配置包含教程文档', read('package.json').includes('"TUTORIAL.md"'));

    // 图文教程：正文引用的配图必须真的在，而且 docs 得进安装包 ——
    // 少一样，打包后教程页里就是一片裂图，本地开发还看不出来
    const _fs = require('node:fs');
    const _path = require('node:path');
    const _root = _path.join(import.meta.dirname, '..');
    const _imgs = [...read('TUTORIAL.md').matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)]
      .map((m) => m[1]).filter((p) => !/^https?:/i.test(p));
    const _miss = _imgs.filter((p) => {
      try { return _fs.statSync(_path.join(_root, p)).size < 100; } catch (e) { return true; }
    });
    check('教程配图存在', _imgs.length >= 8 && _miss.length === 0,
      `${_imgs.length} 张引用，缺 ${_miss.join(',') || 0} 张`);
    check('打包配置包含 docs 目录', read('package.json').includes('"docs/**/*"'));
  }

  // ---- 武器栏 SVG 态（与文字态并存、各自开关）----
  const hudJs = read('src/renderer/hud.js');
  check('武器栏文字态 section 改名后仍指向 module weaponList',
    /id: 'weaponListText'/.test(setJs) && /module: 'weaponList'/.test(setJs));
  check('设置侧有武器栏 SVG 态 section', /id: 'weaponListSvg'/.test(setJs));
  check('SVG 态有独立构建函数', setJs.includes('function buildWeaponListSvgCard'));
  check('SVG 态开关走 modules.weaponList.svgMode', setJs.includes("path: 'modules.weaponList.svgMode'"));
  check('刀型对照表遍历 knifeFiles', setJs.includes('knifeFiles'));
  check('主进程暴露 equip-icons IPC（HUD 与设置页）',
    main.includes("ipcMain.handle('hud:equip-icons'")
    && main.includes("ipcMain.handle('settings:equip-icons'"));

  // config 默认值
  check('DEFAULTS 含武器栏 svgMode 与 svg 配置',
    cfgJs.includes('svgMode: false') && cfgJs.includes('icons: { 1:'));
  {
    const d = DEF.modules.weaponList;
    check('DEFAULTS.weaponList.svg 字段完整',
      d && d.svgMode === false
      && d.svg && d.svg.glow === 6
      && d.svg.icons && d.svg.icons['1'] === ''
      && d.svg.knives && Object.keys(d.svg.knives).length === 0);
  }
  check('打包配置包含 asstes（图标目录）', read('package.json').includes('"asstes/**/*"'));

  // equip-icons 模块：端到端校验映射 + 真目录加载
  {
    const E = require('../src/equip-icons.js');
    check('equip-icons 导出 26 种刀型文件', E.KNIFE_FILES.length === 26);
    check('weapon_ak47 → ak47.svg', E.weaponToIconName('weapon_ak47') === 'ak47.svg');
    check('weapon_c4 → c4.svg', E.weaponToIconName('weapon_c4') === 'c4.svg');
    check('投掷物 smoke → smokegrenade.svg', E.grenadeIdToIcon('smoke') === 'smokegrenade.svg');
    check('投掷物 flame(燃烧瓶/燃烧弹) → incgrenade.svg', E.grenadeIdToIcon('flame') === 'incgrenade.svg');
    check('isKnife(weapon_knife_butterfly)', E.isKnife('weapon_knife_butterfly') === true);
    check('normalizeSvg 把 fill 强制成 currentColor',
      /fill="currentColor"/.test(E.normalizeSvg('<svg viewBox="0 0 10 10"><path fill="#FFFFFF" d="M0 0z"/></svg>')));
    const dir = path.join(root, 'asstes', 'icons', 'equipment');
    let loaded = { files: {} };
    try { loaded = E.loadEquipIcons(dir); } catch (e) { /* 目录缺失时跳过 */ }
    const n = Object.keys(loaded.files || {}).length;
    check('从 asstes 目录加载到全部武器图标', n >= 90, `${n} 个`);
    check('加载结果含 ak47.svg 且已归一化',
      !!loaded.files && !!loaded.files['ak47.svg'] && loaded.files['ak47.svg'].includes('currentColor'));
    check('图标表含拆弹器 defuser.svg', !!loaded.files && !!loaded.files['defuser.svg']);
  }

  // 5 号槽位：匪徒持 C4，CT 带拆弹器
  const gsiJs = read('src/gsi.js');
  check('武器名表含 weapon_defuser（拆弹器）', read('src/weapon-names.js').includes('weapon_defuser'));
  check('gsi 把 team / defusekit 传给 _slots',
    gsiJs.includes('this._slots(weapons, player.team, !!state.defusekit)'));
  check('gsi 在 CT 带拆弹器时把 5 号槽位合成 weapon_defuser',
    gsiJs.includes("out[4].name = 'weapon_defuser'") && gsiJs.includes("team === 'CT'"));
  check('HUD 渲染层有 renderWeaponBarSvg', hudJs.includes('function renderWeaponBarSvg'));
  check('HUD 按 svgMode 切换 SVG 栏显隐', hudJs.includes('wl.svgMode === true'));
  check('applyModules 写出 SVG 栏位置/辉光变量', hudJs.includes('--m-weaponListSvg-x'));
  check('index.html 含 weaponBarSvg 容器', read('src/renderer/index.html').includes('id="weaponBarSvg"'));

  // ---- 武器栏 SVG 态：编号列对齐 / 1-3 左右镜像 / 每槽位辉光颜色 ----
  const hudCss = read('src/renderer/hud.css');
  check('DEFAULTS 含每槽位辉光颜色 glowColors(1..5)',
    !!DEF.modules.weaponList.svg.glowColors && DEF.modules.weaponList.svg.glowColors['5'] === '');
  check('右侧编号列对齐：槽位等宽(stretch)',
    /\.weapon-bar-svg \{[^}]*align-items: stretch/.test(hudCss));
  check('武器图标右对齐、往左排列',
    /\.weapon-bar-svg \.slot \{[^}]*align-items: flex-end/.test(hudCss));
  check('槽位改为纵向（图标上、名称下）',
    /\.weapon-bar-svg \.slot \{[^}]*flex-direction: column/.test(hudCss));
  check('编号垂直居中在图标那一行（名称在下方也不掉）',
    /\.weapon-bar-svg \.wnum \{[^}]*top: 0[^}]*height: calc\(46px \* var\(--scale\)\)/.test(hudCss));
  check('右侧编号列对齐：编号统一右缘',
    /\.weapon-bar-svg \.wnum \{[^}]*right: calc\(-1 \* var\(--wl-svg-num-gap, 26px\)/.test(hudCss));
  check('1/2/3 号槽位图标左右镜像',
    /\.slot\[data-slot="1"\][\s\S]{0,160}--wl-svg-mirror: -1/.test(hudCss));
  check('镜像与选中放大共用 transform 变量（不会互相覆盖）',
    hudCss.includes('scaleX(var(--wl-svg-mirror, 1)) scale(var(--wl-svg-active-scale, 1.18))'));

  // ---- 行距 / 选中放大 / 名称显示 ----
  check('DEFAULTS 含行距 gap / 放大 activeScale / 名称开关',
    DEF.modules.weaponList.svg.gap === 12
    && DEF.modules.weaponList.svg.activeScale === 1.18
    && DEF.modules.weaponList.svg.showName === true);
  check('DEFAULTS 含名称颜色与每栏常显名称 slotNames(1..5)',
    DEF.modules.weaponList.svg.nameColor === '#FFFFFF'
    && !!DEF.modules.weaponList.svg.slotNames
    && DEF.modules.weaponList.svg.slotNames['5'] === '');
  check('行间距走 CSS 变量（可在设置里调）',
    /\.weapon-bar-svg \{[^}]*gap: calc\(var\(--wl-svg-gap, 12px\) \* var\(--scale\)\)/.test(hudCss));
  check('DEFAULTS 含编号间距 numGap',
    DEF.modules.weaponList.svg.numGap === 26);
  check('图标↔编号距离走 CSS 变量（padding-right 与 .wnum right 同源）',
    /\.weapon-bar-svg \{[^}]*padding-right: calc\(var\(--wl-svg-num-gap, 26px\) \* var\(--scale\)\)/.test(hudCss)
    && /\.weapon-bar-svg \.wnum \{[^}]*right: calc\(-1 \* var\(--wl-svg-num-gap, 26px\) \* var\(--scale\)\)/.test(hudCss));
  check('applyModules 写出编号间距变量',
    hudJs.includes("'--wl-svg-num-gap'"));
  check('设置页有「编号间距」调节项',
    setJs.includes("path: base + '.numGap'"));

  // ---- 名称自定义（位置 / 颜色 / 是否辉光 / 辉光颜色）----
  check('DEFAULTS 含名称位置 nameOffsetX/Y',
    DEF.modules.weaponList.svg.nameOffsetX === 0 && DEF.modules.weaponList.svg.nameOffsetY === 0);
  check('DEFAULTS 含名称辉光开关与颜色（颜色留空=跟随槽位辉光色）',
    DEF.modules.weaponList.svg.nameGlow === true
    && DEF.modules.weaponList.svg.nameGlowColor === '');
  check('名称位置走 CSS 变量（.wl-name 与 .nname 都消费）',
    /\.weapon-bar-svg \.wl-name \{[^}]*transform: translate\(var\(--wl-svg-name-dx, 0px\), var\(--wl-svg-name-dy, 0px\)\)/.test(hudCss)
    && /\.weapon-bar-svg \.grenades \.nname \{[^}]*transform: translate\(var\(--wl-svg-name-dx, 0px\), var\(--wl-svg-name-dy, 0px\)\)/.test(hudCss));
  check('名称辉光走自己的开关/颜色（留空回退到槽位辉光色）',
    /\.weapon-bar-svg \.wl-name\.on\.act \{[^}]*var\(--wl-svg-name-glow, 0px\) var\(--wl-svg-name-glow-color, var\(--wl-svg-glow-color, #3b82f6\)\)/.test(hudCss)
    && /\.weapon-bar-svg \.grenades \.nname\.on\.act \{[^}]*var\(--wl-svg-name-glow, 0px\) var\(--wl-svg-name-glow-color, var\(--wl-svg-glow-color, #3b82f6\)\)/.test(hudCss)
    && hudJs.includes("'--wl-svg-name-glow'") && hudJs.includes("'--wl-svg-name-glow-color'"));
  check('名称辉光关闭时半径压成 0；颜色留空时移除变量（触发 CSS 回退）',
    hudJs.includes('wls.nameGlow ?') && hudJs.includes(": '0px'")
    && hudJs.includes("root.removeProperty('--wl-svg-name-glow-color')"));
  check('applyModules 写出名称位置变量',
    hudJs.includes("'--wl-svg-name-dx'") && hudJs.includes("'--wl-svg-name-dy'"));
  check('设置页有名称位置/辉光/辉光颜色',
    setJs.includes("path: base + '.nameOffsetX'") && setJs.includes("path: base + '.nameOffsetY'")
    && setJs.includes("path: base + '.nameGlow'") && setJs.includes("path: base + '.nameGlowColor'"));

  // ---- 剪影颜色（默认 + 每槽位独立）----
  check('DEFAULTS 含每槽位剪影颜色 colors(1..5)',
    !!DEF.modules.weaponList.svg.colors && DEF.modules.weaponList.svg.colors['5'] === '');
  check('HUD 渲染层消费每槽位剪影颜色',
    hudJs.includes('svg.colors') && hudJs.includes("el.dataset.silColor"));
  check('设置页有默认剪影颜色 + 每槽位剪影颜色',
    setJs.includes("path: base + '.color'") && setJs.includes('.colors.'));

  check('选中放大倍数走 CSS 变量',
    /--wl-svg-active-scale/.test(hudCss));
  check('名称元素 .wl-name 有独立样式（可显隐/两态配色）',
    /\.weapon-bar-svg \.wl-name \{[^}]*white-space: nowrap/.test(hudCss)
    && /\.weapon-bar-svg \.wl-name\.on\.pin/.test(hudCss)
    && /\.weapon-bar-svg \.wl-name\.on\.act/.test(hudCss));
  check('DEFAULTS 含名称字号 nameSize',
    DEF.modules.weaponList.svg.nameSize === 13);
  check('名称字号走 CSS 变量（可在设置里调）',
    /\.weapon-bar-svg \.wl-name \{[^}]*font-size: calc\(var\(--wl-svg-name-size, 13px\) \* var\(--scale\)\)/.test(hudCss));
  check('名称参与布局（在图标下方，不是浮在行距上）',
    /\.weapon-bar-svg \.wl-name \{[^}]*margin-top:/.test(hudCss));
  check('投掷物名称贴「对应那颗」的正下方（每颗独立 .nade > .nname）',
    /\.weapon-bar-svg \.grenades \.nade \{[^}]*flex-direction: column/.test(hudCss)
    && /\.weapon-bar-svg \.grenades \.nname \{[^}]*white-space: nowrap/.test(hudCss)
    && hudJs.includes("wrap.className = 'nade'")
    && hudJs.includes("nm.className = 'nname'"));
  check('投掷物行不再把名称甩到右侧（旧的横排覆盖已移除）',
    !/\.slot\[data-slot="4"\] \.wl-name \{[^}]*margin-left:/.test(hudCss));
  check('名称在 .ico 之外（不被 1/2/3 的镜像 transform 翻转）',
    /<div class="ico"><\/div><span class="wl-name"><\/span>/.test(read('src/renderer/index.html')));
  check('HUD 渲染层读 showName / slotNames / names / labels',
    hudJs.includes('svg.showName !== false') && hudJs.includes('svg.slotNames')
    && hudJs.includes('info.names') && hudJs.includes('info.labels'));
  check('有常显名称的空槽位不会被隐藏',
    hudJs.includes('empty && !pinName'));
  check('applyModules 写出行距/放大/名称颜色变量',
    hudJs.includes("'--wl-svg-gap'") && hudJs.includes("'--wl-svg-active-scale'")
    && hudJs.includes("'--wl-svg-name-size'") && hudJs.includes("'--wl-svg-name-color'"));
  check('设置页有「名称与行距」卡（行距/放大/名称字号/常显名）',
    setJs.includes('名称与行距') && setJs.includes("path: base + '.gap'")
    && setJs.includes("path: base + '.activeScale'") && setJs.includes("path: base + '.showName'")
    && setJs.includes("path: base + '.nameSize'") && setJs.includes('.slotNames.'));
  check('设置页可跳去「文字替换」改武器名',
    setJs.includes("activate('text')"));

  // 投掷物名称：gsi 要把每颗的内部名与显示名带上，前端才能只显示手上那颗的名字
  check('gsi 投掷物条目带 name / label',
    gsiJs.includes('name: w.name, label: displayName(w.name)')
    && gsiJs.includes('out[3].names =') && gsiJs.includes('out[3].labels ='));
  {
    const WN = require('../src/weapon-names.js');
    check('投掷物显示名逐颗正确（燃烧弹 ≠ 燃烧瓶）',
      WN.displayName('weapon_incgrenade') === '燃烧弹'
      && WN.displayName('weapon_molotov') === '燃烧瓶'
      && WN.displayName('weapon_flashbang') === '闪光弹'
      && WN.displayName('weapon_decoy') === '诱饵弹'
      && WN.displayName('weapon_smokegrenade') === '烟雾弹'
      && WN.displayName('weapon_hegrenade') === '高爆手雷');
  }
  check('HUD 渲染层消费每槽位辉光颜色',
    hudJs.includes('svg.glowColors') && hudJs.includes("setProperty('--wl-svg-glow-color'"));
  check('设置页有每槽位辉光颜色取色器',
    setJs.includes('.glowColors.') && setJs.includes('号槽位辉光'));
}

console.log('\n[14] 原生 HUD / 游戏命令（写进 CS2 的配套 cfg）');
{
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(import.meta.dirname, '..');
  const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

  const G = require('../src/gamecmds.js');
  const setJs = read('src/settings/settings.js');
  const setPre = read('src/settings/preload.js');
  const main = read('src/main.js');
  const cfgJs = read('src/config.js');

  // ---- 命令目录 ----
  check('命令目录 5 条', G.IDS.length === 5, `实际 ${G.IDS.length}`);
  check('目录 id 与 DEFAULTS.gamecmds.enabled 键完全一致',
    JSON.stringify(G.IDS) === JSON.stringify(Object.keys(ADVDEF.gamecmds.enabled)),
    `目录 ${G.IDS.join(',')} / 默认 ${Object.keys(ADVDEF.gamecmds.enabled).join(',')}`);
  check('每条命令都有中文标签与说明',
    G.CATALOG.every((c) => c.label && c.note && c.cmd));
  check('命令目录分三组（基础 / 必留 / 可选）', G.GROUPS.length === 3);

  // ---- 用户给定的五条命令必须原样出现 ----
  {
    const txt = G.cfgText({});
    const want = [
      'cl_draw_only_deathnotices 1',                    // 关原生 HUD
      'cl_drawhud_force_radar 1',                       // 雷达（必开）
      'cl_drawhud_force_teamid_overhead 1',             // 队友头顶标识（必开）
      'bind alt toggle cl_drawhud_force_deathnotices 1 0', // Alt 开关
      'r_drawtracers_firstperson false',                // 曳光弹
    ];
    check('五条命令全部原样出现在 cfg 正文里', want.every((l) => txt.includes(l)));
    // ⚠️ Source 的 cfg 解析对非 ASCII 不保证，正文必须纯 ASCII
    check('cfg 正文是纯 ASCII', /^[\x20-\x7E\r\n]*$/.test(txt));
    check('取消勾选后该条命令从正文里消失',
      !G.cfgText({ radar: false }).includes('cl_drawhud_force_radar 1'));
    check('全不勾时正文里一条命令都不剩',
      G.selected({ hide_native_hud: false, radar: false, teamid_overhead: false, alt_hud: false, tracers: false }).length === 0);
  }

  // ---- autoexec 区块：可反复写、可原样摘除 ----
  {
    const en = G.resolveEnabled({});
    const base = 'sensitivity 1.5\r\nviewmodel_fov 68\r\n';
    const twice = G.upsertBlock(G.upsertBlock(base, en), { radar: false, tracers: false });
    check('autoexec 区块只出现一次（重复写入不叠加）',
      twice.split(G.MARK_BEGIN).length - 1 === 1);
    check('写入区块不动用户原有内容',
      twice.includes('sensitivity 1.5') && twice.includes('viewmodel_fov 68'));
    check('取消勾选后 autoexec 里的那一行也没了',
      !twice.includes('cl_drawhud_force_radar 1'));
    check('摘除区块后完全还原原文件', G.stripBlock(twice).text === base);
    check('文件里没有我们的区块时摘除不动它',
      G.stripBlock('host_writeconfig\n').removed === false);
    check('CRLF 的 autoexec 不会被塞进 LF', twice.includes('cl_draw_only_deathnotices 1\r\n'));
  }

  // ---- 配置层 ----
  check('gamecmds.autoexec 默认关闭', ADVDEF.gamecmds.autoexec === false);
  check('merge 剔除目录里不存在的命令 id',
    !('bogus' in mergeCfg({ gamecmds: { enabled: { bogus: true } } }).gamecmds.enabled));
  check('merge 只认显式 false 为关、其余当开',
    mergeCfg({ gamecmds: { enabled: { radar: false } } }).gamecmds.enabled.radar === false
    && mergeCfg({}).gamecmds.enabled.radar === true);
  check('autoexec 只认严格 true',
    mergeCfg({ gamecmds: { autoexec: 'yes' } }).gamecmds.autoexec === false
    && mergeCfg({ gamecmds: { autoexec: true } }).gamecmds.autoexec === true);

  // ---- 主进程 / preload / 设置界面 ----
  check('config.js 从 gamecmds 取默认开关（单一权威）', cfgJs.includes("require('./gamecmds')"));
  for (const ch of ['gamecmds:info', 'gamecmds:write', 'gamecmds:remove', 'gamecmds:reveal',
    'gamecmds:copy-exec', 'gamecmds:text']) {
    check(`主进程有 ${ch}`, main.includes(`'${ch}'`));
  }
  check('写入 CS2 前会把界面勾选落盘（走 applyConfig + 存盘）',
    /gamecmds:write[\s\S]{0,400}applyConfig\(draft,\s*true\)/.test(main));
  check('preload 暴露 gamecmds 组', setPre.includes('gamecmds: {'));
  check('设置侧有「原生 HUD 命令」分区', /id: 'gamecmds'/.test(setJs));
  check('分区挂在基础配置组下（没写 group 即归 basic）',
    /id: 'gamecmds'[^\n]*build: buildGamecmdsSection/.test(setJs));
  check('页面里有写入 / 移除 / 复制 exec 三个动作',
    setJs.includes('写入 CS2') && setJs.includes('移除已写入') && setJs.includes("activate('gamecmds')"));
  check('页面会现查 CS2 状态（不是缓存）', setJs.includes('async function refreshGameCmds'));
  check('页面有「将要写进 cfg 的内容」预览', setJs.includes('将要写进 cfg 的内容'));
  check('导航图标有 gamecmds 配色', read('src/settings/settings.css').includes('.nav-ico.gamecmds'));
  check('首页概览有游戏命令一格', setJs.includes("statBox(sum, 'gamecmds', '游戏命令')"));

  // ---- 文档口径统一 ----
  const readme = read('README.md');
  const devplan = read('DEV-PLAN.md');
  check('README 已把 teamid_overhead 改成 1（与用户口径一致）',
    readme.includes('cl_drawhud_force_teamid_overhead 1')
    && !readme.includes('cl_drawhud_force_teamid_overhead -1'));
  check('DEV-PLAN 同步为 1',
    devplan.includes('cl_drawhud_force_teamid_overhead 1')
    && !devplan.includes('cl_drawhud_force_teamid_overhead -1'));
  check('教程里有这一节', read('TUTORIAL.md').includes('原生 HUD'));
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail === 0 ? 0 : 1);
