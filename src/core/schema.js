'use strict';

/**
 * OphSchema · 字段 schema
 *
 * 设置页的字段是「数据」，不是代码：一行 schema 就该出一个控件。
 * 这里负责两件事：
 *   1. clampNum / normalizeField —— 纯计算，主进程也能用（不碰 DOM）
 *   2. 控件类型注册表 —— type 名为键，谁都能挂进来
 *
 * 加一种新控件（比如「时间点选择」「按键捕获」）只要两步：
 *   OphSchema.registerType('hotkey', { create: (f) => {...返回 DOM...} });
 *   然后在任意 schema 里写 { type: 'hotkey', label: '…', path: '…' }
 * 不需要动设置页的内核代码 —— 这是本次重构最想要的那个性质。
 */
;(function () {
  const TAG = '[core:schema]';

  /** 把任意输入收进 f 描述的区间；与原实现逐字一致（旧行为不能变） */
  function clampNum(v, f) {
    let n = Number(v);
    if (!Number.isFinite(n)) n = 0;
    if (f.integer) n = Math.round(n);
    if (f.min != null) n = Math.max(f.min, n);
    if (f.max != null) n = Math.min(f.max, n);
    if (f.step && f.step < 1) n = Math.round(n * 1000) / 1000;
    return n;
  }

  const TYPES = new Map();

  const schema = {
    clampNum,

    /** 字段规整：补默认值 + 校验必备项，返回新对象（不改调用方那份） */
    normalizeField(f, i) {
      if (!f || typeof f !== 'object') throw new Error(`${TAG} 第 ${i} 个字段不是对象`);
      if (!f.path) throw new Error(`${TAG} 第 ${i} 个字段缺少 path：${JSON.stringify(f)}`);
      const type = f.type || 'num';
      // 没写 type 就是 num（默认值，不必吵）；显式写了个没人认识的名字才是 bug
      if (f.type && type !== 'num' && !TYPES.has(type)) {
        console.warn(`${TAG} 未知控件类型 "${type}"（${f.path}），将回落到 num`);
      }
      return { type, label: f.label || f.path, ...f };
    },

    /** 批量规整（schema 页统一从这里过一遍，坏 schema 早报错） */
    normalizeFields(list) {
      return (list || []).map((f, i) => schema.normalizeField(f, i));
    },

    registerType(type, desc) {
      if (!type || !desc || typeof desc.create !== 'function') {
        throw new Error(`${TAG} registerType("${type}") 需要 { create(field) }`);
      }
      TYPES.set(String(type), Object.freeze({ type: String(type), ...desc }));
      return schema;
    },

    typeFor(type) {
      return TYPES.get(String(type)) || TYPES.get('num') || null;
    },

    types() { return [...TYPES.keys()]; },

    /**
     * 建一个控件节点。找不到类型时回落到 num —— 宁可退化也不要整页崩掉。
     */
    makeControl(field) {
      const t = schema.typeFor(field.type);
      if (!t) {
        console.error(`${TAG} 没有任何控件类型可用，字段 ${field.path} 无法渲染`);
        return document.createElement('span');
      }
      try {
        return t.create(field);
      } catch (e) {
        console.error(`${TAG} 渲染字段 ${field.path}（type=${field.type}）失败：`, e && e.message);
        const box = document.createElement('span');
        box.className = 'ctl-error';
        box.textContent = '控件渲染失败';
        return box;
      }
    },
  };

  globalThis.OphSchema = Object.assign(globalThis.OphSchema || {}, schema);
})();
