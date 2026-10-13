'use strict';

/**
 * 文字替换 · 设置页模块
 *
 * 由 src/settings/settings.js（重构前巨石）机械拆分而来，代码原样保留。
 * 依赖通过头部解构显式声明 —— 不依赖加载顺序之外的东西，也不往全局挂散名。
 */
;(function () {
  const { el } = globalThis.OphDOM;
  const { fieldRow, freeText, newCard, sectionHead } = globalThis.OphLayout;
  const { commit, state } = globalThis.OphCtx;
  const { getPath, setPath } = globalThis.OphPath;
  const { markDirty, rebuild, schedulePreview, toast } = globalThis.OphApp;


function buildTextSection(sec) {
  const wrap = el('div', 'section');
  wrap.dataset.section = sec.id;
  wrap.append(sectionHead('文字替换', '修改界面上显示的文字。留空则使用内置默认值，不影响判定逻辑。'));

  // ---- 投掷物单字 ----
  const g = newCard('投掷物单字', '顺位固定为 火 → 烟 → 雷 → 闪 → 诱，修改文字不改变顺位。');
  for (const k of state.grenadeKinds) {
    g.body.append(fieldRow(k.label, freeText(
      () => getPath(state.cfg, `text.grenadeChars.${k.id}`) ?? k.char,
      (v) => commit(`text.grenadeChars.${k.id}`, v),
      { placeholder: k.char, width: 96 },
    )));
  }
  g.body.append(fieldRow('分隔符', freeText(
    () => getPath(state.cfg, 'text.grenadeSep') ?? '・',
    (v) => commit('text.grenadeSep', v),
    { placeholder: '・', width: 96 },
  )));
  wrap.append(g.card);

  // ---- 比分面板标签 ----
  const l = newCard('比分面板标签', '顶部比分面板显示的文字。');
  const labelFields = [
    ['存活', 'alive', '存活'],
    ['CT 阵营', 'ct', 'CT'],
    ['T 阵营', 't', 'T'],
  ];
  for (const [name, key, def] of labelFields) {
    l.body.append(fieldRow(name, freeText(
      () => getPath(state.cfg, `text.labels.${key}`) ?? def,
      (v) => commit(`text.labels.${key}`, v),
      { placeholder: def, width: 150 },
    )));
  }
  wrap.append(l.card);

  // ---- 武器名 ----
  wrap.append(buildWeaponNamesCard());

  return wrap;
}
function buildWeaponNamesCard() {
  const { card, body } = newCard('武器名称', '左列为 GSI 内部名，中列为当前名称，右列填写自定义显示名。');

  const srow = el('div', 'search-row');
  const search = el('input', 'txt');
  search.type = 'text';
  search.placeholder = '搜索武器（内部名或显示名）…';
  const resetAll = el('button', 'mini', '全部恢复默认');
  resetAll.addEventListener('click', () => {
    setPath(state.cfg, 'text.weaponNames', {});
    rebuild();
    markDirty();
    schedulePreview();
    toast('武器名已全部恢复默认', 'ok');
  });
  srow.append(search, resetAll);
  body.append(srow);

  const list = el('div', 'wlist');
  const rows = [];

  for (const [key, def] of Object.entries(state.weaponNames)) {
    const map = getPath(state.cfg, 'text.weaponNames') || {};
    const row = el('div', 'wrow');

    const cur = el('div', 'wcur', map[key] || def);

    const inp = el('input', 'txt');
    inp.type = 'text';
    inp.value = map[key] || '';
    inp.placeholder = def;

    const clr = el('button', 'wclear', '清除');
    clr.classList.toggle('hidden', !map[key]);

    const sync = () => {
      const next = Object.assign({}, getPath(state.cfg, 'text.weaponNames') || {});
      const v = inp.value.trim();
      if (v) next[key] = v; else delete next[key];
      setPath(state.cfg, 'text.weaponNames', next);
      cur.textContent = v || def;
      clr.classList.toggle('hidden', !v);
      markDirty();
      schedulePreview();
    };

    inp.addEventListener('input', sync);
    clr.addEventListener('click', () => { inp.value = ''; sync(); });

    row.append(el('div', 'wkey', key === '_knife' ? '匕首（所有刀具）' : key), cur, inp, clr);
    list.append(row);
    rows.push({ row, key, def });
  }

  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    for (const r of rows) {
      const hit = !q || r.key.toLowerCase().includes(q) || r.def.toLowerCase().includes(q);
      r.row.classList.toggle('hidden', !hit);
    }
  });

  body.append(list);
  return card;
}

  // 自注册：上架与否只由 sections/manifest.js 决定，这里不写死顺序
  globalThis.OphSections.register({
    id: "text", ico: "text", name: "文字替换",
    group: "basic",
    build: buildTextSection,
  });
})();
