'use strict';

/**
 * app · 设置界面宿主（最后加载）
 *
 * 它的职责只有四件：
 *   1. 把窗口里的按钮/快捷键接到命令上（保存、重读、导出、导入、恢复默认、预览）
 *   2. 通过 OphKernel 声明「功能」——主题、检索、状态流、快捷键
 *   3. 读一次配置并把界面搭起来（init）
 *   4. 出错时给出可读的失败页，而不是白屏
 *
 * ⚠️ 约定：宿主只依赖**框架层**（core / ui / app-api）与注册表。
 *    任何「页面级」符号（OphSecHome / OphSecCustom / OphSecGamecmds …）
 *    都按可选访问 —— 删掉那一页，宿主只会少一个钩子，而不是整个界面起不来。
 */
;(function () {
  const TAG = '[settings:app]';

  const { el } = globalThis.OphDOM;
  const { state, store, commit } = globalThis.OphCtx;
  const { setStatus, toast, rebuild, activate, markDirty } = globalThis.OphApp;
  const { OphSections } = globalThis;
  const bus = globalThis.OphBus.app;

  const req = (name) => {
    const v = globalThis[name];
    if (!v) throw new Error(`${TAG} 缺少 ${name} —— 检查 manifest 顺序`);
    return v;
  };
  const opt = (name) => globalThis[name] || null;

  // ============================================================
  // 控件类型 → 实现（唯一一处“接线板”）
  // 以后加控件类型：在 ui/controls/ 里写好工厂，来这里加一行。
  // ============================================================

  function wireControlTypes() {
    const Schema = req('OphSchema');
    const C = req('OphControls');
    Schema.registerType('num',    { create: (f) => C.numControl(f) });
    Schema.registerType('color',  { create: (f) => C.colorControl(f) });
    Schema.registerType('switch', { create: (f) => C.switchControl(f) });
    Schema.registerType('select', { create: (f) => C.selectControl(f) });
    Schema.registerType('text',   { create: (f) => C.textControl(f) });
    console.log(`${TAG} 已注册控件类型：${Schema.types().join(' / ')}`);
  }

  // ============================================================
  // 配置读写
  // ============================================================

  async function doSave() {
    try {
      const saved = await window.oph.save(state.cfg);
      state.cfg = saved;
      state.dirty = false;
      document.getElementById('dirty').hidden = true;
      setStatus('已保存', 'ok');
      toast('已保存到 config.json', 'ok');
      bus.emit('config:saved', saved);
      globalThis.OphEffects?.haptic(0.35, 60, 'ui');   // 触感缝：现在无声无息，接上震动即生效
    } catch (e) {
      setStatus('保存失败：' + e.message, 'err');
      toast('保存失败：' + e.message, 'err');
    }
  }

  async function doReload() {
    const data = await window.oph.get();
    state.cfg = data.cfg;
    state.defaults = data.defaults;
    state.dirty = false;
    document.getElementById('dirty').hidden = true;
    setStatus('已重新读取');
    rebuild();
    reindex();
    window.oph.preview(state.cfg);
    toast('已放弃改动并重新读取配置');
  }

  async function doExport() {
    const r = await window.oph.exportCfg();
    if (r.canceled) return;
    if (!r.ok) { toast('导出失败：' + r.error, 'err'); return; }
    toast('已导出到 ' + r.file, 'ok');
    setStatus('已导出', 'ok');
  }

  async function doCopy() {
    await window.oph.copyCfg();
    toast('配置 JSON 已复制到剪贴板', 'ok');
  }

  async function doImport() {
    if (state.dirty && !confirm('当前存在未保存的改动，导入将直接覆盖。\n\n继续导入？')) return;

    const r = await window.oph.importCfg();
    if (r.canceled) return;
    if (!r.ok) {
      toast('导入失败：' + r.error, 'err');
      setStatus('导入失败：' + r.error, 'err');
      return;
    }

    // 主进程已经写盘了，这里同步界面
    state.cfg = r.cfg;
    opt('OphSecCustom')?.normalizeCustom();
    state.dirty = false;
    document.getElementById('dirty').hidden = true;
    rebuild();
    reindex();
    window.oph.preview(state.cfg);
    setStatus('已导入', 'ok');
    toast('已从 ' + r.file + ' 导入', 'ok');
  }

  async function doReset() {
    if (!confirm('确认将所有设置恢复为出厂默认？\n当前 config.json 将被覆盖。')) return;
    const saved = await window.oph.reset();
    state.cfg = saved;
    state.dirty = false;
    document.getElementById('dirty').hidden = true;
    setStatus('已恢复默认', 'ok');
    rebuild();
    reindex();
    window.oph.preview(state.cfg);
    toast('已恢复出厂默认', 'ok');
  }

  // ============================================================
  // 元素检索（索引随界面重建）
  // ============================================================

  let search = null;

  function reindex() {
    if (!search) return 0;
    const n = search.index(OphSections.searchEntries());
    console.log(`${TAG} 检索索引：${n} 条`);
    return n;
  }

  /** 供后期「检索元素」输入框直接调用；返回 [{entry, score}] */
  function query(q, o) {
    if (!search) return [];
    return search.query(q, o);
  }

  // ============================================================
  // 功能声明（OphKernel）
  // ============================================================

  function defineFeatures() {
    const Kernel = req('OphKernel');
    const Themes = opt('OphThemes');
    const Search = opt('OphSearch');
    const Effects = opt('OphEffects');
    const kernel = Kernel.create({ bus });

    // ---- 主题：外观全部走 CSS 变量，切主题只换一份样式表 ----
    kernel.define({
      id: 'themes',
      order: 10,
      init() {
        if (!Themes) return console.warn(TAG + ' 主题层缺失，跳过');
        // 实例化一套主题表（OphThemes 是工厂，不是实例）
        const themes = Themes.create({ bus });
        // 内置默认主题（令牌定义在 settings.css 的 :root 里，href 为空即「用内置那份」）
        themes.register({ id: 'newsprint', name: '报刊风', href: null,
          desc: '纸白 + 油墨黑 + 编辑红的报刊风，零圆角、硬投影' });
        // 想加主题：新建 src/themes/<id>.css（覆盖同名变量）后在这里 register 一行即可
        themes.boot('newsprint');
        globalThis.OphApp.themes = themes;
        console.log(`${TAG} 主题：${themes.list().map((t) => t.id).join(' / ')}（当前 ${themes.current()}）`);
      },
    });

    // ---- 检索：把每个页面与字段编进索引，后期搜索框直接用 ----
    kernel.define({
      id: 'search',
      order: 20,
      init(ctx) {
        if (!Search) return console.warn(TAG + ' 检索层缺失，跳过');
        search = Search.create();
        ctx.search = search;
      },
      mount() { reindex(); },
    });

    // ---- 状态流：主进程每秒推一次，转发到总线，并喂给首页 ----
    kernel.define({
      id: 'status-stream',
      order: 30,
      init() {
        if (!window.oph.onStatus) return;
        window.oph.onStatus((st) => {
          state.status = st;
          bus.emit('status:update', st);
          // 首页自己负责重绘；它没上架（或已删除）就只是少一个订阅者
          globalThis.OphSecHome?.paint?.(st);
        });
      },
      mount() { globalThis.OphSecHome?.pushStatusNow?.(); },
    });

    // ---- 快捷键 ----
    kernel.define({
      id: 'hotkeys',
      order: 40,
      init() {
        document.addEventListener('keydown', (e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            doSave();
          }
        });
      },
    });

    // ---- 触感：留缝（后期接手柄震动只需注册一个 haptic 实现） ----
    kernel.define({
      id: 'haptics',
      order: 50,
      init() {
        if (!Effects) return;
        // 现在什么都不做，只保证「有人请求过」这件事是可观测的
        bus.on('fx:haptic', (p) => { if (p.kind === 'kill') { /* 后期：手柄振动 */ } });
      },
    });

    return kernel;
  }

  // ============================================================
  // 启动
  // ============================================================

  let kernel = null;

  async function init() {
    if (!window.oph) throw new Error('preload 桥未就绪（window.oph 不存在）');

    const data = await window.oph.get();
    state.cfg = data.cfg;
    state.defaults = data.defaults;

    // 变量表和可改名的武器清单（来自主进程，和 HUD 层共用 src/vars.js）
    const vd = await window.oph.vars();
    state.vars = vd.vars || [];
    state.weaponNames = vd.weaponNames || {};
    state.grenadeKinds = vd.grenadeKinds || [];
    state.buyCatalog = vd.buyCatalog || { categories: [], weapons: [] };

    // 武器 / 刀 / 投掷物 SVG 图标清单（供「武器栏SVG态」页下拉选择）
    try {
      state.equipIcons = (await window.oph.equipIcons()) || {};
      state.equipIconFiles = Object.keys(state.equipIcons);
    } catch (e) { state.equipIcons = {}; state.equipIconFiles = []; }

    opt('OphSecCustom')?.normalizeCustom();

    // 游戏侧命令目录（主进程是唯一权威，渲染层不另写一份）
    try { state.gamecmds = await window.oph.gamecmds.info(); } catch (e) { state.gamecmds = null; }
    opt('OphSecGamecmds')?.ensureGamecmds();

    const pathEl = document.getElementById('cfgPath');
    if (pathEl) pathEl.textContent = data.file;

    rebuild();

    // 支持 #global 这样的深链，直接跳到某个分页
    const hash = location.hash.replace('#', '');
    if (hash && OphSections.has(hash)) activate(hash);

    setStatus('就绪');
    bindButtons();
    reindex();
    console.log(`${TAG} 就绪：${OphSections.size()} 个页面 / ${kernel ? kernel.ids().length : 0} 个功能`);
  }

  function bindButtons() {
    const on = (id, fn) => {
      const n = document.getElementById(id);
      if (n) n.addEventListener('click', fn);
      else console.warn(`${TAG} 界面上找不到 #${id}`);
    };

    on('btnSave', doSave);
    on('btnReload', doReload);
    on('btnReset', doReset);
    on('btnReveal', () => window.oph.reveal());
    on('btnExport', doExport);
    on('btnImport', doImport);
    on('btnCopy', doCopy);
    on('btnMin', () => window.oph.minimize());
    on('btnClose', () => {
      if (state.dirty && !confirm('存在未保存的改动。\n关闭后将丢弃这些改动，HUD 恢复为配置文件中的状态。\n\n确定关闭？')) return;
      window.oph.close();
    });

    // ---- 实时预览：开一个「模拟数据」窗口，边调边看 ----
    const btnPreview = document.getElementById('btnPreview');
    const setPreviewBtn = (onState) => {
      if (!btnPreview) return;
      btnPreview.classList.toggle('on', !!onState);
      btnPreview.textContent = onState ? '预览中' : '预览';
      btnPreview.title = onState
        ? '预览窗口已打开（模拟数据），再次点击关闭。'
        : '打开模拟数据预览窗口';
    };
    if (btnPreview) {
      btnPreview.addEventListener('click', async () => {
        let onState = false;
        try { onState = await window.oph.togglePreview(); } catch (e) { return; }
        setPreviewBtn(onState);
        if (onState) {
          // 把「当前正在编辑、还没保存」的配置也推过去，预览立刻就是眼前这套参数
          window.oph.preview(state.cfg);
          toast('预览窗口已打开（模拟数据），修改设置将实时生效', 'ok');
        }
      });
    }
    globalThis.OphApp.setPreviewBtn = setPreviewBtn;
    if (window.oph.onPreviewState) window.oph.onPreviewState(setPreviewBtn);
    window.oph.getPreviewState().then(setPreviewBtn).catch(() => {});
  }

  /** 由 bootstrap 调用：功能启动 → 读配置 → 建界面 */
  async function boot() {
    try {
      wireControlTypes();
      kernel = defineFeatures();
      kernel.start({ bus, store, root: document, search: null, query });
    } catch (e) {
      // 功能层出问题不该让整个界面打不开：记下来，继续把界面搭起来
      console.error(TAG + ' 功能层启动失败（界面继续）：', e && e.stack || e);
    }
    return init();
  }

  globalThis.OphApp = Object.assign(globalThis.OphApp || {}, {
    boot, init, kernel: () => kernel,
    doSave, doReload, doExport, doCopy, doImport, doReset,
    query, reindex,
    /** 后期「检索元素」输入框接这里：返回可点击的结果列表 */
    search(q, o) { return query(q, o); },
  });
})();
