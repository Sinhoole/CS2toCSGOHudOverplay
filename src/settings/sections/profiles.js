'use strict';

/**
 * 配置方案 · 设置页模块
 *
 * 由 src/settings/settings.js（重构前巨石）机械拆分而来，代码原样保留。
 * 依赖通过头部解构显式声明 —— 不依赖加载顺序之外的东西，也不往全局挂散名。
 */
;(function () {
  const { el } = globalThis.OphDOM;
  const { newCard, sectionHead } = globalThis.OphLayout;
  const { rebuild, toast } = globalThis.OphApp;
  const { state } = globalThis.OphCtx;


function buildProfilesSection(sec) {
  const wrap = el('div', 'section');
  wrap.dataset.section = sec.id;
  wrap.append(sectionHead('配置方案',
    '将整套设置保存为本地方案并随时切换。方案为 config.json 的完整快照，'
    + '存放于配置目录的 profiles 文件夹中。'));

  // ---- 保存当前 ----
  const c1 = newCard('把当前配置存成方案', '以已保存的配置为准；存在未保存改动时请先点击底部「保存」。');
  const nameInp = el('input', 'txt');
  nameInp.type = 'text';
  nameInp.placeholder = '方案名称';
  nameInp.style.flex = '0 0 200px';
  const noteInp = el('input', 'txt');
  noteInp.type = 'text';
  noteInp.placeholder = '备注（可留空）';
  const saveBtn = el('button', 'btn primary', '保存为新方案');
  saveBtn.addEventListener('click', async () => {
    const name = nameInp.value.trim();
    if (!name) { toast('请先填写方案名', 'err'); return; }
    const r = await window.oph.profiles.saveAs(name, noteInp.value.trim());
    if (!r.ok) { toast(r.error || '保存失败', 'err'); return; }
    nameInp.value = '';
    noteInp.value = '';
    renderList(r.list, r.active);
    toast('已保存方案「' + name + '」', 'ok');
  });
  const row1 = el('div', 'row');
  row1.append(nameInp, noteInp, saveBtn);
  c1.body.append(row1);
  wrap.append(c1.card);

  // ---- 方案列表 ----
  const c2 = newCard('已有方案', '「启用」将用该方案覆盖当前配置（会重写 config.json）。');
  const listBody = el('div', 'card-body');
  c2.body = listBody;
  c2.card.append(listBody);
  wrap.append(c2.card);

  const renderList = (list, active) => {
    listBody.textContent = '';
    if (!list || !list.length) {
      listBody.append(el('div', 'empty-hint', '暂无方案。'));
      return;
    }
    for (const p of list) {
      const row = el('div', 'prof-row' + (p.active ? ' on' : ''));
      const info = el('div', 'prof-info');
      const title = el('div', 'prof-name');
      title.append(el('span', null, p.name));
      if (p.active) title.append(el('span', 'tag on', '当前'));
      if (p.builtin) title.append(el('span', 'tag', '内置'));
      info.append(title);
      const meta = [];
      if (p.note) meta.push(p.note);
      if (p.savedAt) meta.push('保存于 ' + String(p.savedAt).slice(0, 16).replace('T', ' '));
      info.append(el('div', 'prof-meta', meta.join('　·　') || '—'));
      row.append(info);

      const acts = el('div', 'prof-acts');
      const useBtn = el('button', 'btn primary', p.active ? '重新应用' : '启用');
      useBtn.addEventListener('click', async () => {
        if (!confirm('确认用方案「' + p.name + '」覆盖当前配置？\n\n当前 config.json 将被重写。')) return;
        const r = await window.oph.profiles.apply(p.name);
        if (!r.ok) { toast(r.error || '切换失败', 'err'); return; }
        state.cfg = r.cfg;
        state.dirty = false;
        document.getElementById('dirty').hidden = true;
        rebuild();
        window.oph.preview(state.cfg);
        toast('已切换到「' + p.name + '」', 'ok');
      });
      const ovBtn = el('button', 'btn', '用当前配置覆盖');
      ovBtn.addEventListener('click', async () => {
        if (!confirm('用当前配置覆盖方案「' + p.name + '」？')) return;
        const r = await window.oph.profiles.update(p.name);
        if (!r.ok) { toast(r.error || '覆盖失败', 'err'); return; }
        renderList(r.list, r.active);
        toast('已覆盖「' + p.name + '」', 'ok');
      });
      const rnBtn = el('button', 'btn', '重命名');
      rnBtn.addEventListener('click', async () => {
        const nn = prompt('新名称：', p.name);
        if (nn == null) return;
        const r = await window.oph.profiles.rename(p.name, nn.trim());
        if (!r.ok) { toast(r.error || '重命名失败', 'err'); return; }
        renderList(r.list, r.active);
        toast('已重命名', 'ok');
      });
      const delBtn = el('button', 'btn danger', '删除');
      delBtn.addEventListener('click', async () => {
        if (!confirm('删除方案「' + p.name + '」？此操作不可撤销。')) return;
        const r = await window.oph.profiles.remove(p.name);
        if (!r.ok) { toast(r.error || '删除失败', 'err'); return; }
        renderList(r.list, r.active);
        toast('已删除', 'ok');
      });
      acts.append(useBtn, ovBtn, rnBtn, delBtn);
      row.append(acts);
      listBody.append(row);
    }
  };

  const dirNote = el('div', 'home-note', '');
  window.oph.profiles.list().then((r) => {
    dirNote.textContent = '方案目录：' + (r.dir || '—');
    renderList(r.list, r.active);
  }).catch(() => {});

  wrap.append(dirNote);
  return wrap;
}

  // 自注册：上架与否只由 sections/manifest.js 决定，这里不写死顺序
  globalThis.OphSections.register({
    id: "profiles", ico: "profiles", name: "配置方案",
    group: "tools",
    build: buildProfilesSection,
  });
})();
