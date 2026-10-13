'use strict';

/**
 * 首页 · 设置页模块
 *
 * 由 src/settings/settings.js（重构前巨石）机械拆分而来，代码原样保留。
 * 依赖通过头部解构显式声明 —— 不依赖加载顺序之外的东西，也不往全局挂散名。
 */
;(function () {
  const { state } = globalThis.OphCtx;
  const { el } = globalThis.OphDOM;
  const { sectionHead } = globalThis.OphLayout;
  const { activate, rebuild, toast } = globalThis.OphApp;


// 首页的重绘函数。状态每秒推一次，每次重建 section 都会换成新的。
let homePaint = null;
// 预览按钮的同步函数（init 里赋真身），首页也要能改它的状态
let applyPreviewBtn = null;
/** 立刻向主进程要一份最新状态并重绘首页 */
async function pushStatusNow() {
  try {
    const st = await window.oph.status();
    state.status = st;
    if (homePaint) homePaint(st);
  } catch (e) { /* 主进程没就绪时忽略 */ }
}
function buildHomeSection(sec) {
  const wrap = el('div', 'section');
  wrap.dataset.section = sec.id;
  wrap.append(sectionHead('总览'));

  // ---------------- 状态带 ----------------
  const band = el('div', 'hs-band');
  const dot = el('span', 'hs-dot');
  const hsMain = el('div', 'hs-main');
  const hsTitle = el('div', 'hs-title', '正在读取状态…');
  const hsSub = el('div', 'hs-sub', '');
  hsMain.append(hsTitle, hsSub);
  const hsBadge = el('span', 'hs-badge', '—');
  band.append(dot, hsMain, hsBadge);
  wrap.append(band);

  // ---------------- 关键信息 ----------------
  wrap.append(el('div', 'home-sub', '关键信息'));
  const info = el('div', 'stat-grid');
  wrap.append(info);
  const infoVal = {};
  const statBox = (host, key, label) => {
    const box = el('div', 'stat');
    box.append(el('div', 'stat-k', label));
    const v = el('div', 'stat-v', '—');
    box.append(v);
    host.append(box);
    return v;
  };
  infoVal.mode = statBox(info, 'mode', '运行模式');
  infoVal.port = statBox(info, 'port', '数据端口');
  infoVal.res = statBox(info, 'res', '设计分辨率');
  infoVal.fit = statBox(info, 'fit', '屏幕适配');
  infoVal.scale = statBox(info, 'scale', '整体缩放');
  infoVal.display = statBox(info, 'display', '显示器');

  // ---------------- 快捷操作 ----------------
  wrap.append(el('div', 'home-sub', '快捷操作'));
  const quick = el('div', 'quick-grid');
  wrap.append(quick);

  const qcard = (host, title, desc, fn, accent) => {
    const b = el('button', 'qcard' + (accent ? ' accent' : ''));
    b.type = 'button';
    b.append(el('span', 'qc-t', title), el('span', 'qc-d', desc));
    b.addEventListener('click', fn);
    host.append(b);
    return b;
  };

  const gsiNote = el('div', 'home-note', '');
  const refreshGsi = async () => {
    try {
      const r = await window.oph.gsiInfo();
      if (!r.ok) { gsiNote.textContent = '无法检查 GSI 安装状态：' + (r.error || '未知错误'); gsiNote.className = 'home-note warn'; return; }
      if (!r.roots || !r.roots.length) {
        gsiNote.textContent = '⚠ 未检测到 CS2，需手动将 cfg 复制到 <CS2>\\game\\csgo\\cfg\\ 与 game\\core\\cfg\\';
        gsiNote.className = 'home-note warn';
      } else {
        gsiNote.textContent = `已找到 ${r.roots.length} 处 CS2 配置目录`
          + (r.running ? '；CS2 正在运行，需完全退出游戏后重新启动才会生效。' : '。');
        gsiNote.className = 'home-note';
      }
    } catch (e) { gsiNote.textContent = ''; }
  };

  const gsiBtn = qcard(quick, '安装 GSI 配置', '将 Valve 官方 GSI 配置写入 CS2 目录', async () => {
    gsiBtn.disabled = true;
    let r = null;
    try { r = await window.oph.installCfg(); } catch (e) { r = { ok: false, reason: e.message }; }
    gsiBtn.disabled = false;
    if (r && r.ok) {
      toast(`已写入 ${r.copied.length} 处，完全重启 CS2 后生效${r.running ? '（CS2 正在运行，请先退出）' : ''}`, 'ok');
    } else if (r && r.reason === 'no_cs2') {
      toast('未检测到 CS2 安装目录，需手动复制 cfg', 'err');
    } else if (r && r.reason === 'no_source') {
      toast('程序内未找到 GSI 配置文件', 'err');
    } else {
      toast('安装失败：' + ((r && r.reason) || '未知原因'), 'err');
    }
    refreshGsi();
  }, true);

  qcard(quick, '原生 HUD 命令', '将关闭原生 HUD、保留雷达与队友标识的命令写入 CS2', () => activate('gamecmds'));

  qcard(quick, '实时预览', '打开模拟数据预览窗口', async () => {
    let on = false;
    try { on = await window.oph.togglePreview(); } catch (e) { return; }
    if (applyPreviewBtn) applyPreviewBtn(on);
    toast(on ? '预览窗口已打开（模拟数据）' : '预览窗口已关闭', 'ok');
    pushStatusNow();
  });

  qcard(quick, '显示 / 隐藏 HUD', '切换 HUD 显示状态', async () => {
    const r = await window.oph.toggleHud();
    toast(r && r.visible ? 'HUD 已显示' : 'HUD 已隐藏', 'ok');
  });

  qcard(quick, '重新读取配置', '放弃未保存的改动并重新读取 config.json', async () => {
    const r = await window.oph.reloadConfig();
    if (r && r.cfg) {
      state.cfg = r.cfg;
      state.dirty = false;
      document.getElementById('dirty').hidden = true;
      rebuild();
      window.oph.preview(state.cfg);
    }
    toast('已重新读取配置', 'ok');
  });

  qcard(quick, '配置文件位置', '在资源管理器中定位 config.json', () => window.oph.reveal());
  qcard(quick, '方案目录', '打开配置方案所在文件夹', () => window.oph.profiles.reveal());
  qcard(quick, '开发者工具', '打开 HUD 窗口的开发者工具', () => window.oph.openDevTools());

  wrap.append(gsiNote);

  // ---------------- 配置概览 ----------------
  wrap.append(el('div', 'home-sub', '当前配置概览'));
  const sum = el('div', 'stat-grid');
  wrap.append(sum);
  const sumVal = {};
  // 10-13：击杀播报 / 进阶外观 / 画图 / 图标库 / 购买轮盘 已下线，概览格一并移除
  sumVal.custom = statBox(sum, 'custom', '自定义文本');
  sumVal.gamecmds = statBox(sum, 'gamecmds', '游戏命令');

  // ---------------- 继续 ----------------
  wrap.append(el('div', 'home-sub', '更多'));
  const more = el('div', 'quick-grid');
  const go = (id, title, desc) => qcard(more, title, desc, () => activate(id));
  go('gamecmds', '原生 HUD 命令', '关闭原生 HUD，保留雷达与队友标识');
  go('profiles', '配置方案', '保存与切换多套配置');
  // 「教程」「进阶 · 每元素」「进阶 · 画图」入口已随对应设置页一同下线（10-13）
  wrap.append(more);

  // ---------------- 绘制 ----------------
  const setStat = (host, key, v, cls) => {
    const n = host[key];
    if (!n) return;
    n.textContent = v;
    n.className = 'stat-v' + (cls ? ' ' + cls : '');
  };
  const FIT_LABEL = {
    fill: '拉伸铺满（4:3 怀旧）',
    stretch: '等比铺满 Cover',
    contain: '等比完整 Contain',
  };

  const paint = (s) => {
    if (!s) return;
    const live = s.connected && s.inMatch;
    const connected = !!s.connected;
    band.classList.toggle('ok', live);
    band.classList.toggle('warn', connected && !live);
    band.classList.toggle('off', !connected);
    hsTitle.textContent = !s.running ? '覆盖层未运行'
      : live ? '对局进行中'
        : connected ? '已连接，当前不在对局中'
          : '等待游戏数据';
    hsSub.textContent = !s.running ? '请确认覆盖层进程是否仍在运行'
      : live ? 'GSI 数据正常，HUD 显示中'
        : connected ? '进入对局后将自动显示 HUD'
          : '未检测到 CS2，或 GSI 配置尚未安装到 CS2 目录';
    hsBadge.textContent = s.mock ? '模拟数据' : '真实 GSI';
    hsBadge.classList.toggle('mock', !!s.mock);

    setStat(infoVal, 'mode', s.mock ? '模拟数据' : '真实 GSI');
    setStat(infoVal, 'port', String(s.port));
    setStat(infoVal, 'res', s.design);
    setStat(infoVal, 'fit', FIT_LABEL[s.fit] || s.fit);
    setStat(infoVal, 'scale', String(s.scale));
    setStat(infoVal, 'display', s.mock ? '—' : '#' + (Number(s.displayIndex) + 1));

    setStat(sumVal, 'custom', String(s.custom));
    setStat(sumVal, 'gamecmds',
      (s.gamecmds == null ? '—' : (s.gamecmds + ' / ' + (s.gamecmdsAll || 0) + ' 条')),
      s.gamecmds && s.gamecmds === s.gamecmdsAll ? 'ok' : 'dim');
  };

  homePaint = paint;
  if (state.status) paint(state.status);
  refreshGsi();

  return wrap;
}

  // 自注册：上架与否只由 sections/manifest.js 决定，这里不写死顺序
  globalThis.OphSections.register({
    id: "home", ico: "home", name: "首页",
    group: "home",
    build: buildHomeSection,
  });

  // 交给宿主的接口：启动时要主动拉一次运行状态；
  // 另外「主页重绘」与「预览按钮回调」是模块作用域里的 let，外部不能直接赋值，所以留 setter。
  globalThis.OphSecHome = Object.assign(globalThis.OphSecHome || {}, {
    pushStatusNow,
    /** 宿主把新状态喂进来（首页还没建出来时静默忽略） */
    paint(st) { if (homePaint) homePaint(st); },
    setPaint(fn) { homePaint = fn; },
    setPreviewBtn(fn) { applyPreviewBtn = fn; },
  });
})();
