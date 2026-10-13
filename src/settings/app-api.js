'use strict';

/**
 * app-api · 宿主接口（早加载层）
 *
 * 为什么单独一个文件：拆分出来的页面模块与控件在**加载期**就解构了
 * `globalThis.OphApp` 上的东西（`const { markDirty } = OphApp`），所以这个对象
 * 必须在它们之前存在。而宿主自己（app.js）要等所有页面注册完才能初始化 ——
 * 于是把「接口」和「启动」分成两层：
 *
 *   app-api.js   先加载：导航、建页、标脏、状态条、toast —— 全是页面模块要用的
 *   app.js       后加载：读配置、挂功能、绑按钮、boot()
 *
 * 本文件里所有对其它命名空间的访问都写在函数体内（调用时才查），
 * 这样它就能排在任何 UI 库之前，不会因为加载顺序踩空。
 */
;(function () {
  const TAG = '[settings:app-api]';

  // ============================================================
  // 模块目录（HUD 各模块的展示名与说明）
  // ============================================================

  const MODULES = [
    { key: 'scoreboard', ico: 'ct',     name: '顶部比分面板', hint: '屏幕顶部居中：CT 块 / 时间+比分 / T 块' },
    { key: 'money',      ico: 'money',  name: '金钱',        hint: '左侧信息组，位于血量护甲上方' },
    { key: 'vitals',     ico: 'vitals', name: '血量 / 护甲',  hint: '左下角，含血量槽与护甲槽' },
    { key: 'ammo',       ico: 'ammo',   name: '弹药 / 连杀',  hint: '右下角，含连杀、弹匣/备弹与子弹' },
    { key: 'weaponList', ico: 'weapon', name: '武器栏（文字态）', hint: '右侧 1–5 号槽位，纯文字方案' },
    { key: 'roster',     ico: 'roster', name: '名单面板',     hint: '队友 / 对手的血量、武器、KDA —— 只有死亡观战时才有数据' },
  ];

  // 侧边导航分组。顺序 = 界面顺序；没写 group 的分区一律归入 basic
  const NAV_GROUPS = [
    { id: 'home',     label: '总览' },
    { id: 'basic',    label: '基础配置' },
    { id: 'tools',    label: '工具与帮助' },
  ];

  // ============================================================
  // 标脏 / 状态 / 提示
  // ============================================================

  function setStatus(text, cls) {
    const s = document.getElementById('status');
    if (!s) return;
    s.textContent = text || '';
    s.className = 'status' + (cls ? ' ' + cls : '');
  }

  let toastTimer = 0;
  function toast(msg, cls) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show' + (cls ? ' ' + cls : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast' + (cls ? ' ' + cls : ''); }, 1900);
  }

  function markDirty() {
    if (globalThis.OphCtx) globalThis.OphCtx.state.dirty = true;
    const d = document.getElementById('dirty');
    if (d) d.hidden = false;
    setStatus('存在未保存的改动');
  }

  let previewTimer = 0;
  /** 改动后延迟 70ms 才推预览：拖动滑杆时别把 IPC 打满 */
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      const st = globalThis.OphCtx?.state;
      if (st && window.oph) window.oph.preview(st.cfg);
    }, 70);
  }

  // ============================================================
  // 建页
  // ============================================================

  /**
   * 一个分区 → 一个 DOM 节点。
   * 三种页面形态：自绘（sec.build）/ 纯 schema（fields、colors、alphas）/ 两者的组合。
   */
  function buildSection(sec) {
    const { el } = globalThis.OphDOM;
    if (typeof sec.build === 'function') return sec.build(sec);

    const UI = globalThis.OphLayout;
    const Controls = globalThis.OphControls;
    const Schema = globalThis.OphSchema;
    const Cards = globalThis.OphModuleCards;

    const wrap = el('div', 'section');
    wrap.dataset.section = sec.id;

    const mod = MODULES.find((m) => m.key === sec.module);

    // ---- 标题 ----
    const title = el('div', 'card');
    const th = el('div', 'card-head');
    const tb = el('div');
    tb.append(el('div', 'card-title', sec.name));
    if (mod) tb.append(el('div', 'card-hint', mod.hint));
    th.append(tb);
    title.append(th);
    wrap.append(title);

    // ---- 位置 / 大小 / 旋转 ----
    if (mod) wrap.append(Cards.transformCard(mod));

    // ---- 配色（colors 走色板，alphas 走滑杆）----
    const colorFields = [
      ...(sec.colors || []).map((c) => ({ type: 'color', label: c.label, path: c.path, withAlpha: !!c.withAlpha })),
      ...(sec.alphas || []).map((a) => ({ type: 'num', label: a.label, path: a.path, min: 0, max: 1, step: 0.01 })),
    ];
    if (colorFields.length) {
      const card = el('div', 'card');
      const head = el('div', 'card-head');
      head.append(el('div', 'card-title', '配色'));
      card.append(head);
      const body = el('div', 'card-body');
      for (const f of colorFields) {
        // 统一走类型注册表：以后加新控件类型，这里一行都不用改
        body.append(UI.fieldRow(f.label, Schema.makeControl(f)));
      }
      card.append(body);
      wrap.append(card);
    }

    // ---- 不透明度与辉光 ----
    if (mod) wrap.append(Cards.effectsCard(mod));

    // ---- 其它字段（开关 / 数值 / 下拉 / 文本 / 颜色）----
    if (sec.fields && sec.fields.length) {
      const card = el('div', 'card');
      const head = el('div', 'card-head');
      head.append(el('div', 'card-title', sec.id === 'global' ? '通用设置' : '显示与行为'));
      card.append(head);
      const body = el('div', 'card-body');

      for (const f of Schema.normalizeFields(sec.fields)) {
        if (f.type === 'switch') {
          // 开关行：开关在左（占标签列），说明文字在右
          const field = el('div', 'field');
          const row = el('div', 'row');
          row.append(Controls.switchControl(f), el('span', 'switch-label', f.label));
          field.append(row);
          if (f.note) field.append(el('div', 'note', f.note));
          body.append(field);
        } else {
          body.append(UI.fieldRow(f.label, Schema.makeControl(f), f.note));
        }
      }

      card.append(body);
      wrap.append(card);
    }

    return wrap;
  }

  // ============================================================
  // 导航 / 切页 / 重建
  // ============================================================

  function buildNav() {
    const { el } = globalThis.OphDOM;
    const S = globalThis.OphSections;
    const side = document.getElementById('side');
    if (!side || !S) return;
    side.innerHTML = '';

    let first = true;
    const multi = NAV_GROUPS.length > 1;
    const known = new Set(NAV_GROUPS.map((g) => g.id));

    // 分组名以 NAV_GROUPS 为准；schema 里写了未知分组的，追加到末尾而不是丢
    const groups = S.groups();
    const ordered = [
      ...NAV_GROUPS.map((g) => [g.id, g.label]),
      ...groups.filter(([id]) => !known.has(id)).map(([id]) => [id, id]),
    ];

    for (const [gid, label] of ordered) {
      const items = groups.find(([id]) => id === gid)?.[1] || [];
      if (!items.length) continue;
      // 只有一个分组时不画组标题，保持界面干净
      if (multi) side.append(el('div', 'nav-group', label));
      for (const sec of items) {
        const b = el('button', 'nav-item' + (first ? ' active' : ''));
        first = false;
        b.dataset.target = sec.id;
        b.append(el('span', 'nav-ico ' + sec.ico), el('span', null, sec.name));
        b.addEventListener('click', () => activate(sec.id));
        side.append(b);
      }
    }
  }

  function activate(id) {
    for (const b of document.querySelectorAll('.nav-item')) {
      b.classList.toggle('active', b.dataset.target === id);
    }
    for (const s of document.querySelectorAll('.section')) {
      s.classList.toggle('active', s.dataset.section === id);
    }
    // 有些页（更新公告）要联网/算数据，只有真正切过去才干活 —— 见 wrap._onActivate
    const sec = document.querySelector('.section[data-section="' + id + '"]');
    if (sec && typeof sec._onActivate === 'function') sec._onActivate();
    const bus = globalThis.OphBus?.app;
    if (bus) bus.emit('section:change', id);
  }

  function rebuild() {
    const S = globalThis.OphSections;
    const content = document.getElementById('content');
    if (!content || !S) return;
    const keep = document.querySelector('.nav-item.active')?.dataset.target;
    content.innerHTML = '';
    for (const sec of S.list()) content.append(buildSection(sec));
    buildNav();
    const first = S.list()[0];
    activate(keep || (first && first.id));
  }

  globalThis.OphApp = Object.assign(globalThis.OphApp || {}, {
    MODULES,
    NAV_GROUPS,
    setStatus,
    toast,
    markDirty,
    schedulePreview,
    buildSection,
    buildNav,
    activate,
    rebuild,
    TAG,
  });
})();
