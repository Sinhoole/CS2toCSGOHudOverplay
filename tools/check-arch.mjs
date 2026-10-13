'use strict';

/**
 * 架构自检（tools/check-arch.mjs）
 *
 * 经典脚本的世界里没有 import，靠「加载顺序 + 全局命名空间」见面。
 * 于是最容易被写出、又最难查的 bug 是：某个文件在**加载期**解构了还没加载的命名空间，
 * 报错是一句冷冰冰的 "Cannot destructure property 'x' of undefined"。
 *
 * 这个工具把这件事变成静态可查：
 *   1. 扫出每个文件在加载期解构了哪些命名空间（只看模块顶层、2 空格缩进的那行）
 *   2. 找出每个命名空间的「定义者」（哪个文件写了 globalThis.NS =）
 *   3. 检查 manifest 的加载顺序是否满足全部「定义者先于使用者」约束
 *   4. 顺手报告：manifest 里有但磁盘上没有的文件、以及谁也没定义的命名空间
 *
 * 用法：node tools/check-arch.mjs
 * 退出码 0 = 顺序合法；1 = 有问题（可直接挂在 CI / 自检里）
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SETTINGS = path.join(ROOT, 'src/settings');

// ---- 读 manifest（它在 Node 里也能跑：只往 globalThis 挂数据）----
const manSrc = fs.readFileSync(path.join(SETTINGS, 'manifest.js'), 'utf8');
// eslint-disable-next-line no-new-func
new Function(manSrc)();
const M = globalThis.OphManifest;
if (!M) { console.error('manifest.js 没有产出 OphManifest'); process.exit(1); }

const flat = M.flat;
const rel = (p) => path.relative(SETTINGS, path.resolve(SETTINGS, p)).replace(/\\/g, '/');

// ---- 扫描 ----
const DEF_RE = /globalThis\.([A-Za-z_$][\w$]*)\s*=\s*Object\.assign\(globalThis\.\1/g;
const REQ_RE = /^  const \{([^}]*)\} = globalThis\.([A-Za-z_$][\w$]*);/;

const defs = new Map();     // ns -> file（定义者，只记第一个）
const reqs = [];            // { file, ns, members }
const missing = [];

for (const p of flat) {
  const abs = path.resolve(SETTINGS, p);
  if (!fs.existsSync(abs)) { missing.push(p); continue; }
  const text = fs.readFileSync(abs, 'utf8');
  for (const m of text.matchAll(DEF_RE)) if (!defs.has(m[1])) defs.set(m[1], p);

  text.split('\n').forEach((line, i) => {
    const m = line.match(REQ_RE);
    if (!m) return;
    const ns = m[2];
    if (ns === 'globalThis') return;                // core 通用，不当依赖
    reqs.push({ file: p, ns, members: m[1].split(',').map((s) => s.trim()).filter(Boolean), line: i + 1 });
  });
}

// ---- 顺序校验 ----
const index = new Map(flat.map((p, i) => [p, i]));
const bad = [];
const unknownNs = new Map();

for (const r of reqs) {
  const owner = defs.get(r.ns);
  if (!owner) { unknownNs.set(r.ns, (unknownNs.get(r.ns) || 0) + 1); continue; }
  if (index.get(owner) > index.get(r.file)) {
    bad.push({ ns: r.ns, owner, user: r.file, line: r.line, members: r.members });
  }
}

console.log(`\n架构自检 · ${flat.length} 个文件 / ${defs.size} 个命名空间 / ${reqs.length} 处加载期依赖\n`);

if (missing.length) {
  console.log('❌ manifest 里列了但磁盘上不存在：');
  for (const p of missing) console.log(`   ${p}`);
}

if (bad.length) {
  console.log('❌ 加载顺序不满足依赖（定义者排在使用者之后）：');
  for (const b of bad) {
    console.log(`   ${rel(b.user)}:${b.line} 需要 ${b.ns} ← 定义在 ${rel(b.owner)}`);
    console.log(`      → 把 ${rel(b.owner)} 挪到 ${rel(b.user)} 之前（见 manifest.js 注释）`);
  }
} else if (!missing.length) {
  console.log('✅ 加载顺序合法：所有加载期依赖都在使用者之前');
}

if (unknownNs.size) {
  console.log('\nℹ️ 没找到定义者的命名空间（可能来自 HTML 里单独引入的共享库）：');
  for (const [ns, n] of unknownNs) console.log(`   ${ns}（被引 ${n} 处）`);
}

// ---- 顺带报告体积分布，方便判断「哪个文件又胖起来了」----
const sizes = flat
  .map((p) => { const a = path.resolve(SETTINGS, p); return fs.existsSync(a) ? { p, n: fs.readFileSync(a, 'utf8').split('\n').length } : null; })
  .filter(Boolean)
  .sort((a, b) => b.n - a.n);
console.log('\n最大的 6 个文件：');
for (const s of sizes.slice(0, 6)) console.log(`   ${String(s.n).padStart(5)} 行  ${rel(s.p)}`);

process.exit(bad.length || missing.length ? 1 : 0);
