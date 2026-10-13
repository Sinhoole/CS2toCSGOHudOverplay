'use strict';

/**
 * 架构自检（tools/check-arch.mjs）
 *
 * 经典脚本的世界里没有 import，靠「加载顺序 + 全局命名空间」见面。
 * 于是最容易被写出、又最难查的 bug 是：某个文件在**加载期**解构了还没加载的命名空间，
 * 报错是一句冷冰冰的 "Cannot destructure property 'x' of undefined"。
 *
 * 这个工具把这件事变成静态可查。目前管两份清单（同一个套路，只是目录不同）：
 *   · 设置界面  src/settings/manifest.js      → globalThis.OphManifest
 *   · HUD 渲染层 src/renderer/hud-manifest.js → globalThis.OphHudManifest
 *
 * 每个工程都做：
 *   1. 扫出每个文件在**加载期**引用了哪些命名空间（只看模块顶层、2 空格缩进的那行，
 *      因为外层是 IIFE，函数体内的引用至少 4 空格）
 *   2. 找出每个命名空间的「定义者」（哪个文件写了 globalThis.NS =）
 *   3. 检查 flat 加载顺序是否满足全部「定义者先于使用者」约束
 *   4. 报告：清单里有但磁盘上没有的文件、谁也没定义的命名空间、体积分布
 *
 * HUD 渲染层额外做结构断言（structural: true）：
 *   · hud-env.js 必须排第一（模块加载期就要解构 OphHudCtx）
 *   · hud-host.js 必须排最后（要等所有模块注册完才绑桥）
 *   · hud-kit.js / hud-registry.js 必须排在任何 modules/ 之前
 *   · dormant（未上架的代码）不得出现在加载链里
 *   · css 数组里的样式表必须真的存在于磁盘
 *   · sections 里的每个文件必须「自注册」：要么 OphHud.register()，要么挂一个 globalThis.OphHudXxx
 *
 * 用法：node tools/check-arch.mjs       （npm run test:arch）
 * 退出码 0 = 全绿；1 = 有问题（可直接挂在 CI / 自检里）
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

// ---- 受管工程 ----
const PROJECTS = [
  {
    name: '设置界面',
    dir: 'src/settings',
    manifest: 'src/settings/manifest.js',
    global: 'OphManifest',
  },
  {
    name: 'HUD 渲染层',
    dir: 'src/renderer',
    manifest: 'src/renderer/hud-manifest.js',
    global: 'OphHudManifest',
    structural: true,
  },
];

// 加载期引用（顶层 2 空格）：const { a, b } = globalThis.NS…  /  const X = globalThis.NS…
const REQ_RE = /^\s{2}const\s+(?:\{([^}]*)\}|([A-Za-z_$][\w$]*))\s*=\s*globalThis\.([A-Za-z_$][\w$]*)/;
// 命名空间定义者：globalThis.NS = …（排除 == / ===）
const DEF_RE = /globalThis\.([A-Za-z_$][\w$]*)\s*=(?!=)/g;

let failed = false;

/**
 * 跑一个工程
 * @returns {{ flat: string[], defs: Map<string,string>, reqs: object[], missing: string[], bad: object[] }}
 */
function scan(proj) {
  const DIR = path.join(ROOT, proj.dir);

  // manifest 在 Node 里也能跑：它只往 globalThis 挂数据
  // eslint-disable-next-line no-new-func
  new Function(fs.readFileSync(path.join(ROOT, proj.manifest), 'utf8'))();
  const M = globalThis[proj.global];
  if (!M) {
    console.log(`\n❌ [${proj.name}] ${proj.manifest} 没有产出 ${proj.global}`);
    failed = true;
    return { flat: [], defs: new Map(), reqs: [], missing: [], bad: [] };
  }

  const flat = M.flat;
  const defs = new Map();   // ns -> file（定义者，只记第一个）
  const reqs = [];          // { file, ns, members, line }
  const missing = [];

  for (const p of flat) {
    const abs = path.resolve(DIR, p);
    if (!fs.existsSync(abs)) { missing.push(p); continue; }
    const text = fs.readFileSync(abs, 'utf8');

    for (const m of text.matchAll(DEF_RE)) {
      const ns = m[1];
      if (ns === 'globalThis') continue;
      if (!defs.has(ns)) defs.set(ns, p);
    }

    text.split('\n').forEach((line, i) => {
      const m = line.match(REQ_RE);
      if (!m) return;
      const ns = m[3];
      if (ns === 'globalThis') return;   // core 通用，不当依赖
      reqs.push({
        file: p,
        ns,
        members: m[1] ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : (m[2] ? [m[2]] : []),
        line: i + 1,
      });
    });
  }

  // 顺序校验
  const index = new Map(flat.map((p, i) => [p, i]));
  const bad = [];
  for (const r of reqs) {
    const owner = defs.get(r.ns);
    if (!owner) continue;                                   // 外部共享库（fit/adv/dom…），只做信息报告
    if (!index.has(r.file)) continue;
    if (index.get(owner) > index.get(r.file)) bad.push({ ...r, owner });
  }

  return { flat, defs, reqs, missing, bad, M, DIR };
}

/** HUD 渲染层专属结构断言 */
function checkStructural(proj, res) {
  const { M, DIR, flat } = res;
  const problems = [];
  const pos = (f) => flat.indexOf(f);

  if (flat[0] !== 'hud-env.js') {
    problems.push(`hud-env.js 必须排第一（模块加载期就要 const C = globalThis.OphHudCtx），实际是 ${flat[0]}`);
  }
  if (flat[flat.length - 1] !== 'hud-host.js') {
    problems.push(`hud-host.js 必须排最后（要等所有模块注册完才绑桥），实际是 ${flat[flat.length - 1]}`);
  }

  const firstModule = flat.findIndex((p) => p.startsWith('modules/'));
  for (const dep of ['hud-kit.js', 'hud-registry.js']) {
    const at = pos(dep);
    if (at === -1) { problems.push(`${dep} 不在加载链里`); continue; }
    if (firstModule !== -1 && at > firstModule) {
      problems.push(`${dep} 必须排在任何 modules/ 之前（模块加载期要解构它），实际在第 ${at} 位，第一个模块在第 ${firstModule} 位`);
    }
  }

  for (const d of M.dormant || []) {
    if (flat.includes(d)) problems.push(`未上架的 ${d} 出现在加载链里（dormant 的代码不应被加载）`);
  }

  const cssSeen = new Set();
  for (const c of M.css || []) {
    if (!fs.existsSync(path.resolve(DIR, c))) problems.push(`css 数组里的 ${c} 不在磁盘上`);
    if (cssSeen.has(c)) problems.push(`css 数组里 ${c} 重复列出（层叠顺序会乱）`);
    cssSeen.add(c);
  }

  // sections 里的每个模块必须「自注册」：OphHud.register() 或挂一个 globalThis.OphHudXxx
  for (const p of M.sections || []) {
    const abs = path.resolve(DIR, p);
    if (!fs.existsSync(abs)) continue;                       // 已在 missing 里报过
    const text = fs.readFileSync(abs, 'utf8');
    const hasRegister = /globalThis\.OphHud\.register\(/.test(text);
    const hasExport = /globalThis\.OphHud[A-Z][\w$]*\s*=/.test(text);
    if (!hasRegister && !hasExport) {
      problems.push(`${p} 既没调 OphHud.register() 也没挂 globalThis.OphHudXxx —— 加载了也不生效`);
    }
  }

  // 加载链自身不得有重复项
  const seen = new Set();
  for (const p of flat) { if (seen.has(p)) problems.push(`加载链里 ${p} 出现两次`); seen.add(p); }

  return problems;
}

// ================= 主流程 =================
for (const proj of PROJECTS) {
  const res = scan(proj);
  const { flat, defs, reqs, missing, bad, DIR } = res;
  if (!flat.length) continue;

  const rel = (p) => path.relative(DIR, path.resolve(DIR, p)).replace(/\\/g, '/');

  console.log(`\n── ${proj.name} · ${flat.length} 个文件 / ${defs.size} 个命名空间 / ${reqs.length} 处加载期依赖 ──`);

  if (missing.length) {
    failed = true;
    console.log('❌ 清单里列了但磁盘上不存在：');
    for (const p of missing) console.log(`   ${p}`);
  }

  if (bad.length) {
    failed = true;
    console.log('❌ 加载顺序不满足依赖（定义者排在使用者之后）：');
    for (const b of bad) {
      console.log(`   ${rel(b.user || b.file)}:${b.line} 需要 ${b.ns} ← 定义在 ${rel(b.owner)}`);
      console.log(`      → 把 ${rel(b.owner)} 挪到 ${rel(b.file)} 之前`);
    }
  }

  // 结构断言（只算一次，别重复跑）
  const problems = proj.structural ? checkStructural(proj, res) : [];
  if (problems.length) {
    failed = true;
    console.log('❌ 结构断言不通过：');
    for (const p of problems) console.log(`   ${p}`);
  }

  if (!missing.length && !bad.length && !problems.length) {
    console.log(`✅ 加载顺序合法：所有加载期依赖都在使用者之前${proj.structural ? '；结构断言全部通过' : ''}`);
  }

  // 没找到定义者的命名空间：多半来自 HTML 里单独引入的共享库，只做信息报告
  const unknown = new Map();
  for (const r of reqs) if (!defs.has(r.ns)) unknown.set(r.ns, (unknown.get(r.ns) || 0) + 1);
  if (unknown.size) {
    console.log('ℹ️ 未在本清单内定义（来自外部共享库）：');
    for (const [ns, n] of [...unknown].sort((a, b) => b[1] - a[1])) console.log(`   ${ns}（被引 ${n} 处）`);
  }

  // 体积分布，方便判断「哪个文件又胖起来了」
  const sizes = flat
    .map((p) => {
      const a = path.resolve(DIR, p);
      return fs.existsSync(a) ? { p, n: fs.readFileSync(a, 'utf8').split('\n').length } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.n - a.n);
  console.log('   最大的 5 个文件：');
  for (const s of sizes.slice(0, 5)) console.log(`   ${String(s.n).padStart(5)} 行  ${rel(s.p)}`);
}

console.log(failed ? '\n架构自检未通过。\n' : '\n架构自检全部通过。\n');
process.exit(failed ? 1 : 0);
