'use strict';

/**
 * 武器名映射与槽位归类。
 *
 * GSI 只给英文内部名（weapon_ak47），中文名是我们自己维护的映射表。
 * 新增武器只要往 NAMES 里加一行，不用动别的代码。
 */

const NAMES = {
  // ---- 步枪 / 冲锋枪 ----
  weapon_ak47: 'AK-47',
  weapon_m4a1: 'M4A4',
  weapon_m4a1_silencer: 'M4A1消音型',
  weapon_aug: 'AUG',
  weapon_sg556: 'SG 553',
  weapon_famas: 'FAMAS',
  weapon_galilar: '加利尔AR',

  // ---- 狙击枪 ----
  weapon_awp: 'AWP',
  weapon_ssg08: 'SSG 08',
  weapon_scar20: 'SCAR-20',
  weapon_g3sg1: 'G3SG1',

  // ---- 冲锋枪 ----
  weapon_mp9: 'MP9',
  weapon_mac10: 'MAC-10',
  weapon_mp7: 'MP7',
  weapon_mp5sd: 'MP5-SD',
  weapon_ump45: 'UMP-45',
  weapon_p90: 'P90',
  weapon_bizon: 'PP-野牛',

  // ---- 霰弹枪 ----
  weapon_nova: 'Nova',
  weapon_xm1014: 'XM1014',
  weapon_mag7: 'MAG-7',
  weapon_sawedoff: '截短霰弹枪',

  // ---- 机枪 ----
  weapon_m249: 'M249',
  weapon_negev: '内格夫',

  // ---- 手枪 ----
  weapon_glock: '格洛克18型',
  weapon_usp_silencer: 'USP消音版',
  weapon_hkp2000: 'P2000',
  weapon_p250: 'P250',
  weapon_fiveseven: 'Five-SeveN',
  weapon_tec9: 'Tec-9',
  weapon_cz75a: 'CZ75',
  weapon_deagle: '沙漠之鹰',
  weapon_revolver: 'R8左轮',
  weapon_elite: '双持贝瑞塔',

  // ---- 其他 ----
  weapon_taser: '电击枪',
  weapon_c4: 'C4',
  weapon_defuser: '拆弹器',   // CT 的拆弹器（钳子）。GSI 里它不是武器，由 gsi.js 合成进 5 号槽位
  weapon_healthshot: '医疗针',
};

/**
 * 投掷物单字 + 固定顺位（火→烟→雷→闪→诱）。
 * id 是给用户改字用的稳定键：改 `text.grenadeChars.flame` 就能换掉"火"，
 * 燃烧瓶和燃烧弹共用同一个 id，不用改两次。
 */
const GRENADES = {
  weapon_molotov: { id: 'flame', char: '火', order: 1, name: '燃烧瓶' },
  weapon_incgrenade: { id: 'flame', char: '火', order: 1, name: '燃烧弹' },
  weapon_smokegrenade: { id: 'smoke', char: '烟', order: 2, name: '烟雾弹' },
  weapon_hegrenade: { id: 'he', char: '雷', order: 3, name: '高爆手雷' },
  weapon_flashbang: { id: 'flash', char: '闪', order: 4, name: '闪光弹' },
  weapon_decoy: { id: 'decoy', char: '诱', order: 5, name: '诱饵弹' },
};

/** 投掷物的稳定顺序与默认单字，设置界面按这个列表生成可改的输入框 */
const GRENADE_KINDS = [
  { id: 'flame', label: '燃烧弹 / 燃烧瓶', char: '火' },
  { id: 'smoke', label: '烟雾弹', char: '烟' },
  { id: 'he', label: '高爆手雷', char: '雷' },
  { id: 'flash', label: '闪光弹', char: '闪' },
  { id: 'decoy', label: '诱饵弹', char: '诱' },
];

const TYPE_SLOT = {
  Rifle: 1,
  SniperRifle: 1,
  'Submachine Gun': 1,
  Shotgun: 1,
  'Machine Gun': 1,
  Pistol: 2,
  Knife: 3,
  Grenade: 4,
  C4: 5,
};

function isKnife(name) {
  return /^weapon_knife/.test(name) || /bayonet/.test(name);
}

function grenadeOf(name) {
  return GRENADES[name] || null;
}

function slotOfType(type, name) {
  if (TYPE_SLOT[type] != null) return TYPE_SLOT[type];
  if (isKnife(name)) return 3;
  if (name === 'weapon_c4') return 5;
  return null;
}

/** 投掷物的完整名（{weapon} 这种变量用得到，不然会显示成 flashbang） */
const GRENADE_NAMES = {
  flame: '燃烧瓶', smoke: '烟雾弹', he: '高爆手雷', flash: '闪光弹', decoy: '诱饵弹',
};

function displayName(name) {
  if (NAMES[name]) return NAMES[name];
  if (isKnife(name)) return '匕首';
  const g = GRENADES[name];
  if (g) return g.name || GRENADE_NAMES[g.id] || g.char;
  return name.replace(/^weapon_/, '');
}

module.exports = { NAMES, GRENADES, GRENADE_KINDS, displayName, grenadeOf, slotOfType };
