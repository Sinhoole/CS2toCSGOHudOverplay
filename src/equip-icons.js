/**
 * equip-icons.js —— 武器 / 刀 / 投掷物 SVG 图标加载与归一化。
 *
 * 只给主进程（Node）用：读 asstes/icons/equipment 下用户提供的 SVG，
 * 归一化成「可被 CSS 用 currentColor 上色」的安全剪影，再交给渲染层。
 *
 * ⚠️ 绝不裸注入：先 normalizeSvg 剥离 script/foreignObject/style/defs/use/animate，
 *    并把所有 fill 强制成 currentColor，渲染层才能按「选中/未选中」换色。
 *
 * 写成 UMD：Node 走 module.exports，浏览器挂 globalThis.OphEquip（设置页不需要直接 require，
 * 图标 map 走 IPC 下发；这里挂全局只为 selftest 能直接引用）。
 */
(function () {
  'use strict';

  // 刀型 SVG 文件名（与 asstes/icons/equipment 一一对应，共 26 种）
  const KNIFE_FILES = [
    'bayonet.svg', 'knife.svg', 'knife_bowie.svg', 'knife_butterfly.svg', 'knife_canis.svg',
    'knife_cord.svg', 'knife_css.svg', 'knife_falchion.svg', 'knife_flip.svg', 'knife_gut.svg',
    'knife_gypsy_jackknife.svg', 'knife_karambit.svg', 'knife_kukri.svg', 'knife_m9_bayonet.svg',
    'knife_outdoor.svg', 'knife_push.svg', 'knife_skeleton.svg', 'knife_stiletto.svg',
    'knife_survival_bowie.svg', 'knife_t.svg', 'knife_tactical.svg', 'knife_twinblade.svg',
    'knife_ursus.svg', 'knife_widowmaker.svg', 'knifegg.svg', 'melee.svg',
  ];

  // 投掷物 id（来自 weapon-names.js 的 grenadeOf）→ SVG 文件名
  // ⚠️ 燃烧弹 / 燃烧瓶的 id 都是 'flame'，统一用 incgrenade.svg 剪影
  const GRENADE_ICON = {
    flame: 'incgrenade.svg',
    smoke: 'smokegrenade.svg',
    flash: 'flashbang.svg',
    he: 'hegrenade.svg',
    decoy: 'decoy.svg',
  };

  function isKnife(name) {
    if (!name) return false;
    return /^weapon_knife/.test(name)
      || /bayonet/.test(name)
      || name === 'weapon_melee'
      || name === 'weapon_knifegg';
  }

  /** GSI 武器内部名 → SVG 文件名（去 weapon_ 前缀 + .svg；c4 特例） */
  function weaponToIconName(name) {
    if (!name) return '';
    let n = String(name).replace(/^weapon_/, '');
    if (n === 'c4') return 'c4.svg';
    return n + '.svg';
  }

  function grenadeIdToIcon(id) {
    return GRENADE_ICON[id] || '';
  }

  /**
   * 归一化单条 SVG：
   *  - 去 <?xml ?> / 注释 / script / defs / foreignObject / style / metadata / title / desc / image / use / animate / set
   *  - 去 width/height（交给 CSS 定尺寸）
   *  - 所有 fill 强制 currentColor（剪影只取一种颜色，便于按状态换色）
   *  - 根 <svg> 若没有 fill，补一个
   */
  function normalizeSvg(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return '';
    let s = raw
      .replace(/<\?xml[\s\S]*?\?>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, '')
      .replace(/<\s*defs[\s\S]*?<\s*\/\s*defs\s*>/gi, '')
      .replace(/<\s*(?:foreignObject|style|metadata|title|desc|image|use|animate|set)\b[\s\S]*?(?:<\s*\/\s*\1\s*>|\/>)/gi, '')
      .replace(/\s+(?:width|height)\s*=\s*("(?:[^"]*)"|'(?:[^']*)')/gi, '');

    s = s.replace(/\bfill\s*=\s*("(?:[^"]*)"|'(?:[^']*)')/gi, 'fill="currentColor"');

    if (!/\bfill\s*=/.test(s)) {
      s = s.replace(/(<svg\b[^>]*?)>/i, '$1 fill="currentColor">');
    }
    return s.trim();
  }

  const hasRequire = typeof require !== 'undefined';
  const fs = hasRequire ? require('fs') : null;
  const pathMod = hasRequire ? require('path') : null;

  /**
   * 读目录，返回 { files: { 文件名: 归一化SVG }, names: [文件名] }。
   * 目录不存在 / 读不到时返回空对象（不抛错，HUD 端会跳过缺失图标）。
   */
  function loadEquipIcons(dir) {
    const out = { files: {}, names: [] };
    if (!fs || !dir) return out;
    let entries = [];
    try { entries = fs.readdirSync(dir); } catch (e) { return out; }
    for (const f of entries) {
      if (!/\.svg$/i.test(f)) continue;
      try {
        const raw = fs.readFileSync(pathMod.join(dir, f), 'utf8');
        out.files[f] = normalizeSvg(raw);
        out.names.push(f);
      } catch (e) { /* 跳过坏文件 */ }
    }
    return out;
  }

  const api = {
    KNIFE_FILES, GRENADE_ICON,
    isKnife, weaponToIconName, grenadeIdToIcon, normalizeSvg, loadEquipIcons,
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof globalThis === 'object') globalThis.OphEquip = api;
})();
