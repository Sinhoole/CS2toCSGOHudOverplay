'use strict';

/**
 * OphSections · 设置页注册表
 *
 * 「一个页面 = 一个文件 + 一次 register()」。加载顺序由 manifest 决定，
 * 侧栏分组由 group 决定，页面内部长什么样由 build() 或 fields[] 决定 —— 三者互不知情。
 *
 * 想删一个页面？把文件从 manifest 里去掉（或整份删掉），没有别处需要改。
 * 想加一个页面？新建文件、在文件末尾 register、在 manifest 里加一行。
 *
 * register 支持两种页面：
 *   · 声明式 —— 只给 fields / colors / alphas，宿主按 schema 渲染（见 sections/declarative.js）
 *   · 自绘式 —— 给 build(sec) 自己拼 DOM（见 sections/global.js 等）
 */
;(function () {
  const TAG = '[settings:sections]';
  const reg = globalThis.OphRegistry.create({ name: 'sections' });

  const api = {
    register(desc) {
      if (!desc || !desc.id) throw new Error(`${TAG} register() 缺少 id`);
      if (!desc.name) throw new Error(`${TAG} 分区 "${desc.id}" 缺少 name`);
      if (!desc.build && !desc.fields) {
        console.warn(`${TAG} 分区 "${desc.id}" 既没有 build() 也没有 fields[]，点了会是空白页`);
      }
      return reg.add({
        ico: 'dot',
        group: 'basic',
        keywords: [],
        order: 0,
        ...desc,
        id: String(desc.id),
      }, { replace: true });
    },

    remove(id) { return reg.remove(id); },
    has(id) { return reg.has(id); },
    get(id) { return reg.get(id); },
    list(o) { return reg.list(o); },
    ids() { return reg.ids(); },
    size() { return reg.size(); },
    groups(o) { return reg.groups({ defaultGroup: 'basic', ...o }); },
    clear() { reg.clear(); },

    /**
     * 喂给 OphSearch 的条目：页面本身 + 页面里的每个字段。
     * 于是「检索元素」能直接搜到「低血预警」并跳到 血量/护甲 页 —— 不需要任何页面配合。
     */
    searchEntries() {
      const out = [];
      for (const s of reg.list()) {
        out.push({
          id: 'section:' + s.id,
          label: s.name,
          keywords: [s.id, s.ico, ...(s.keywords || [])],
          group: s.group,
          target: { kind: 'section', section: s.id },
        });
        const fields = [
          ...(s.fields || []),
          ...(s.colors || []).map((c) => ({ ...c, type: 'color' })),
          ...(s.alphas || []).map((a) => ({ ...a, type: 'num' })),
        ];
        for (const f of fields) {
          if (!f.path) continue;
          out.push({
            id: 'field:' + f.path,
            label: f.label || f.path,
            keywords: [f.path, s.name, ...(s.keywords || []), ...(f.keywords || [])],
            group: s.group,
            target: { kind: 'field', section: s.id, path: f.path, type: f.type || 'num' },
          });
        }
      }
      return out;
    },
  };

  globalThis.OphSections = Object.assign(globalThis.OphSections || {}, api);
})();
