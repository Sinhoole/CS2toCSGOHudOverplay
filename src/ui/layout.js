'use strict';

/**
 * OphLayout · 通用库
 *
 * 由 src/settings/settings.js（重构前巨石）机械拆分而来，代码原样保留。
 * 依赖通过头部解构显式声明 —— 不依赖加载顺序之外的东西，也不往全局挂散名。
 */
;(function () {
  const { el } = globalThis.OphDOM;


const ANCHORS = [
  ['tl', '左上'], ['tc', '顶中'], ['tr', '右上'],
  ['ml', '左中'], ['mc', '正中'], ['mr', '右中'],
  ['bl', '左下'], ['bc', '底中'], ['br', '右下'],
];
const ALIGNS = [['left', '左对齐'], ['center', '居中'], ['right', '右对齐']];
/**
 * 九宫格锚点选择器：比下拉直观得多 —— 点哪个格子，图形就从屏幕哪个位置贴上去。
 * 用在「形状元素」这种位置语义最强的场景。
 */
function anchorGrid(value, onPick) {
  const wrap = el('div', 'anchor-grid');
  const label = {
    tl: '左上', tc: '顶中', tr: '右上',
    ml: '左中', mc: '正中', mr: '右中',
    bl: '左下', bc: '底中', br: '右下',
  };
  for (const [v] of ANCHORS) {
    const b = el('button', 'ag-cell' + (v === value ? ' on' : ''));
    b.type = 'button';
    b.title = label[v] || v;
    b.dataset.anchor = v;
    b.addEventListener('click', () => {
      for (const o of wrap.children) o.classList.toggle('on', o.dataset.anchor === v);
      onPick(v);
    });
    wrap.append(b);
  }
  return wrap;
}
/** 分区标题卡片（只有标题，没有内容） */
function sectionHead(title, hint) {
  const card = el('div', 'card');
  const head = el('div', 'card-head');
  const box = el('div');
  box.append(el('div', 'card-title', title));
  if (hint) box.append(el('div', 'card-hint', hint));
  head.append(box);
  card.append(head);
  return card;
}
/** 带标题与内容区的卡片 */
function newCard(title, hint) {
  const card = el('div', 'card');
  const head = el('div', 'card-head');
  const box = el('div');
  box.append(el('div', 'card-title', title));
  if (hint) box.append(el('div', 'card-hint', hint));
  head.append(box);
  const body = el('div', 'card-body');
  card.append(head, body);
  return { card, head, body };
}
/** 通用文本输入：读写都走回调，方便接数组下标这类路径 */
function freeText(getVal, setVal, opts) {
  const o = opts || {};
  const inp = el('input', 'txt');
  inp.type = 'text';
  const v = getVal();
  inp.value = v == null ? '' : String(v);
  if (o.placeholder) inp.placeholder = o.placeholder;
  if (o.width) inp.style.flex = `0 0 ${o.width}px`;
  inp.addEventListener('change', () => setVal(inp.value));
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { setVal(inp.value); inp.blur(); } });
  return inp;
}
/** 一行字段：标签 + 控件，可选地在下方跟一段说明 */
function fieldRow(label, control, note) {
  const field = el('div', 'field');
  const row = el('div', 'row');
  row.append(el('div', 'row-label', label), control);
  field.append(row);
  if (note) field.append(el('div', 'note', note));
  return field;
}

  globalThis.OphLayout = Object.assign(globalThis.OphLayout || {}, {
    ANCHORS, ALIGNS, anchorGrid, sectionHead, newCard, freeText, fieldRow
  });
})();
