'use strict';

/**
 * events · 击杀 / 死亡播报（含进阶外观、HUD 抖动、手柄震动）
 *
 * 由 src/renderer/hud.js（重构前巨石，1665 行）机械拆分而来，正文逐字保留。
 * 共享可变状态走 C（globalThis.OphHudCtx），纯函数走 K（globalThis.OphHudKit）。
 * 想加/删这块功能：改 src/renderer/hud-manifest.js 里的一行即可。
 */
;(function () {
  const C = globalThis.OphHudCtx;
  const K = globalThis.OphHudKit;

  let lastEventId = 0;
  let evInited = false;      // 第一份快照只建立基线，不补播历史事件
  let evPlaying = false;
  const evQueue = [];
  let curveSeq = 0;          // 弯字 SVG 的路径 id 计数器（一页里多条会并存，必须唯一）
  let devEventFired = false;
  /** 每帧渲染：快照到达时由宿主分发调用 */
  function render(s) {
  // ---- 击杀 / 死亡播报 ----
  renderEvents(s);
  maybeFireDevEvent(s);
  }

// ============================================================
// 击杀 / 死亡播报
// ============================================================



/**
 * 开发截图专用：--shot-event=<kind> 时，第一份快照到达后强制播一条播报，
 * 这样没有真实击杀事件也能截到「进阶外观」长什么样。生产运行不会带 devEvent。
 */
function maybeFireDevEvent(s) {
  if (!C.devEventKind || devEventFired) return;
  if (C.eventsCfg.enabled === false) return;
  devEventFired = true;
  const kind = K.EV_PRIORITY.indexOf(C.devEventKind) >= 0 ? devEventKind : 'kill';
  const conf = Object.assign({ on: true, text: '测试播报  +1', color: '#A6D94A' }, C.eventsCfg[kind] || {});
  enqueueEvent({ kind, ev: { id: 1e9, value: 3 }, conf });
}

function renderEvents(s) {
  if (!C.eventsCfg.enabled) return;

  const list = Array.isArray(s.events) ? s.events : [];

  // 第一份快照只记基线：这时候游戏里可能已经有 14 次击杀了，
  // 不能把它们当成「刚刚发生」一次性全播出来。
  if (!evInited) {
    evInited = true;
    lastEventId = list.length ? list[list.length - 1].id : 0;
    return;
  }
  if (!list.length) return;

  const fresh = list.filter((e) => e.id > lastEventId);
  lastEventId = Math.max(lastEventId, list[list.length - 1].id);
  if (!fresh.length) return;

  const pick = pickEvent(fresh);
  if (pick) enqueueEvent(pick);
}

function pickEvent(fresh) {
  for (const kind of K.EV_PRIORITY) {
    const conf = C.eventsCfg[kind];
    if (!conf || conf.on === false) continue;
    const ev = fresh.find((e) => e.kind === kind);
    if (ev) return { kind, ev, conf };
  }
  return null;
}

function enqueueEvent(pick) {
  evQueue.push(pick);
  if (evQueue.length > 3) evQueue.shift();   // 只留最近三条，别积压
  if (!evPlaying) playNextEvent();
}

function playNextEvent() {
  const item = evQueue.shift();
  if (!item) {
    evPlaying = false;
    return;
  }
  evPlaying = true;

  const layer = C.nodes.eventLayer;
  const el = document.createElement('div');
  el.className = 'ev-item a-' + (C.eventsCfg.anchor || 'tc');
  el.style.setProperty('--ev-size', String(Number(C.eventsCfg.fontSize) || 30));
  el.style.setProperty('--ev-color', item.conf.color || '#FFFFFF');
  el.style.setProperty('--ev-x', `${Number(C.eventsCfg.offsetX) || 0}px`);
  el.style.setProperty('--ev-y', `${Number(C.eventsCfg.offsetY) || 0}px`);
  el.style.setProperty('--ev-fade', `${Math.max(0, Number(C.eventsCfg.fadeMs) || 240)}ms`);

  // 播报文字也走 {变量} 插值：连杀那条用的是「触发时刻」的本回合击杀数，
  // 不能用当前快照 —— 排队播放时快照可能已经翻到下一回合了。
  const src = Object.assign({}, C.pending || {}, { roundKills: item.ev.value });
  const text = K.fillTemplate(item.conf.text || '', src, { weaponLabel: K.weaponLabel, textMap: C.textMap });

  // ---- 进阶外观：只有总开关打开、本模块加载成功、且该类没被关掉时才走 ----
  // 否则走下面这条「和以前一模一样」的基础路径，保证默认零变化、可回退。
  const advOn = !!(C.advCfg && C.advCfg.enabled && C.OPH_ADV
    && typeof C.OPH_ADV.resolveKind === 'function');
  const R = advOn ? C.OPH_ADV.resolveKind(C.advCfg, item.kind) : null;
  const useAdv = advOn && R && R.enabled;

  if (useAdv) {
    buildAdvEvent(el, text, R, item.conf);
    layer.textContent = '';       // 串行播放，一次只留一条
    layer.appendChild(el);
    runAdvEvent(el, R, item.conf);
  } else {
    el.textContent = text;
    layer.textContent = '';
    layer.appendChild(el);
    void el.offsetWidth;          // 强制回流，让过渡重新开始
    el.classList.add('is-on');
  }

  const hold = useAdv
    ? Math.max(200, Number(R.holdMs) || 1500)
    : Math.max(200, Number(C.eventsCfg.holdMs) || 1500);
  const fade = useAdv
    ? Math.max(0, Number(R.outDur) || 240)
    : Math.max(0, Number(C.eventsCfg.fadeMs) || 240);

  setTimeout(() => {
    if (useAdv && el.animate) {
      try {
        el.animate([{ opacity: 1 }, { opacity: 0 }],
          { duration: fade, easing: 'ease-out', fill: 'forwards' });
      } catch (e) { el.classList.remove('is-on'); }
    } else {
      el.classList.remove('is-on');
    }
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
      playNextEvent();
    }, fade);
  }, hold);
}

/**
 * 组好进阶外观的 DOM：图标 + 文字（或弯字 SVG）。
 * 位置/锚点仍由基础段的 CSS 类负责，这里只管「内容长什么样」。
 */
function buildAdvEvent(el, text, R, conf) {
  el.classList.add('ev-adv', 'is-on');
  el.style.setProperty('--ev-weight', String(R.weight));
  el.style.setProperty('--ev-ls', `${R.letterSpacing}em`);
  el.style.setProperty('--ev-gap', `${Math.max(0, R.iconGap)}px`);
  el.style.setProperty('--ev-icon-size', String(R.iconSize));
  if (R.italic) el.classList.add('ev-italic');
  if (R.outlineOn) {
    el.classList.add('ev-outline');
    el.style.setProperty('--ev-ol-w', `${Math.max(0, R.outlineWidth)}px`);
    el.style.setProperty('--ev-ol-c', R.outlineColor || '#000000');
  }
  if (R.iconSide === 'right') el.classList.add('ev-ico-right');

  const ico = K.makeIconNode(R.icon, R.iconRef);
  if (ico) el.appendChild(ico);

  if (R.curveOn && C.OPH_ADV && typeof C.OPH_ADV.buildCurveSVG === 'function') {
    const id = 'evp' + (++curveSeq);
    el.insertAdjacentHTML('beforeend', C.OPH_ADV.buildCurveSVG(
      text, Object.assign({ color: conf.color || '#FFFFFF', fontSize: C.eventsCfg.fontSize }, R), id,
    ));
  } else {
    const txt = document.createElement('span');
    txt.className = 'ev-txt';
    txt.textContent = text;
    el.appendChild(txt);
  }
}



/** 播放：入场缩放 / 停留脉冲 / HUD 抖动 / 手柄震动。全部用原生 API，失败静默。 */
function runAdvEvent(el, R, conf) {
  if (el.animate) {
    // 入场：透明 + 缩放。用独立的 `scale` 属性（而非 transform），
    // 这样不会覆盖锚点类里用来居中的 transform: translate(-50%, -50%)。
    const inKf = [{ opacity: 0 }];
    if (Math.abs(R.inScale - 1) > 0.001) inKf[0].scale = String(R.inScale);
    inKf.push({ opacity: 1, scale: '1' });
    try {
      el.animate(inKf, {
        duration: Math.max(1, R.inDur),
        easing: C.OPH_ADV.easingOf(R.inEase),
      });
    } catch (e) { /* 忽略 */ }

    // 停留脉冲（"大小会不会变化"）
    if (R.pulseOn && Math.abs(R.pulseTo - 1) > 0.001) {
      const iter = R.pulseRepeat < 0 ? Infinity : Math.max(1, Math.floor(R.pulseRepeat));
      try {
        el.animate([{ scale: '1' }, { scale: String(R.pulseTo) }, { scale: '1' }], {
          duration: Math.max(60, R.pulseDur),
          iterations: iter,
          easing: 'ease-in-out',
          delay: Math.max(0, R.inDur),
        });
      } catch (e) { /* 忽略 */ }
    }
  }

  if (R.shakeOn) shakeHud(R.shakeAmp, R.shakeDur, R.shakeAxis);
  if (R.rumbleOn) rumbleGamepad(R.rumbleStrong, R.rumbleWeak, R.rumbleDur);
}

/**
 * HUD 抖动。用独立的 `translate` 属性播放，**不动 transform** ——
 * fill 模式给根元素设了 scale 的 transform，动它会把整个 HUD 弄歪。
 */
function shakeHud(amp, dur, axis) {
  const a = Math.max(0, Number(amp) || 0);
  if (!a || !C.root || !C.root.animate) return;
  const N = 8;
  const kf = [];
  for (let i = 0; i <= N; i++) {
    const k = i / N;
    const decay = 1 - k;                       // 末尾收敛，避免残留偏移
    const wave = Math.sin(k * Math.PI * 6);
    const dx = axis === 'y' ? 0 : a * wave * decay;
    const dy = axis === 'x' ? 0 : a * Math.sin(k * Math.PI * 6 + 1.1) * decay;
    kf.push({ translate: `${dx.toFixed(2)}px ${dy.toFixed(2)}px` });
  }
  try { C.root.animate(kf, { duration: Math.max(60, dur), easing: 'ease-out' }); } catch (e) { /* 忽略 */ }
}

/**
 * 手柄震动。走浏览器原生 Gamepad API 的 vibrationActuator ——
 * 由浏览器直接驱动手柄，**不经过游戏、不注入任何输入**（VAC 底线）。
 * 浏览器通常要求先有一次「用户手势」才允许震动，所以按了没反应时先用一下手柄。
 */
function rumbleGamepad(strong, weak, dur) {
  try {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    for (const p of pads) {
      if (!p || !p.vibrationActuator || typeof p.vibrationActuator.playEffect !== 'function') continue;
      const d = Math.max(40, Math.floor(Number(dur) || 160));
      Promise.resolve(p.vibrationActuator.playEffect('dual-rumble', {
        startDelay: 0,
        duration: d,
        weakMagnitude: Math.min(1, Math.max(0, Number(weak) || 0)),
        strongMagnitude: Math.min(1, Math.max(0, Number(strong) || 0)),
      })).catch(() => {});
    }
  } catch (e) { /* 没有手柄 / 不支持时静默 */ }
}

  globalThis.OphHud.register({
    id: 'events',
    render,
    reset() { evInited = false; lastEventId = 0; evQueue.length = 0; evPlaying = false; },
  });

  // 预览模块要直接往队列里压一条试播报
  globalThis.OphHudEvents = { enqueueEvent, playNextEvent };
})();
