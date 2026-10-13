'use strict';

/**
 * preview · 预览窗口顶部的工具条（仅 ?preview=1 时生效）
 *
 * 由 src/renderer/hud.js（重构前巨石，1665 行）机械拆分而来，正文逐字保留。
 * 共享可变状态走 C（globalThis.OphHudCtx），纯函数走 K（globalThis.OphHudKit）。
 * 想加/删这块功能：改 src/renderer/hud-manifest.js 里的一行即可。
 */
;(function () {
  const C = globalThis.OphHudCtx;
  const K = globalThis.OphHudKit;

  let pvEvSeq = 0;           // 试播报用的假事件 id 序号
function initPreviewBar() {
  document.body.classList.add('preview-mode');

  const pvNote = K.$('pvNote');
  const pvSay = (t) => { if (pvNote) pvNote.textContent = t || ''; };

  // ---- 暂停 / 继续：只冻结画面，模拟数据继续在跑 ----
  const btnPause = K.$('pvPause');
  if (btnPause) {
    btnPause.addEventListener('click', () => {
      C.pvPaused = !C.pvPaused;
      btnPause.textContent = C.pvPaused ? '▶ 继续' : '⏸ 暂停';
      btnPause.classList.toggle('on', C.pvPaused);
      pvSay(C.pvPaused ? '已暂停（画面冻结）' : '');
      if (!C.pvPaused && C.pvLastSnap) {
        C.pending = C.pvLastSnap;
        globalThis.OphHud.render(C.pending);
      }
    });
  }

  // ---- 重播 / 跳到某个阶段：交给主进程重启模拟时间线 ----
  const btnRestart = K.$('pvRestart');
  if (btnRestart) {
    btnRestart.addEventListener('click', () => {
      previewCmd('restart', 0);
      pvSay('时间线已归零');
    });
  }
  for (const b of document.querySelectorAll('[data-pv-seek]')) {
    b.addEventListener('click', () => {
      const t = Number(b.getAttribute('data-pv-seek')) || 0;
      previewCmd('seek', t);
      pvSay(`已跳到第 ${t} 秒`);
    });
  }

  // ---- 试播报：直接压进播报队列，立刻能看到图标 / 弯曲 / 抖动 / 震动 ----
  for (const b of document.querySelectorAll('[data-pv-ev]')) {
    b.addEventListener('click', () => firePreviewEvent(b.getAttribute('data-pv-ev')));
  }

  // 预览窗口可以随意缩放 —— 尺寸变了重新映射一次（相当于换了一台显示器）
  window.addEventListener('resize', () => {
    if (!C.currentCfg) return;
    globalThis.OphHudViewport.applyBounds(C.currentCfg, globalThis.OphHudViewport.previewAwareBounds(null));
    globalThis.OphHudAppearance.applyEffects(C.currentCfg);
  });
}
/** 给主进程发一条预览命令（preload 里暴露的 previewCmd） */
function previewCmd(cmd, arg) {
  if (C.BRIDGE && typeof C.BRIDGE.previewCmd === 'function') C.BRIDGE.previewCmd(cmd, arg);
}

  /** 时间线重置后要把「播报基线」清掉，否则新一轮的击杀会被当成旧事件吞掉 */
  if (typeof C.BRIDGE.onPreviewReset === 'function') {
    C.BRIDGE.onPreviewReset(() => {
      globalThis.OphHud.reset();
      if (C.nodes.eventLayer) C.nodes.eventLayer.textContent = '';
      const n = K.$('pvNote');
      if (n) n.textContent = '时间线已归零';
    });
  }

/**
 * 试播报：强制播一条，不受「该类是否勾选」影响 —— 这里的目的就是看外观。
 * 走的是和真实播报完全相同的那条渲染路径，所以看到的即为实际效果。
 */
function firePreviewEvent(kind) {
  const k = K.PV_EV_TEXT[kind] ? kind : 'kill';
  const conf = Object.assign({}, (C.eventsCfg && C.eventsCfg[k]) || {});
  conf.on = true;
  if (!conf.text) conf.text = K.PV_EV_TEXT[k];
  pvEvSeq += 1;
  globalThis.OphHudEvents.enqueueEvent({ kind: k, ev: { id: 1e9 + pvEvSeq, value: k === 'multi' ? 3 : 1 }, conf });
}

  if (C.PREVIEW) initPreviewBar();

  globalThis.OphHudPreview = { firePreviewEvent };
})();
