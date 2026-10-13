/**
 * version.js —— 版本号解析与比较（更新公告页用）。
 *
 * 需求：公告正文里可能出现多个 Vx.x.x，需要挑出**最大**的那个，
 * 再与本地版本比较，判断是「存在可更新内容 / 已更新至最新版本 / 已更新至预览版本」。
 *
 * ⚠️ 只认带 V / v 前缀的版本号。
 *    页面里 `1.7.11`、`1.6` 这类多是资源或样式版本（在 URL、属性里），
 *    不带前缀一律不算，否则会取到一个和程序无关的更大数字。
 *
 * 写成 UMD：Node 走 module.exports，浏览器挂 globalThis.OphVersion。
 */
(function () {
  'use strict';

  // 前后不限，中间要 V 前缀 + 至少两段数字（如 V2.2 / V2.2.0 / V2.2.0.1）
  const SCAN = /[Vv](\d+(?:\.\d+){1,3})/g;

  const toParts = (s) => String(s).split('.').map((x) => parseInt(x, 10) || 0);

  /** 把单个版本串解析成 { text, parts }；不是版本号返回 null。可带可不带 V 前缀。 */
  function parse(str) {
    const m = /^[Vv]?(\d+(?:\.\d+){1,3})$/.exec(String(str == null ? '' : str).trim());
    if (!m) return null;
    return { text: 'V' + m[1], parts: toParts(m[1]) };
  }

  /** 从一段文本里按出现顺序抽出所有版本号（同一版本只留一次）。 */
  function extract(text) {
    const out = [];
    const seen = new Set();
    const s = String(text == null ? '' : text);
    SCAN.lastIndex = 0;
    let m;
    while ((m = SCAN.exec(s))) {
      const text_ = 'V' + m[1];
      if (seen.has(text_)) continue;
      seen.add(text_);
      out.push({ text: text_, parts: toParts(m[1]) });
    }
    return out;
  }

  /** 比较两个版本：a 小返回 -1，相等 0，a 大返回 1。段数不齐按 0 补。 */
  function cmp(a, b) {
    const pa = (a && a.parts) || [];
    const pb = (b && b.parts) || [];
    const n = Math.max(pa.length, pb.length);
    for (let i = 0; i < n; i += 1) {
      const x = pa[i] || 0;
      const y = pb[i] || 0;
      if (x !== y) return x > y ? 1 : -1;
    }
    return 0;
  }

  /** 文本里最大的那个版本；一个都没有返回 null。 */
  function maxVersion(text) {
    let best = null;
    for (const v of extract(text)) if (!best || cmp(v, best) > 0) best = v;
    return best;
  }

  const LABEL = {
    outdated: '存在可更新内容',
    latest: '已更新至最新版本',
    ahead: '已更新至预览版本',
    unknown: '无法判断版本',
  };

  /**
   * 比较本地版本与公告文本。
   * @returns {{status:'outdated'|'latest'|'ahead'|'unknown', label:string,
   *            local:object|null, latest:object|null, cmp:number}}
   */
  function check(localVersion, text) {
    const local = parse(localVersion);
    const latest = maxVersion(text);
    if (!local || !latest) {
      return { status: 'unknown', label: LABEL.unknown, local, latest, cmp: 0 };
    }
    const c = cmp(local, latest);
    const status = c < 0 ? 'outdated' : (c > 0 ? 'ahead' : 'latest');
    return { status, label: LABEL[status], local, latest, cmp: c };
  }

  const API = { parse, extract, cmp, maxVersion, check, LABEL, SCAN };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  globalThis.OphVersion = API;
})();
