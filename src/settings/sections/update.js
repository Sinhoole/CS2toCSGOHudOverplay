'use strict';

/**
 * 更新公告 · 设置页模块
 *
 * 由 src/settings/settings.js（重构前巨石）机械拆分而来，代码原样保留。
 * 依赖通过头部解构显式声明 —— 不依赖加载顺序之外的东西，也不往全局挂散名。
 */
;(function () {
  const { el } = globalThis.OphDOM;
  const { sectionHead } = globalThis.OphLayout;
  const { state } = globalThis.OphCtx;
  const { buildSection } = globalThis.OphApp;


const CHANGELOG_URL = 'https://blog.taoxi.ink/p/202610131828/';
/** 相对地址 → 绝对地址；非 http(s) 一律拒绝（javascript: / data: 之类直接不给） */
function absHttpUrl(u, base) {
  if (!u) return '';
  try {
    const abs = new URL(String(u).trim(), base || CHANGELOG_URL).toString();
    return /^https?:\/\//i.test(abs) ? abs : '';
  } catch (_) { return ''; }
}
// 允许保留的标签；清单之外的一律「剥壳留字」。
// 这样博客以后改版加了奇怪的东西，也不会把脚本 / 表单 / 内嵌框架带进来。
const UP_KEEP = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'UL', 'OL', 'LI',
  'BLOCKQUOTE', 'PRE', 'CODE', 'HR', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'DEL',
  'A', 'IMG', 'FIGURE', 'FIGCAPTION', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD',
  'SPAN', 'DIV', 'DL', 'DT', 'DD', 'SUP', 'SUB', 'MARK', 'KBD']);
const UP_DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT',
  'BUTTON', 'TEXTAREA', 'SELECT', 'LINK', 'META', 'SVG', 'CANVAS', 'VIDEO', 'AUDIO', 'BASE']);
/** 按白名单把节点树复制进当前文档（只留 href / src / alt / title 这几个属性） */
function upClone(node, doc, base) {
  const out = [];
  for (const n of Array.from(node.childNodes)) {
    if (n.nodeType === 3) { out.push(doc.createTextNode(n.nodeValue)); continue; }
    if (n.nodeType !== 1) continue;                          // 注释 / 处理指令全丢
    const tag = n.tagName;
    if (UP_DROP.has(tag)) continue;
    const kids = upClone(n, doc, base);
    if (!UP_KEEP.has(tag)) { out.push(...kids); continue; }  // 剥壳留字
    const e = doc.createElement(tag.toLowerCase());
    if (tag === 'A') {
      const href = absHttpUrl(n.getAttribute('href'), base);
      if (href) {
        e.setAttribute('href', href);
        e.setAttribute('rel', 'noreferrer noopener');
      }
    } else if (tag === 'IMG') {
      const src = absHttpUrl(n.getAttribute('src'), base);
      if (!src) continue;                                    // 不安全的图直接丢
      e.setAttribute('src', src);
      e.setAttribute('alt', n.getAttribute('alt') || '');
      e.setAttribute('loading', 'lazy');
    }
    for (const k of kids) e.appendChild(k);
    out.push(e);
  }
  return out;
}
/** 从公告页 HTML 里挖出标题 / 元信息 / 正文三段 */
function parseChangelog(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const titleEl = doc.querySelector('.post-title') || doc.querySelector('article h1') || doc.querySelector('h1');
  const metaEl = doc.querySelector('.post-meta');
  const bodyEl = doc.querySelector('.post-content') || doc.querySelector('.md-content')
    || doc.querySelector('article') || doc.body;

  const title = titleEl ? titleEl.textContent.trim() : '';
  const meta = metaEl ? metaEl.textContent.replace(/\s+/g, ' ').trim() : '';

  const holder = document.createElement('div');
  if (bodyEl) for (const n of upClone(bodyEl, document, CHANGELOG_URL)) holder.appendChild(n);
  return { title, meta, node: holder };
}
function buildUpdateSection(sec) {
  const wrap = el('div', 'section');
  wrap.dataset.section = sec.id;
  wrap.append(sectionHead('更新公告'));

  const card = el('div', 'card');
  const head = el('div', 'card-head');
  const box = el('div');
  box.append(el('div', 'card-title', '最新公告'));
  head.append(box);
  card.append(head);

  const body = el('div', 'card-body');
  const verBox = el('div', 'up-ver');
  verBox.hidden = true;
  const doc = el('div', 'up-doc');
  body.append(verBox, doc);
  card.append(body);
  wrap.append(card);

  let loaded = false;
  let loading = false;

  // 本地版本只在第一次用到时取一次（appInfo 是本地 IPC，很便宜但仍不重复调）
  let localVer = null;
  async function getLocalVersion() {
    if (localVer !== null) return localVer;
    try {
      const i = await window.oph.appInfo();
      localVer = (i && i.ok && i.version) || '';
    } catch (e) {
      localVer = '';
    }
    return localVer;
  }

  const showState = (cls, title, detail, retry) => {
    verBox.hidden = true;          // 没内容就没版本状态
    doc.innerHTML = '';
    const st = el('div', 'up-state' + (cls ? ' ' + cls : ''));
    st.append(el('div', 'up-state-t', title));
    if (detail) st.append(el('div', 'up-state-d', detail));
    if (retry) {
      const b = el('button', 'btn', '再试一次');
      b.addEventListener('click', () => load(true));
      st.append(b);
    }
    doc.append(st);
  };

  // 版本状态条：本地版本 vs 公告里最大的那个版本
  const paintVer = (vres) => {
    if (!vres || vres.status === 'unknown') { verBox.hidden = true; return; }
    verBox.hidden = false;
    verBox.className = 'up-ver ' + vres.status;
    verBox.textContent = '';
    verBox.append(el('div', 'up-ver-t', vres.label));
    verBox.append(el('div', 'up-ver-d',
      '本地 v' + String(vres.local.text).replace(/^V/, '') + '  ·  公告 ' + vres.latest.text));
  };

  const paint = (data, localVersion) => {
    const parsed = parseChangelog(data.html);
    doc.textContent = '';
    const art = el('div', 'up-article');
    if (parsed.title) art.append(el('h1', 'up-title', parsed.title));
    const bits = [];
    if (parsed.meta) bits.push(parsed.meta);
    if (bits.length) art.append(el('div', 'up-meta', bits.join('  ·  ')));
    if (data.stale) art.append(el('div', 'up-badge', '当前显示的是上一次获取的内容'));
    art.append(parsed.node);
    doc.append(art);

    // 只扫正文的文本内容（textContent 不含标签属性），
    // 免得把资源 / 样式里的版本号当成程序版本。
    const V = globalThis.OphVersion;
    if (V) paintVer(V.check(localVersion, art.textContent));
    else verBox.hidden = true;
  };

  async function load(force) {
    if (loading) return;
    loading = true;
    if (!loaded) showState('', '正在获取公告…', '');
    let r = null;
    try {
      r = await window.oph.changelog(!!force);
    } catch (e) {
      r = { ok: false, error: (e && e.message) || String(e) };
    }
    loading = false;
    if (!r || !r.ok) {
      showState('err', '公告获取失败',
        (r && r.error) || '请检查网络连接后重试。',
        true);
      return;
    }
    loaded = true;
    paint(r, await getLocalVersion());
  }

  // 正文里的链接一律丢给系统浏览器 —— 绝不能让设置窗口自己跳走（跳走就回不来了）
  doc.addEventListener('click', (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    e.preventDefault();
    window.oph.openExternal(a.getAttribute('href'));
  });

  // 懒加载：只有真正切到这一页才联网。
  // 注意 buildSection 会在启动时把所有页都建出来，不懒加载就等于「一开设置就发请求」。
  wrap._onActivate = () => { if (!loaded && !loading) load(false); };

  return wrap;
}

  // 自注册：上架与否只由 sections/manifest.js 决定，这里不写死顺序
  globalThis.OphSections.register({
    id: "update", ico: "update", name: "更新公告",
    group: "home",
    build: buildUpdateSection,
  });
})();
