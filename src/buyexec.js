'use strict';

/**
 * 购买执行器（路线 B 专用）。
 *
 * ⚠️ VAC 红线例外：本项目底线是「不模拟任何输入」。购买轮盘是用户明确批准的唯一例外——
 * 点选格子时会向 CS2 注入按键 / 控制台指令来完成购买。这一例外仅限本功能，且只在
 * 购买时间、只用于本地玩家自己买东西。详情见 MEMORY.md。
 *
 * 原理：GSI 是单向的（游戏 → 程序），官方没有回传通道。要让 CS2 真的买东西，只能把
 * 指令打进游戏窗口。这里用 PowerShell + System.Windows.Forms.SendKeys 把按键送到
 * cs2.exe 的主窗口（先把窗口置前，再发键）。这是 OS 层输入，不读内存、不注入 DLL。
 *
 * 两种执行方式（由 config.buywheel.execMode 决定）：
 *   - key 模式：直接发一个键（前提是你已经在 CS2 里把这个键绑成了对应购买，
 *     例如 bind "F1" "buy ak47"）。最快、最稳。
 *   - console 模式（auto 模式下没填 key 时走这里）：先开控制台、键入 buy 命令、回车、
 *     再关控制台。无需你预先绑定任何键，零配置。
 *
 * 失败退路：找不到 cs2.exe 进程时返回 { ok:false, reason:'no_cs2' }，由调用方把
 * buy 命令复制到剪贴板，玩家自己贴进控制台也不耽误事。
 */

const { spawnSync } = require('child_process');

/** SendKeys 里的特殊字符必须用花括号包起来，否则会被当成修饰键/分组 */
function escapeSendKeys(s) {
  return String(s == null ? '' : s).replace(/([+^%~()[\]{}])/g, '{$1}');
}

/** 把一串键翻译成 SendKeys 语法：功能键 F1..F12 要包成 {F1} */
function toSendKeys(key) {
  const k = String(key || '').trim();
  if (!k) return '';
  if (/^f\d{1,2}$/i.test(k)) return `{${k.toUpperCase()}}`;
  return escapeSendKeys(k);
}

/** 生成 PowerShell 脚本：把 cs2 窗口置前，然后按顺序发键 */
function buildScript(sequence) {
  // sequence: 一段段要发的键，可以夹 Start-Sleep
  const parts = sequence
    .map((p) => {
      if (p.sleep != null) return `Start-Sleep -Milliseconds ${p.sleep}`;
      const b64 = Buffer.from(p.keys, 'utf8').toString('base64');
      return `$k = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64}'));[K]::S($k)`;
    })
    .join('\n');

  return `
$ErrorActionPreference = 'Stop'
Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);' -Name Win32 -Namespace W32
Add-Type -AssemblyName System.Windows.Forms
$src = 'using System;using System.Windows.Forms;public class K{[STAThread] public static void S(string keys){SendKeys.SendWait(keys);}}'
Add-Type -TypeDefinition $src
$p = Get-Process cs2 -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { Write-Output 'NO_CS2'; exit 0 }
[W32.Win32]::SetForegroundWindow($p.MainWindowHandle)
${parts}
Write-Output 'OK'
`.trim();
}

/**
 * 执行一次购买。
 * @param {object} o
 * @param {string} o.execMode  'auto' | 'key' | 'console'
 * @param {string} o.consoleKey 打开控制台的键（默认反引号）
 * @param {string} o.command   要执行的 buy 命令（console/auto 模式用）
 * @param {string} o.key       可选的预绑定键（key/auto 模式用）
 * @returns {{ok:boolean, mode:string, reason?:string}}
 */
function execBuy({ execMode, consoleKey, command, key } = {}) {
  const useKey = execMode === 'key' || (execMode === 'auto' && key && key.trim());
  const mode = useKey ? 'key' : 'console';

  let sequence;
  if (useKey) {
    const k = toSendKeys(key);
    if (!k) return { ok: false, mode, reason: 'empty_key' };
    sequence = [
      { keys: k },
      { sleep: 30 },
    ];
  } else {
    const ck = toSendKeys(consoleKey && consoleKey.trim() ? consoleKey : '`');
    const cmd = escapeSendKeys((command || '').trim());
    if (!cmd) return { ok: false, mode, reason: 'empty_command' };
    sequence = [
      { keys: ck },                              // 开控制台
      { sleep: 70 },
      { keys: `${cmd}{ENTER}` },                 // 键入命令并回车
      { sleep: 50 },
      { keys: ck },                              // 关控制台
    ];
  }

  const script = buildScript(sequence);
  try {
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      timeout: 8000,
    });
    const out = (r.stdout || '').toString();
    if (out.includes('NO_CS2')) return { ok: false, mode, reason: 'no_cs2' };
    if (!out.includes('OK')) {
      const err = (r.stderr || '').toString().trim();
      return { ok: false, mode, reason: 'ps_error', detail: err || 'unknown' };
    }
    return { ok: true, mode };
  } catch (e) {
    return { ok: false, mode, reason: 'exception', detail: e.message };
  }
}

module.exports = { execBuy };
