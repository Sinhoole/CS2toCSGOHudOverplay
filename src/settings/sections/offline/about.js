'use strict';

/**
 * 关于 · 设置页模块
 *
 * 由 src/settings/settings.js（重构前巨石）机械拆分而来，代码原样保留。
 * 依赖通过头部解构显式声明 —— 不依赖加载顺序之外的东西，也不往全局挂散名。
 */
;(function () {
  const { el } = globalThis.OphDOM;
  const { newCard, sectionHead } = globalThis.OphLayout;
  const { activate, toast } = globalThis.OphApp;


const BLOG_URL = 'https://blog.taoxi.ink';
function buildAboutSection(sec) {
  const wrap = el('div', 'section');
  wrap.dataset.section = sec.id;
  wrap.append(sectionHead('关于', 'OverplayHUD —— 把 CS2 的 HUD 还原成 CS:GO 的样子'));

  // ---- 作者博客：整页最大的那一块，也是全页唯一用编辑红的地方 ----
  const blog = el('div', 'about-blog');
  blog.append(el('div', 'ab-kicker', '作者博客'));

  const link = el('a', 'ab-url', 'blog.taoxi.ink');
  link.href = BLOG_URL;
  link.addEventListener('click', (e) => {
    e.preventDefault();
    window.oph.openExternal(BLOG_URL);
  });
  blog.append(link);
  blog.append(el('div', 'ab-url-full', BLOG_URL));
  blog.append(el('div', 'ab-note',
    '更新公告、折腾记录、以及这个 HUD 是怎么一步步做出来的，都写在这儿。'));

  const acts = el('div', 'ab-acts');
  const go = el('button', 'btn primary', '在浏览器中打开');
  go.addEventListener('click', () => window.oph.openExternal(BLOG_URL));
  const cp = el('button', 'btn', '复制网址');
  cp.addEventListener('click', () => { window.oph.copyText(BLOG_URL); toast('网址已复制', 'ok'); });
  acts.append(go, cp);
  blog.append(acts);
  wrap.append(blog);

  // ---- 程序本身 ----
  const info = newCard('这个程序', '');
  const grid = el('div', 'ab-grid');

  const verOut = el('div', 'ab-v', '…');
  grid.append(abCell('版本', verOut, 'main'));
  grid.append(abCell('定位', el('div', 'ab-v', 'CS:GO 时代的 HUD 复刻'), 'main'));
  grid.append(abCell('数据来源', el('div', 'ab-v', 'Valve 官方 GSI'), 'main'));
  const envOut = el('div', 'ab-v', '…');
  grid.append(abCell('运行环境', envOut, 'main'));

  info.body.append(grid);
  wrap.append(info.card);

  window.oph.appInfo().then((i) => {
    if (!i || !i.ok) return;
    verOut.textContent = 'v' + i.version;
    envOut.textContent = 'Electron ' + i.electron;
  }).catch(() => { verOut.textContent = '—'; envOut.textContent = '—'; });

  // ---- 底线：这段刻意写得直白，因为它是这个项目唯一不能松口的地方 ----
  const safe = newCard('它不做什么',
    '这条线是这个项目存在的前提，不会为了任何功能挪动。');
  const ul = el('div', 'ab-safe');
  for (const t of [
    '只接收 Valve 官方 GSI 主动发到 127.0.0.1 的数据，不读游戏内存',
    '不注入 DLL、不 hook 渲染、不改任何游戏文件',
    '不模拟按键、不代替你操作游戏',
    '只显示普通玩家本来就看得到的信息，没有任何额外情报',
  ]) ul.append(el('div', 'ab-safe-item', t));
  safe.body.append(ul);
  safe.body.append(el('div', 'ab-warn',
    '不要在有第三方反作弊的平台（Faceit / ESEA / 5E / B5 等）上使用。'));
  wrap.append(safe.card);

  // ---- 去哪儿找东西 ----
  const more = newCard('其它', '');
  const row = el('div', 'ab-acts');
  const b1 = el('button', 'btn', '看使用教程');
  b1.addEventListener('click', () => activate('tutorial'));
  const b2 = el('button', 'btn', '打开配置文件夹');
  b2.addEventListener('click', () => window.oph.reveal());
  row.append(b1, b2);
  more.body.append(row);
  wrap.append(more.card);

  return wrap;
}
function abCell(k, vEl, cls) {
  const d = el('div', 'ab-cell' + (cls ? ' ' + cls : ''));
  d.append(el('div', 'ab-k', k), vEl);
  return d;
}
/**
 * 极简 Markdown → HTML（只为教程服务，不引外部库）。
 * 先把文本整体做 HTML 转义再拼标签，所以文档里写什么都不会变成可执行标记。
 */
/**
 * 极简 Markdown 渲染，只认教程里真正用到的那几种语法。
 *
 * baseDir 是 TUTORIAL.md 所在的目录。教程里的图片写的是相对路径（docs/xxx.png），
 * 得拼成 file:// 绝对地址才能显示 —— 打包后也一样，asar 内的 file:// 由 Electron 解析。
 */
function mdToHtml(md, baseDir) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const imgURL = (src) => {
    const s = String(src || '').trim();
    if (/^https?:\/\//i.test(s) || /^data:image\//i.test(s)) return s;
    if (!baseDir) return '';
    const joined = String(baseDir).replace(/\\/g, '/').replace(/\/+$/, '')
      + '/' + s.replace(/^\.\//, '');
    return encodeURI('file:///' + joined.replace(/^\/+/, ''));
  };
  const imgTag = (alt, src) => {
    const u = imgURL(src);
    return u ? `<img class="md-img" src="${u}" alt="${esc(alt || '')}" loading="lazy">` : esc(alt || '');
  };

  const inline = (s) => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // ⚠️ 图片规则必须排在链接前面：反过来的话 "![a](b)" 会先被链接规则吃掉，剩个孤零零的 "!"
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt, src) => imgTag(alt, src))
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const isSep = (s) => s.indexOf('-') >= 0 && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(s);

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      out.push('<pre class="md-code"><code>' + esc(buf.join('\n')) + '</code></pre>');
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lv = h[1].length;
      out.push(`<h${lv} class="md-h md-h${lv}">${inline(h[2])}</h${lv}>`);
      i++;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { out.push('<hr class="md-hr">'); i++; continue; }
    if (/^\s*>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      out.push('<blockquote class="md-quote">' + inline(buf.join(' ')) + '</blockquote>');
      continue;
    }
    if (line.indexOf('|') >= 0 && i + 1 < lines.length && isSep(lines[i + 1])) {
      const cells = (s) => s.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].indexOf('|') >= 0) { rows.push(cells(lines[i])); i++; }
      out.push('<div class="md-tablewrap"><table class="md-table"><thead><tr>'
        + head.map((c) => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>'
        + rows.map((r) => '<tr>' + r.map((c) => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('')
        + '</tbody></table></div>');
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const tag = ordered ? 'ol' : 'ul';
      const buf = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        buf.push(inline(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, '')));
        i++;
      }
      out.push(`<${tag} class="md-list">` + buf.map((t) => '<li>' + t + '</li>').join('') + `</${tag}>`);
      continue;
    }
    if (/^\s*$/.test(line)) { i++; continue; }

    const buf = [];
    while (i < lines.length && !/^\s*$/.test(lines[i])
      && !/^(#{1,4}\s|```|\s*[-*]\s|\s*\d+\.\s|\s*>)/.test(lines[i])
      && lines[i].indexOf('|') < 0) { buf.push(lines[i]); i++; }
    if (buf.length) out.push('<p class="md-p">' + inline(buf.join(' ')) + '</p>');
    else i++;
  }
  return out.join('');
}

  // 自注册：上架与否只由 sections/manifest.js 决定，这里不写死顺序
  globalThis.OphSections.register({
    id: "about", ico: "about", name: "关于",
    group: "tools",
    build: buildAboutSection,
  });
  // ⚠️ 未列入 manifest → 不会加载。重新上架：在 manifest 里加一行即可。

  globalThis.OphSecAbout = Object.assign(globalThis.OphSecAbout || {}, {
    BLOG_URL, buildAboutSection, abCell, mdToHtml
  });
})();
