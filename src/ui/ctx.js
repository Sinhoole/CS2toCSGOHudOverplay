'use strict';

/**
 * OphCtx · 设置界面的编辑上下文
 *
 * 一个地方存放「正在编辑的那份配置」，一个函数负责所有写操作（commit）。
 * 重构前 `state` 是全局裸对象、`commit()` 靠闭包抓 markDirty/schedulePreview，
 * 现在把关系显式化：写 → 通知（标脏 + 推预览 + 广播 config:changed）。
 *
 * 注意 state 本身保持「普通对象」形状：state.cfg / state.vars / state.status …
 * 拆分出来的页面模块仍然按老写法读它，行为零变化。
 */
;(function () {
  const TAG = '[ui:ctx]';

  const state = {
    cfg: null,        // 当前编辑中的配置（工作副本）
    defaults: null,   // 出厂默认值，用于「重置本模块」
    dirty: false,
    vars: [],         // 自定义文本可用的变量（来自 src/vars.js）
    weaponNames: {},  // 默认武器名表
    grenadeKinds: [], // 投掷物种类
    status: null,     // 主进程推来的运行状态（首页用）
  };

  const { OphStore, OphPath } = globalThis;

  if (!OphStore || !OphPath) {
    console.error(`${TAG} 缺少 OphStore / OphPath —— 检查 manifest 顺序（core 必须先于 ui）`);
  }

  /** 所有配置写入的唯一入口。改动只会经由这里，所以预览推送不会漏 */
  const store = OphStore.create({
    source: () => state.cfg,
    onChange: (patch, root) => {
      state.dirty = true;
      const app = globalThis.OphApp;
      if (app) { app.markDirty(); app.schedulePreview(); }
      const bus = globalThis.OphBus?.app;
      if (bus) bus.emit('config:changed', root, patch);
    },
  });

  function commit(path, val) {
    if (!state.cfg) { console.error(`${TAG} commit 时 state.cfg 尚未就绪：「${path}」`); return; }
    store.set(path, val);
  }

  globalThis.OphCtx = Object.assign(globalThis.OphCtx || {}, {
    state,
    store,
    commit,

    /** 读一个路径（带默认值） */
    get(path, def) { return store.get(path, def); },

    /** 整份换掉（读取 / 导入 / 恢复默认）：调用方负责随后 rebuild + 推预览 */
    replace(cfg) {
      state.cfg = cfg;
      store.touch(['']);
      return cfg;
    },

    /** 出厂默认里某个路径的值（「重置本模块」用） */
    defaultOf(path, def) {
      const v = OphPath.getPath(state.defaults || {}, path);
      return v === undefined ? def : v;
    },
  });
})();
