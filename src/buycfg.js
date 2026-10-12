'use strict';

/**
 * 购买轮盘的两级 cfg 方案。
 *
 * 一级轮盘 = 5 个分类扇区（装备 / 手枪 / 冲锋枪 / 主武器 / 道具）。
 * 点分类 → 向 CS2 控制台注入 `exec oph_bw_<阵营>_<分类>`，激活对应的 cfg：
 * 那份 cfg 先 unbind 掉 5 个购买键，再把它们 bind 成该分类 5 件武器的 buy 命令。
 * 于是同一组键在所有分类之间复用 —— 换分类就换绑定，按真键由游戏自己完成购买
 * （不经过本程序，这部分完全不是模拟输入）。
 *
 * 本模块只做「纯文本生成 + 写文件」，不注入任何输入。
 */

const fs = require('fs');
const path = require('path');
const { findGameRoots, targets } = require('./gsi-install');

/** 一级轮盘的分类（顺序即扇区顺序） */
const CATEGORIES = [
  { id: 'gear',   label: '装备' },
  { id: 'pistol', label: '手枪' },
  { id: 'smg',    label: '冲锋枪' },
  { id: 'rifle',  label: '主武器' },
  { id: 'nade',   label: '道具' },
];

/**
 * 武器目录。buy 是 CS2 官方购买指令（控制台验证过的内部名）；
 * teams: 'both' 两边都能买 / 'CT' / 'T' 仅该阵营。
 * ⚠️ CS2 的 loadout 系统：bind buy 只对「当前配装里装上了的武器」生效，
 * 玩家需要在游戏内配装界面把想买的枪放进对应槽位。
 */
const CATALOG = [
  // ---- 装备 ----
  { id: 'vest',        label: '防弹衣',        buy: 'buy vest',        teams: 'both', cat: 'gear' },
  { id: 'vesthelm',    label: '防弹衣+头盔',   buy: 'buy vesthelm',    teams: 'both', cat: 'gear' },
  { id: 'defuser',     label: '拆弹钳',        buy: 'buy defuser',     teams: 'CT',   cat: 'gear' },
  { id: 'taser',       label: '电击枪',        buy: 'buy taser',       teams: 'both', cat: 'gear' },

  // ---- 手枪 ----
  { id: 'glock',         label: '格洛克18',    buy: 'buy glock',         teams: 'T',    cat: 'pistol' },
  { id: 'hkp2000',       label: 'P2000',       buy: 'buy hkp2000',       teams: 'CT',   cat: 'pistol' },
  { id: 'usp_silencer',  label: 'USP-S',       buy: 'buy usp_silencer',  teams: 'CT',   cat: 'pistol' },
  { id: 'p250',          label: 'P250',        buy: 'buy p250',          teams: 'both', cat: 'pistol' },
  { id: 'fiveseven',     label: 'FN57',        buy: 'buy fiveseven',     teams: 'CT',   cat: 'pistol' },
  { id: 'tec9',          label: 'Tec-9',       buy: 'buy tec9',          teams: 'T',    cat: 'pistol' },
  { id: 'elite',         label: '双持贝瑞塔',  buy: 'buy elite',         teams: 'both', cat: 'pistol' },
  { id: 'deagle',        label: '沙漠之鹰',    buy: 'buy deagle',        teams: 'both', cat: 'pistol' },

  // ---- 冲锋枪 ----
  { id: 'mac10',   label: 'MAC-10',  buy: 'buy mac10',   teams: 'T',    cat: 'smg' },
  { id: 'mp9',     label: 'MP9',     buy: 'buy mp9',     teams: 'CT',   cat: 'smg' },
  { id: 'mp7',     label: 'MP7',     buy: 'buy mp7',     teams: 'both', cat: 'smg' },
  { id: 'mp5sd',   label: 'MP5-SD',  buy: 'buy mp5sd',   teams: 'both', cat: 'smg' },
  { id: 'ump45',   label: 'UMP-45',  buy: 'buy ump45',   teams: 'both', cat: 'smg' },
  { id: 'p90',     label: 'P90',     buy: 'buy p90',     teams: 'both', cat: 'smg' },
  { id: 'bizon',   label: 'PP野牛',  buy: 'buy bizon',   teams: 'both', cat: 'smg' },

  // ---- 主武器（步枪 / 狙击 / 霰弹 / 机枪）----
  { id: 'galilar',       label: '加利尔',     buy: 'buy galilar',       teams: 'T',    cat: 'rifle' },
  { id: 'famas',         label: 'FAMAS',      buy: 'buy famas',         teams: 'CT',   cat: 'rifle' },
  { id: 'ak47',          label: 'AK-47',      buy: 'buy ak47',          teams: 'T',    cat: 'rifle' },
  { id: 'm4a1',          label: 'M4A4',       buy: 'buy m4a1',          teams: 'CT',   cat: 'rifle' },
  { id: 'm4a1_silencer', label: 'M4A1-S',     buy: 'buy m4a1_silencer', teams: 'CT',   cat: 'rifle' },
  { id: 'sg556',         label: 'SG 553',     buy: 'buy sg556',         teams: 'T',    cat: 'rifle' },
  { id: 'aug',           label: 'AUG',        buy: 'buy aug',           teams: 'CT',   cat: 'rifle' },
  { id: 'ssg08',         label: 'SSG 08',     buy: 'buy ssg08',         teams: 'both', cat: 'rifle' },
  { id: 'awp',           label: 'AWP',        buy: 'buy awp',           teams: 'both', cat: 'rifle' },
  { id: 'g3sg1',         label: 'G3SG1',      buy: 'buy g3sg1',         teams: 'T',    cat: 'rifle' },
  { id: 'scar20',        label: 'SCAR-20',    buy: 'buy scar20',        teams: 'CT',   cat: 'rifle' },
  { id: 'nova',          label: 'Nova',       buy: 'buy nova',          teams: 'both', cat: 'rifle' },
  { id: 'xm1014',        label: 'XM1014',     buy: 'buy xm1014',        teams: 'both', cat: 'rifle' },
  { id: 'mag7',          label: 'MAG-7',      buy: 'buy mag7',          teams: 'CT',   cat: 'rifle' },
  { id: 'm249',          label: 'M249',       buy: 'buy m249',          teams: 'both', cat: 'rifle' },
  { id: 'negev',         label: '内格夫',     buy: 'buy negev',         teams: 'both', cat: 'rifle' },

  // ---- 道具（投掷物）----
  { id: 'flashbang',    label: '闪光弹',          buy: 'buy flashbang',    teams: 'both', cat: 'nade' },
  { id: 'smokegrenade', label: '烟雾弹',          buy: 'buy smokegrenade', teams: 'both', cat: 'nade' },
  { id: 'hegrenade',    label: '高爆弹',          buy: 'buy hegrenade',    teams: 'both', cat: 'nade' },
  { id: 'molotov',      label: '莫洛托夫',        buy: 'buy molotov',      teams: 'T',    cat: 'nade' },
  { id: 'incgrenade',   label: '燃烧弹',          buy: 'buy incgrenade',   teams: 'CT',   cat: 'nade' },
  { id: 'decoy',        label: '诱饵弹',          buy: 'buy decoy',        teams: 'both', cat: 'nade' },
];

const CLEAR_NAME = 'oph_bw_clear.cfg';

/** 某个阵营某个分类下可以勾选的武器 */
function catalogFor(team, cat) {
  return CATALOG.filter((w) => w.cat === cat && (w.teams === 'both' || w.teams === team));
}

/** 按 id 找武器 */
function byId(id) {
  return CATALOG.find((w) => w.id === id) || null;
}

/** cfg 文件名，例如 oph_bw_ct_pistol.cfg */
function cfgName(team, cat) {
  return `oph_bw_${String(team).toLowerCase()}_${cat}.cfg`;
}

/** 归一化 bind 用的键名：去掉空白；F 键统一大写（F1），其余小写（kp_1 / uparrow） */
function normKey(key) {
  const k = String(key || '').trim();
  if (!k) return '';
  return /^f\d{1,2}$/i.test(k) ? k.toUpperCase() : k.toLowerCase();
}

/**
 * 生成一份分类 cfg 的文本。
 * @param {string} team  'CT' | 'T'
 * @param {string} cat   分类 id
 * @param {string[]} ids 勾选的武器 id（会过滤掉不存在 / 阵营不符的，最多取前 5 个）
 * @param {string[]} keys 购买键（与武器按顺序对应，keys[i] → ids[i]）
 */
function buildCfg(team, cat, ids, keys) {
  const weapons = (Array.isArray(ids) ? ids : [])
    .map(byId)
    .filter((w) => w && w.cat === cat && (w.teams === 'both' || w.teams === team))
    .slice(0, 5);

  const normKeys = (Array.isArray(keys) ? keys : []).map(normKey);
  const catLabel = (CATEGORIES.find((c) => c.id === cat) || {}).label || cat;

  const lines = [
    `// OverplayHUD 购买轮盘 · ${team} · ${catLabel}`,
    '// 由设置自动生成，手动修改会在下次保存时被覆盖',
    '// 作用：先解绑购买键，再把它们绑定到本分类的武器上（键在所有分类间复用）',
    '',
  ];
  for (const k of normKeys) {
    if (k) lines.push(`unbind "${k}"`);
  }
  lines.push('');
  weapons.forEach((w, i) => {
    const k = normKeys[i];
    if (!k) return;
    lines.push(`bind "${k}" "${w.buy}"`);
  });
  return lines.join('\n') + '\n';
}

/** 清除 cfg：把 5 个购买键全部解绑（关轮盘时 exec，避免残余绑定影响正常游戏） */
function buildClearCfg(keys) {
  const lines = [
    '// OverplayHUD 购买轮盘 · 解绑所有购买键',
    '// 由设置自动生成，手动修改会在下次保存时被覆盖',
    '',
  ];
  for (const k of (Array.isArray(keys) ? keys : []).map(normKey)) {
    if (k) lines.push(`unbind "${k}"`);
  }
  return lines.join('\n') + '\n';
}

/** 生成全部 11 份 cfg（10 分类 + 1 清除），返回 [{ name, content }] */
function buildAll(bw) {
  const keys = (bw && Array.isArray(bw.keys)) ? bw.keys : [];
  const files = [{ name: CLEAR_NAME, content: buildClearCfg(keys) }];
  for (const team of ['CT', 'T']) {
    for (const c of CATEGORIES) {
      const ids = bw && bw.teams && bw.teams[team] ? bw.teams[team][c.id] : [];
      files.push({ name: cfgName(team, c.id), content: buildCfg(team, c.id, ids, keys) });
    }
  }
  return files;
}

/**
 * 用户手填的路径可能停在任意一层（cfg 目录 / csgo / game / CSGO 根 / steamapps / Steam 库根），
 * 统一归一到 CSGO 安装根（findGameRoots 的 manual 参数要求传根）。
 * 无法识别时原样返回，让 existsSync 自己判空。
 */
function normalizeRoot(p) {
  let dir = String(p || '').trim();
  if (!dir) return '';
  try { dir = path.resolve(dir); } catch (e) { /* 保持原样 */ }

  // 直接给了 cfg 目录（或更深的 csgo / game 层），逐级向上剥到根
  const base = path.basename(dir).toLowerCase();
  if (base === 'cfg') {
    dir = path.dirname(dir);
    if (path.basename(dir).toLowerCase() === 'csgo') dir = path.dirname(dir);
    if (path.basename(dir).toLowerCase() === 'game') dir = path.dirname(dir);
    return dir;
  }
  if (base === 'csgo' || base === 'game') {
    dir = path.dirname(dir);
    if (base === 'csgo' && path.basename(dir).toLowerCase() === 'game') dir = path.dirname(dir);
    return dir;
  }
  // 路径里含 CSGO 目录名 → 截到那一层
  const marker = 'counter-strike global offensive';
  const idx = dir.toLowerCase().indexOf(marker);
  if (idx >= 0) return dir.slice(0, idx + marker.length);
  // Steam 库根（含 steamapps 且 common 下有 CSGO）
  const common = path.join(dir, 'steamapps', 'common', 'Counter-Strike Global Offensive');
  if (fs.existsSync(common)) return common;
  return dir;
}

/**
 * 把 cfg 写进 CS2 的两个 cfg 目录（和 GSI cfg 同一套探测逻辑）。
 * @returns {{ copied: string[], failed: string[], roots: number }}
 */
function generateAll(bw, manualRoot) {
  const raw = manualRoot || (bw && bw.cfgDir) || '';
  const roots = raw ? [normalizeRoot(raw)] : findGameRoots();
  const files = buildAll(bw);
  const copied = [];
  const failed = [];

  for (const root of roots) {
    for (const dir of targets(root)) {
      if (!fs.existsSync(dir)) continue;
      for (const f of files) {
        try {
          fs.writeFileSync(path.join(dir, f.name), f.content, 'utf8');
          copied.push(path.join(dir, f.name));
        } catch (e) {
          failed.push(path.join(dir, f.name) + ' — ' + e.message);
        }
      }
    }
  }
  return { copied, failed, roots: roots.length, files: files.map((f) => f.name) };
}

/** 给渲染层 / 设置页用的纯展示目录（去掉内部字段也没必要，直接给全量即可） */
function publicCatalog() {
  return { categories: CATEGORIES, weapons: CATALOG };
}

module.exports = {
  CATEGORIES, CATALOG, CLEAR_NAME,
  catalogFor, byId, cfgName, normKey, normalizeRoot,
  buildCfg, buildClearCfg, buildAll, generateAll, publicCatalog,
};
