'use strict';

/**
 * 自定义文本元素可以用的变量。
 *
 * 用普通脚本写（不是 ESM），因为要同时被两个渲染层用 <script> 加载：
 *   - HUD 层 src/renderer/index.html
 *   - 设置界面 src/settings/index.html
 * 两边读同一份定义，才不会出现「设置界面里能选、HUD 里认不出来」的情况。
 *
 * 新增变量只要往这个数组里加一行。
 */

var OPH_VARS = [
  // ---- 状态 ----
  { group: '状态', key: 'health',   label: '血量',          sample: '76',    get: (s) => s.health },
  { group: '状态', key: 'armor',    label: '护甲值',        sample: '57',    get: (s) => s.armor },
  { group: '状态', key: 'equip',    label: '护甲组合',      sample: '甲+盔',
    get: (s) => (s.armor <= 0 ? '无甲' : (s.helmet ? '甲+盔' : '甲')) },
  { group: '状态', key: 'helmet',   label: '头盔',          sample: '有',
    get: (s) => (s.helmet ? '有' : '无') },
  { group: '状态', key: 'defusekit', label: '拆弹器',       sample: '有',
    get: (s) => (s.defusekit ? '有' : '无') },
  { group: '状态', key: 'money',    label: '金钱（带千分位）', sample: '4,350',
    get: (s) => Number(s.money || 0).toLocaleString('en-US') },
  { group: '状态', key: 'money_raw', label: '金钱（纯数字）', sample: '4350',
    get: (s) => s.money },

  // ---- 武器 ----
  { group: '武器', key: 'weapon',    label: '当前武器名',   sample: 'AK-47',
    get: (s, h) => (s.weapon ? h.weaponLabel(s.weapon) : '') },
  { group: '武器', key: 'weapon_raw', label: '武器内部名',  sample: 'weapon_ak47',
    get: (s) => (s.weapon ? s.weapon.name : '') },
  { group: '武器', key: 'clip',      label: '弹匣子弹',     sample: '30',
    get: (s) => (s.weapon && s.weapon.clip != null ? s.weapon.clip : '') },
  { group: '武器', key: 'reserve',   label: '备用子弹',     sample: '90',
    get: (s) => (s.weapon && s.weapon.reserve != null ? s.weapon.reserve : '') },
  { group: '武器', key: 'clipmax',   label: '弹匣容量',     sample: '30',
    get: (s) => (s.weapon && s.weapon.clipMax != null ? s.weapon.clipMax : '') },

  // ---- 战绩 ----
  { group: '战绩', key: 'kills',     label: '总击杀',       sample: '14', get: (s) => s.matchKills },
  { group: '战绩', key: 'deaths',    label: '总死亡',       sample: '9',  get: (s) => s.matchDeaths },
  { group: '战绩', key: 'assists',   label: '总助攻',       sample: '3',  get: (s) => s.matchAssists },
  { group: '战绩', key: 'mvps',      label: 'MVP 次数',     sample: '2',  get: (s) => s.matchMvps },
  { group: '战绩', key: 'kdscore',   label: '个人得分',     sample: '34', get: (s) => s.matchScore },
  { group: '战绩', key: 'round_kills', label: '本回合击杀', sample: '3',  get: (s) => s.roundKills },
  { group: '战绩', key: 'round_hs',  label: '本回合爆头',   sample: '1',  get: (s) => s.roundHeadshots },
  { group: '战绩', key: 'kd',        label: 'K/D 比',       sample: '1.56',
    get: (s) => (Number(s.matchDeaths) > 0
      ? (Number(s.matchKills || 0) / Number(s.matchDeaths)).toFixed(2)
      : String(Number(s.matchKills || 0))) },
  { group: '战绩', key: 'kdr',       label: 'K/D（分开写）', sample: '14 / 9',
    get: (s) => `${Number(s.matchKills || 0)} / ${Number(s.matchDeaths || 0)}` },

  // ---- 比分 ----
  { group: '比分', key: 'ct_score',  label: 'CT 比分',      sample: '7',  get: (s) => s.scoreCT },
  { group: '比分', key: 't_score',   label: 'T 比分',       sample: '9',  get: (s) => s.scoreT },
  { group: '比分', key: 'alive_ct',  label: 'CT 存活人数',  sample: '',
    get: (s) => (s.aliveCT == null ? '' : s.aliveCT) },
  { group: '比分', key: 'alive_t',   label: 'T 存活人数',   sample: '',
    get: (s) => (s.aliveT == null ? '' : s.aliveT) },

  // ---- 名单（只有死亡观战 / GOTV / 回放时才有数据，其余时候取到空字符串）----
  { group: '名单', key: 'team_alive',  label: '我方存活',   sample: '',
    get: (s) => (s.teamAlive == null ? '' : s.teamAlive) },
  { group: '名单', key: 'enemy_alive', label: '敌方存活',   sample: '',
    get: (s) => (s.enemyAlive == null ? '' : s.enemyAlive) },
  { group: '名单', key: 'total_alive', label: '全场存活',   sample: '',
    get: (s) => (s.totalAlive == null ? '' : s.totalAlive) },
  { group: '名单', key: 'spectating',  label: '是否观战',   sample: '否',
    get: (s) => (s.spectating ? '是' : '否') },
  { group: '名单', key: 'bomb_carrier', label: 'C4 携带者',  sample: '',
    get: (s) => s.bombCarrier || '' },

  // ---- 回合 ----
  { group: '回合', key: 'time',      label: '回合计时',     sample: '1 : 37',
    get: (s) => (s.timer ? s.timer.text : '') },
  { group: '回合', key: 'phase',     label: '回合阶段',     sample: '进行中',
    get: (s) => ({ freezetime: '冻结', live: '进行中', over: '已结束',
                   warmup: '热身', gameover: '比赛结束' }[s.phase] || s.phase || '') },
  { group: '回合', key: 'bomb',      label: 'C4 状态',      sample: '已下包',
    get: (s) => (s.bombPlanted ? '已下包' : '') },
  { group: '回合', key: 'round_no',  label: '回合数',       sample: '16', get: (s) => s.roundNo },
  { group: '回合', key: 'map',       label: '地图名',       sample: 'de_mirage', get: (s) => s.map },
  { group: '回合', key: 'team',      label: '当前阵营',     sample: 'CT', get: (s) => s.team },
];

// 浏览器里挂在全局，Node 里走 module.exports
if (typeof module === 'object' && module.exports) module.exports = OPH_VARS;
