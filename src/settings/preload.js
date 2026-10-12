'use strict';

/**
 * 设置窗口的 preload。
 * 只暴露设置界面需要的那几个能力，不碰 HUD 那边的通道。
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('oph', {
  /** 读当前配置 + 默认值 + 配置文件路径 */
  get: () => ipcRenderer.invoke('settings:get'),

  /** 实时预览：只推给覆盖层，不写文件 */
  preview: (cfg) => ipcRenderer.send('settings:preview', cfg),

  /** 保存到 config.json */
  save: (cfg) => ipcRenderer.invoke('settings:save', cfg),

  /** 恢复默认并保存 */
  reset: () => ipcRenderer.invoke('settings:reset'),

  /** 在资源管理器里定位配置文件 */
  reveal: () => ipcRenderer.invoke('settings:reveal'),

  /** 导出配置到文件（分享给别人） */
  exportCfg: () => ipcRenderer.invoke('settings:export'),

  /** 从文件导入配置（会覆盖当前设置，导入方自己要先确认） */
  importCfg: () => ipcRenderer.invoke('settings:import'),

  /** 把当前配置复制成 JSON 文本，方便直接粘给别人 */
  copyCfg: () => ipcRenderer.invoke('settings:copy'),

  /** 复制一小段文本（file:// 页面的 navigator.clipboard 不可靠，走主进程） */
  copyText: (text) => ipcRenderer.send('settings:copy-text', String(text)),

  /** 自定义文本可用的变量表（和 HUD 层共用 src/vars.js） */
  vars: () => ipcRenderer.invoke('settings:vars'),

  /** 立即把购买轮盘的 10+1 份 cfg 写到 CS2（保存设置时也会自动生成） */
  generateBuycfg: () => ipcRenderer.invoke('settings:generateBuycfg'),

  /** 实时预览：开/关那个「模拟数据」预览窗口，返回最新状态 */
  togglePreview: () => ipcRenderer.invoke('settings:toggle-preview'),

  /** 预览窗口当前是否开着 */
  getPreviewState: () => ipcRenderer.invoke('settings:preview-state'),

  /** 预览窗口被窗口自己关掉时，主进程会推过来同步按钮状态 */
  onPreviewState: (cb) => ipcRenderer.on('settings:preview-state', (_e, on) => cb(!!on)),

  // ---- 运行状态（首页）----
  /** 立即取一次运行状态 */
  status: () => ipcRenderer.invoke('settings:status'),
  /** 主进程每秒推一次运行状态 */
  onStatus: (cb) => ipcRenderer.on('settings:status', (_e, st) => cb(st)),

  // ---- 首页快捷操作 ----
  installCfg: () => ipcRenderer.invoke('settings:install-cfg'),
  gsiInfo: () => ipcRenderer.invoke('settings:gsi-info'),
  toggleHud: () => ipcRenderer.invoke('settings:toggle-hud'),
  reloadConfig: () => ipcRenderer.invoke('settings:reload-config'),
  openDevTools: () => ipcRenderer.send('settings:open-devtools'),

  // ---- 教程 ----
  tutorial: () => ipcRenderer.invoke('settings:tutorial'),
  openTutorial: () => ipcRenderer.invoke('settings:open-tutorial'),
  revealTutorial: () => ipcRenderer.invoke('settings:reveal-tutorial'),

  /** 关于页：版本号 / 作者博客等（版本现取，界面不写死） */
  appInfo: () => ipcRenderer.invoke('settings:app-info'),
  /** 用系统默认浏览器打开外部链接（主进程只放行 http / https） */
  openExternal: (url) => ipcRenderer.invoke('settings:open-external', String(url)),

  // ---- 配置方案（本地多套存档）----
  profiles: {
    list: () => ipcRenderer.invoke('profiles:list'),
    saveAs: (name, note) => ipcRenderer.invoke('profiles:save-as', name, note),
    update: (name) => ipcRenderer.invoke('profiles:update', name),
    apply: (name) => ipcRenderer.invoke('profiles:apply', name),
    remove: (name) => ipcRenderer.invoke('profiles:delete', name),
    rename: (a, b) => ipcRenderer.invoke('profiles:rename', a, b),
    reveal: () => ipcRenderer.invoke('profiles:reveal'),
  },

  // ---- 原生 HUD / 游戏命令（把配套命令写进 CS2 的 cfg）----
  gamecmds: {
    info: () => ipcRenderer.invoke('gamecmds:info'),
    text: (map) => ipcRenderer.invoke('gamecmds:text', map),
    write: (draft) => ipcRenderer.invoke('gamecmds:write', draft),
    remove: () => ipcRenderer.invoke('gamecmds:remove'),
    reveal: () => ipcRenderer.invoke('gamecmds:reveal'),
    copyExec: () => ipcRenderer.invoke('gamecmds:copy-exec'),
  },

  minimize: () => ipcRenderer.send('settings:minimize'),
  close: () => ipcRenderer.send('settings:close'),
});
