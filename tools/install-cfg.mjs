#!/usr/bin/env node
/**
 * 把 cfg/gamestate_integration_overplayhud.cfg 复制到 CS2 的 cfg 目录。
 *
 *   node tools/install-cfg.mjs
 *   node tools/install-cfg.mjs --check
 *   node tools/install-cfg.mjs --game "D:\\SteamLibrary\\steamapps\\common\\Counter-Strike Global Offensive"
 *
 * 真正的逻辑在 src/gsi-install.js —— 打包后的程序从托盘菜单装 cfg 时走的是同一份代码。
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'cfg', 'gamestate_integration_overplayhud.cfg');

const api = require('../src/gsi-install.js');

const argIdx = process.argv.indexOf('--game');
const manual = argIdx >= 0 ? process.argv[argIdx + 1] : null;

// ---------- 只读检查 ----------
if (process.argv.includes('--check')) {
  const r = api.inspect(SRC, manual);
  console.log('\n===== 只读检查（不写入任何文件）=====\n');

  if (r.roots.length === 0) {
    console.log('❌ 没找到 CS2 安装目录。手动指定：');
    console.log('   node tools/install-cfg.mjs --check --game "<CS2 安装目录>"');
    process.exit(1);
  }

  for (const root of r.roots) {
    console.log(`CS2 目录：${root.path}`);
    for (const d of root.dirs) {
      if (!d.exists) {
        console.log(`   ⚪ ${d.dir}  （不存在，跳过）`);
        continue;
      }
      console.log(`   ${d.installed ? '✅' : '⚠️ '} ${d.dir}${d.installed ? '   ← cfg 已就位' : '   ← cfg 未安装'}`);
      const others = d.others.filter((f) => f !== api.CFG_NAME);
      if (others.length) console.log(`      目录里已有的其它 GSI 配置：${others.join(', ')}`);
    }
  }

  console.log(r.running
    ? '\n⚠️  CS2 正在运行 —— cfg 必须在游戏启动前就位，改完要完全退出再重开。'
    : '\nℹ️  CS2 当前没在运行。');
  process.exit(0);
}

// ---------- 安装 ----------
const r = api.install(SRC, manual);

if (r.roots === 0) {
  console.error('❌ 没找到 CS2 安装目录。');
  console.error('   手动指定：node tools/install-cfg.mjs --game "<CS2 安装目录>"');
  process.exit(1);
}

for (const p of r.copied) console.log(`✅ ${p}`);
for (const f of r.failed) console.log(`❌ ${f}`);

console.log(r.copied.length > 0
  ? `\n装好了 ${r.copied.length} 处。现在完全重启 CS2，然后跑 npm run verify 检查有没有数据。`
  : '\n一处都没装上，手动复制吧。');
