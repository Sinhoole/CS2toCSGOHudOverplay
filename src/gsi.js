'use strict';

const http = require('http');
const { displayName, grenadeOf, slotOfType } = require('./weapon-names');

/**
 * GSI 接收 + 状态机。
 *
 * 数据全部来自 Valve 官方的 Game State Integration：
 * 游戏客户端主动把 JSON POST 给我们，我们不打开 cs2.exe 的进程句柄，
 * 不读内存、不注入、不改游戏文件。
 */
class GsiHub {
  constructor(cfg) {
    this.cfg = cfg;
    this.listeners = new Set();
    this.server = null;

    // 计时器基准（GSI 对本地玩家不提供 phase_countdowns，只能本地推算）
    this.marks = { freeze: 0, round: 0, bomb: 0 };
    this.prev = { phase: null, bomb: null, roundNo: null };

    // 金钱变动检测（消费扣除 / 击杀奖励提示）
    this.prevMoney = null;
    this.deltaSeq = 0;
    this.lastDelta = null;

    // 战绩增量检测（击杀 / 死亡 / 助攻 / 连杀播报）
    // GSI 只给「累计值」，拿不到击杀事件流（谁杀了谁、用什么枪），
    // 所以这里靠对比两次快照的差值反推出「刚发生了什么」。
    this.prevStats = {};
    this.eventId = 0;
    this.events = [];

    // 存活人数「加减法」用的死亡基线。
    // 思路（正是用户要求的那种简单计数）：
    //   GSI 在观察者视角下会给每个玩家的累计死亡数 match_stats.deaths，
    //   击杀发生时它只会增加。我们记下「开始观察时 / 每回合冻结时」的死亡数作为基线，
    //   之后 alive = 阵营人数 − Σ max(0, deaths − 基线)。
    // 全程只做加减法，不需要给每个玩家维护 alive/dead 状态。
    this._deathBaseline = null;     // { steamid: 基线死亡数 }
    this._sawAllplayers = false;    // 是否正在收到 allplayers（断流后要重新建基线）

    // ⚠️ CS2 的 payload 是「部分下发」的：没变化的组件不会每一包都带。
    // allplayers 尤其如此 —— 实测它常常只在「观战名单发生变化」的那一刻出现一次，
    // 之后几十包都不再携带。若把「这一包没带」当成「名单没了」，面板就会一闪即没
    // （实机表现正是「死亡后的观战面板根本不显示」，和当初 round.phase 抖动同一类坑）。
    // 因此这里缓存最近一次的 allplayers：缺失 = 未变化 → 沿用。
    this._lastAll = null;
    this._lastAllAt = 0;
    this._rosterDbg = '';           // 名单侦测日志去重用
    // 名单面板功能已取消，isBuyTime 级别的名单侦测日志不再默认刷屏。
    // 需要排查时：set OPH_ROSTER_DEBUG=1，或启动加 --roster-debug。
    this._rosterDebug = process.env.OPH_ROSTER_DEBUG === '1'
      || process.argv.includes('--roster-debug');

    this.lastPayloadAt = 0;
    this.received = 0;
    this.snapshot = { connected: false, visible: false };
  }

  onSnapshot(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  start() {
    const { port, host, token } = this.cfg;

    this.server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => {
        body += c;
        if (body.length > 1e6) req.destroy();
      });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
        if (req.method !== 'POST') return;
        this._ingest(body, token);
      });
    });

    this.server.on('error', (err) => {
      console.error('[GSI] 监听失败:', err.message);
      if (err.code === 'EADDRINUSE') {
        console.error(`[GSI] 端口 ${port} 被占用，改 config.json 里的 port（记得同步改 cfg 文件里的 uri）`);
      }
    });

    this.server.listen(port, host, () => {
      console.log(`[GSI] 监听 http://${host}:${port}  等待 CS2 推送…`);
    });
  }

  stop() {
    if (this.server) this.server.close();
  }

  _ingest(raw, token) {
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      return; // 心跳或非 JSON，忽略
    }

    if (token && payload?.auth?.token !== token) {
      console.warn('[GSI] token 不匹配，已丢弃该包');
      return;
    }

    this.received += 1;
    this.lastPayloadAt = Date.now();
    this.snapshot = this._derive(payload);
    for (const fn of this.listeners) fn(this.snapshot);
  }

  /**
   * 每 100ms 由主进程调用一次：重算计时器并检查数据是否过期。
   * 因为 GSI 只在状态变化时推送，心跳间隔默认 30s，计时器不能靠它驱动。
   */
  refresh() {
    if (!this.snapshot.connected) return;
    const now = Date.now();
    this.snapshot.timer = this._timer(this.prev.phase, this.prev.bomb, now);
    if (now - this.lastPayloadAt >= this.cfg.staleTimeoutMs) {
      this.snapshot.visible = false;
      this.snapshot.connected = false;
    }
    for (const fn of this.listeners) fn(this.snapshot);
  }

  /** 把原始 payload 压平成渲染层需要的快照 */
  _derive(p) {
    const player = p.player || {};
    const state = player.state || {};
    const map = p.map || {};
    const round = p.round || {};
    const weapons = player.weapons || {};

    // ---- 战绩增量 → 事件 ----
    // GSI 只给累计的 K/D/A，拿不到「谁杀了谁」这种事件流，
    // 所以用两次快照的差值反推：击杀 +1、阵亡、连杀、助攻、MVP。
    const stats = this._stats(player, state);
    this._detectEvents(stats);

    // ---- 当前手持武器 ----
    let active = null;
    for (const w of Object.values(weapons)) {
      if (w && w.state === 'active') { active = w; break; }
    }

    // ---- 计时器状态机 ----
    // ⚠️ GSI 的组件是「变化时才下发」：冻结时间里绝大多数快照根本不带 round。
    // 缺失 ≠ 回合结束 —— 沿用上一次的 phase / bomb，否则 isBuyTime 会每几包抖一次，
    // 购买轮盘就会「开了又关、关了又开」（实机踩过的坑：轮盘看起来根本没弹）。
    const now = Date.now();
    const phase = round.phase || this.prev.phase || null;
    const bomb = round.bomb || this.prev.bomb || null;
    const roundNo = map.round != null ? map.round : this.prev.roundNo;

    if (phase !== this.prev.phase) {
      if (phase === 'freezetime') this.marks.freeze = now;
      if (phase === 'live') this.marks.round = now;
    }
    // 进入新的冻结时间 = 新回合开始，死亡基线要清零重算
    const rebase = phase === 'freezetime' && this.prev.phase !== 'freezetime';
    if (roundNo !== this.prev.roundNo) {
      this.marks.bomb = 0;
    }
    if (bomb === 'planted' && this.prev.bomb !== 'planted') {
      this.marks.bomb = now;
    }
    if (bomb !== 'planted') {
      this.marks.bomb = 0;
    }
    this.prev = { phase, bomb, roundNo };

    const timer = this._timer(phase, bomb, now, p.phase_countdowns);

    // ---- 金钱变动 ----
    // 扣款任何时候都要提示（买枪/买道具多在冻结时间）；加钱只在回合进行或结算时提示，
    // 否则回合开始时那笔经济重置也会被当成「获得奖励」弹出来。
    const money = num(state.money, 0);
    if (this.prevMoney != null && money !== this.prevMoney) {
      const d = money - this.prevMoney;
      if (d < 0 || phase === 'live' || phase === 'over') {
        this.deltaSeq += 1;
        this.lastDelta = { amount: d, seq: this.deltaSeq };
      }
    }
    this.prevMoney = money;

    // ---- allplayers 的「缺失 = 未变化」处理 ----
    // CS2 只在 allplayers 发生变化时才下发这个块。所以：
    //   带了（非空）→ 刷新缓存；带了但是 {} → 名单清空；
    //   没带 + 活着 → 本来就不该有，清空；
    //   没带 + 死的/观战 → 沿用缓存（缺失只是「没变化」，不是「没了」）。
    const allRaw = p && p.allplayers;
    const hasAll = !!allRaw && typeof allRaw === 'object' && !Array.isArray(allRaw);
    const healthNow = num(state.health, 0);
    const deadNow = healthNow <= 0 || player.activity === 'spectating';

    let allUse = this._lastAll;
    if (hasAll && Object.keys(allRaw).length) {
      allUse = allRaw;
      this._lastAll = allRaw;
      this._lastAllAt = now;
    } else if (hasAll) {
      allUse = null;                 // 显式空 {} = 名单清空（sparse collection 语义）
      this._lastAll = null;
    } else if (!deadNow) {
      allUse = null;                 // 活着却没有 allplayers：本来就不该有，清掉
      this._lastAll = null;
    }

    // ---- 名单侦测（诊断）：allplayers 的到场 / 缺席 × 视角状态，变化时打一行 ----
    // ⚠️ 名单面板功能已取消，这段默认不再输出（之前会随 slot 抖动刷屏）。
    const rawCount = hasAll ? Object.keys(allRaw).length : -1;
    const dbg = `${rawCount}|${allUse ? Object.keys(allUse).length : 0}|${player.activity || '-'}|${deadNow ? 'dead' : 'alive'}|${player.observer_slot ?? '-'}`;
    if (this._rosterDebug && dbg !== this._rosterDbg) {
      this._rosterDbg = dbg;
      const held = allUse ? Object.keys(allUse).length : 0;
      console.log(`[roster] 原始 allplayers=${rawCount < 0 ? '缺失' : rawCount + '人'}`
        + ` | 采用=${held ? held + '人' : '无'}`
        + ` | activity=${player.activity || '-'}`
        + ` | 血量=${healthNow}`
        + ` | slot=${player.observer_slot ?? '-'}`
        + ` | 缓存距今=${this._lastAllAt ? ((now - this._lastAllAt) / 1000).toFixed(1) + 's' : '-'}`);
    }

    // ---- 存活人数 / 队友名单（只有观察者视角才有 allplayers）----
    const roster = this._roster(allUse, player, { rebase });
    const alive = { ct: roster.counts.ct, t: roster.counts.t };

    // ---- 可见性 ----
    const fresh = Date.now() - this.lastPayloadAt < this.cfg.staleTimeoutMs;
    const mapPhase = map.phase || null;
    const inMatch = mapPhase === 'live' || mapPhase === 'warmup' || mapPhase === 'gameover';

    // ---- 购买时间判定（驱动购买轮盘自动弹出）----
    // freezetime 且倒计时仍 > 0 = 买枪窗口；warmup 也允许买。
    // phase_countdowns 在观察者视角才有，普通玩家拿不到时退化为「是 freezetime 就算」。
    const cd = p.phase_countdowns || {};
    const freezeRemain = (cd.phase === 'freezetime' && cd.phase_ends_in != null)
      ? num(cd.phase_ends_in, null)
      : null;
    const isBuyTime = (phase === 'freezetime' && (freezeRemain == null || freezeRemain > 0))
      || mapPhase === 'warmup';

    return {
      connected: true,
      visible: !!(player.steamid && fresh && (!this.cfg.timer.hideWhenNoMatch || inMatch)),
      map: map.name || '',
      team: player.team || null,

      health: num(state.health, 100),
      armor: num(state.armor, 0),
      helmet: !!state.helmet,
      defusekit: !!state.defusekit,
      money,
      moneyDelta: this.lastDelta,
      flashed: num(state.flashed, 0),

      weapon: active
        ? {
            name: active.name || '',
            label: displayName(active.name || ''),   // 默认中文名，前端可用用户自定义名覆盖
            type: active.type || '',
            clip: int(active.ammo_clip),
            clipMax: int(active.ammo_clip_max),
            reserve: int(active.ammo_reserve),
          }
        : null,

      roundKills: num(state.round_kills, 0),
      roundHeadshots: num(state.round_killhs, 0),

      scoreCT: num(map.team_ct?.score, 0),
      scoreT: num(map.team_t?.score, 0),
      aliveCT: alive.ct,
      aliveT: alive.t,
      slots: this._slots(weapons, player.team, !!state.defusekit),

      // ---- 队友 / 对手名单（allplayers，仅观察者视角）----
      roster: roster.players,
      rosterReady: roster.available,     // 有数据才显示面板，不拿占位数据糊弄
      teamAlive: roster.teamAlive,
      enemyAlive: roster.enemyAlive,
      totalAlive: roster.totalAlive,
      bombCarrier: roster.bombCarrier,
      spectating: player.activity === 'spectating',
      isBuyTime,

      // ---- 事件队列（前端按 id 去重后播报）----
      events: this.events,

      // 自定义文本元素用的变量源
      phase: phase || '',
      bombPlanted: bomb === 'planted',
      roundNo: roundNo == null ? '' : roundNo,
      matchKills: stats.kills,
      matchDeaths: stats.deaths,
      matchAssists: stats.assists,
      matchMvps: stats.mvps,
      matchScore: stats.score,
      matchHs: stats.roundHs,

      timer,
    };
  }

  /**
   * 右侧武器栏的 1-5 号槽位。
   * 1 主武器 / 2 副武器 / 3 近战 / 4 投掷物（单字，按固定顺位）/ 5 特殊装备
   * 5 号：匪徒持 C4 显示 C4；CT 带拆弹器显示拆弹器（GSI 不给拆弹器武器，按 team+defusekit 合成）。
   * 返回的 label 已经是可以直接显示的中文名。
   */
  _slots(weapons, team, hasDefuse) {
    const out = [
      { slot: 1, name: '', label: '', active: false },
      { slot: 2, name: '', label: '', active: false },
      { slot: 3, name: '', label: '', active: false },
      { slot: 4, chars: [], ids: [], activeIndex: -1, active: false },
      { slot: 5, name: '', label: '', active: false },
    ];
    const grenades = [];

    for (const w of Object.values(weapons || {})) {
      if (!w || !w.name) continue;
      const isActive = w.state === 'active';

      const nade = grenadeOf(w.name);
      if (nade) {
        // 同一个 id 只记一次（燃烧弹 / 燃烧瓶共用 'flame'），
        // 但记下它是不是当前手持的那个 —— 前端只高亮这一颗。
        const dup = grenades.find((x) => x.id === nade.id);
        if (!dup) grenades.push({ id: nade.id, char: nade.char, order: nade.order, active: isActive });
        else if (isActive) dup.active = true;
        continue;
      }

      const slot = slotOfType(w.type, w.name);
      if (!slot) continue;

      const entry = out[slot - 1];
      if (!entry.label || isActive) {
        entry.name = w.name;              // 原始英文名，前端拿它查用户自定义的显示名
        entry.label = displayName(w.name);
        entry.active = isActive;
      }
    }

    grenades.sort((a, b) => a.order - b.order);
    out[3].chars = grenades.map((x) => x.char);
    out[3].ids = grenades.map((x) => x.id);
    out[3].activeIndex = grenades.findIndex((x) => x.active);
    out[3].active = out[3].activeIndex >= 0;

    // 5 号槽位兜底：CT 带拆弹器时显示拆弹器（GSI 里拆弹器不是武器，得自己合成）。
    // 没带 C4（CT 本来就拿不到）且身上有拆弹器时才填。
    if (!out[4].name && hasDefuse && team === 'CT') {
      out[4].name = 'weapon_defuser';
      out[4].label = displayName('weapon_defuser');
    }
    return out;
  }

  /** 本地玩家的战绩累计值（含本回合数据），事件检测的输入 */
  _stats(player, state) {
    const ms = player.match_stats || {};
    return {
      kills: num(ms.kills, 0),
      deaths: num(ms.deaths, 0),
      assists: num(ms.assists, 0),
      mvps: num(ms.mvps, 0),
      score: num(ms.score, 0),
      roundKills: num(state.round_kills, 0),
      roundHs: num(state.round_killhs, 0),
    };
  }

  /**
   * 用两次快照的差值反推「刚刚发生了什么」。
   *
   * GSI 不提供击杀事件流 —— 看不到谁杀了谁、用的什么枪、多远、是否穿墙。
   * 它只给累计值，所以这里只能从「数字涨了」推断出：
   *   击杀 +1（顺带能判断这次是不是爆头）、阵亡、助攻、MVP、连杀。
   * 前端播报时就只能播这些，不要假装知道击杀目标。
   */
  _detectEvents(cur) {
    const pv = this.prevStats;

    // 第一份数据只建立基准，否则「开局就已经 14 杀」会被当成一次击杀
    if (pv.kills == null) {
      this.prevStats = cur;
      return;
    }

    if (cur.kills > pv.kills) {
      this._push({ kind: 'kill', value: cur.kills - pv.kills, hs: cur.roundHs > pv.roundHs });
    }
    if (cur.deaths > pv.deaths) {
      this._push({ kind: 'death', value: cur.deaths });
    }
    if (cur.assists > pv.assists) {
      this._push({ kind: 'assist', value: cur.assists - pv.assists });
    }
    if (cur.mvps > pv.mvps) {
      this._push({ kind: 'mvp', value: cur.mvps });
    }
    // 回合切换时 round_kills 会归零，所以只在「变大」时才当连杀
    if (cur.roundKills > pv.roundKills && cur.roundKills >= 2) {
      this._push({ kind: 'multi', value: cur.roundKills });
    }

    this.prevStats = cur;
  }

  _push(e) {
    this.eventId += 1;
    this.events.push(Object.assign({ id: this.eventId, at: Date.now() }, e));
    // 只留最近一小段：前端可能有一两帧没渲染，留够缓冲但别无限涨
    if (this.events.length > 24) this.events.splice(0, this.events.length - 24);
  }

  /**
   * 队友 / 对手名单。
   *
   * ⚠️ 数据源 allplayers 被 Valve 限定为「仅 HLTV 与观察者有效」：
   * 你还活着的时候，游戏不会下发队友的血量、武器、位置 —— 这是故意设计的，
   * 否则任何第三方程序都能合法拿到全场信息。所以本方法在存活期间返回空名单，
   * 由前端把面板收起来，而不是编个数字糊弄。
   *
   * 死亡进入观战后 activity 变成 spectating，此时 allplayers 才有数据。
   * 这正好是「想知道队友还剩几个」的那个时刻。
   *
   * 存活人数用「加减法」算（用户建议的方式）：
   *   场上的击杀详情是会被播报的 —— 每个玩家的 match_stats.deaths 在阵亡时 +1。
   *   记下每回合开始时的死亡数作为基线，之后
   *     alive = 阵营总人数 − Σ max(0, deaths − 基线)
   *   全程只做加减，不需要给每个人维护 alive/dead 状态（也不依赖血量抖动）。
   *   中途才连进观战、拿不到本回合前面的死亡时，基数从「当前」算起，会少算已死的人，
   *   直到下一个冻结时间重新建基线为止 —— 这是拿不到历史数据时的诚实近似。
   *
   * @param {object|null} all allplayers 块（由调用方做过「缺失=未变化」的缓存处理）
   */
  _roster(all, player, opts) {
    const empty = {
      available: false, players: [],
      counts: { ct: null, t: null },
      teamAlive: null, enemyAlive: null, totalAlive: null,
      bombCarrier: '',
    };

    if (!all || typeof all !== 'object' || Array.isArray(all)) {
      // 没有可用的 allplayers（活着，或缓存被清空）
      this._sawAllplayers = false;
      return empty;
    }

    const mySlot = player.observer_slot;
    const mySid = player.steamid ? String(player.steamid) : '';
    const myTeam = player.team || null;

    const players = [];
    let bombCarrier = '';

    for (const [key, pl] of Object.entries(all)) {
      if (!pl || typeof pl !== 'object') continue;

      const st = pl.state || {};
      const ms = pl.match_stats || {};
      const weapons = pl.weapons || {};
      const sid = pl.steamid == null ? '' : String(pl.steamid);

      // 自己是谁：优先比 steamid，退而用 observer_slot（键名形如 player_3）
      const isSelf = (!!mySid && sid === mySid)
        || (mySlot != null && key === `player_${mySlot}`);

      // 观战时最想看的：这个人手里拿的是什么
      let active = null;
      for (const w of Object.values(weapons)) {
        if (w && w.state === 'active') { active = w; break; }
      }

      if (weapons.weapon_c4 && !bombCarrier) bombCarrier = pl.name || '';

      const team = pl.team || '';
      const deaths = num(ms.deaths, 0);

      players.push({
        key,
        steamid: sid,
        name: pl.name || '',
        team,
        isSelf,
        health: num(st.health, 0),       // 仍保留，用于前端显示血量；计数不再依赖它
        armor: num(st.armor, 0),
        helmet: !!st.helmet,
        money: num(st.money, 0),
        roundKills: num(st.round_kills, 0),
        kills: num(ms.kills, 0),
        deaths,
        assists: num(ms.assists, 0),
        mvps: num(ms.mvps, 0),
        score: num(ms.score, 0),
        hasBomb: !!weapons.weapon_c4,
        weapon: active ? active.name || '' : '',
        weaponLabel: active ? displayName(active.name || '') : '',
        deadThisRound: false,           // 下面根据死亡基线补全
        alive: true,
      });
    }

    if (!players.length) return empty;

    // ---- 死亡基线（加减法计数的关键）----
    // 新回合冻结时间、或我们第一次看到 allplayers 时，把当前死亡数记成基线。
    // 之后任何人多死一次 deaths 就 +1，差值就是「本回合已阵亡人数」。
    const rebase = !!(opts && opts.rebase);
    if (rebase || !this._deathBaseline) {
      this._deathBaseline = {};
      for (const pl of players) this._deathBaseline[pl.steamid] = pl.deaths;
    }
    this._sawAllplayers = true;

    // 计算每个阵营「本回合阵亡数」= 各人 max(0, deaths − 基线)
    const teamTotals = { ct: 0, t: 0 };
    const roundDeaths = { ct: 0, t: 0 };
    for (const pl of players) {
      const tk = pl.team === 'CT' ? 'ct' : pl.team === 'T' ? 't' : null;
      if (tk) teamTotals[tk] += 1;
      const base = this._deathBaseline[pl.steamid];
      const d = base == null ? 0 : Math.max(0, pl.deaths - base);
      if (tk) roundDeaths[tk] += d;
      pl.deadThisRound = d > 0;
      pl.alive = !pl.deadThisRound;
    }

    // alive = 阵营总人数 − 本回合阵亡数
    const aliveCT = teamTotals.ct - roundDeaths.ct;
    const aliveT = teamTotals.t - roundDeaths.t;

    const isMine = (x) => (myTeam === 'CT' || myTeam === 'T') ? x.team === myTeam : x.isSelf;
    const mine = players.filter(isMine);
    const theirs = players.filter((x) => !isMine(x));

    const myAlive = myTeam === 'CT' ? aliveCT : myTeam === 'T' ? aliveT : null;
    const enemyAlive = myTeam === 'CT' ? aliveT : myTeam === 'T' ? aliveCT : null;

    return {
      available: true,
      players,
      counts: { ct: aliveCT, t: aliveT },
      teamAlive: mine.length ? myAlive : null,
      enemyAlive: theirs.length ? enemyAlive : null,
      totalAlive: aliveCT + aliveT,
      bombCarrier,
    };
  }

  _timer(phase, bomb, now, countdown) {
    const c = this.cfg.timer;
    let mode = 'none';
    let remain = 0;

    if (bomb === 'planted' && this.marks.bomb) {
      mode = 'bomb';
      remain = c.bombSeconds - (now - this.marks.bomb) / 1000;
    } else if (phase === 'live' && this.marks.round) {
      mode = 'round';
      remain = c.roundSeconds - (now - this.marks.round) / 1000;
    } else if (phase === 'freezetime' && this.marks.freeze) {
      mode = 'freeze';
      remain = c.freezeSeconds - (now - this.marks.freeze) / 1000;
    }

    // 观察者视角下 GSI 会给官方倒计时，比本地推算准 —— 本地推算得先等到
    // 一次 phase 变化才知道基准时刻，中途连进来会偏好几秒。
    // 只在非下包阶段采用：planted 之后各家对 phase_ends_in 的口径不一致，
    // 本地固定的 40 秒反而更稳。
    const ends = countdown ? num(countdown.phase_ends_in, null) : null;
    let official = false;
    if (mode !== 'none' && mode !== 'bomb' && ends != null && ends >= 0) {
      remain = ends;
      official = true;
    }

    remain = Math.max(0, remain);
    return { mode, remain, official, text: mode === 'none' ? '' : fmtTime(remain) };
  }
}

/** 弹药数这类字段必须是整数，防止来源给到浮点 / 字符串时前端显示成 3.91 */
function int(v) {
  const n = num(v, null);
  return n == null ? null : Math.round(n);
}

function num(v, d) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : d;
}

function fmtTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m} : ${String(r).padStart(2, '0')}`;
}

module.exports = { GsiHub };
