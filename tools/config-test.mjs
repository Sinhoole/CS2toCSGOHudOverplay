'use strict';

/**
 * 设置界面的读写链路测试。
 *
 * 会真的往 config.json 里写东西，所以开头先备份、结尾无条件还原。
 * 覆盖三件事：预览不落盘 / 保存落盘且补全 / 恢复默认。
 *
 *   node tools/config-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfgMod = require(path.join(root, 'src', 'config.js'));

const FILE = cfgMod.FILE;
const BACKUP = FILE + '.test-backup';
const original = fs.readFileSync(FILE, 'utf8');

let pass = 0;
let fail = 0;

function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? '  → ' + detail : ''}`); }
}

function readFile() {
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

try {
  fs.writeFileSync(BACKUP, original, 'utf8');

  console.log('\n[1] 预览不落盘');
  const before = original;
  const previewed = cfgMod.preview({ modules: { ammo: { offsetX: 123 } } });
  check('预览返回补全后的配置', previewed.modules.ammo.offsetX === 123 && previewed.modules.ammo.scaleX === 1,
    JSON.stringify(previewed.modules.ammo));
  check('预览不碰磁盘', fs.readFileSync(FILE, 'utf8') === before);
  check('未知字段被保留', cfgMod.preview({ myCustomFlag: 'keep-me' }).myCustomFlag === 'keep-me');

  console.log('\n[2] 保存落盘并补全');
  cfgMod.save({ modules: { vitals: { offsetY: -40, scaleX: 1.2 } } });
  const onDisk = readFile();
  check('改动写进了文件', onDisk.modules.vitals.offsetY === -40 && onDisk.modules.vitals.scaleX === 1.2,
    JSON.stringify(onDisk.modules.vitals));
  check('缺失字段被默认值补全', onDisk.modules.vitals.barAlpha === cfgMod.DEFAULTS.modules.vitals.barAlpha,
    String(onDisk.modules.vitals.barAlpha));
  check('其它模块没被动过', onDisk.modules.money.scaleX === cfgMod.DEFAULTS.modules.money.scaleX);
  check('顶层字段完整', onDisk.timer && onDisk.show && onDisk.hud && onDisk.staleTimeoutMs === cfgMod.DEFAULTS.staleTimeoutMs);
  check('文件是合法 JSON 且带缩进', fs.readFileSync(FILE, 'utf8').includes('\n  "modules"'));

  console.log('\n[3] 恢复默认');
  cfgMod.reset();
  const afterReset = readFile();
  check('vitals 回到默认', afterReset.modules.vitals.offsetY === cfgMod.DEFAULTS.modules.vitals.offsetY);
  check('所有模块键齐全', Object.keys(cfgMod.DEFAULTS.modules).every((k) => afterReset.modules[k]),
    Object.keys(afterReset.modules).join(','));
} finally {
  // 无条件还原用户原本的配置
  fs.writeFileSync(FILE, original, 'utf8');
  try { fs.unlinkSync(BACKUP); } catch (e) { /* 已删除 */ }
  const restored = fs.readFileSync(FILE, 'utf8') === original;
  console.log(`\n${restored ? '✅' : '❌'} config.json 已还原成原样`);
  if (!restored) process.exitCode = 1;
}

console.log(`\n结果：${pass} 通过，${fail} 失败\n`);
if (fail) process.exitCode = 1;
