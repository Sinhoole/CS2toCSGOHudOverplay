'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overplayhud', {
  onConfig: (cb) => ipcRenderer.on('hud:config', (_e, payload) => cb(payload)),
  onBounds: (cb) => ipcRenderer.on('hud:bounds', (_e, bounds) => cb(bounds)),
  onSnapshot: (cb) => ipcRenderer.on('hud:snapshot', (_e, snapshot) => cb(snapshot)),

  // ---- 预览窗口专用（真实覆盖层不会调用）----
  // 只用来「重播 / 跳到某个阶段」模拟时间线，不含任何游戏输入。
  previewCmd: (cmd, arg) => ipcRenderer.send('preview:cmd', String(cmd), arg),
  onPreviewReset: (cb) => ipcRenderer.on('hud:preview-reset', () => cb()),

  /** 武器/刀/投掷物 SVG 图标 map（文件名 → 归一化 SVG 字符串） */
  equipIcons: () => ipcRenderer.invoke('hud:equip-icons'),
});
