'use strict';

/**
 * 模拟数据源：不开 CS2 也能预览 HUD 长什么样。
 * 用法：npm run mock
 *
 * 时间线（每 150 秒一轮）：
 *   0-15s   冻结时间
 *   15-115s 回合进行（第 60s 下包，第 100s 爆炸）
 *   115s+   回合结束
 */
const CYCLE = 150;

function buildPayload(t) {
  const local = t % CYCLE;

  let phase = 'live';
  let bomb = null;
  if (local < 15) phase = 'freezetime';
  else if (local >= 115) phase = 'over';
  if (local >= 60 && local < 100) bomb = 'planted';

  // 血量/护甲在回合里逐步掉光；回合结束后回满血、清空护甲。
  // 这样四张参考图的状态都能看到：
  //   t=5   满血满护甲带头盔   t=62  受伤无护甲（血条转红）
  //   t=91  低血量预警         t=120 满血无护甲
  const progH = phase === 'live' ? Math.min(1, (local - 15) / 80) : 0;
  // 护甲掉得比血量快：t≈63 是「41 血 / 0 甲」，t≈91 是「8 血 / 0 甲」，正好对上参考图的两种状态
  const progA = phase === 'live' ? Math.min(1, (local - 15) / 48) : 0;
  const health = phase === 'over' ? 100 : Math.max(3, Math.round(100 - progH * 97));
  const armor = phase === 'freezetime' ? 100
              : phase === 'over' ? 0
              : Math.max(0, Math.round(100 - progA * 100));

  // 每 8 秒打空一次弹匣
  const shotCycle = local % 8;
  const clip = Math.max(0, Math.round(30 - shotCycle * 5));   // 必须取整：local 是浮点数，不取整会算出 3.91 这种值
  const reserve = Math.max(0, 90 - Math.floor(local / 8) * 5);

  // 金钱：第 40 秒买枪扣 350（消费扣除），第 78 秒击杀奖励 +100
  const moneyBase = 2000 + (Math.floor(t / CYCLE) % 3) * 900;
  let money = moneyBase;
  if (local >= 40) money -= 350;
  if (local >= 78) money += 100;

  return {
    provider: { name: 'Counter-Strike: Global Offensive', appid: 730, version: 0, steamid: '76561190000000000', timestamp: Math.floor(Date.now() / 1000) },
    map: {
      mode: 'competitive',
      name: 'de_mirage',
      phase: 'live',
      round: Math.floor(t / CYCLE),
      team_ct: { score: 7 },
      team_t: { score: 9 },
    },
    round: { phase, bomb, win_team: phase === 'over' ? 'T' : undefined },
    player: {
      steamid: '76561190000000000',
      name: 'OverplayHUD',
      team: 'CT',
      activity: 'playing',
      observer_slot: 0,
      state: {
        health,
        armor,
        helmet: true,
        defusekit: true,
        flashed: 0,
        money,
        round_kills: Math.min(5, Math.floor(local / 22)),
        round_killhs: Math.floor(local / 80),
        equip_value: 4700,
      },
      weapons: buildWeapons(local, clip, reserve),
      // 累计战绩随时间单调增长，用来验证「击杀 +1 / 阵亡」播报确实被触发
      match_stats: {
        kills: 14 + Math.floor(t / 26),
        deaths: 9 + Math.floor(t / 47),
        assists: 3 + Math.floor(t / 40),
        mvps: 2 + Math.floor(t / 75),
        score: 34 + Math.floor(t / 8),
      },
    },

    // 真实 GSI 只有观察者 / GOTV 才带 allplayers —— 也就是你死亡观战的那一刻。
    // 这里一直给数据，好在没开游戏时就能预览名单面板长什么样。
    allplayers: buildAllPlayers(local),
  };
}

/** 名单用的人名（虚构的，避免和真实选手混淆） */
const ROSTER = {
  CT: ['Aurora', 'Bishop', 'Cyclone', 'Dagger', 'Echo'],
  T: ['Falcon', 'Ghost', 'Hunter', 'Ivory', 'Joker'],
};
const ROSTER_GUNS = {
  CT: ['weapon_m4a1', 'weapon_m4a1_silencer', 'weapon_awp', 'weapon_mp9', 'weapon_deagle'],
  T: ['weapon_ak47', 'weapon_ak47', 'weapon_awp', 'weapon_mac10', 'weapon_deagle'],
};

// 每个位置「回合开始时的累计死亡数」基线。阵亡后 +1，
// 这样加减法存活计数（alive = 人数 − Σ max(0, deaths − 基线)）能直接验证。
const DEATH_BASE = [2, 5, 1, 4, 3];

/** 手持武器随回合推进会切换，投掷物会消耗，用来预览武器栏的状态变化 */
function buildWeapons(local, clip, reserve) {
  // 开局只有手枪和刀，第 18 秒"买"出主武器 —— 用来预览空槽位收起 / 顺位补进
  const hasPrimary = local >= 18;

  let active = 'weapon_glock';
  if (hasPrimary) {
    active =
      local >= 80 ? 'weapon_ak47' :
      local >= 60 ? 'weapon_flashbang' :
      local >= 45 ? 'weapon_glock' :
                    'weapon_ak47';
  }
  const st = (n) => (n === active ? 'active' : 'holstered');

  const out = {
    weapon_0: { name: 'weapon_knife', type: 'Knife', state: st('weapon_knife') },
    weapon_2: { name: 'weapon_glock', type: 'Pistol', ammo_clip: 20, ammo_clip_max: 20, ammo_reserve: 120, state: st('weapon_glock') },
    weapon_3: { name: 'weapon_molotov', type: 'Grenade', state: st('weapon_molotov') },
    weapon_4: { name: 'weapon_hegrenade', type: 'Grenade', state: st('weapon_hegrenade') },
    weapon_5: { name: 'weapon_flashbang', type: 'Grenade', state: st('weapon_flashbang') },
    weapon_6: { name: 'weapon_decoy', type: 'Grenade', state: st('weapon_decoy') },
    weapon_7: { name: 'weapon_c4', type: 'C4', state: 'holstered' },
  };
  if (hasPrimary) {
    out.weapon_1 = { name: 'weapon_ak47', type: 'Rifle', ammo_clip: clip, ammo_clip_max: 30, ammo_reserve: reserve, state: st('weapon_ak47') };
  }

  // 烟雾弹在第 50 秒用掉，闪光在第 75 秒用掉 —— 用来预览单字消失、分隔符自动合并
  if (local < 50) {
    out.weapon_8 = { name: 'weapon_smokegrenade', type: 'Grenade', state: st('weapon_smokegrenade') };
  }
  if (local >= 75) delete out.weapon_5;

  return out;
}

function buildAllPlayers(local) {
  const out = {};
  // 人数随回合推进递减，方便看人数变化的微反馈
  const aliveOf = { CT: local < 35 ? 5 : local < 62 ? 4 : 3, T: local < 35 ? 5 : local < 75 ? 5 : 4 };

  for (const team of ['CT', 'T']) {
    const names = ROSTER[team];
    const alive = aliveOf[team];

    for (let i = 0; i < 5; i += 1) {
      const isAlive = i < alive;
      const isSelf = team === 'CT' && i === 0;   // 自己和 observer_slot 0 对上

      const weapons = isAlive ? {
        weapon_0: { name: 'weapon_knife', type: 'Knife', state: 'holstered' },
        weapon_1: { name: ROSTER_GUNS[team][i], type: 'Rifle', state: 'active', ammo_clip: 25, ammo_reserve: 90 },
      } : {};
      // C4 在 T 队第一个存活的人手上
      if (team === 'T' && i === 0 && isAlive) {
        weapons.weapon_c4 = { name: 'weapon_c4', type: 'C4', state: 'holstered' };
      }

      out[`player_${team === 'CT' ? i : i + 5}`] = {
        steamid: isSelf ? '76561190000000000' : `7656119111100000${i}${team === 'CT' ? 0 : 1}`,
        name: names[i],
        team,
        state: {
          health: isAlive ? Math.max(12, 100 - i * 21) : 0,
          armor: isAlive ? 100 : 0,
          helmet: isAlive,
          money: 850 + i * 420,
          round_kills: isAlive ? Math.min(3, i) : 0,
        },
        match_stats: {
          kills: 21 - i * 4,
          // 阵亡时累计死亡数 +1 —— 对应真实 GSI 里击杀播报让 deaths 递增的行为
          deaths: DEATH_BASE[i] + (isAlive ? 0 : 1),
          assists: 6 - i,
          mvps: 4 - Math.floor(i / 2),
          score: 48 - i * 6,
        },
        weapons,
      };
    }
  }
  return out;
}

/**
 * @param {number} offset 从时间线的第几秒开始（用来直接把 HUD 停在某个状态上截图）
 *                        例如 offset=105 → 血量 3、护甲 0 的极端状态
 */
function startMock(hub, hz = 10, offset = 0) {
  const t0 = Date.now();
  const timer = setInterval(() => {
    const t = offset + (Date.now() - t0) / 1000;
    hub._ingest(JSON.stringify(buildPayload(t)), '');
  }, 1000 / hz);
  console.log(`[mock] 模拟数据已启动，时间线起点 ${offset}s（真实 GSI 不会同时生效）`);
  return () => clearInterval(timer);
}

module.exports = { startMock, buildPayload };
