#!/usr/bin/env node
/**
 * P1 验证：不开 Electron，纯 Node 确认 CS2 的 GSI 数据能不能收到。
 *
 *   node tools/verify-gsi.mjs              默认监听 58880
 *   node tools/verify-gsi.mjs --port 9000
 *   node tools/verify-gsi.mjs --dump last.json   把最后一份原始 payload 存盘
 *   node tools/verify-gsi.mjs --raw              打印原始 JSON
 *
 * 跑起来后进 CS2（官匹或社区服），这个窗口应该每秒刷十几行实时数据。
 * 如果一直没输出，看下面的排查提示。
 */
import http from 'node:http';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const has = (name) => args.includes(`--${name}`);

const PORT = Number(flag('port', 58880));
const DUMP = flag('dump', '');
const RAW = has('raw');

let count = 0;
let lastRaw = '';
let reported = false;
let lastAll = 0;
let seenAll = false;

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    if (req.method !== 'POST') return;

    lastRaw = body;
    count += 1;

    let p;
    try {
      p = JSON.parse(body);
    } catch {
      return;
    }

    if (RAW) {
      console.log(JSON.stringify(p, null, 2));
      return;
    }
    if (!reported) {
      reported = true;
      console.log('\n✅ 收到第一份数据，GSI 通了。下面是实时状态（Ctrl+C 退出）：\n');
    }

    const st = p.player?.state || {};
    const w = Object.values(p.player?.weapons || {}).find((x) => x && x.state === 'active');
    const map = p.map || {};
    const round = p.round || {};

    // ---- allplayers 探测 ----
    // Valve 把 allplayers 限定为「仅观察者有效」：你还活着的时候它根本不出现，
    // 死亡进入观战后才开始有数据。这一列就是用来眼见为实的。
    const all = p.allplayers && typeof p.allplayers === 'object' ? Object.keys(p.allplayers).length : 0;

    if (all !== lastAll) {
      lastAll = all;
      if (all > 0) {
        process.stdout.write(`\n✅ allplayers 出现了（${all} 人）—— 说明现在是观战视角。名单面板可以用了。\n`);
        if (!seenAll) {
          seenAll = true;
          const k = Object.keys(p.allplayers)[0];
          console.log(`   第一个人（${k}）的原始结构，字段名以这个为准：`);
          console.log(JSON.stringify(p.allplayers[k], null, 2).split('\n').map((l) => '   ' + l).join('\n'));
          console.log('');
        }
      } else {
        process.stdout.write('\n⛔ allplayers 没了 —— 回到存活视角。这是正常的，不是出错。\n');
      }
    }

    const line = [
      `HP ${pad(st.health, 3)}`,
      `甲 ${pad(st.armor, 3)}${st.helmet ? '+盔' : '   '}`,
      `$${pad(st.money, 5)}`,
      `${pad((w?.name || '-').replace('weapon_', ''), 14)}`,
      `弹 ${pad(w?.ammo_clip ?? '-', 2)}/${pad(w?.ammo_reserve ?? '-', 3)}`,
      `比分 ${map.team_ct?.score ?? '-'}:${map.team_t?.score ?? '-'}`,
      `阶段 ${round.phase ?? '-'}${round.bomb ? '/' + round.bomb : ''}`,
      `名单 ${all ? all + '人' : ' — '}`,
      `包数 ${count}`,
    ].join('  ');

    process.stdout.write(`\r${line}   `);
  });
});

server.on('error', (e) => {
  console.error(`\n❌ 监听失败: ${e.message}`);
  if (e.code === 'EADDRINUSE') console.error(`   端口 ${PORT} 被占用，换一个：--port 9000`);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n监听 http://127.0.0.1:${PORT}`);
  console.log('现在启动 CS2 并进入一局（官匹或社区服）…');
  console.log('');
  console.log('提示：活着的时候「名单」那一列会一直是 —，这是正常的 ——');
  console.log('     游戏不会把队友数据下发给还活着的玩家。死一次进入观战，');
  console.log('     它就会变成「10人」并打印出第一个人的原始结构。\n');

  setTimeout(() => {
    if (count === 0) {
      console.log('⏳ 还没收到任何数据。按顺序排查：');
      console.log('   1) cfg 文件放对了吗？路径应为');
      console.log('      <Steam>\\steamapps\\common\\Counter-Strike Global Offensive\\game\\csgo\\cfg\\gamestate_integration_overplayhud.cfg');
      console.log('      （CS2 有两份 cfg 目录，game\\core\\cfg 也放一份试试）');
      console.log('   2) 放完 cfg 必须完全重启 CS2，不是重连服务器');
      console.log('   3) GSI 只在真实对局中推送，主菜单和创意工坊地图没有数据');
      console.log('   4) 端口是否被占用？换个端口要同时改 cfg 里的 uri');
      console.log('   5) 某些第三方平台（Faceit/ESEA 等）会屏蔽 GSI\n');
    }
  }, 20000);
});

process.on('SIGINT', () => {
  console.log(`\n\n共收到 ${count} 份数据。`);
  if (DUMP && lastRaw) {
    writeFileSync(DUMP, JSON.stringify(JSON.parse(lastRaw), null, 2));
    console.log(`原始 payload 已存到 ${DUMP}`);
  }
  process.exit(0);
});

function pad(v, n) {
  return String(v ?? '').padStart(n, ' ');
}
