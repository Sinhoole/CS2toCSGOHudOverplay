'use strict';

/**
 * 把 GSI 配置文件装到 CS2 目录。
 *
 * CS2 的文件结构里存在两份 cfg 目录（game/csgo/cfg 与 game/core/cfg），
 * 只放一份可能静默失效，所以两个都放。
 *
 * 这个模块被两处共用：
 *   - tools/install-cfg.mjs（命令行）
 *   - src/main.js 的托盘菜单「安装 GSI 配置到 CS2」（打包后没有命令行，只能从菜单装）
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CFG_NAME = 'gamestate_integration_overplayhud.cfg';

/** 探测所有 Steam 库目录 */
function steamLibraries() {
  const out = [];
  try {
    if (process.platform === 'win32') {
      const txt = execSync('reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath', { encoding: 'utf8' });
      const m = txt.match(/SteamPath\s+REG_SZ\s+(.+)/);
      const steam = m ? m[1].trim() : null;
      if (steam) {
        out.push(steam);
        const vdf = path.join(steam, 'steamapps', 'libraryfolders.vdf');
        if (fs.existsSync(vdf)) {
          const s = fs.readFileSync(vdf, 'utf8');
          for (const mm of s.matchAll(/"path"\s+"([^"]+)"/g)) {
            out.push(mm[1].replace(/\\\\/g, '\\'));
          }
        }
      }
    } else {
      const home = process.env.HOME || '';
      const base = process.platform === 'darwin'
        ? path.join(home, 'Library', 'Application Support', 'Steam')
        : path.join(home, '.local', 'share', 'Steam');
      out.push(base);
      const vdf = path.join(base, 'steamapps', 'libraryfolders.vdf');
      if (fs.existsSync(vdf)) {
        const s = fs.readFileSync(vdf, 'utf8');
        for (const mm of s.matchAll(/"path"\s+([^"]+)/g)) out.push(mm[1]);
      }
    }
  } catch (e) {
    out.push('C:\\Program Files (x86)\\Steam');
  }
  return [...new Set(out)];
}

/** 找到的 CS2 安装目录（去重时忽略大小写，Windows 路径不区分大小写） */
function findGameRoots(manual) {
  const candidates = manual
    ? [manual]
    : steamLibraries().map((lib) => path.join(lib, 'steamapps', 'common', 'Counter-Strike Global Offensive'));

  const seen = new Set();
  return candidates.filter((p) => {
    if (!fs.existsSync(p)) return false;
    const key = p.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** CS2 是不是正在运行 */
function isGameRunning() {
  try {
    const out = execSync('tasklist', { encoding: 'utf8' });
    return /cs2\.exe/i.test(out);
  } catch (e) {
    return null;   // 查不到就算了
  }
}

/** 由调用方提供 cfg 源文件路径（打包后它在 asar 里，用 fs 能正常读） */
function targets(root) {
  return [path.join(root, 'game', 'csgo', 'cfg'), path.join(root, 'game', 'core', 'cfg')];
}

/**
 * 只读检查：不写任何文件。
 * 返回 { roots: [{ path, dirs: [{ dir, exists, installed, others }] }], running }
 */
function inspect(srcFile, manual) {
  const data = fs.existsSync(srcFile) ? fs.readFileSync(srcFile, 'utf8') : '';
  const roots = findGameRoots(manual).map((root) => ({
    path: root,
    dirs: targets(root).map((dir) => {
      const exists = fs.existsSync(dir);
      let others = [];
      if (exists) {
        try {
          others = fs.readdirSync(dir).filter((f) => /^gamestate_integration_.*\.cfg$/i.test(f));
        } catch (e) { /* 读不了就算了 */ }
      }
      return { dir, exists, installed: exists && fs.existsSync(path.join(dir, CFG_NAME)), others };
    }),
  }));
  return { roots, running: isGameRunning(), bytes: data.length };
}

/**
 * 安装。返回 { copied: [路径], failed: [路径], roots: number }
 */
function install(srcFile, manual) {
  const data = fs.readFileSync(srcFile, 'utf8');
  const roots = findGameRoots(manual);
  const copied = [];
  const failed = [];

  for (const root of roots) {
    for (const dir of targets(root)) {
      if (!fs.existsSync(dir)) continue;
      const dest = path.join(dir, CFG_NAME);
      try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(dest, data, 'utf8');
        copied.push(dest);
      } catch (e) {
        failed.push(dest + ' — ' + e.message);
      }
    }
  }
  return { copied, failed, roots: roots.length };
}

module.exports = { CFG_NAME, findGameRoots, targets, inspect, install, isGameRunning, steamLibraries };
