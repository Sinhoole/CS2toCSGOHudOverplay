'use strict';

/**
 * 进阶图标 · 设置页模块
 *
 * 由 src/settings/settings.js（重构前巨石）机械拆分而来，代码原样保留。
 * 依赖通过头部解构显式声明 —— 不依赖加载顺序之外的东西，也不往全局挂散名。
 */
;(function () {
  const { el } = globalThis.OphDOM;
  const { newCard, sectionHead } = globalThis.OphLayout;
  const { addIcon, ensureIcons, iconPreview } = globalThis.OphAdvElements;
  const { markDirty, rebuild, schedulePreview, toast } = globalThis.OphApp;
  const { newId } = globalThis.OphUtil;
  const { advMod } = globalThis.OphAdvBridge;
  const { readDataURL } = globalThis.OphMedia;
  const { state } = globalThis.OphCtx;


function buildAdvIconsSection(sec) {
  const wrap = el('div', 'section');
  wrap.dataset.section = sec.id;
  wrap.append(sectionHead('进阶配置 · 图标库',
    '攒一套自己的图标，播报 / 自定义元素都能引用。三种来源：内联 emoji、粘贴或上传 SVG、'
    + '以及手绘（去「进阶 · 画图」画好直接存进来）。'));

  ensureIcons();

  // ---- 新增：emoji / 文字 ----
  const c1 = newCard('新增 · emoji / 文字', '直接填一个字符，最简单');
  const emojiName = el('input', 'txt'); emojiName.type = 'text'; emojiName.placeholder = '图标名'; emojiName.style.flex = '0 0 150px';
  const emojiChar = el('input', 'txt'); emojiChar.type = 'text'; emojiChar.placeholder = '💀'; emojiChar.style.flex = '0 0 90px';
  const emojiPrev = el('span', 'icon-prev');
  emojiChar.addEventListener('input', () => { emojiPrev.textContent = emojiChar.value; });
  const addEmoji = el('button', 'btn primary', '加入图标库');
  addEmoji.addEventListener('click', () => {
    const t = emojiChar.value.trim();
    if (!t) { toast('先填一个 emoji / 字符', 'err'); return; }
    addIcon({ id: newId('ic'), name: emojiName.value.trim() || t, kind: 'text', text: t });
  });
  const row1 = el('div', 'search-row');
  row1.append(emojiName, emojiChar, emojiPrev, addEmoji);
  c1.body.append(row1);
  wrap.append(c1.card);

  // ---- 新增：粘贴 SVG ----
  const c2 = newCard('新增 · 粘贴 SVG',
    '把 SVG 源码粘进来。只保留图形本身，脚本 / 事件 / 外链会被丢弃。');
  const svgName = el('input', 'txt'); svgName.type = 'text'; svgName.placeholder = '图标名'; svgName.style.flex = '0 0 150px';
  const svgTa = document.createElement('textarea');
  svgTa.className = 'tpl';
  svgTa.placeholder = '<svg viewBox="0 0 24 24">…</svg>';
  const svgPrev = el('span', 'icon-prev-box');
  const addSvg = el('button', 'btn primary', '解析并加入');
  addSvg.addEventListener('click', () => {
    const A = advMod();
    if (typeof A.parseSVG !== 'function') { toast('解析模块没加载', 'err'); return; }
    const parsed = A.parseSVG(svgTa.value);
    if (!parsed.items.length) { toast('没解析出图形，检查一下 SVG', 'err'); return; }
    addIcon({ id: newId('ic'), name: svgName.value.trim() || 'SVG 图标', kind: 'draw',
      w: parsed.w, h: parsed.h, items: parsed.items });
  });
  svgTa.addEventListener('input', () => {
    const A = advMod();
    if (typeof A.parseSVG !== 'function') return;
    const parsed = A.parseSVG(svgTa.value);
    svgPrev.textContent = '';
    if (parsed.items.length && typeof A.shapeToSVG === 'function') {
      svgPrev.insertAdjacentHTML('beforeend', A.shapeToSVG({ w: parsed.w, h: parsed.h, items: parsed.items }, {}));
    }
  });
  const row2 = el('div', 'row');
  row2.style.display = 'block';
  row2.append(svgName, svgTa, svgPrev, addSvg);
  c2.body.append(row2);
  wrap.append(c2.card);

  // ---- 新增：上传文件 ----
  const c3 = newCard('新增 · 上传文件', '支持 .svg / .png / .jpg / .webp / .gif');
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.svg,image/svg+xml,image/png,image/jpeg,image/webp,image/gif';
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const A = advMod();
    const name = file.name.replace(/\.[^.]+$/, '');
    try {
      if (/\.svg$/i.test(file.name) || file.type === 'image/svg+xml') {
        const text = await file.text();
        const parsed = (typeof A.parseSVG === 'function') ? A.parseSVG(text) : { items: [] };
        if (!parsed.items.length) { toast('这个 SVG 没解析出图形', 'err'); return; }
        addIcon({ id: newId('ic'), name, kind: 'draw', w: parsed.w, h: parsed.h, items: parsed.items });
      } else if (/^image\//.test(file.type)) {
        const url = await readDataURL(file);
        if (!(A.safeDataURL && A.safeDataURL(url))) { toast('图片格式不支持', 'err'); return; }
        addIcon({ id: newId('ic'), name, kind: 'image', data: url });
      } else {
        toast('只支持 SVG 与图片文件', 'err');
      }
    } catch (e) {
      toast('读取失败：' + e.message, 'err');
    } finally {
      fileInput.value = '';
    }
  });
  c3.body.append(fileInput);
  wrap.append(c3.card);

  // ---- 图标列表 ----
  const c4 = newCard('图标库', state.cfg.icons.length ? `现有 ${state.cfg.icons.length} 个图标` : '还没有图标');
  if (!state.cfg.icons.length) {
    c4.body.append(el('div', 'empty-hint', '还没有图标。用上面任意一种方式加一个吧。'));
  }
  for (const ic of state.cfg.icons) {
    const row = el('div', 'icon-row');
    row.append(iconPreview(ic));

    const nameInp = el('input', 'txt');
    nameInp.type = 'text';
    nameInp.value = ic.name || '';
    nameInp.style.flex = '0 0 160px';
    nameInp.addEventListener('change', () => { ic.name = nameInp.value.trim() || ic.name; markDirty(); schedulePreview(); });

    const kindTag = el('span', 'tag', { text: '文字', draw: 'SVG', image: '图片' }[ic.kind] || ic.kind);
    const idTag = el('span', 'note', ic.id);

    const del = el('button', 'mini danger', '删除');
    del.addEventListener('click', () => {
      const idx = state.cfg.icons.indexOf(ic);
      if (idx >= 0) state.cfg.icons.splice(idx, 1);
      rebuild(); markDirty(); schedulePreview();
      toast('已删除图标', 'ok');
    });

    row.append(nameInp, kindTag, idTag, del);
    c4.body.append(row);
  }
  wrap.append(c4.card);

  return wrap;
}

  // 自注册：上架与否只由 sections/manifest.js 决定，这里不写死顺序
  globalThis.OphSections.register({
    id: "adv-icons", ico: "adv", name: "进阶图标",
    group: "basic",
    build: buildAdvIconsSection,
  });
  // ⚠️ 未列入 manifest → 不会加载。重新上架：在 manifest 里加一行即可。

  globalThis.OphAdvIcons = Object.assign(globalThis.OphAdvIcons || {}, {
    buildAdvIconsSection
  });
})();
