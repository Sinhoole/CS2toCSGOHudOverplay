'use strict';

const { app, BrowserWindow, screen, Menu, Tray, ipcMain, shell, dialog, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

const cfgMod = require('./config');
const {
  load: loadConfig, save: saveConfig, reset: resetConfig, preview: previewConfig, DEFAULTS,
} = cfgMod;
const configFile = () => cfgMod.file();

const { GsiHub } = require('./gsi');
const { execBuy } = require('./buyexec');
const buycfg = require('./buycfg');
const { install: installGsiCfg, inspect: inspectGsiCfg, CFG_NAME } = require('./gsi-install');
const gamecmds = require('./gamecmds');
const VARS = require('./vars');
const { NAMES, GRENADE_KINDS } = require('./weapon-names');
const equipIcons = require('./equip-icons');

const USE_MOCK = process.argv.includes('--mock');
const OPEN_SETTINGS = process.argv.includes('--settings');
const OPEN_PREVIEW = process.argv.includes('--preview');

// ⚠️ 关掉硬件加速（实机踩坑）：GPU 进程在这类环境下不稳定（0xC0000005 崩溃），
// 已画好的窗口能幸存，但**运行中新创建的窗口**（购买轮盘）渲染进程会跟着挂——
// 表现就是「日志说已就绪，屏幕上一片空白」：透明窗体 + 什么都没画出来。
// HUD 全是简单 DOM，软件渲染绰绰有余；设 OPH_GPU=1 可临时恢复硬件加速排查。
if (!process.env.OPH_GPU) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
  // 规避另一个 app 实例 / 上次没退干净时抢 GPU 缓存文件锁导致 GPU 进程崩溃
  app.commandLine.appendSwitch('disable-gpu-cache');
}

// 打包后 app.asar 是只读的，配置必须写到用户数据目录去。
// 首次运行时把随包带的那份 config.json 当种子复制过去，这样"我的调校"能跟着安装包走。
function prepareConfigDir() {
  const dir = app.isPackaged ? app.getPath('userData') : path.join(__dirname, '..');
  cfgMod.setConfigDir(dir);
  if (!app.isPackaged) return;

  // 首次运行：把随包带的那份 config.json 当种子，装的人一上来就是调好的样子
  const target = path.join(dir, 'config.json');
  if (fs.existsSync(target)) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const seed = path.join(__dirname, '..', 'config.json');
    if (fs.existsSync(seed)) fs.copyFileSync(seed, target);
  } catch (e) {
    console.warn('[config] 种子配置复制失败:', e.message);
  }
}

prepareConfigDir();

let cfg = loadConfig();

/**
 * 开发用：--shot-json=patch.json
 * 从文件里读一段配置盖在内存里的 cfg 上，**完全不碰用户的 config.json**。
 * 这样验证「某个效果长什么样」不需要先备份再还原配置文件。
 */
(function applyShotPatch() {
  const arg = process.argv.find((a) => a.startsWith('--shot-json='));
  if (!arg) return;
  const p = path.resolve(arg.slice('--shot-json='.length));
  try {
    cfg = cfgMod.deepMerge(cfg, JSON.parse(fs.readFileSync(p, 'utf8')));
    console.log('[shot-json] 内存覆盖配置:', p);
  } catch (e) {
    console.error('[shot-json] 读取失败:', e.message);
  }
})();

let win = null;
let settingsWin = null;
let previewWin = null;
let tray = null;
let hub = null;
let stopMock = null;
let ticker = null;

// 实时预览：独立的一份 GSI hub + 模拟数据源，跟真实对局互不干扰
let prevHub = null;
let stopPrevMock = null;
let prevOffset = 0;

// 只允许一个实例，避免重复开覆盖层。
// 例外：--shot 是开发截图模式，允许与游戏里那个实例并存
// —— 否则游戏一开着覆盖层，就没法截图自检了。
const SHOT_MODE = process.argv.some((a) => a.startsWith('--shot=') || a.startsWith('--shot-settings=')
  || a.startsWith('--shot-json=') || a.startsWith('--shot-event=') || a.startsWith('--shot-preview='));

// 开发用截图：--shot-event=kill 让渲染层强制播一条播报，好在没真实事件时也能截到
// 「进阶外观」长什么样（配合 --shot-json 打开 adv.enabled）。
(function applyDevEvent() {
  const arg = process.argv.find((a) => a.startsWith('--shot-event='));
  if (!arg) return;
  cfg.devEvent = arg.slice('--shot-event='.length).trim() || 'kill';
  console.log('[shot-event] 强制播报:', cfg.devEvent);
})();
if (SHOT_MODE || app.requestSingleInstanceLock()) {
  app.whenReady().then(boot);
} else {
  app.quit();
}

function currentDisplay() {
  const all = screen.getAllDisplays();
  return all[Math.min(cfg.displayIndex, all.length - 1)] || screen.getPrimaryDisplay();
}

function boot() {
  hub = new GsiHub(cfg);
  hub.onSnapshot(push);
  hub.onSnapshot(handleBuyWheel);

  if (USE_MOCK) {
    // 模拟模式下刻意不监听 GSI 端口：游戏真在跑的时候，
    // 真实数据和模拟数据会交替灌进同一个 hub，金钱/血量会来回跳，
    // 产生像 -$2,050 这种根本不存在的变动提示。
    console.log('[mock] 模拟模式：不监听 GSI 端口，真实数据不会混进来');
    // --t=105 可以把 HUD 直接停在时间线第 105 秒（血量 3、护甲 0）
    const tArg = process.argv.find((a) => a.startsWith('--t='));
    const offset = tArg ? Number(tArg.slice(4)) || 0 : 0;
    stopMock = require('./mock').startMock(hub, 10, offset);
  } else {
    hub.start();
  }

  createWindow();
  createTray();
  registerSettingsIpc();

  // 配置方案：第一次跑（还没有任何方案）就放一份内置「默认」方案
  ensureBuiltinProfile();
  // 首页的运行状态：每秒推一次，界面永远和真实进程一致
  startStatusPush();

  // 启动就把设置窗口摆出来。
  // 以前默认只留一个托盘图标，用户装完点开什么都没有，得先去右下角找 —— 太劝退。
  // 截图 / 自动化（--shot-*）和单独预览时不开，免得糊在一起。
  // 例外：--shot-settings 本身就是来截设置窗的，必须开（截图钩子挂在设置窗 did-finish-load 上）。
  const SHOT_SETTINGS = process.argv.some((a) => a.startsWith('--shot-settings='));
  const wantSettings = OPEN_SETTINGS || SHOT_SETTINGS
    || (cfg.openSettingsOnStart !== false && !SHOT_MODE && !OPEN_PREVIEW);
  if (wantSettings) openSettings();
  if (OPEN_PREVIEW) openPreview();

  // 计时器需要自己走：GSI 只在状态变化时推送，心跳间隔 30s 太粗
  ticker = setInterval(() => {
    hub.refresh();
  }, 100);

  screen.on('display-metrics-changed', () => {
    if (!win) return;
    const b = currentDisplay().bounds;
    win.setBounds(b);
    win.webContents.send('hud:bounds', b);
  });
  screen.on('display-added', () => refreshBounds());
  screen.on('display-removed', () => refreshBounds());
}

function refreshBounds() {
  if (!win) return;
  const b = currentDisplay().bounds;
  win.setBounds(b);
  win.webContents.send('hud:bounds', b);
}

/**
 * 把渲染层的日志/报错转发到终端。
 * ⚠️ Electron ≥32 把 console-message 的签名从
 *     (event, level:number, message, line, source) 改成了 (event, details)。
 *    沿用旧签名时 level 会变成对象、`level >= 2` 恒为 false —— 诊断会静默失效。
 *    这里两种都兼容，避免「以为装了日志其实一条都不出」。
 */
function rendererConsole(tag, args) {
  const d = (args[1] && typeof args[1] === 'object')
    ? args[1]
    : { level: args[1], message: args[2], lineNumber: args[3], sourceId: args[4] };
  const rank = { verbose: 0, debug: 0, info: 1, log: 1, warning: 2, warn: 2, error: 3 };
  const lv = typeof d.level === 'number' ? d.level : (rank[d.level] ?? 1);
  const msg = d.message ?? '';
  // 放行 warn/error，以及我们自己以 [hud: / [roster 开头的诊断行
  // （它们是 console.log，级别是 info，默认会被过滤掉 —— 那等于诊断白装）
  const ours = msg.startsWith('[hud:') || msg.startsWith('[roster');
  if (lv >= 2 || ours) {
    // Electron 自带的开发期安全提示，开发模式每条都会刷，过滤掉
    if (msg.includes('Electron Security Warning')) return;
    const where = d.sourceId ? ` ${d.sourceId}:${d.lineNumber ?? ''}` : '';
    console.log(`${tag}${where} ${msg}`);
  }
}

/**
 * 渲染层诊断三件套：控制台报错 / 渲染进程崩溃 / 页面加载失败。
 * 没有它，渲染层脚本一旦抛异常就是「静默黑屏」，只能靠猜（踩过坑）。
 */
function attachRendererDiagnostics(wc, tag) {
  wc.on('console-message', (...a) => rendererConsole(tag, a));
  wc.on('did-fail-load', (_e, code, desc) => console.error(`${tag} 页面加载失败: ${code} ${desc}`));
}

function createWindow() {
  const b = currentDisplay().bounds;

  win = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    transparent: true,
    frame: false,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  win.setMenu(null);
  win.setIgnoreMouseEvents(!cfg.enableInteraction, { forward: true });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // 渲染层报错 / 加载失败 → 终端可见（否则渲染层异常就是静默黑屏）
  attachRendererDiagnostics(win.webContents, '[hud:renderer]');

  win.webContents.once('did-finish-load', () => {
    // 截图时给页面铺一层底色，模拟真实游戏画面，方便判断白字的可读性
    const bgArg = process.argv.find((a) => a.startsWith('--shot-bg='));
    if (bgArg) cfg.shotBg = bgArg.slice('--shot-bg='.length);
    win.webContents.send('hud:config', { cfg, bounds: b });
    win.show();
    maybeShoot(b);
  });

  win.on('closed', () => {
    win = null;
  });

  console.log(`[win] 覆盖层 ${b.width}x${b.height} @ (${b.x},${b.y})  鼠标穿透=${!cfg.enableInteraction}`);
}

/**
 * 开发用截图：--shot=out.png [--shot-region=x,y,w,h] [--shot-delay=3000]
 * 直接抓窗口内容并退出，保留透明通道，不需要第三方截图工具。
 * region 的 y 传负数表示「距屏幕底部多少像素」。
 */
function maybeShoot(bounds) {
  const arg = process.argv.find((a) => a.startsWith('--shot='));
  if (!arg) return;

  const file = path.resolve(arg.slice('--shot='.length));
  const delayArg = process.argv.find((a) => a.startsWith('--shot-delay='));
  const delay = delayArg ? Number(delayArg.slice('--shot-delay='.length)) || 3000 : 3000;

  let rect = { x: 0, y: 0, width: bounds.width, height: bounds.height };
  const regionArg = process.argv.find((a) => a.startsWith('--shot-region='));
  if (regionArg) {
    const [x, y, w, h] = regionArg.slice('--shot-region='.length).split(',').map(Number);
    rect = { x, y: y < 0 ? bounds.height + y : y, width: w, height: h };
  }
  rect.x = Math.max(0, Math.round(rect.x));
  rect.y = Math.max(0, Math.round(rect.y));
  rect.width = Math.min(Math.round(rect.width), bounds.width - rect.x);
  rect.height = Math.min(Math.round(rect.height), bounds.height - rect.y);

  setTimeout(async () => {
    try {
      const image = await win.webContents.capturePage(rect);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, image.toPNG());
      console.log(`[shot] ${file}  ${rect.width}x${rect.height}`);
    } catch (e) {
      console.error('[shot] 失败:', e.message);
    }
    app.quit();
  }, delay);
}

function push(snapshot) {
  if (win && !win.webContents.isDestroyed()) {
    win.webContents.send('hud:snapshot', snapshot);
  }
}

// ============================================================
// 购买轮盘（路线 B：点选格子时向 CS2 注入按键完成购买）
// ⚠️ 这是本项目唯一被批准「模拟输入」的地方，仅限购买时间、仅本地玩家自用。
// ============================================================

let wheelWin = null;
let wheelArmed = false;   // 本次轮盘会话里是否激活过分类 cfg（关轮盘时据此解绑购买键）
let wheelSnap = null;     // 最近一次「购买时间」的快照（轮盘崩溃重建时用）

function openWheel(snapshot) {
  if (wheelWin) return;
  const b = currentDisplay().bounds;
  console.log('[wheel] 弹出购买轮盘  阵营=' + (snapshot && snapshot.team));

  wheelWin = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    transparent: true, frame: false, skipTaskbar: true,
    focusable: true, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'renderer', 'buywheel-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  wheelWin.setMenu(null);
  wheelWin.setAlwaysOnTop(true, 'screen-saver');
  wheelWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  wheelWin.loadFile(path.join(__dirname, 'renderer', 'buywheel.html'));

  // 渲染层诊断：轮盘「看不见」时，这里能立刻区分是渲染报错还是窗口层级问题
  wheelWin.webContents.on('console-message', (...a) => rendererConsole('[wheel:renderer]', a));
  wheelWin.webContents.on('render-process-gone', (_e, details) => {
    console.error(`[wheel:renderer] 渲染进程挂了: ${details.reason} → 2 秒后自动重建`);
    // 留着一个空白窗体只会让用户以为「轮盘没弹」；干脆销毁重建
    const dead = wheelWin;
    wheelWin = null;
    try { dead.destroy(); } catch (e) { /* 已销毁 */ }
    if (win) win.setIgnoreMouseEvents(!cfg.enableInteraction, { forward: true });
    setTimeout(() => {
      if (!wheelWin && cfg.buywheel && cfg.buywheel.enabled) {
        openWheel(wheelSnap || { connected: false });
      }
    }, 2000);
  });
  wheelWin.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error(`[wheel:renderer] 页面加载失败: ${code} ${desc}`);
  });

  wheelWin.webContents.once('did-finish-load', () => {
    if (!wheelWin) return;
    wheelWin.webContents.send('buywheel:config', {
      cfg: cfg.buywheel,
      bounds: b,
      catalog: buycfg.publicCatalog(),
    });
    wheelWin.webContents.send('buywheel:snapshot', snapshot);
    wheelWin.show();
    wheelWin.focus();
  });

  wheelWin.on('closed', () => { wheelWin = null; });
  console.log('[wheel] 轮盘窗口已创建，等待加载');

  // 取消主覆盖层的鼠标穿透：轮盘弹出时鼠标要能点到格子
  if (win) win.setIgnoreMouseEvents(false);
}

function closeWheel() {
  const wasArmed = wheelArmed;
  wheelArmed = false;
  if (!wheelWin) return;
  console.log('[wheel] 关闭购买轮盘，恢复穿透');
  try { wheelWin.close(); } catch (e) { /* 已关闭 */ }
  wheelWin = null;
  // 恢复穿透（除非用户开启了「鼠标可交互」调试开关）
  if (win) win.setIgnoreMouseEvents(!cfg.enableInteraction, { forward: true });

  // 轮盘用完把购买键全部解绑，避免残余的 F1=buy 之类的绑定影响正常游戏
  if (wasArmed && cfg.buywheel && cfg.buywheel.unbindOnClose) {
    const bw = cfg.buywheel;
    const r = execBuy({
      execMode: 'console',
      consoleKey: bw.consoleKey,
      command: `exec ${buycfg.CLEAR_NAME.replace(/\.cfg$/i, '')}`,
    });
    console.log(`[buy] 清除绑定 -> ${r.ok ? 'ok' : 'fail'} (${r.reason || r.mode})`);
  }
}

/** 根据快照里的 isBuyTime 自动开关轮盘 */
let lastBuySeenAt = 0;    // 最近一次「是购买时间」的时刻（关轮盘去抖用）
let buyTimeLog = false;

function handleBuyWheel(s) {
  const bw = cfg.buywheel;
  // 购买轮盘已被取消（cfg.buywheel.enabled=false）：彻底不参与 ——
  // 既不会弹窗，也不会再往终端打 isBuyTime 日志。代码保留，日后要重启该功能改回 true 即可。
  if (!bw || !bw.enabled) return;

  const shouldOpen = !!(bw.openOnBuyTime && s.isBuyTime);
  if (s.isBuyTime) { lastBuySeenAt = Date.now(); wheelSnap = s; }

  // isBuyTime 翻转时打一行日志，实机排障用（弹没弹、为什么没弹一眼可见）
  if (!!s.isBuyTime !== buyTimeLog) {
    buyTimeLog = !!s.isBuyTime;
    const blocked = s.isBuyTime && !bw.openOnBuyTime;
    console.log(`[wheel] isBuyTime = ${!!s.isBuyTime}`
      + (blocked ? '（但「自动弹出」没开，不弹）' : ''));
  }

  if (shouldOpen && !wheelWin) {
    openWheel(s);
  } else if (shouldOpen && wheelWin && !wheelWin.webContents.isDestroyed()) {
    wheelWin.webContents.send('buywheel:snapshot', s);
  } else if (!shouldOpen && wheelWin) {
    // 容抖动：快照偶发抖出一次「非购买时间」时立刻关会闪窗，
    // 连续 2 秒都不是购买时间才真正关。
    if (Date.now() - lastBuySeenAt > 2000) closeWheel();
  }
}

// ============================================================
// 实时预览（设置界面里「预览」开出来的那个窗口）
//
// 它就是第二个 HUD 窗口：同一份 renderer/index.html，只是多了 ?preview=1，
// 所以显示出来的东西和真实覆盖层是同一套代码 —— 边调边看不会有「看着像、实际不一样」。
// 数据来自一份**独立的**模拟数据源（自己的 GSI hub + mock 时间线），
// 不读真实对局、不注入、不模拟任何输入。
// ============================================================

// 预览底板：报刊风的「墨色印版」——暖墨而不是冷蓝黑，和设置界面的新闻纸呼应。
// HUD 是给游戏画面设计的（浅色字 + 描边），必须落在深底上才读得出来，所以不能换成纸白。
const PREVIEW_BG = 'radial-gradient(circle at 28% 16%, #3b352b 0%, #241f18 48%, #14110c 100%)';
// 预览窗口顶部工具条的高度（px）。渲染层里有同样的常量，改的时候两处都要动。
const PREVIEW_BAR_HEIGHT = 34;

/** 预览窗口用的配置副本：只覆盖底色，绝不回写用户配置 */
function previewCfg() {
  return Object.assign({}, cfg, { shotBg: PREVIEW_BG });
}

function previewBounds() {
  const b = previewWin ? previewWin.getContentBounds() : { width: 900, height: 560 };
  return { x: 0, y: 0, width: b.width, height: b.height };
}

/** 预览用的模拟数据源：一份全新的 hub，保证事件检测从零开始 */
function startPrevFeed() {
  stopPrevFeed();
  prevHub = new GsiHub(cfg);
  prevHub.onSnapshot((s) => {
    if (previewWin && !previewWin.webContents.isDestroyed()) {
      previewWin.webContents.send('hud:snapshot', s);
    }
  });
  stopPrevMock = require('./mock').startMock(prevHub, 10, prevOffset);

  // 时间线重置后要通知渲染层清掉播报基线，否则新的一轮击杀会被当成旧事件
  if (previewWin && !previewWin.webContents.isDestroyed()) {
    previewWin.webContents.send('hud:preview-reset');
  }
}

function stopPrevFeed() {
  if (stopPrevMock) {
    try { stopPrevMock(); } catch (e) { /* 忽略 */ }
    stopPrevMock = null;
  }
  prevHub = null;
}

/**
 * 预览窗口默认按「当前显示器」的宽高比开 —— 因为真实覆盖层就是铺满整块屏幕的，
 * 只有比例对上了，看到的位置和比例才和游戏里一致。宽度固定，高度按比例算。
 */
function previewDefaultSize() {
  const b = currentDisplay().bounds;
  const w = Math.max(560, Math.min(960, b.width));
  const h = Math.round(w * (b.height / b.width)) + PREVIEW_BAR_HEIGHT;
  return { width: w, height: h };
}

function createPreviewWindow() {
  if (previewWin) return previewWin;

  const size = previewDefaultSize();

  previewWin = new BrowserWindow({
    width: size.width,
    height: size.height,
    minWidth: 480,
    minHeight: 300,
    useContentSize: true,            // 给的是内容区尺寸（不含系统标题栏），HUD 按它排版
    frame: true,                     // 系统边框：本身就是一台「小显示器」，可随意拖拽缩放
    backgroundColor: '#0d1015',
    title: 'OverplayHUD 预览 · 模拟数据',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),   // 和真实覆盖层同一份桥
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  previewWin.setMenu(null);
  // 设置窗口是 screen-saver 层级，预览窗口必须同级别才不会被盖住
  previewWin.setAlwaysOnTop(true, 'screen-saver');
  previewWin.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query: { preview: '1' } });
  attachRendererDiagnostics(previewWin.webContents, '[preview]');

  previewWin.webContents.once('did-finish-load', () => {
    previewWin.webContents.send('hud:config', { cfg: previewCfg(), bounds: previewBounds() });
    prevOffset = 0;
    startPrevFeed();
    broadcastPreviewState();

    // 开发用：--shot-preview=out.png [+ --shot-delay=3000] [+ --shot-event=kill]
    const arg = process.argv.find((a) => a.startsWith('--shot-preview='));
    if (!arg) return;
    const file = path.resolve(arg.slice('--shot-preview='.length));
    const dArg = process.argv.find((a) => a.startsWith('--shot-delay='));
    const delay = dArg ? Number(dArg.slice('--shot-delay='.length)) || 3000 : 3000;
    // --shot-preview-tap=.pv-btn[data-pv-ev=multi],#pvPause
    // 截图前先把工具条上的按钮真的点一遍，验证事件确实接通（开发用）
    const tapArg = process.argv.find((a) => a.startsWith('--shot-preview-tap='));
    const taps = tapArg ? tapArg.slice('--shot-preview-tap='.length).split(',').map((s) => s.trim()).filter(Boolean) : [];

    setTimeout(async () => {
      try {
        for (const sel of taps) {
          // 包一层 try：页面里抛错时 executeJavaScript 只会给一句
          // 「Script failed to execute」，看不到原因（踩过）。这里把原因带回来。
          const ok = await previewWin.webContents.executeJavaScript(
            '(() => { try {'
            + ` const n = document.querySelector(${JSON.stringify(sel)});`
            + " if (!n) return 'no-match'; n.click(); return 'ok';"
            + ' } catch (e) { return "err: " + e.message; } })()');
          console.log(`[shot] tap ${sel} -> ${ok}`);
        }
        if (taps.length) await new Promise((r) => setTimeout(r, 300));
        const img = await previewWin.webContents.capturePage();
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, img.toPNG());
        console.log(`[shot] ${file}`);
      } catch (e) {
        console.error('[shot] 预览窗口截图失败:', e.message);
      }
      app.quit();
    }, delay);
  });

  previewWin.on('closed', () => {
    previewWin = null;
    stopPrevFeed();
    broadcastPreviewState();
  });

  return previewWin;
}

function openPreview() {
  const w = createPreviewWindow();
  w.show();
  w.focus();
  broadcastPreviewState();
  return w;
}

/** 返回「预览现在是不是开着」 */
function togglePreview() {
  if (previewWin) { previewWin.close(); return false; }
  openPreview();
  return true;
}

function broadcastPreviewState() {
  if (settingsWin && !settingsWin.webContents.isDestroyed()) {
    settingsWin.webContents.send('settings:preview-state', !!previewWin);
  }
  updateTrayMenu();     // 托盘里的「实时预览 / 关闭实时预览」跟着变
}

// ============================================================
// 设置界面
// ============================================================

function createSettingsWindow() {
  settingsWin = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 780,
    minHeight: 540,
    frame: false,
    show: false,
    backgroundColor: '#12151a',
    title: 'OverplayHUD 设置',
    webPreferences: {
      preload: path.join(__dirname, 'settings', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWin.setMenu(null);
  // 教程 / 关于页里的外链一律丢给系统浏览器，不在程序内开新窗口。
  // 不拦的话点一下会弹出一个空白的 Electron 窗口，很莫名。
  settingsWin.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // 渲染层报错转发到终端 —— 否则设置界面脚本一出错就是「一片空白」，只能靠猜（踩过）
  attachRendererDiagnostics(settingsWin.webContents, '[settings:renderer]');
  // 覆盖层的层级是 screen-saver，设置窗口必须同级别才不会被它盖住
  // （同级别时焦点窗口在上，所以设置窗口打开时始终可见）
  settingsWin.setAlwaysOnTop(true, 'screen-saver');

  // --settings-tab=global 可以直接打开某个分页（也方便开发时逐页截图核对）
  const tabArg = process.argv.find((a) => a.startsWith('--settings-tab='));
  const hash = tabArg ? tabArg.slice('--settings-tab='.length) : '';
  settingsWin.loadFile(path.join(__dirname, 'settings', 'index.html'), hash ? { hash } : undefined);

  // 关窗口时丢弃「改了但没保存」的预览：从磁盘重新读一遍。
  // 否则覆盖层会停在半套没落盘的参数上，下次重启又变回去，很难解释。
  settingsWin.on('close', () => {
    const shotBg = cfg ? cfg.shotBg : null;
    cfg = loadConfig();
    if (shotBg) cfg.shotBg = shotBg;
    if (win && !win.webContents.isDestroyed()) {
      win.webContents.send('hud:config', { cfg, bounds: currentDisplay().bounds });
    }
    // 预览窗口可能还开着，同样恢复成磁盘上的那份（否则它会停在半套没落盘的参数上）
    if (previewWin && !previewWin.webContents.isDestroyed()) {
      previewWin.webContents.send('hud:config', { cfg: previewCfg(), bounds: previewBounds() });
    }
    if (prevHub) prevHub.cfg = cfg;
    updateTrayMenu();
  });

  settingsWin.on('closed', () => { settingsWin = null; });

  // 开发用：--shot-settings=out.png 抓一张设置界面就退出
  settingsWin.webContents.once('did-finish-load', () => {
    const arg = process.argv.find((a) => a.startsWith('--shot-settings='));
    if (!arg) return;
    const file = path.resolve(arg.slice('--shot-settings='.length));
    // --shot-settings-scroll=800 抓长页面的下半截
    const scrollArg = process.argv.find((a) => a.startsWith('--shot-settings-scroll='));
    const scrollTo = scrollArg ? Number(scrollArg.slice('--shot-settings-scroll='.length)) || 0 : 0;

    setTimeout(async () => {
      try {
        if (scrollTo) {
          await settingsWin.webContents.executeJavaScript(
            `document.getElementById('content').scrollTop = ${scrollTo};`);
          await new Promise((r) => setTimeout(r, 400));
        }
        const img = await settingsWin.webContents.capturePage();
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, img.toPNG());
        console.log(`[shot] ${file}`);
      } catch (e) {
        console.error('[shot] 设置界面截图失败:', e.message);
      }
      app.quit();
    }, 1400);
  });
}

function openSettings() {
  if (!settingsWin) createSettingsWindow();
  settingsWin.show();
  settingsWin.focus();
  console.log('[settings] 设置窗口已打开');
}

/**
 * 应用一份配置。
 * persist=false 时只用于实时预览，不写文件。
 * 两种情况下都会立刻推给覆盖层，所以拖动滑杆能马上看到效果。
 */
function applyConfig(next, persist) {
  const shotBg = cfg ? cfg.shotBg : null;   // 截图底色不属于用户配置，不能被覆盖掉

  cfg = persist ? saveConfig(next) : previewConfig(next);
  if (shotBg) cfg.shotBg = shotBg;

  if (win && !win.webContents.isDestroyed()) {
    win.webContents.send('hud:config', { cfg, bounds: currentDisplay().bounds });
  }

  // 实时预览窗口同步跟随（边调边看）；模拟数据源也要拿到新阈值 / 计时器配置
  if (previewWin && !previewWin.webContents.isDestroyed()) {
    previewWin.webContents.send('hud:config', { cfg: previewCfg(), bounds: previewBounds() });
  }
  if (prevHub) prevHub.cfg = cfg;

  // 鼠标穿透、所在显示器这两个是窗口属性，改完要落到窗口上
  if (win) {
    win.setIgnoreMouseEvents(!cfg.enableInteraction, { forward: true });

    const b = currentDisplay().bounds;
    const cur = win.getBounds();
    if (cur.x !== b.x || cur.y !== b.y || cur.width !== b.width || cur.height !== b.height) {
      refreshBounds();
    }
  }

  updateTrayMenu();
  return cfg;
}

let equipIconsCache = null;
/** 读一次 asstes/icons/equipment，归一化后的图标 map 缓存在内存里 */
function getEquipIcons() {
  if (equipIconsCache) return equipIconsCache;
  const dir = path.join(app.getAppPath(), 'asstes', 'icons', 'equipment');
  try {
    equipIconsCache = equipIcons.loadEquipIcons(dir);
  } catch (e) {
    console.error('[equip-icons] 加载失败:', e.message);
    equipIconsCache = { files: {}, names: [] };
  }
  return equipIconsCache;
}

function registerSettingsIpc() {
  ipcMain.handle('settings:get', () => ({
    cfg,
    defaults: DEFAULTS,
    file: configFile(),
  }));

  ipcMain.on('settings:preview', (_e, next) => {
    try {
      applyConfig(next, false);
    } catch (e) {
      console.error('[settings] 预览失败:', e.message);
    }
  });

  ipcMain.handle('settings:save', (_e, next) => {
    const saved = applyConfig(next, true);
    console.log(`[settings] 已保存 ${configFile()}`);
    // 购买轮盘：用户确认后自动把 10+1 份 cfg 写到 CS2（每类勾的武器可能变了）
    if (saved.buywheel && saved.buywheel.enabled) {
      try {
        const r = buycfg.generateAll(saved.buywheel, saved.buywheel.cfgDir);
        console.log(`[buycfg] 已生成 ${r.copied.length} 份购买 cfg（roots=${r.roots}，失败 ${r.failed.length}）`);
      } catch (e) {
        console.error('[buycfg] 生成失败:', e.message);
      }
    }
    return saved;
  });

  ipcMain.handle('settings:reset', () => {
    const d = resetConfig();   // resetConfig 已经把默认值写进 config.json
    applyConfig(d, false);     // 同步推给覆盖层
    return d;
  });

  ipcMain.handle('settings:reveal', () => {
    shell.showItemInFolder(configFile());
  });

  // ---- 实时预览（模拟数据，方便边调边看）----
  ipcMain.handle('settings:preview-state', () => !!previewWin);
  ipcMain.handle('settings:toggle-preview', () => {
    const on = togglePreview();
    broadcastPreviewState();
    return on;
  });

  // 预览窗口工具条：重播 / 跳到某个阶段（只重启模拟时间线，不碰游戏）
  ipcMain.on('preview:cmd', (_e, cmd, arg) => {
    if (!previewWin) return;
    if (cmd === 'restart') { prevOffset = 0; startPrevFeed(); }
    else if (cmd === 'seek') { prevOffset = Number(arg) || 0; startPrevFeed(); }
  });

  ipcMain.handle('settings:export', async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const { canceled, filePath } = await dialog.showSaveDialog(settingsWin, {
      title: '导出 OverplayHUD 配置',
      defaultPath: `overplayhud-config-${stamp}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };

    try {
      // 包一层元信息，方便别人看出这是什么、以及是哪版导出的。
      // 导入时会自动剥掉这层。
      const payload = {
        _app: 'OverplayHUD',
        _version: app.getVersion(),
        _exportedAt: new Date().toISOString(),
        config: cfg,
      };
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
      return { ok: true, file: filePath };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('settings:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(settingsWin, {
      title: '导入 OverplayHUD 配置',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths || !filePaths.length) return { ok: false, canceled: true };

    const file = filePaths[0];
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      return { ok: false, error: '这个文件不是合法的 JSON：' + e.message };
    }

    // 兼容两种形式：带 { config: {...} } 外壳的导出文件，或者就是裸的 config.json
    const incoming = (parsed && typeof parsed.config === 'object' && parsed.config) ? parsed.config : parsed;

    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
      return { ok: false, error: '文件里没有找到配置对象' };
    }
    // 至少得像个 OverplayHUD 配置，免得随便一个 JSON 被导进来把设置冲掉
    if (!incoming.modules && !incoming.show && !incoming.hud) {
      return { ok: false, error: '这看起来不是 OverplayHUD 的配置（缺少 modules / show / hud 字段）' };
    }

    // saveConfig 会先补全默认值，所以旧版本导出的文件里缺的新字段也能填上
    const saved = applyConfig(incoming, true);
    console.log(`[settings] 已从 ${file} 导入配置`);
    return { ok: true, file, cfg: saved };
  });

  ipcMain.handle('settings:copy', () => {
    clipboard.writeText(JSON.stringify({
      _app: 'OverplayHUD',
      _version: app.getVersion(),
      _exportedAt: new Date().toISOString(),
      config: cfg,
    }, null, 2));
    return { ok: true };
  });

  // 变量表 + 可改名的武器清单。get 是函数、过不了 IPC，只传展示用的字段。
  ipcMain.handle('settings:vars', () => ({
    vars: VARS.map((v) => ({ key: v.key, label: v.label, sample: v.sample, group: v.group })),
    // _knife 是稳定假键：匕首在 GSI 里有几十个内部名（weapon_knife / *_bayonet 等），
    // 逐个列不现实。HUD 端 weaponLabel 对所有刀具回落读这个键。
    weaponNames: Object.assign({ _knife: '匕首' }, NAMES),
    grenadeKinds: GRENADE_KINDS,
    // 购买轮盘的武器目录（设置页勾选武器用）
    buyCatalog: buycfg.publicCatalog(),
  }));

  // 武器 / 刀 / 投掷物 SVG 图标：读一次缓存，HUD 与设置页各自按需取
  ipcMain.handle('hud:equip-icons', () => getEquipIcons().files);
  ipcMain.handle('settings:equip-icons', () => getEquipIcons().files);

  // 手动生成购买 cfg（保存设置时也会自动生成一次）
  ipcMain.handle('settings:generateBuycfg', () => {
    try {
      const r = buycfg.generateAll(cfg.buywheel, cfg.buywheel && cfg.buywheel.cfgDir);
      console.log(`[buycfg] 生成 ${r.copied.length} 份（roots=${r.roots}，失败 ${r.failed.length}）`);
      return { ok: r.copied.length > 0, copied: r.copied.length, failed: r.failed, roots: r.roots };
    } catch (e) {
      return { ok: false, error: e.message, copied: 0, failed: [], roots: 0 };
    }
  });

  ipcMain.on('settings:copy-text', (_e, text) => clipboard.writeText(String(text || '')));

  // ---- 首页：运行状态 + 快捷操作 ----
  ipcMain.handle('settings:status', () => statusSnapshot());

  ipcMain.handle('settings:install-cfg', () => doInstallCfg());

  ipcMain.handle('settings:gsi-info', () => {
    const src = path.join(__dirname, '..', 'cfg', CFG_NAME);
    try {
      const info = inspectGsiCfg(src);
      return { ok: true, roots: info.roots || [], running: !!info.running, expect: CFG_NAME };
    } catch (e) {
      return { ok: false, roots: [], error: e.message };
    }
  });

  ipcMain.handle('settings:toggle-hud', () => {
    if (!win) return { ok: false, visible: false };
    if (win.isVisible()) win.hide(); else win.show();
    pushStatus();
    return { ok: true, visible: win.isVisible() };
  });

  ipcMain.handle('settings:reload-config', () => {
    cfg = loadConfig();
    applyConfig(cfg, false);
    pushStatus();
    return { ok: true, cfg };
  });

  ipcMain.on('settings:open-devtools', () => {
    if (win) win.webContents.openDevTools({ mode: 'detach' });
  });

  // ---- 教程（文字版 md 文档）----
  ipcMain.handle('settings:tutorial', () => readTutorial());
  ipcMain.handle('settings:open-tutorial', async () => {
    const p = tutorialPath();
    const err = await shell.openPath(p);
    if (err) { shell.showItemInFolder(p); return { ok: false, error: err, path: p }; }
    return { ok: true, path: p };
  });
  ipcMain.handle('settings:reveal-tutorial', () => {
    shell.showItemInFolder(tutorialPath());
    return { ok: true, path: tutorialPath() };
  });

  // ---- 关于页 ----
  // 版本号一律现取（= package.json 的 version），界面不许写死，
  // 否则改版本时总有一处忘了同步。
  ipcMain.handle('settings:app-info', () => ({
    ok: true,
    name: 'OverplayHUD',
    version: app.getVersion(),
    blog: 'https://blog.taoxi.ink',
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  }));

  // 打开外部链接。⚠️ 只放行 http / https：
  // shell.openExternal 拿到 file:// 之类是能直接唤起本机程序的，不能给它别的可能。
  ipcMain.handle('settings:open-external', (_e, url) => {
    const u = String(url || '').trim();
    if (!/^https?:\/\//i.test(u)) return { ok: false, error: '只允许 http / https 链接' };
    try {
      shell.openExternal(u);
      return { ok: true, url: u };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ---- 游戏侧配套命令（关原生 HUD / 保留雷达与队友标识 / Alt 开关 / 曳光弹）----
  // ⚠️ 只往 CS2 的 cfg 目录写文本文件，绝不模拟按键、不注入进程 —— 和项目底线一致。
  //    命令生不生效完全由游戏自己决定，程序只负责「替用户把命令抄好」。
  ipcMain.handle('gamecmds:info', () => Object.assign({
    ok: true,
    catalog: gamecmds.CATALOG,
    groups: gamecmds.GROUPS,
    enabled: gamecmds.resolveEnabled(cfg.gamecmds && cfg.gamecmds.enabled),
    autoexec: !!(cfg.gamecmds && cfg.gamecmds.autoexec),
  }, gamecmds.inspect()));

  // 纯计算：按当前勾选预览会写进 cfg 的正文（不碰文件系统，勾一下就能刷新）
  ipcMain.handle('gamecmds:text', (_e, map) => gamecmds.cfgText(map || {}));

  // 写入 CS2。顺带把界面上的勾选（草稿）落盘，省得用户忘了点「保存」
  ipcMain.handle('gamecmds:write', (_e, draft) => {
    let c = cfg;
    if (draft && typeof draft === 'object') {
      try {
        c = applyConfig(draft, true);
        console.log(`[gamecmds] 已保存 ${configFile()}`);
      } catch (e) {
        console.error('[gamecmds] 保存配置失败:', e.message);
      }
    }
    const gc = (c && c.gamecmds) || {};
    const en = gamecmds.resolveEnabled(gc.enabled);

    const wr = gamecmds.writeCfg(en);
    const ax = gc.autoexec ? gamecmds.writeAutoexec(en) : gamecmds.removeAutoexec();
    console.log(`[gamecmds] cfg 写入 ${wr.copied.length} 处（roots=${wr.roots}，失败 ${wr.failed.length}）`
      + `；autoexec ${gc.autoexec ? '写入' : '清除'}`);

    return Object.assign({
      ok: wr.copied.length > 0,
      copied: wr.copied,
      failed: wr.failed.concat(ax.failed || []),
      counts: { on: gamecmds.selected(en).length, all: gamecmds.IDS.length },
      autoexec: !!gc.autoexec,
    }, gamecmds.inspect());
  });

  ipcMain.handle('gamecmds:remove', () => {
    let ax = { removed: [] };
    try { gamecmds.removeCfg(); } catch (e) { console.error('[gamecmds] 删除 cfg 失败:', e.message); }
    try { ax = gamecmds.removeAutoexec(); } catch (e) { console.error('[gamecmds] 清除 autoexec 区块失败:', e.message); }
    // 配置里也把「开机自动执行」关掉，否则下次写入又会装回去
    if (cfg && cfg.gamecmds && cfg.gamecmds.autoexec) {
      try {
        applyConfig(Object.assign({}, cfg, {
          gamecmds: Object.assign({}, cfg.gamecmds, { autoexec: false }),
        }), true);
      } catch (e) { /* 写不进配置也不影响已经清掉的文件 */ }
    }
    return Object.assign({ ok: true, autoexecRemoved: ax.removed || [] }, gamecmds.inspect());
  });

  ipcMain.handle('gamecmds:reveal', () => {
    const info = gamecmds.inspect();
    for (const r of info.roots) {
      for (const d of r.dirs) {
        if (d.installed) { shell.showItemInFolder(path.join(d.dir, gamecmds.CFG_NAME)); return { ok: true }; }
      }
    }
    // 还没写过：退而定位 CS2 的 cfg 目录
    for (const r of info.roots) {
      const hit = r.dirs.find((d) => d.exists);
      if (hit) { shell.openPath(hit.dir); return { ok: true, dir: true }; }
    }
    return { ok: false };
  });

  ipcMain.handle('gamecmds:copy-exec', () => {
    clipboard.writeText(gamecmds.execLine());
    return { ok: true, text: gamecmds.execLine() };
  });

  // ---- 配置方案（本地多套存档）----
  ipcMain.handle('profiles:list', () => ({
    ok: true, dir: profileDir(), active: readActiveProfile(), list: listProfiles(),
  }));

  ipcMain.handle('profiles:save-as', (_e, name, note) => {
    const n = String(name || '').trim();
    if (!n) return { ok: false, error: '方案名不能为空' };
    if (fs.existsSync(profileFile(n))) return { ok: false, error: '已经有同名方案了' };
    try { writeProfile(n, cfg, note, false); } catch (e) { return { ok: false, error: e.message }; }
    setActiveProfile(n);
    return { ok: true, list: listProfiles(), active: n };
  });

  ipcMain.handle('profiles:update', (_e, name) => {
    const n = String(name || '').trim();
    if (!n) return { ok: false, error: '方案名不能为空' };
    let note = '';
    let builtin = false;
    try {
      const j = JSON.parse(fs.readFileSync(profileFile(n), 'utf8'));
      note = j.note || ''; builtin = !!j.builtin;
    } catch (e) { /* 文件不存在 → 当新建 */ }
    try { writeProfile(n, cfg, note, builtin); } catch (e) { return { ok: false, error: e.message }; }
    setActiveProfile(n);
    return { ok: true, list: listProfiles(), active: n };
  });

  ipcMain.handle('profiles:apply', (_e, name) => {
    const n = String(name || '').trim();
    let j;
    try { j = JSON.parse(fs.readFileSync(profileFile(n), 'utf8')); }
    catch (e) { return { ok: false, error: '读不到方案文件：' + e.message }; }
    const incoming = (j && typeof j.config === 'object' && j.config) ? j.config : j;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
      return { ok: false, error: '方案里没有配置对象' };
    }
    const saved = applyConfig(incoming, true);
    setActiveProfile(n);
    console.log(`[profile] 已切换到「${n}」`);
    return { ok: true, cfg: saved, list: listProfiles(), active: n };
  });

  ipcMain.handle('profiles:delete', (_e, name) => {
    const n = String(name || '').trim();
    const file = profileFile(n);
    if (!fs.existsSync(file)) return { ok: false, error: '方案不存在' };
    try { fs.unlinkSync(file); } catch (e) { return { ok: false, error: e.message }; }
    if (readActiveProfile() === n) setActiveProfile('');
    return { ok: true, list: listProfiles() };
  });

  ipcMain.handle('profiles:rename', (_e, oldName, newName) => {
    const o = String(oldName || '').trim();
    const n = String(newName || '').trim();
    if (!o || !n) return { ok: false, error: '名字不能为空' };
    const src = profileFile(o);
    if (!fs.existsSync(src)) return { ok: false, error: '原方案不存在' };
    const dst = profileFile(n);
    if (dst !== src && fs.existsSync(dst)) return { ok: false, error: '已经有同名方案了' };
    try {
      const j = JSON.parse(fs.readFileSync(src, 'utf8'));
      j.name = n;
      fs.writeFileSync(dst, JSON.stringify(j, null, 2) + '\n', 'utf8');
      if (dst !== src) fs.unlinkSync(src);
    } catch (e) { return { ok: false, error: e.message }; }
    if (readActiveProfile() === o) setActiveProfile(n);
    return { ok: true, list: listProfiles(), active: n };
  });

  ipcMain.handle('profiles:reveal', () => {
    ensureProfileDir();
    shell.openPath(profileDir());
    return { ok: true, dir: profileDir() };
  });

  ipcMain.on('settings:minimize', () => settingsWin && settingsWin.minimize());
  ipcMain.on('settings:close', () => settingsWin && settingsWin.close());

  // ---- 购买轮盘：点格子下单 → 注入按键 / 控制台指令到 CS2 ----
  // 这是本项目唯一被批准「模拟输入」的地方（用户明确批准，仅限购买时间、仅本地玩家自用）。
  ipcMain.on('buy:exec', (_e, slot) => {
    const bw = cfg.buywheel || {};
    const r = execBuy({
      execMode: bw.execMode,
      consoleKey: bw.consoleKey,
      command: slot && slot.command,
      key: slot && slot.key,
    });
    if (wheelWin && !wheelWin.webContents.isDestroyed()) {
      wheelWin.webContents.send('buy:result', Object.assign({ type: 'weapon', id: slot && slot.id }, r));
    }
    // 找不到 cs2 进程时，把命令复制到剪贴板，玩家自己贴控制台也不耽误
    if (!r.ok && r.reason === 'no_cs2') {
      try { clipboard.writeText((slot && slot.command) || ''); } catch (e) { /* ignore */ }
    }
    console.log(`[buy] ${slot && slot.id} -> ${r.ok ? 'ok' : 'fail'} (${r.mode}${r.reason ? '/' + r.reason : ''})`);
  });

  // ---- 购买轮盘：点一级分类 → exec 对应阵营的分类 cfg（激活绑定）----
  // 激活固定走控制台（key 模式对 exec 无意义）。成功后渲染层才切到二级菜单。
  ipcMain.on('buy:activate', (_e, payload) => {
    const bw = cfg.buywheel || {};
    const team = payload && payload.team === 'T' ? 'T' : 'CT';
    const cat = payload && payload.cat;
    const valid = buycfg.CATEGORIES.some((c) => c.id === cat);
    if (!valid) return;

    const command = `exec ${buycfg.cfgName(team, cat).replace(/\.cfg$/i, '')}`;
    const r = execBuy({ execMode: 'console', consoleKey: bw.consoleKey, command });
    if (r.ok) wheelArmed = true;
    if (wheelWin && !wheelWin.webContents.isDestroyed()) {
      wheelWin.webContents.send('buy:result', Object.assign({ type: 'activate', cat, team }, r));
    }
    if (!r.ok && r.reason === 'no_cs2') {
      try { clipboard.writeText(command); } catch (e) { /* ignore */ }
    }
    console.log(`[buy] exec ${command} -> ${r.ok ? 'ok' : 'fail'} (${r.reason || r.mode})`);
  });

  ipcMain.on('buy:close', () => closeWheel());
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'tray.png');
  tray = new Tray(iconPath);
  tray.setToolTip('OverplayHUD');
  updateTrayMenu();
  tray.on('click', () => tray.popUpContextMenu());
}

function updateTrayMenu() {
  if (!tray) return;
  const template = [
    { label: 'OverplayHUD', enabled: false },
    { type: 'separator' },
    {
      label: win && win.isVisible() ? '隐藏 HUD' : '显示 HUD',
      click: () => (win.isVisible() ? win.hide() : win.show()),
    },
    {
      label: USE_MOCK ? '（当前：模拟数据）' : '（当前：真实 GSI）',
      enabled: false,
    },
    {
      label: settingsWin ? '设置（窗口已打开）' : '设置…',
      click: () => openSettings(),
    },
    {
      label: previewWin ? '关闭实时预览' : '实时预览（模拟数据）…',
      click: () => { togglePreview(); updateTrayMenu(); },
    },
    {
      label: '重新加载配置文件',
      click: () => {
        applyConfig(loadConfig(), false);
      },
    },
    ...(cfg.buywheel && cfg.buywheel.enabled
      ? [{
          label: wheelWin ? '关闭购买轮盘（测试）' : '测试购买轮盘',
          click: () => {
            if (wheelWin) closeWheel();
            else openWheel(hub && hub.snapshot ? hub.snapshot : { connected: false });
          },
        }]
      : []),
    {
      label: '打开开发者工具',
      click: () => win && win.webContents.openDevTools({ mode: 'detach' }),
    },
    { type: 'separator' },
    {
      label: '安装 GSI 配置到 CS2',
      click: () => installCfgFromTray(),
    },
    {
      label: '打开配置文件位置',
      click: () => shell.showItemInFolder(configFile()),
    },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

/**
 * 真正装 GSI cfg 的公共逻辑（托盘弹窗与设置首页共用）。
 * 只做事情、返回结构化结果，不弹窗 —— 弹窗交给调用方决定。
 */
function doInstallCfg() {
  const src = path.join(__dirname, '..', 'cfg', CFG_NAME);
  if (!fs.existsSync(src)) return { ok: false, reason: 'no_source', src };
  const before = inspectGsiCfg(src);
  if (!before.roots.length) return { ok: false, reason: 'no_cs2', src };
  const { copied, failed } = installGsiCfg(src);
  return {
    ok: copied.length > 0,
    reason: copied.length ? '' : 'copy_failed',
    src,
    copied,
    failed,
    roots: before.roots.length,
    running: !!before.running,
  };
}

/**
 * 从托盘装 GSI 配置。
 * 打包之后没有命令行可用，所以这个入口是必须的 —— 否则拿到安装包的人装不上。
 */
function installCfgFromTray() {
  const r = doInstallCfg();

  if (r.reason === 'no_source') {
    dialog.showMessageBox({
      type: 'error',
      title: '装不了',
      message: '程序里没找到 GSI 配置文件',
      detail: `期望的位置：${r.src}`,
    });
    return;
  }
  if (r.reason === 'no_cs2') {
    dialog.showMessageBox({
      type: 'error',
      title: '没找到 CS2',
      message: '自动探测不到 Counter-Strike 2 的安装目录',
      detail: '如果你是自定义路径装的 Steam，可能探测不到。\n'
        + '可以手动把程序目录里 cfg\\' + CFG_NAME + ' 复制到：\n'
        + '<CS2>\\game\\csgo\\cfg\\ 和 <CS2>\\game\\core\\cfg\\',
    });
    return;
  }

  const lines = r.copied.map((p) => '✅ ' + p).concat(r.failed.map((f) => '❌ ' + f));
  let detail = lines.join('\n');
  if (r.running) {
    detail += '\n\n⚠️ CS2 现在正在运行。GSI 配置必须在游戏启动前就位，'
      + '请完全退出 CS2 再重新打开（重连服务器没用）。';
  }

  dialog.showMessageBox({
    type: r.copied.length ? 'info' : 'error',
    title: r.copied.length ? 'GSI 配置已装好' : '安装失败',
    message: r.copied.length
      ? `已写入 ${r.copied.length} 处，完全重启 CS2 后生效`
      : '一处都没装上',
    detail,
  });
}

// ============================================================
// 运行状态（设置首页用）
//
// 首页显示的所有信息都从这一份快照里取 —— 主进程每秒推一次，
// 界面永远和真实进程一致，不需要各种零散 IPC。
// ============================================================

function statusSnapshot() {
  const snap = (hub && hub.snapshot) || null;
  const c = cfg || {};
  return {
    running: !!(win && !win.webContents.isDestroyed()),
    hudVisible: !!(win && win.isVisible()),
    connected: !!(snap && snap.connected),
    inMatch: !!(snap && snap.visible),
    phase: (snap && snap.phase) || '',
    port: c.port,
    mock: USE_MOCK,
    fit: c.fit || 'contain',
    design: `${c.designWidth}×${c.designHeight}`,
    scale: c.scale,
    displayIndex: c.displayIndex,
    font: (c.font && c.font.family) || '内置',
    configFile: configFile(),
    profileDir: profileDir(),
    previewOn: !!previewWin,
    buywheel: !!(c.buywheel && c.buywheel.enabled),
    gamecmds: gamecmds.selected(c.gamecmds && c.gamecmds.enabled).length,
    gamecmdsAll: gamecmds.IDS.length,
    gamecmdsAutoexec: !!(c.gamecmds && c.gamecmds.autoexec),
    adv: !!(c.adv && c.adv.enabled),
    events: !!(c.events && c.events.enabled),
    shapes: (c.shapes || []).length,
    custom: (c.custom || []).length,
    icons: (c.icons || []).length,
    eventsOn: ['kill', 'multi', 'death', 'assist', 'mvp']
      .filter((k) => c.events && c.events[k] && c.events[k].on !== false),
  };
}

let statusTimer = null;

function pushStatus() {
  if (settingsWin && !settingsWin.webContents.isDestroyed()) {
    settingsWin.webContents.send('settings:status', statusSnapshot());
  }
}

function startStatusPush() {
  if (statusTimer) return;
  statusTimer = setInterval(pushStatus, 1000);
}

// ============================================================
// 配置方案（多套配置存档在本地）
//
// 目录：<配置目录>/profiles/*.json，一个文件 = 一套方案。
// 文件名由方案名转义而来（去掉 Windows 非法字符），文件里记 name / savedAt / note。
// 「当前激活哪一套」单独记在 profiles/_active.json，不污染 config.json。
// ============================================================

const PROFILE_DIR = 'profiles';
const ACTIVE_FILE = '_active.json';
const BUILTIN_PROFILE = '默认';

function profileDir() {
  return path.join(path.dirname(configFile()), PROFILE_DIR);
}

function ensureProfileDir() {
  const d = profileDir();
  try { fs.mkdirSync(d, { recursive: true }); } catch (e) { /* 只读也不影响启动 */ }
  return d;
}

function safeProfileName(name) {
  const s = String(name == null ? '' : name)
    .replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 40);
  return s || 'profile';
}

function profileFile(name) {
  return path.join(profileDir(), safeProfileName(name) + '.json');
}

function readActiveProfile() {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(profileDir(), ACTIVE_FILE), 'utf8'));
    return typeof j.name === 'string' ? j.name : '';
  } catch (e) { return ''; }
}

function setActiveProfile(name) {
  try {
    ensureProfileDir();
    fs.writeFileSync(path.join(profileDir(), ACTIVE_FILE),
      JSON.stringify({ name: String(name || ''), at: new Date().toISOString() }, null, 2), 'utf8');
  } catch (e) { /* 忽略 */ }
}

function writeProfile(name, config, note, builtin) {
  ensureProfileDir();
  const file = profileFile(name);
  const payload = {
    _app: 'OverplayHUD',
    _version: app.getVersion(),
    name: String(name),
    note: note || '',
    builtin: !!builtin,
    savedAt: new Date().toISOString(),
    config,
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return file;
}

function listProfiles() {
  const d = ensureProfileDir();
  let files = [];
  try { files = fs.readdirSync(d).filter((f) => /\.json$/i.test(f) && f !== ACTIVE_FILE); }
  catch (e) { return []; }
  const active = readActiveProfile();
  const nowName = active;
  const out = [];
  for (const f of files) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
      const name = String(j.name || f.replace(/\.json$/i, ''));
      out.push({
        name,
        note: j.note || '',
        savedAt: j.savedAt || null,
        builtin: !!j.builtin,
        active: name === nowName,
      });
    } catch (e) { /* 坏文件跳过，不让它拖垮整个列表 */ }
  }
  out.sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh'));
  return out;
}

/** 「默认」方案的内容：当前配置去掉播报与画图元素（用户要的纯净基准） */
function builtinProfileConfig(base) {
  const out = JSON.parse(JSON.stringify(base || loadConfig()));
  if (out.events) out.events.enabled = false;
  if (out.adv) out.adv.enabled = false;
  out.shapes = [];
  return out;
}

/** 方案目录空着的时候，自动放一份内置「默认」方案，并设为当前 */
function ensureBuiltinProfile() {
  const d = ensureProfileDir();
  let has = false;
  try { has = fs.readdirSync(d).some((f) => /\.json$/i.test(f) && f !== ACTIVE_FILE); }
  catch (e) { has = false; }
  if (has) return;
  try {
    writeProfile(BUILTIN_PROFILE, builtinProfileConfig(cfg), '内置基准：基础 HUD，不含播报与画图元素', true);
    setActiveProfile(BUILTIN_PROFILE);
    console.log('[profile] 已生成内置方案「' + BUILTIN_PROFILE + '」');
  } catch (e) {
    console.error('[profile] 生成内置方案失败:', e.message);
  }
}

// ============================================================
// 教程文档
// ============================================================

const TUTORIAL_NAME = 'TUTORIAL.md';

function tutorialPath() {
  return path.join(__dirname, '..', TUTORIAL_NAME);
}

function readTutorial() {
  try {
    return { ok: true, path: tutorialPath(), text: fs.readFileSync(tutorialPath(), 'utf8') };
  } catch (e) {
    return { ok: false, path: tutorialPath(), text: '', error: e.message };
  }
}

// 已经有一个实例在跑时，第二条命令（比如 npm run settings）不会启动新进程，
// 而是把参数交给已经在跑的那个实例处理 —— 这里负责把设置窗口叫出来。
app.on('second-instance', (_e, argv) => {
  if (argv.includes('--settings')) openSettings();
  if (argv.includes('--preview')) openPreview();
});

app.on('will-quit', () => {
  if (ticker) clearInterval(ticker);
  if (statusTimer) clearInterval(statusTimer);
  if (stopMock) stopMock();
  if (stopPrevMock) stopPrevMock();
  if (hub) hub.stop();
});

app.on('window-all-closed', (e) => {
  // 覆盖层窗口不是"主窗口"，关掉不应退出进程；由托盘菜单退出
  e.preventDefault();
});
