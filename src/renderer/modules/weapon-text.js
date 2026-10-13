'use strict';

/**
 * weapon-text · 武器栏（纯文字态）
 *
 * 由 src/renderer/hud.js（重构前巨石，1665 行）机械拆分而来，正文逐字保留。
 * 共享可变状态走 C（globalThis.OphHudCtx），纯函数走 K（globalThis.OphHudKit）。
 * 想加/删这块功能：改 src/renderer/hud-manifest.js 里的一行即可。
 */
;(function () {
  const C = globalThis.OphHudCtx;
  const K = globalThis.OphHudKit;

  let slotEls = [];
  let prevGrenades = [];
  let prevGrenadeSep = '';
  /** 每帧渲染：快照到达时由宿主分发调用 */
  function render(s) {
  // ---- 右侧武器栏 ----
  renderWeaponBar(s);
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
      textEl.textContent = empty ? '' : K.weaponLabel(info);
    }
  });
}

/**
 * 投掷物：按「火・烟・雷・闪・诱」顺位拼接，缺失的直接跳过、分隔符自动增减。
 * 新出现的单字淡入；消失的整串重排（分隔符会自动补位）。
 */
function renderGrenadeText(el, info) {
  el.classList.add('grenades');

  const chars = K.grenadeCharsOf(info || {});
  const sep = C.textMap.grenadeSep == null ? '・' : C.textMap.grenadeSep;
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
  const gs = el.querySelectorAll('.gchar');
  for (let i = 0; i < C.nodes.length; i++) {
    gs[i].classList.toggle('hot', i === activeIndex);
  }
}

  slotEls = Array.from(document.querySelectorAll('#weaponBar .slot'));

  globalThis.OphHud.register({
    id: 'weaponText',
    render,
    apply() { prevGrenades = []; },   // 文本改了要整串重绘
  });
})();
