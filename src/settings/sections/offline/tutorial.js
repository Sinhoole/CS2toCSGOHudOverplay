'use strict';

/**
 * 教程 · 设置页模块
 *
 * 由 src/settings/settings.js（重构前巨石）机械拆分而来，代码原样保留。
 * 依赖通过头部解构显式声明 —— 不依赖加载顺序之外的东西，也不往全局挂散名。
 */
;(function () {
  const { el } = globalThis.OphDOM;
  const { sectionHead } = globalThis.OphLayout;
  const { toast } = globalThis.OphApp;
  const { mdToHtml } = globalThis.OphSecAbout;


function buildTutorialSection(sec) {
  const wrap = el('div', 'section');
  wrap.dataset.section = sec.id;
  wrap.append(sectionHead('教程',
    '一份中文使用说明，同时以 Markdown 文件（TUTORIAL.md）保存在程序目录里，可随时打开或分享。'));

  const bar = el('div', 'search-row');
  const openBtn = el('button', 'btn primary', '用系统程序打开 .md');
  openBtn.addEventListener('click', async () => {
    const r = await window.oph.openTutorial();
    toast(r.ok ? '已用系统默认程序打开教程' : '没找到默认打开方式，已在文件夹中定位', r.ok ? 'ok' : 'err');
  });
  const revealBtn = el('button', 'btn', '在文件夹中显示');
  revealBtn.addEventListener('click', () => window.oph.revealTutorial());
  const copyBtn = el('button', 'btn', '复制全文');
  copyBtn.addEventListener('click', async () => {
    const r = await window.oph.tutorial();
    if (!r.ok) { toast('读不到教程文件', 'err'); return; }
    await window.oph.copyText(r.text);
    toast('教程全文已复制到剪贴板', 'ok');
  });
  bar.append(openBtn, revealBtn, copyBtn);
  wrap.append(bar);

  const pathNote = el('div', 'note', '');
  wrap.append(pathNote);

  const doc = el('div', 'md-doc');
  doc.append(el('div', 'empty-hint', '正在载入教程…'));
  wrap.append(doc);

  window.oph.tutorial().then((r) => {
    doc.textContent = '';
    pathNote.textContent = r.path || '';
    if (!r.ok) {
      doc.append(el('div', 'empty-hint', '读不到教程文件：' + (r.error || '未知错误')));
      return;
    }
    const base = r.path ? String(r.path).replace(/[\\/][^\\/]*$/, '') : '';
    doc.innerHTML = mdToHtml(r.text, base);
  }).catch((e) => {
    doc.textContent = '';
    doc.append(el('div', 'empty-hint', '载入失败：' + e.message));
  });

  return wrap;
}

  // 自注册：上架与否只由 sections/manifest.js 决定，这里不写死顺序
  globalThis.OphSections.register({
    id: "tutorial", ico: "tutorial", name: "教程",
    group: "tools",
    build: buildTutorialSection,
  });
  // ⚠️ 未列入 manifest → 不会加载。重新上架：在 manifest 里加一行即可。

  globalThis.OphSecTutorial = Object.assign(globalThis.OphSecTutorial || {}, {
    buildTutorialSection
  });
})();
