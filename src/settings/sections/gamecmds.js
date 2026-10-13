'use strict';

/**
 * 原生 HUD 命令 · 设置页模块
 *
 * 由 src/settings/settings.js（重构前巨石）机械拆分而来，代码原样保留。
 * 依赖通过头部解构显式声明 —— 不依赖加载顺序之外的东西，也不往全局挂散名。
 */
;(function () {
  const { state } = globalThis.OphCtx;
  const { markDirty, rebuild, setStatus, toast } = globalThis.OphApp;
  const { el } = globalThis.OphDOM;
  const { newCard, sectionHead } = globalThis.OphLayout;
  const { switchControl } = globalThis.OphControls;


/** 把 state.cfg.gamecmds 补成完整结构（旧配置 / 手改坏的 config.json 都兜住） */
function ensureGamecmds() {
  if (!state.cfg.gamecmds || typeof state.cfg.gamecmds !== 'object') state.cfg.gamecmds = {};
  const gc = state.cfg.gamecmds;
  if (!gc.enabled || typeof gc.enabled !== 'object') gc.enabled = {};
  for (const c of ((state.gamecmds && state.gamecmds.catalog) || [])) {
    if (typeof gc.enabled[c.id] !== 'boolean') gc.enabled[c.id] = true;
  }
  if (typeof gc.autoexec !== 'boolean') gc.autoexec = false;
  return gc;
}
/** 重新问主进程要一次状态（写完 / 移除后刷新用） */
async function refreshGameCmds() {
  try {
    state.gamecmds = await window.oph.gamecmds.info();
    ensureGamecmds();
    rebuild();
  } catch (e) {
    toast('读取 CS2 状态失败：' + e.message, 'err');
  }
}
function gcCopyBtn(text, label) {
  const b = el('button', 'mini', label || '复制');
  b.type = 'button';
  b.addEventListener('click', () => {
    window.oph.copyText(text);
    toast('已复制：' + text, 'ok');
  });
  return b;
}
function buildGamecmdsSection(sec) {
  const info = state.gamecmds;
  const wrap = el('div', 'section');
  wrap.dataset.section = sec.id;

  wrap.append(sectionHead('原生 HUD 与游戏命令',
    '关闭 CS2 原生 HUD，同时保留雷达与队友标识（这两项 GSI 无法提供）。'
    + '勾选后点击「写入 CS2」，程序会将命令写成一份独立 cfg 放入 CS2 的 cfg 目录。'
    + '⚠️ 本页只写入文本文件，不模拟按键、不注入进程。'));

  if (!info || !info.catalog) {
    const c = newCard('无法读取命令目录', '');
    c.body.append(el('div', 'note err', '主进程未返回命令目录，可能是设置窗口与主程序版本不一致。'));
    wrap.append(c.card);
    return wrap;
  }

  const gc = ensureGamecmds();
  const catalog = info.catalog || [];
  const groups = info.groups || [];
  const roots = info.roots || [];
  const installedDirs = roots.reduce((n, r) => n + ((r.dirs || []).filter((d) => d.installed).length), 0);
  const blockOn = roots.some((r) => r.autoexecHasBlock);
  const execLine = info.execLine || 'exec overplayhud_gamesetup';

  // ---------------- 状态 + 操作 ----------------
  const sc = newCard('CS2 状态', '打开本页时实时查询');

  const grid = el('div', 'gc-stat');
  const stat = (k, v, cls) => {
    const b = el('div', 'gc-stat-item');
    b.append(el('div', 'gc-stat-k', k), el('div', 'gc-stat-v' + (cls ? ' ' + cls : ''), v));
    grid.append(b);
  };
  stat('CS2 安装目录', roots.length ? roots.length + ' 处' : '未检测到', roots.length ? 'ok' : 'warn');
  stat('命令 cfg', installedDirs ? '已写入 ' + installedDirs + ' 处' : '未写入', installedDirs ? 'ok' : 'dim');
  stat('开机自动执行', blockOn ? '已挂载到 autoexec' : '未启用', blockOn ? 'ok' : 'dim');
  stat('游戏进程', info.running == null ? '未检测到' : (info.running ? '运行中' : '未运行'),
    info.running ? 'warn' : 'dim');
  sc.body.append(grid);

  const act = el('div', 'gc-actions');
  const btnWrite = el('button', 'btn primary', '写入 CS2');
  const btnRemove = el('button', 'btn', '移除已写入');
  const btnReveal = el('button', 'btn', '在文件夹中显示');
  const btnExec = el('button', 'btn', '复制 exec 指令');
  act.append(btnWrite, btnRemove, btnReveal, btnExec);
  sc.body.append(act);

  const onNow = catalog.filter((c) => gc.enabled[c.id] !== false).length;
  const hint = el('div', 'home-note', roots.length
    ? (installedDirs
      ? (blockOn
        ? '已写入并挂载到 autoexec，每次启动游戏自动生效。'
        : '已写入。还需在 CS2 控制台执行一次 ' + execLine
          + '，或勾选下方的「开机自动执行」。')
      : '尚未写入 CS2。点击「写入 CS2」可将上方勾选的 ' + onNow + ' 条命令存为一份独立 cfg。')
    : '⚠ 未检测到 CS2 安装目录（自定义 Steam 路径可能无法探测）。'
      + '可点击「在文件夹中显示」查看程序预期位置并手动复制。');
  hint.className = roots.length ? 'home-note' : 'home-note warn';
  sc.body.append(hint);
  wrap.append(sc.card);

  btnWrite.addEventListener('click', async () => {
    btnWrite.disabled = true;
    let r = null;
    try { r = await window.oph.gamecmds.write(state.cfg); } catch (e) { r = { ok: false, error: e.message }; }
    btnWrite.disabled = false;
    if (r && r.copied && r.copied.length) {
      toast(`已写入 ${r.copied.length} 处`
        + (r.running ? '（CS2 正在运行，需完全退出游戏后重新启动才生效）' : ''), 'ok');
      state.dirty = false;
      document.getElementById('dirty').hidden = true;
      setStatus('已保存并写入 CS2', 'ok');
    } else if (r && r.error) {
      toast('写入失败：' + r.error, 'err');
    } else {
      toast('未找到可写入的 CS2 cfg 目录', 'err');
    }
    if (r && r.failed && r.failed.length) console.warn('[gamecmds] 部分失败：', r.failed.join(' | '));
    await refreshGameCmds();
  });

  btnRemove.addEventListener('click', async () => {
    if (!confirm('确认删除程序写入 CS2 的命令 cfg？\n'
      + '若已挂载到 autoexec，对应区块将一并移除，autoexec 中其它内容不受影响。')) return;
    btnRemove.disabled = true;
    try { await window.oph.gamecmds.remove(); } catch (e) { /* 忽略 */ }
    btnRemove.disabled = false;
    toast('已移除写入的命令 cfg 与 autoexec 区块', 'ok');
    await refreshGameCmds();
  });

  btnReveal.addEventListener('click', () => window.oph.gamecmds.reveal());
  btnExec.addEventListener('click', async () => {
    try { await window.oph.gamecmds.copyExec(); } catch (e) { window.oph.copyText(execLine); }
    toast('已复制：' + execLine, 'ok');
  });

  // ---------------- 命令清单 ----------------
  const pre = el('pre', 'gc-pre', '');
  const previewTimerBox = { t: 0 };

  const repaintCfg = () => {
    const map = {};
    for (const c of catalog) map[c.id] = gc.enabled[c.id] !== false;
    window.oph.gamecmds.text(map)
      .then((txt) => { pre.textContent = typeof txt === 'string' ? txt : ''; })
      .catch(() => { pre.textContent = ''; });
  };
  const scheduleCfg = () => {
    clearTimeout(previewTimerBox.t);
    previewTimerBox.t = setTimeout(repaintCfg, 60);
  };

  for (const g of groups) {
    const items = catalog.filter((c) => c.group === g.id);
    if (!items.length) continue;
    const card = newCard(g.label, g.hint);
    for (const c of items) {
      const row = el('div', 'gc-row');
      const cb = el('input', 'gc-cb');
      cb.type = 'checkbox';
      cb.checked = gc.enabled[c.id] !== false;
      cb.addEventListener('change', () => {
        gc.enabled[c.id] = cb.checked;
        markDirty();
        scheduleCfg();
      });
      row.append(cb);

      const main = el('div', 'gc-main');
      const head = el('div', 'gc-head');
      head.append(el('span', 'gc-label', c.label));
      if (c.required) head.append(el('span', 'gc-tag', '必开'));
      head.append(el('code', 'gc-cmd', c.cmd), gcCopyBtn(c.cmd));
      main.append(head);
      if (c.note) main.append(el('div', 'gc-note', c.note));
      row.append(main);
      card.body.append(row);
    }
    wrap.append(card.card);
  }

  // ---------------- 执行方式 ----------------
  const ax = newCard('执行方式', '两种方式任选其一');
  const axField = el('div', 'field');
  const axRow = el('div', 'row');
  axRow.append(switchControl({ path: 'gamecmds.autoexec' }),
    el('span', 'switch-label', '开机自动执行（写入 autoexec.cfg）'));
  axField.append(axRow);
  axField.append(el('div', 'note',
    '勾选后会在 autoexec.cfg 中维护一段带标记的区块，启动游戏时自动生效，无需手动执行 exec。'
    + '该区块可通过「移除已写入」撤销，不会改动 autoexec.cfg 中的其它内容；'
    + '文件不存在时会自动创建。'));
  ax.body.append(axField);

  const manField = el('div', 'field');
  const manRow = el('div', 'row');
  manRow.append(el('div', 'row-label', '手动执行'));
  const execBox = el('div', 'gc-exec');
  execBox.append(el('code', 'gc-cmd', execLine));
  manRow.append(execBox, gcCopyBtn(execLine));
  manField.append(manRow);
  manField.append(el('div', 'note',
    '每次进入游戏后在控制台执行此行。若服务器锁定相关 cvar，进入服务器后可能被重置，'
    + '则需每局执行一次。'));
  ax.body.append(manField);
  wrap.append(ax.card);

  // ---------------- 将要写进 cfg 的内容 ----------------
  const pv = newCard('将要写进 cfg 的内容',
    '内容随上方勾选实时更新。cfg 内仅写入 ASCII 注释（Source 引擎的 cfg 解析不保证支持非 ASCII 编码），'
    + '中文说明仅在本页显示。');
  pv.body.append(pre);
  pv.body.append(el('div', 'note',
    '文件名为 ' + (info.cfgName || 'overplayhud_gamesetup.cfg')
    + '，写入 CS2 的 game\\csgo\\cfg\\ 与 game\\core\\cfg\\ 两处。'
    + '该文件由程序生成，删除不影响游戏本体。'));
  wrap.append(pv.card);

  repaintCfg();
  return wrap;
}

  // 自注册：上架与否只由 sections/manifest.js 决定，这里不写死顺序
  globalThis.OphSections.register({
    id: "gamecmds", ico: "gamecmds", name: "原生 HUD 命令",
    group: "basic",
    build: buildGamecmdsSection,
  });

  // 宿主要用它：启动时把命令目录灌进 state（主进程是唯一权威）
  globalThis.OphSecGamecmds = Object.assign(globalThis.OphSecGamecmds || {}, {
    ensureGamecmds, refreshGameCmds,
  });
})();
