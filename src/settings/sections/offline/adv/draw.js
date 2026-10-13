'use strict';

/**
 * 进阶画图 · 设置页模块
 *
 * 由 src/settings/settings.js（重构前巨石）机械拆分而来，代码原样保留。
 * 依赖通过头部解构显式声明 —— 不依赖加载顺序之外的东西，也不往全局挂散名。
 */
;(function () {
  const { el } = globalThis.OphDOM;
  const { anchorGrid, fieldRow, newCard, sectionHead } = globalThis.OphLayout;
  const { colorControl2, numControl2 } = globalThis.OphControlsExtra;
  const { markDirty, rebuild, schedulePreview, toast } = globalThis.OphApp;
  const { addIcon } = globalThis.OphAdvElements;
  const { clone, newId } = globalThis.OphUtil;
  const { commit, state } = globalThis.OphCtx;
  const { advMod } = globalThis.OphAdvBridge;
  const { colorControl, numControl } = globalThis.OphControls;


// 画图会话状态（不落盘，仅本页编辑期间用）
const drawState = {
  w: 240, h: 120,
  items: [],
  tool: 'rect',
  stroke: '#E8C46A',
  strokeWidth: 3,
  fill: 'none',
  text: '文字',
};
function buildAdvDrawSection(sec) {
  const wrap = el('div', 'section');
  wrap.dataset.section = sec.id;
  wrap.append(sectionHead('进阶配置 · 画图',
    '用矩形 / 椭圆 / 直线 / 自由笔 / 文字拼出一张矢量图，可以存成图标，也可以直接做成贴在 HUD 上的形状元素。'
    + '文字图元支持 {变量} 插值，例如 {money}、{weapon}。'));

  ensureShapes();

  // ---- 工具栏 ----
  const c1 = newCard('画笔', '选好工具在下面画布上拖拽即可');
  const tools = el('div', 'tools');
  const TOOLS = [['rect', '矩形'], ['ellipse', '椭圆'], ['line', '直线'], ['pen', '自由笔'], ['text', '文字']];
  const toolBtns = {};
  const syncTool = () => { for (const [k, b] of Object.entries(toolBtns)) b.classList.toggle('active', k === drawState.tool); };
  for (const [k, label] of TOOLS) {
    const b = el('button', 'tool', label);
    b.addEventListener('click', () => { drawState.tool = k; syncTool(); });
    toolBtns[k] = b;
    tools.append(b);
  }
  syncTool();
  c1.body.append(tools);

  const row = el('div', 'search-row');
  const strokeCtl = colorControl2('描边色', drawState.stroke, (v) => { drawState.stroke = v; });
  const fillCtl = colorControl2('填充色', drawState.fill, (v) => { drawState.fill = v; }, true);
  const widthCtl = numControl2('线宽', drawState.strokeWidth, 1, 20, 1, (v) => { drawState.strokeWidth = v; });
  const sizeW = numControl2('画布宽', drawState.w, 40, 1920, 1, (v) => { drawState.w = v; redraw(); });
  const sizeH = numControl2('画布高', drawState.h, 24, 1080, 1, (v) => { drawState.h = v; redraw(); });
  row.append(strokeCtl, fillCtl, widthCtl, sizeW, sizeH);
  c1.body.append(row);

  const rowT = el('div', 'search-row');
  const textInp = el('input', 'txt');
  textInp.type = 'text';
  textInp.value = drawState.text;
  textInp.placeholder = '文字内容（可用 {变量}）';
  textInp.style.flex = '0 0 220px';
  textInp.addEventListener('input', () => { drawState.text = textInp.value; });
  rowT.append(el('span', 'note', '文字内容：'), textInp);
  c1.body.append(rowT);
  wrap.append(c1.card);

  // ---- 画布 ----
  // ⚠️ 画布必须与 viewBox 严格同比例。
  //    以前的写法是 canvas 固定 height:264px、viewBox 是 240×120（2:1），
  //    配合 preserveAspectRatio="xMidYMid meet" 会把内容等比缩进中间留白，
  //    而取点 localPoint() 却按整块 bounding rect 线性映射 —— 于是
  //    「鼠标画在哪」和「图元落在哪」整体错位（用户反馈的「位置不精准」）。
  //    现在用 aspect-ratio 让 SVG 盒子本身就等于 viewBox 比例，取点与绘制一一对应。
  const c2 = newCard('画布', '按住鼠标拖拽绘制。画布比例 = 导出比例，画在哪就落在哪');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'draw-canvas');
  const canvasWrap = el('div', 'draw-wrap');
  canvasWrap.append(svg);
  c2.body.append(canvasWrap);

  const readout = el('div', 'draw-readout');
  const rdSize = el('span', 'rd-item');
  const rdPos = el('span', 'rd-item');
  readout.append(rdSize, rdPos);
  c2.body.append(readout);

  const bar = el('div', 'search-row');
  const undo = el('button', 'btn', '撤销');
  undo.addEventListener('click', () => { drawState.items.pop(); redraw(); });
  const clear = el('button', 'btn', '清空');
  clear.addEventListener('click', () => { if (drawState.items.length && confirm('清空当前画布？')) { drawState.items = []; redraw(); } });
  bar.append(undo, clear);
  c2.body.append(bar);
  wrap.append(c2.card);

  // ---- 输出 ----
  const c3 = newCard('输出', '存成图标库条目，或做成贴在 HUD 上的形状元素');
  const outName = el('input', 'txt');
  outName.type = 'text'; outName.placeholder = '名称'; outName.style.flex = '0 0 170px';
  const toIcon = el('button', 'btn', '存为图标');
  toIcon.addEventListener('click', () => {
    if (!drawState.items.length) { toast('画布还是空的', 'err'); return; }
    addIcon({ id: newId('ic'), name: outName.value.trim() || '手绘图标', kind: 'draw',
      w: drawState.w, h: drawState.h, items: clone(drawState.items) });
  });
  const toShape = el('button', 'btn primary', '添加为 HUD 形状元素');
  toShape.addEventListener('click', () => {
    if (!drawState.items.length) { toast('画布还是空的', 'err'); return; }
    addShape({
      id: newId('sh'), name: outName.value.trim() || '形状', enabled: true,
      anchor: 'tl', offsetX: 40, offsetY: 40, scale: 1, rotate: 0,
      opacity: 1, glow: 0, glowColor: '#FFFFFF',
      w: drawState.w, h: drawState.h, items: clone(drawState.items),
    });
  });
  const row3 = el('div', 'search-row');
  row3.append(outName, toIcon, toShape);
  c3.body.append(row3);
  wrap.append(c3.card);

  // ---- 已有形状元素 ----
  const c4 = newCard('HUD 形状元素', '这些会直接画在覆盖层上；位置 / 缩放 / 辉光都能单独调');
  if (!state.cfg.shapes.length) {
    c4.body.append(el('div', 'empty-hint', '还没有形状元素。画好点「添加为 HUD 形状元素」即可。'));
  }
  state.cfg.shapes.forEach((it, i) => c4.body.append(shapeCard(it, i, redraw)));
  wrap.append(c4.card);

  // ---- 载入已有形状回画布 ----
  if (state.cfg.shapes.length) {
    const c5 = newCard('继续编辑', '把已有形状载入画布修改');
    const sel = el('select', 'sel');
    state.cfg.shapes.forEach((it, i) => {
      const o = el('option', null, (it.name || '形状 ' + (i + 1)));
      o.value = String(i);
      sel.append(o);
    });
    const load = el('button', 'btn', '载入画布');
    load.addEventListener('click', () => {
      const it = state.cfg.shapes[Number(sel.value)];
      if (!it) return;
      drawState.w = Number(it.w) || 120;
      drawState.h = Number(it.h) || 60;
      drawState.items = clone(it.items || []);
      rebuild();
      toast('已载入画布', 'ok');
    });
    const back = el('button', 'btn primary', '写回该形状');
    back.addEventListener('click', () => {
      const it = state.cfg.shapes[Number(sel.value)];
      if (!it) return;
      it.w = drawState.w; it.h = drawState.h; it.items = clone(drawState.items);
      rebuild(); markDirty(); schedulePreview();
      toast('已写回形状', 'ok');
    });
    const row5 = el('div', 'search-row');
    row5.append(sel, load, back);
    c5.body.append(row5);
    wrap.append(c5.card);
  }

  // ================= 画布交互与重绘 =================
  let drafting = null;   // 正在拖拽的图元

  function localPoint(ev) {
    const r = svg.getBoundingClientRect();
    const x = (ev.clientX - r.left) / Math.max(1, r.width) * drawState.w;
    const y = (ev.clientY - r.top) / Math.max(1, r.height) * drawState.h;
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  }

  /** 网格步长：按画布短边自适应，落在 5 / 10 / 20 / 50 … 这类好读的数上 */
  function gridStepOf(w, h) {
    const raw = Math.max(1, Math.min(w, h) / 10);
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    return Math.max(4, Math.round(raw / pow) * pow);
  }

  /**
   * 画布背景网格：细格 + 每 5 格一条主格线 + 中心十字。
   * 线宽用 vector-effect="non-scaling-stroke" 固定为视觉 1px，缩放画布时不会变粗。
   */
  function gridSVG(w, h) {
    const step = gridStepOf(w, h);
    const nv = (v) => String(Math.round(v * 100) / 100);
    const line = (x1, y1, x2, y2, major) => `<line x1="${nv(x1)}" y1="${nv(y1)}" x2="${nv(x2)}" y2="${nv(y2)}"`
      + ` stroke="${major ? '#111111' : '#8A8A8A'}" stroke-width="1" vector-effect="non-scaling-stroke"`
      + ` opacity="${major ? 0.26 : 0.14}"/>`;
    let s = '';
    for (let x = step; x < w - 0.001; x += step) s += line(x, 0, x, h, Math.round(x / step) % 5 === 0);
    for (let y = step; y < h - 0.001; y += step) s += line(0, y, w, y, Math.round(y / step) % 5 === 0);
    s += `<rect x="0.5" y="0.5" width="${nv(Math.max(0, w - 1))}" height="${nv(Math.max(0, h - 1))}"`
      + ' fill="none" stroke="#111111" stroke-width="1" vector-effect="non-scaling-stroke" opacity="0.45"/>';
    s += line(w / 2, 0, w / 2, h, false).replace('#8A8A8A', '#CC0000');
    s += line(0, h / 2, w, h / 2, false).replace('#8A8A8A', '#CC0000');
    return `<g class="dw-grid">${s}</g>`;
  }

  function redraw() {
    const A = advMod();
    const items = draftPreview ? drawState.items.concat([draftPreview]) : drawState.items;
    const body = (typeof A.primitivesToSVG === 'function') ? A.primitivesToSVG(items, {}) : '';
    svg.setAttribute('viewBox', `0 0 ${drawState.w} ${drawState.h}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    // 让 SVG 盒子严格等于 viewBox 比例（关键修复：不再产生 letterbox 内缩）
    svg.style.aspectRatio = `${drawState.w} / ${drawState.h}`;
    svg.innerHTML = gridSVG(drawState.w, drawState.h) + body;
    svg.classList.toggle('empty', !body);
    rdSize.textContent = `画布 ${Math.round(drawState.w)} × ${Math.round(drawState.h)}`
      + `　·　网格 ${gridStepOf(drawState.w, drawState.h)} 单位`;
  }

  let draftPreview = null;

  svg.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    svg.setPointerCapture(ev.pointerId);
    const [x, y] = localPoint(ev);
    const t = drawState.tool;

    if (t === 'text') {
      const txt = drawState.text || '文字';
      drawState.items.push({
        type: 'text', x, y: y + 16, text: txt,
        fontSize: 20, fill: drawState.stroke === 'none' ? '#FFFFFF' : drawState.stroke,
      });
      redraw();
      return;
    }
    if (t === 'pen') {
      drafting = { type: 'polyline', points: [[x, y]], fill: 'none', stroke: drawState.stroke, strokeWidth: drawState.strokeWidth };
      draftPreview = drafting;
      redraw();
      return;
    }
    const proto = {
      type: t, x, y, w: 0, h: 0,
      fill: drawState.fill, stroke: drawState.stroke, strokeWidth: drawState.strokeWidth,
      x1: x, y1: y, x2: x, y2: y, cx: x, cy: y, rx: 0, ry: 0, _sx: x, _sy: y,
    };
    drafting = proto;
    draftPreview = proto;
    redraw();
  });

  svg.addEventListener('pointermove', (ev) => {
    const [x, y] = localPoint(ev);
    rdPos.textContent = `x ${x}　y ${y}`;
    if (!drafting) return;
    if (drafting.type === 'polyline') {
      drafting.points.push([x, y]);
    } else if (drafting.type === 'line') {
      drafting.x2 = x; drafting.y2 = y;
    } else if (drafting.type === 'ellipse') {
      drafting.cx = (drafting._sx + x) / 2; drafting.cy = (drafting._sy + y) / 2;
      drafting.rx = Math.abs(x - drafting._sx) / 2; drafting.ry = Math.abs(y - drafting._sy) / 2;
    } else {
      drafting.x = Math.min(drafting._sx, x); drafting.y = Math.min(drafting._sy, y);
      drafting.w = Math.abs(x - drafting._sx); drafting.h = Math.abs(y - drafting._sy);
    }
    redraw();
  });

  const finish = (ev) => {
    if (!drafting) return;
    const d = drafting;
    drafting = null;
    draftPreview = null;
    // 太小的点/短笔忽略，避免误点留下垃圾
    const tiny = (d.type === 'rect' && d.w < 2 && d.h < 2)
      || (d.type === 'ellipse' && d.rx < 1 && d.ry < 1)
      || (d.type === 'line' && Math.abs(d.x2 - d.x1) < 2 && Math.abs(d.y2 - d.y1) < 2)
      || (d.type === 'polyline' && d.points.length < 2);
    if (!tiny) {
      const item = clone(d);
      delete item._sx; delete item._sy;
      if (item.type === 'polyline') item.type = 'polyline';
      drawState.items.push(item);
    }
    redraw();
    if (ev && ev.pointerId != null) { try { svg.releasePointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ } }
  };
  svg.addEventListener('pointerup', finish);
  svg.addEventListener('pointercancel', finish);
  svg.addEventListener('pointerleave', () => { rdPos.textContent = ''; });

  redraw();

  return wrap;
}
function ensureShapes() {
  if (!Array.isArray(state.cfg.shapes)) state.cfg.shapes = [];
}
function addShape(sh) {
  ensureShapes();
  state.cfg.shapes.push(sh);
  rebuild();
  markDirty();
  schedulePreview();
  toast('已加入 HUD 形状元素', 'ok');
}
/** 形状元素的位置 / 外观卡片 */
function shapeCard(it, idx, onChanged) {
  const p = `shapes.${idx}`;
  const card = el('div', 'card');

  const head = el('div', 'card-head');
  const hrow = el('div', 'ci-head');
  const sw = el('div', 'switch' + (it.enabled === false ? '' : ' on'));
  sw.addEventListener('click', () => {
    const next = !sw.classList.contains('on');
    sw.classList.toggle('on', next);
    commit(`${p}.enabled`, next);
    if (onChanged) onChanged();
  });
  const del = el('button', 'ci-del', '删除');
  del.addEventListener('click', () => {
    if (!confirm('删除「' + (it.name || '形状 ' + (idx + 1)) + '」？')) return;
    state.cfg.shapes.splice(idx, 1);
    rebuild(); markDirty(); schedulePreview();
  });
  hrow.append(sw, el('div', 'ci-title', it.name || ('形状 ' + (idx + 1))), del);
  head.append(hrow);
  card.append(head);

  const body = el('div', 'card-body');

  const nameInp = el('input', 'txt');
  nameInp.type = 'text'; nameInp.value = it.name || '';
  nameInp.addEventListener('change', () => { it.name = nameInp.value.trim(); markDirty(); schedulePreview(); });
  body.append(fieldRow('名称', nameInp));

  const sel = el('div', 'sel');
  sel.append(anchorGrid(it.anchor || 'tl', (v) => commit(`${p}.anchor`, v)));
  body.append(fieldRow('屏幕锚点', sel,
    '图形从这个位置贴上屏幕：「左上」= 贴安全区左上角，「正中」= 屏幕中心。'));

  const num = (key, label, min, max, step, unit, note) => {
    const c = numControl({ path: `${p}.${key}`, min, max, step, unit });
    body.append(fieldRow(label, c, note));
  };
  num('offsetX', '水平位移', -900, 900, 1, 'px', '相对锚点的像素位移，正数向右。');
  num('offsetY', '垂直位移', -600, 600, 1, 'px', '正数向下。');
  num('scale', '缩放', 0.2, 4, 0.01, '×');
  num('rotate', '旋转角度', -180, 180, 1, '°');
  num('opacity', '整体不透明度', 0, 1, 0.01);
  num('glow', '辉光强度', 0, 1, 0.01, null, '0 = 关闭；辉光颜色在下一行。');
  body.append(fieldRow('辉光颜色', colorControl({ path: `${p}.glowColor`, fallback: '#FFFFFF' })));

  card.append(body);
  return card;
}

  // 自注册：上架与否只由 sections/manifest.js 决定，这里不写死顺序
  globalThis.OphSections.register({
    id: "adv-draw", ico: "adv", name: "进阶画图",
    group: "basic",
    build: buildAdvDrawSection,
  });
  // ⚠️ 未列入 manifest → 不会加载。重新上架：在 manifest 里加一行即可。

  globalThis.OphAdvDraw = Object.assign(globalThis.OphAdvDraw || {}, {
    drawState, buildAdvDrawSection, ensureShapes, addShape, shapeCard
  });
})();
