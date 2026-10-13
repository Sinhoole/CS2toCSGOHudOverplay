'use strict';

/**
 * money · 金钱与变动提示
 *
 * 由 src/renderer/hud.js（重构前巨石，1665 行）机械拆分而来，正文逐字保留。
 * 共享可变状态走 C（globalThis.OphHudCtx），纯函数走 K（globalThis.OphHudKit）。
 * 想加/删这块功能：改 src/renderer/hud-manifest.js 里的一行即可。
 */
;(function () {
  const C = globalThis.OphHudCtx;
  const K = globalThis.OphHudKit;

  let lastDeltaSeq = 0;
  const deltaTimers = { reward: [], spend: [] };
  /** 每帧渲染：快照到达时由宿主分发调用 */
  function render(s) {
  C.nodes.money.textContent = K.formatMoney(s.money);

  // 金钱变动提示：同一次变动只弹一次（refresh 会重复推送同一份快照）
  const delta = s.moneyDelta;
  if (delta && delta.seq !== lastDeltaSeq) {
    lastDeltaSeq = delta.seq;
    showMoneyDelta(delta.amount < 0 ? 'spend' : 'reward', delta.amount);
  }
  }

/**
 * 金钱变动提示。
 *
 * 扣除行走主金额下方、奖励行走主金额上方，两者互不干扰，各自最多一行。
 * 连续触发时直接覆盖刷新当前那一行，不叠加多行。
 *
 * @param {'spend'|'reward'} kind
 * @param {number} amount 带符号的变动值
 */
function showMoneyDelta(kind, amount) {
  const isReward = kind === 'reward';
  const wrap = isReward ? C.nodes.rewardWrap : C.nodes.spendWrap;
  const line = isReward ? C.nodes.rewardLine : C.nodes.spendLine;
  const amt = isReward ? C.nodes.rewardAmt : C.nodes.spendAmt;

  for (const t of deltaTimers[kind]) clearTimeout(t);
  deltaTimers[kind] = [];

  amt.textContent = K.formatMoney(Math.abs(amount));

  // 已经在显示就只刷新数字，不重播出现动画（避免闪一下）
  const alreadyOn = wrap.classList.contains('is-on');
  line.classList.remove('is-out');
  wrap.classList.add('is-on');
  if (!alreadyOn || !line.classList.contains('is-in')) {
    line.classList.remove('is-in');
    void line.offsetWidth;            // 强制回流，让过渡重新开始
    line.classList.add('is-in');
  }

  deltaTimers[kind].push(setTimeout(() => {
    line.classList.remove('is-in');
    line.classList.add('is-out');
    deltaTimers[kind].push(setTimeout(() => {
      wrap.classList.remove('is-on');
      line.classList.remove('is-out');
    }, C.moneyFadeMs));
  }, C.moneyHoldMs));
}

  globalThis.OphHud.register({
    id: 'money',
    render,
    reset() { lastDeltaSeq = 0; deltaTimers.reward.length = 0; deltaTimers.spend.length = 0; },
  });
})();
