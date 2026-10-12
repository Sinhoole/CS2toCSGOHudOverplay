'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('oph', {
  onConfig: (cb) => ipcRenderer.on('buywheel:config', (_e, payload) => cb(payload)),
  onSnapshot: (cb) => ipcRenderer.on('buywheel:snapshot', (_e, snapshot) => cb(snapshot)),
  onResult: (cb) => ipcRenderer.on('buy:result', (_e, r) => cb(r)),
  /** 二级菜单里点武器：向 CS2 注入按键 / 控制台 buy 命令 */
  exec: (slot) => ipcRenderer.send('buy:exec', slot),
  /** 一级菜单里点分类：让 CS2 exec 该阵营 × 分类 cfg（重新绑定购买键） */
  activate: (team, cat) => ipcRenderer.send('buy:activate', { team, cat }),
  requestClose: () => ipcRenderer.send('buy:close'),
});
