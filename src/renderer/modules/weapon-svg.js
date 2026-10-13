'use strict';

/**
 * weapon-svg · 武器栏（纯色剪影图标态）
 *
 * 由 src/renderer/hud.js（重构前巨石，1665 行）机械拆分而来，正文逐字保留。
 * 共享可变状态走 C（globalThis.OphHudCtx），纯函数走 K（globalThis.OphHudKit）。
 * 想加/删这块功能：改 src/renderer/hud-manifest.js 里的一行即可。
 */
;(function () {
  const C = globalThis.OphHudCtx;
  const K = globalThis.OphHudKit;

  let svgSlotEls = [];
  let weaponBarSvgEl = null;
  /** 每帧渲染：快照到达时由宿主分发调用 */
  function render(s) {
  renderWeaponBarSvg(s);
  }

/**
 * 武器栏 SVG 态：纯色剪影图标，与文字态并存（由各自开关控制）。
 * 图标来自主进程预归一化的 equipIconMap（文件名 → SVG 字符串）。
 */
function renderWeaponBarSvg(s) {
  if (!weaponBarSvgEl || !svgSlotEls.length) return;

  const wl = (C.currentCfg.modules && C.currentCfg.modules.weaponList) || {};
  const svg = wl.svg || {};
  const on = wl.svgMode === true;
  weaponBarSvgEl.style.display = on ? '' : 'none';
  if (!on) return;

  const icons = svg.icons || {};
  const knives = svg.knives || {};
  const slotNames = svg.slotNames || {};
  const showName = svg.showName !== false;
  const list = s.slots || [];

  // 行内名称：选中时显示武器名（.act，吃辉光），否则显示该栏的常显名称（.pin，低调）
  const setName = (el, text, kind) => {
    const nEl = el.querySelector('.wl-name');
    if (!nEl) return;
    const t = text || '';
    if (nEl.textContent !== t) nEl.textContent = t;
    nEl.classList.toggle('on', !!t);
    nEl.classList.toggle('act', !!t && kind === 'act');
    nEl.classList.toggle('pin', !!t && kind === 'pin');
  };

  svgSlotEls.forEach((el, i) => {
    // 每槽位独立辉光颜色：设了就用它，留空则回落全局 --wl-svg-glow-color
    const gc = (svg.glowColors && svg.glowColors[i + 1]) || '';
    if (el.dataset.glowColor !== gc) {
      el.dataset.glowColor = gc;
      if (gc) el.style.setProperty('--wl-svg-glow-color', gc);
      else el.style.removeProperty('--wl-svg-glow-color');
    }

    // 每槽位独立剪影颜色：设了就用它，留空则回落全局 --wl-svg-color
    const sc = (svg.colors && svg.colors[i + 1]) || '';
    if (el.dataset.silColor !== sc) {
      el.dataset.silColor = sc;
      if (sc) el.style.setProperty('--wl-svg-color', sc);
      else el.style.removeProperty('--wl-svg-color');
    }

    const info = list[i];
    const isGrenade = info && info.slot === 4;
    const empty = !info || (isGrenade ? (info.chars || []).length === 0 : !info.name);
    const pinName = slotNames[i + 1] || '';

    // 有常显名称的槽位即使空着也留着（那一行就是个固定标签）
    el.classList.toggle('empty', empty && !pinName);
    el.classList.toggle('active', !!info && !!info.active && !isGrenade);

    if (isGrenade) {
      el.classList.toggle('active', !!info && !!info.active);
      const ids = (info && info.ids) || [];
      const activeIndex = (info && typeof info.activeIndex === 'number') ? info.activeIndex : -1;

      // 只给当前手持的那一颗显示名字（闪光弹 / 诱饵弹…），其余不显示
      let gName = '';
      if (showName && activeIndex >= 0) {
        gName = K.weaponLabel({
          name: (info.names || [])[activeIndex] || '',
          label: (info.labels || [])[activeIndex] || '',
        });
      }
      // 手持那颗的名字贴在「它自己的图标下方」（.nade > .nname），
      // 所以槽位级 .wl-name 只在「没有手持投掷物」时用来显示常显名称。
      setName(el, gName ? '' : pinName, 'pin');

      const g = el.querySelector('.grenades');
      if (!g) return;
      const sig = ids.join(',') + '|' + activeIndex + '|' + (icons[4] || '') + '|' + gName;
      if (g.dataset.sig === sig) return;   // 没变就不重建，避免每帧 innerHTML 闪烁
      g.dataset.sig = sig;
      g.innerHTML = '';
      ids.forEach((id, gi) => {
        const file = icons[4] ? icons[4] : K.grenadeIconFile(id);
        const svgStr = C.equipIconMap[file] || '';
        // 每颗投掷物各自一个小盒子：图标在上、名字在下（只有手持那颗有名字）
        const wrap = document.createElement('div');
        wrap.className = 'nade';
        const d = document.createElement('div');
        d.className = 'ico' + (gi === activeIndex ? ' hot' : '');
        if (svgStr) d.innerHTML = svgStr;
        wrap.appendChild(d);
        const nm = document.createElement('span');
        nm.className = 'nname';
        if (gi === activeIndex && gName) {
          nm.textContent = gName;
          nm.classList.add('on', 'act');
        }
        wrap.appendChild(nm);
        g.appendChild(wrap);
      });
      return;
    }

    const ico = el.querySelector('.ico');
    if (!ico) return;
    const name = info ? info.name : '';
    const activeName = (showName && info && info.active && name) ? K.weaponLabel(info) : '';
    setName(el, activeName || pinName, activeName ? 'act' : 'pin');

    let file = '';
    if (icons[i]) file = icons[i];
    else if (K.isKnifeName(name)) file = knives[name] || K.weaponIconFile(name);
    else file = K.weaponIconFile(name);

    if (ico.dataset.file !== file) {
      ico.dataset.file = file;
      ico.innerHTML = C.equipIconMap[file] || '';
    }
  });
}

  svgSlotEls = Array.from(document.querySelectorAll('#weaponBarSvg .slot'));
  weaponBarSvgEl = document.getElementById('weaponBarSvg');

  globalThis.OphHud.register({ id: 'weaponSvg', render });
})();
