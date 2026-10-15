'use strict';

/**
 * ammo · 弹药与连杀骷髅徽章
 *
 * 由 src/renderer/hud.js（重构前巨石，1665 行）机械拆分而来，正文逐字保留。
 * 共享可变状态走 C（globalThis.OphHudCtx），纯函数走 K（globalThis.OphHudKit）。
 * 想加/删这块功能：改 src/renderer/hud-manifest.js 里的一行即可。
 */
;(function () {
  const C = globalThis.OphHudCtx;
  const K = globalThis.OphHudKit;

  let prevKills = 0;
  let badgeEls = [];
  /** 每帧渲染：快照到达时由宿主分发调用 */
  function render(s) {
  // ---- 弹药 ----
  // 未持枪（空手 / 只有刀）时子弹栏隐去，但只是「看不见」，占位仍在（见 ammo.css 的
  // .gun-off），所以右边的击杀栏不会跟着滑动 —— 两栏相互独立。
  //
  // ⚠️ 这里只挂 gun-off，绝不碰 .off：.off 归配置开关（data-show="ammo"）所有，
  //    两边都 toggle 同一个类会互相覆盖，结果是「关掉弹药开关后又自己冒出来」。
  const w = s.weapon;
  const hasGun = !!w && w.clip != null;
  if (C.nodes.ammoBlock) C.nodes.ammoBlock.classList.toggle('gun-off', !hasGun);

  if (hasGun) {
    C.nodes.clip.textContent = w.clip;
    C.nodes.reserve.textContent = w.reserve == null ? '' : w.reserve;
    C.nodes.clip.classList.toggle('is-empty', w.clip === 0);   // 空弹匣转红
  }

  // ---- 子弹装饰带：射击滚动 · 低弹量转红 · 滚动模糊 ----
  renderBullets(s, w, hasGun);

  // ---- 连杀骷髅：每击杀 1 人加 1 枚，最多 5 枚，死亡清空 ----
  renderKills(s);
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

  C.nodes.killsBlock.classList.toggle('off', C.showFlags.roundKills === false || n === 0);
  prevKills = n;
}

/* ================================================================
 * 子弹装饰带
 *
 * 每颗持有一个「相位」 --k（见 ammo.css）：
 *   -1        左侧预位（屏外，等待滑入）
 *   0 … 4     五个可见槽位
 *   > 4       已从右侧掉出（屏外）
 *
 * 装饰颗数恒为 min(5, clip) 且「靠右排布」，占槽位 (5−n) … 4。
 * 于是「弹药 ≤ 阈值时只掉不补、左端空出」不需要任何额外状态 —— 数量就等于 clip。
 *
 * 一次滚动的角色分配（delta = 本帧掉的发数，d = min(delta, 5)）：
 *   nOld  = 当前可见数
 *   kept  = max(0, nOld − d)      保留颗：相位 + d
 *   out   = nOld − kept           掉出颗：相位 + d，同时淡出
 *   fill  = max(0, nNew − kept)   补入颗：−1 → 槽位 (5−nNew) … (5−kept−1)
 *
 * 位置与淡入淡出全部走 Web Animations API：动画的 from/to 是写死的像素值，
 * 与 CSS 里的 --k 解耦，所以随时可以 cancel 而不会留下状态残留。
 * ⚠️ 约定：撤销动画之前必须先把 --k 写成动画终值，否则撤销瞬间会闪回。
 * ================================================================ */

  const BELT_SLOTS = 5;        // 可见槽位数
  const BELT_STEP = 13;        // 单格步进 px @scale=1（15px 宽 − 2px 重叠）
  const BELT_EASE = 'cubic-bezier(0.33, 0, 0.67, 1)';
  const BELT_FILL_MS = 140;    // 换弹补入：单颗时长
  const BELT_FILL_GAP = 40;    // 换弹补入：相邻颗间隔上限

  /** 每颗：{ el, p }。p 为相位，取值见上方注释 */
  const belt = [];
  let beltClip = null;      // 上一次的弹匣数（null = 尚未拿到 → 下一次落位不播动画）
  let beltWeapon = null;    // 上一次的武器名（变了 = 切枪 → 直接落位）
  let beltBlurTimer = 0;    // 模糊撤销定时器；每次滚动重置 → 连续扫射时模糊持续

  function ammoCfg() {
    const M = C.currentCfg && C.currentCfg.modules;
    return (M && M.ammo) || {};
  }

  function ammoNum(v, d) {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  }

  /** 减少动态偏好：与 CSS 里 prefers-reduced-motion 的处理保持一致（不做补间、不加模糊）。
   *  用户开启「忽略系统减少动态」（hud.ignoreReducedMotion）时视为不需要减少。 */
  function prefersReduce() {
    if (C.forceMotion) return false;
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }

  function beltStep() {
    return BELT_STEP * (Number(C.scale) || 1);
  }

  /** 某相位对应的位移关键帧（必须与 ammo.css 里 --k 的算式一致：13px × scale 一格） */
  function beltKey(k, step) {
    return 'translateX(' + (k * step) + 'px) rotate(20deg)';
  }

  /**
   * 直接落位（无动画）。相位 −1 或 > 4 都在屏外，一律透明。
   * ⚠️ 单颗显隐用 opacity 而不是 visibility：未持枪时父级 .gun-off 用的是 visibility，
   *    子元素再写 visibility 会把它盖掉，导致「空手时子弹还留着」。
   */
  function placeBullet(b, p) {
    if (b.p === p) return;                 // 相位没变就不重写 inline 样式
    b.p = p;
    b.el.style.setProperty('--k', String(p));
    b.el.style.opacity = (p < 0 || p >= BELT_SLOTS) ? '0' : '';
  }

  /** 撤掉所有在飞动画。相位已是终值，所以画面不会闪。 */
  function settleBelt() {
    for (const b of belt) {
      for (const a of b.el.getAnimations()) {
        try { a.cancel(); } catch (e) { /* 已被撤销，忽略 */ }
      }
    }
  }

  /** 无动画整体落位：n 颗靠右排，其余回预位 */
  function layoutBelt(n) {
    settleBelt();
    const base = BELT_SLOTS - n;
    belt.forEach((b, i) => {
      placeBullet(b, i < n ? base + i : -1);
    });
  }

  function visibleCount() {
    return belt.reduce((k, b) => (b.p >= 0 && b.p < BELT_SLOTS ? k + 1 : k), 0);
  }

  /** 空闲池：预位（−1）与已掉出（> 4）都在屏外，都可以直接拿来补入 */
  function idleBullets() {
    return belt.filter((b) => b.p < 0 || b.p >= BELT_SLOTS);
  }

  /**
   * 滚动模糊：整条弹带一起糊掉，停下即恢复清晰。
   * 每次滚动都重置同一只定时器 → 连续扫射期间类一直挂着，模糊持续存在。
   */
  function flashBeltBlur(ms) {
    const box = C.nodes.bulletsBox;
    if (!box) return;
    if (ammoNum(ammoCfg().bulletRollBlur, 1.1) <= 0) return;   // 0 = 关闭
    if (beltBlurTimer) clearTimeout(beltBlurTimer);
    box.classList.add('is-rolling');
    beltBlurTimer = setTimeout(() => {
      beltBlurTimer = 0;
      box.classList.remove('is-rolling');
    }, ms + 20);
  }

  function clearBeltBlur() {
    if (beltBlurTimer) { clearTimeout(beltBlurTimer); beltBlurTimer = 0; }
    if (C.nodes.bulletsBox) C.nodes.bulletsBox.classList.remove('is-rolling');
  }

  /** 滚动时长：单发用基准；一帧多发时压缩（每多一发 −12ms，下限 70ms），避免动画积压滞后 */
  function beltRollMs(delta) {
    const base = Math.max(0, ammoNum(ammoCfg().bulletRollMs, 110));
    return delta <= 1 ? base : Math.max(70, base - (delta - 1) * 12);
  }

  /** 低弹量转红：整条弹带换色，与弹匣数字转红同一个道理 */
  function syncLow() {
    const box = C.nodes.bulletsBox;
    if (!box) return;
    const thr = ammoNum(ammoCfg().lowAmmoThreshold, 5);
    box.classList.toggle('is-low', beltClip !== null && beltClip <= thr);
  }

  /** 射击滚动：整条带右移 delta 格 */
  function rollBelt(delta, nNew) {
    settleBelt();

    const actives = belt.filter((b) => b.p >= 0 && b.p < BELT_SLOTS).sort((a, b) => a.p - b.p);
    const nOld = actives.length;
    const d = Math.min(Math.max(1, delta | 0), BELT_SLOTS);
    const kept = Math.max(0, nOld - d);
    const fill = Math.max(0, nNew - kept);

    if (ammoCfg().bulletRoll === false || prefersReduce()) { layoutBelt(nNew); return; }

    const step = beltStep();
    const ms = beltRollMs(d);
    const opts = { duration: ms, easing: BELT_EASE, fill: 'both' };

    // ⚠️ 空闲池必须在改相位之前取：掉出颗的相位会被写成 > 4，那之后它们也会被算成「空闲」，
    //    同一颗元素就既掉出又补入，位置彻底乱套。
    const pool = idleBullets().slice(0, fill);

    // 保留颗：整体右移 d 格（相位先写成终值，动画被撤销也不会闪回）
    for (const b of actives.slice(0, kept)) {
      const from = b.p;
      const to = from + d;
      placeBullet(b, to);
      b.el.animate([{ transform: beltKey(from, step) }, { transform: beltKey(to, step) }], opts);
    }

    // 掉出颗：右移出界 + 淡出。终态透明，所以撤掉动画也看不见。
    for (const b of actives.slice(kept)) {
      const from = b.p;
      const to = from + d;
      placeBullet(b, to);
      b.el.animate([{ transform: beltKey(from, step), opacity: 1 },
                    { transform: beltKey(to, step), opacity: 0 }], opts);
    }

    // 补入颗：从左侧预位滑进保留颗左边的空档（槽位 5−nNew … 5−kept−1）
    const start = BELT_SLOTS - nNew;
    pool.forEach((b, i) => {
      const slot = start + i;
      placeBullet(b, slot);
      b.el.animate([{ transform: beltKey(-1, step), opacity: 0 },
                    { transform: beltKey(slot, step), opacity: 1 }], opts);
    });

    flashBeltBlur(ms);
  }

  /** 换弹补入：clip 增加时从左侧逐颗滑入（单颗 140ms，错峰间隔封顶 40ms） */
  function fillBelt(nNew) {
    settleBelt();

    const nOld = visibleCount();
    const fill = Math.max(0, nNew - nOld);
    if (fill === 0) return;   // 可见数没变（例如 20 → 25 都是满 5 颗），不动

    if (ammoCfg().bulletRoll === false || prefersReduce()) { layoutBelt(nNew); return; }

    const step = beltStep();
    const start = BELT_SLOTS - nNew;
    const gap = fill > 1 ? Math.min(BELT_FILL_GAP, Math.floor((400 - BELT_FILL_MS) / (fill - 1))) : 0;

    const pool = idleBullets().slice(0, fill);
    pool.forEach((b, i) => {
      const slot = start + i;
      placeBullet(b, slot);
      b.el.animate([{ transform: beltKey(-1, step), opacity: 0 },
                    { transform: beltKey(slot, step), opacity: 1 }],
                   { duration: BELT_FILL_MS, delay: i * gap, easing: BELT_EASE, fill: 'both' });
    });
  }

  /**
   * 子弹带的每帧入口。
   * 闸门（与既有约定一致）：
   *   · 无枪 / 死亡        → 装饰清零并撤掉模糊
   *   · 武器名变化（切枪） → 视为重置，直接落位不播动画
   *   · clip 减少          → 射击滚动
   *   · clip 增加          → 换弹逐颗补入
   * ⚠️ clip 缺失表示「本帧未下发」而非「归零」，此时沿用上次值不做任何事。
   */
  function renderBullets(s, w, hasGun) {
    if (!belt.length) return;

    if (!hasGun || !(s.health > 0)) {
      if (beltClip !== null || visibleCount() > 0) {
        beltClip = null;
        layoutBelt(0);
      }
      beltWeapon = w ? w.name : null;
      clearBeltBlur();
      syncLow();
      return;
    }

    const clip = Math.max(0, w.clip | 0);
    const cap = Math.min(BELT_SLOTS, clip);

    if (w.name !== beltWeapon || beltClip === null) {   // 切枪 / 首次拿到数据 → 落位
      beltWeapon = w.name;
      beltClip = clip;
      clearBeltBlur();
      layoutBelt(cap);
      syncLow();
      return;
    }

    if (clip !== beltClip) {
      if (clip < beltClip) rollBelt(beltClip - clip, cap);
      else fillBelt(cap);
      beltClip = clip;
    }
    syncLow();
  }

  Array.from(document.querySelectorAll('#bulletsBox > svg')).forEach((el) => {
    el.style.opacity = '0';                      // 初始全部透明，等落位
    belt.push({ el, p: -1 });
  });
  layoutBelt(BELT_SLOTS);                        // 与重构前的静态 5 颗观感一致；首帧快照到达后按实际 clip 修正

  badgeEls = Array.from(document.querySelectorAll('#killsBlock .badge'));

  globalThis.OphHud.register({
    id: 'ammo',
    render,
    reset() {
      prevKills = 0;
      beltClip = null;
      beltWeapon = null;
      clearBeltBlur();
      settleBelt();
      syncLow();
    },
  });
})();
