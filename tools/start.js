'use strict';

/**
 * 启动器。
 *
 * 某些终端环境（比如集成终端）会设置 ELECTRON_RUN_AS_NODE=1，
 * 这会让 electron.exe 退化成一个纯 Node，require('electron') 拿不到 app 对象，
 * 启动时直接报 "Cannot read properties of undefined (reading 'requestSingleInstanceLock')"。
 * 这里在派子进程时把这个变量摘掉，保证任何终端里 npm start 都能用。
 */
const { spawn } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const electronPath = require('electron'); // 纯 Node 模式下返回可执行文件路径
const args = [root, ...process.argv.slice(2)];

const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, args, { cwd: root, stdio: 'inherit', env });

child.on('error', (e) => {
  console.error('启动失败:', e.message);
  process.exit(1);
});

child.on('exit', (code) => process.exit(code == null ? 0 : code));
