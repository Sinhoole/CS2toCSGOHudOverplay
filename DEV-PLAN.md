# OverplayHUD — 把 CS2 的 HUD 还原成 CS:GO 的完整开发方案

> 目标：不改游戏、不读内存，用一个全屏透明覆盖层把 CS:GO 时期的 HUD 画在 CS2 画面上，并通过控制台命令关掉 CS2 原生 HUD（含顶部队伍比分栏）。

---

## 0. 结论先行

**唯一能同时满足"做得出"和"不会被 VAC"的路线：**

| 环节 | 方案 |
|---|---|
| 拿数据 | **GSI（Game State Integration）**——Valve 官方接口，游戏主动 HTTP POST 给你 |
| 画出来 | 独立进程的**全屏透明 / 鼠标穿透 / 置顶窗口**，HTML+CSS 渲染 |
| 藏原生 | 控制台命令 `cl_draw_only_deathnotices 1` + 一组 `cl_drawhud_force_*` 微调 |
| 红线 | 不读内存、不注入、不改游戏文件、不模拟任何输入 |

这套东西在系统眼里 = "一个只会画图的本地网页 + 官方接口"，风险接近 0。

---

## 1. 三条技术路线的取舍

| 路线 | 数据完整度 | VAC 风险 | 维护成本 | 结论 |
|---|---|---|---|---|
| **A. GSI + 覆盖层** | 够用（本地玩家全量；观察者类数据缺失） | 极低（官方接口） | 低 | ✅ **推荐** |
| B. ReadProcessMemory 读 cs2.exe | 最全 | 中～高，且属于明确越界 | 极高（每次更新偏移全失效） | ❌ 排除 |
| C. 替换 panorama / vpk 贴图 | 最原汁原味 | 改客户端文件，理论上有风险 | 高（更新即覆盖） | ❌ 排除 |

先说清楚：**B 和 C 都别碰**。B 是典型的外部作弊形态；C 属于"未授权的客户端文件修改"。为了一个怀旧 HUD 搭上库存不值得。

---

## 2. 关掉 CS2 原生 HUD（关键环节）

### 2.1 命令矩阵

| 命令 | 作用 | 是否需要 sv_cheats |
|---|---|---|
| `cl_draw_only_deathnotices 1` | 只保留准星 + 击杀提示，**其余 HUD 全关（含顶部队伍比分栏）** | Valve 官方 wiki 标为 release（官匹可用）；部分资料站标 sv_cheats → **以实测为准** |
| `cl_drawhud 0` | 连准星一起全关 | ✅ 需要（仅离线 / 私服） |
| `cl_drawhud_force_radar 1` | HUD 关闭时**照样画雷达** | 否 |
| `cl_drawhud_force_deathnotices -1` | 强制不画击杀提示（1=强制画，0=默认）。做成 `bind alt toggle cl_drawhud_force_deathnotices 1 0` 就是 **Alt 开关：临时唤回原生 HUD** | 否 |
| `cl_drawhud_force_teamid_overhead 1` | 强制保留头顶队伍标识（GSI 的 allplayers 仅观察者有效，覆盖层拿不到，必须留原生） | 否 |
| `hud_showtargetid 0` | 关掉准星上方的敌人名字 | 否 |
| `cl_showloadout 0` | 关掉 CS2 特有的武器栏常驻显示 | 否 |
| `cl_crosshairstyle 4` | 经典静态准星（CS:GO 手感，CS2 仍支持全套 crosshair cvar） | 否 |

### 2.2 推荐组合（官匹 / 社区服）

写入 `autoexec.cfg`：

```cfg
// ---- OverplayHUD: 关掉 CS2 原生 HUD ----
cl_draw_only_deathnotices 1        // 只留准星 + 击杀提示
cl_drawhud_force_radar 1           // 雷达单独保留（GSI 拿不到位置数据，复刻不了）
cl_drawhud_force_teamid_overhead 1 // 队友头顶标识也保留（同理）
bind alt toggle cl_drawhud_force_deathnotices 1 0  // Alt 开关：临时唤回原生 HUD
r_drawtracers_firstperson false    // 关掉第一人称曳光弹（观感）
hud_showtargetid 0
cl_showloadout 0
cl_crosshairstyle 4

// 雷达尽量往 CS:GO 靠
cl_radar_always_centered 0
cl_radar_scale 0.4
cl_radar_icon_scale_min 0.6
cl_radar_rotate 1
cl_radar_square_with_scoreboard 1

host_writeconfig
```

离线 / 私服可以再狠一点：`sv_cheats 1` 后 `cl_drawhud 0`，连准星都没了（准星就得由覆盖层自己画）。

### 2.3 三个必须知道的坑

1. **顶部队伍比分栏没有独立的 cvar**，它是 HUD 的一部分，被 `cl_draw_only_deathnotices 1` 一并关掉——这正好是你要的。
2. **雷达和击杀提示建议保留原生的**：GSI 对本地玩家不提供位置数据和击杀事件流，这两个复刻不了。上面的 `cl_drawhud_force_radar 1` 就是为这个场景存在的。
3. **部分服务器会锁 cvar**，进服后可能被重置。没有合法手段从外部让游戏执行命令，只能靠 autoexec；如果失效，覆盖层里做个"检测到原生 HUD 仍在"的提示即可，别去想办法绕过。

---

## 3. 总体架构

```
┌──────────────┐                        ┌─────────────────────────┐
│   CS2 客户端 │  HTTP POST (JSON)       │  OverplayHUD (独立进程) │
│              │ ─────────────────────▶ │  ┌───────────────────┐  │
│ gamestate_   │   127.0.0.1:58880      │  │ GSI 接收服务       │  │
│ integration_ │   ~20-30 次/秒          │  │ (本机 HTTP server) │  │
│ overplay.cfg │                        │  └─────────┬─────────┘  │
└──────────────┘                        │            ▼            │
       ▲                                │  ┌───────────────────┐  │
       │ 控制台命令关掉                   │  │ 状态机 / 差分      │  │
       │ 原生 HUD                        │  │ (计时器本地估算)   │  │
       │                                │  └─────────┬─────────┘  │
       │                                │            ▼            │
       │                                │  ┌───────────────────┐  │
       └──────── 画面合成 ◀────────────── │  │ 透明置顶窗口       │  │
              （全屏窗口化）              │  │ HTML/CSS 画 HUD   │  │
                                        │  │ 鼠标键盘穿透       │  │
                                        │  └───────────────────┘  │
                                        └─────────────────────────┘
```

---

## 4. 技术选型

| 层 | 推荐 | 备选 |
|---|---|---|
| 数据接收 | **Node 20+ / TypeScript**，库 `csgogsi` | Rust `cs2-gsi`、Go `cs2gsi`、C# `antonpup/CounterStrike2GSI` |
| 渲染 | **HTML + CSS**（CS:GO 的 HUD 本身就是 Panorama 的 HTML/CSS，复刻最自然） | Direct2D（性能极致但工作量大 5 倍） |
| 窗口外壳 | **Electron**（起步最快） | Tauri（更轻，稳定后再迁移）、C# WPF + WebView2、C++ Win32 |

建议：Electron 先把形态跑通，等真的嫌它占内存再换 Tauri。**别一开始就用 C++**，你会死在窗口细节上。

---

## 5. 打通 GSI（P1，全项目最大单点风险）

### 5.1 配置文件 —— 注意格式是 Valve KV，不是 JSON

网上大量教程给的是 JSON，**那是错的**。正确格式：

```cfg
"OverplayHUD v.1"
{
  "uri"      "http://127.0.0.1:58880"
  "timeout"  "5.0"
  "buffer"   "0.05"
  "throttle" "0.03"
  "heartbeat" "30.0"
  "auth"
  {
    "token" "换成你自己的随机字符串"
  }
  "data"
  {
    "provider"           "1"   // 游戏 / appid / 自己的 steamid
    "map"                "1"   // 地图、模式、阶段、双方比分
    "round"              "1"   // 回合阶段、炸弹状态、胜方
    "player_id"          "1"   // 名字、队名
    "player_state"       "1"   // 血量、护甲、头盔、金钱、本回合击杀/爆头
    "player_weapons"     "1"   // 持有武器 + 弹药
    "player_match_stats" "1"   // KDA / 得分 / MVP
  }
}
```

**存放路径**（放完必须**重启游戏**才生效）：

```
<Steam>\steamapps\common\Counter-Strike Global Offensive\game\csgo\cfg\gamestate_integration_overplayhud.cfg
```

> ⚠️ 社区已知坑：CS2 的文件结构里存在 **两份 cfg 目录**（`game\csgo\cfg` 与 `game\core\cfg`），有人因为只放了一份而始终收不到数据。**两个目录各放一份**能省掉你两小时的排查。

### 5.2 最小验证服务器（先跑这个，别急着写 UI）

```js
// verify.mjs —— node verify.mjs
import http from 'node:http';

http.createServer((req, res) => {
  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    try {
      const j = JSON.parse(body);
      const p = j.player;
      const s = p?.state;
      const w = Object.values(p?.weapons ?? {}).find(x => x.state === 'active');
      console.log(
        `HP ${s?.health}  甲 ${s?.armor}${s?.helmet ? '+盔' : ''}  ` +
        `$${s?.money}  ${w?.name}  ${w?.ammo_clip}/${w?.ammo_reserve}  ` +
        `比分 ${j.map?.team_ct?.score}:${j.map?.team_t?.score}`
      );
    } catch (e) { /* 忽略心跳等非 JSON */ }
    res.writeHead(200); res.end();
  });
}).listen(58880, '127.0.0.1', () => console.log('GSI listening on 58880'));
```

**这一步通不过，后面所有设计都要推倒重来。** 务必先在官匹和常去的社区服各试一次。

---

## 6. 数据字段 → HUD 元素映射

| CS:GO HUD 元素 | GSI 字段 | 备注 |
|---|---|---|
| 生命值（左下） | `player.state.health` | |
| 护甲 + 头盔（左下） | `player.state.armor` / `player.state.helmet` | 头盔是 bool，对应 CS:GO 护甲图标里的小头盔 |
| 金钱 | `player.state.money` | 位置以 CS:GO 原版截图校准 |
| 弹匣 / 备弹（右下） | `weapons[active].ammo_clip` / `ammo_reserve` / `ammo_clip_max` | 刀、手雷需特殊处理（无弹药概念） |
| 武器图标 / 名称 | `weapons[active].name`（如 `weapon_ak47`） | 需要一张 name → 图标 的映射表 |
| 本回合击杀数 + 爆头（弹药左侧小头像） | `player.state.round_kills` / `round_killhs` | |
| 顶部比分 | `map.team_ct.score` / `map.team_t.score` | ✅ 有 |
| 顶部计时器 / 炸弹倒计时 | ❌ `phase_countdowns` 仅 GOTV / 观察者 | 见 §7 本地估算 |
| 顶部存活人数 | ❌ `allplayers_*` 仅观察者 | 见 §7 |
| 击杀提示 | ❌ 无事件流 | **保留 CS2 原生** |
| 雷达 | ❌ 本地玩家无位置数据 | **保留 CS2 原生**，用 `cl_radar_*` 调参 |

一句话：**80% 的核心元素（血、甲、钱、弹药、武器、比分）GSI 全都有**，缺的恰好是"要观察者权限"的那几个。

---

## 7. 数据缺口的补偿方案

**计时器（必须做，否则 CS:GO HUD 少了灵魂）**

本地时钟估算，误差 ±0.5s，实战够用：

```
phase 由 freezetime → live 时记 t0：  剩余 = 115 - (now - t0)
round.bomb.state 变 planted 时记 tb： 剩余 = 40  - (now - tb)
defused / exploded / over / 新回合：  清零
```

注意 GSI 有 throttle 延迟（30ms 级），直接用 payload 到达时刻会略偏慢，可接受。

**存活人数（可选）**

本地玩家视角无解。两个选择：
1. 干脆不做，顶部只显示比分 + 队名 + 计时器（其实很像 CS:GO 早期布局）；
2. 做成"死后自动点亮"——官匹死后进入队友观察视角时，`allplayers_*` 有可能开始出数据。**列为验证项**，实测有就做，没有就砍掉。

**武器图标素材**

- 来源 A：本机仍装着的 CS:GO，`csgo/panorama/images/icons/equipment/*.svg`
- 来源 B：Steam 创意工坊搜 "CSGO Style Weapon Icons"
- 来源 C：自己画 / 生成 SVG

只做本地个人使用，**不要打包分发游戏素材**。

---

## 8. 覆盖层窗口实现要点（Windows）

### 8.1 前置：CS2 必须用"全屏窗口"模式

设置 → 视频 → 显示模式 = **全屏窗口**（borderless）。独占全屏下覆盖层可能被盖住或闪烁。

### 8.2 Electron 窗口配置

```js
const win = new BrowserWindow({
  transparent: true,
  frame: false,
  fullscreen: true,
  alwaysOnTop: true,
  skipTaskbar: true,
  focusable: false,        // 不抢键盘输入
  resizable: false,
  movable: false,
  hasShadow: false,
  webPreferences: {
    backgroundThrottling: false,   // 别让窗口被系统降频
  },
});

win.setIgnoreMouseEvents(true, { forward: true });  // 鼠标穿透
win.setAlwaysOnTop(true, 'screen-saver');           // 层级高于普通置顶
win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
```

### 8.3 容易踩的坑

- **DPI / 多显示器**：用 `screen.getPrimaryDisplay()` 取 `bounds` 与 `scaleFactor`，不要写死 1920×1080。
- **性能**：只在数据变化时更新 DOM，别整窗口重绘；无内容区域保持 alpha=0，别铺一层半透明底色（会明显掉帧）。
- **对齐**：CS2 的 `hud_scaling`（0.5~0.95）会改变原生 HUD 尺寸，覆盖层要提供对应的缩放参数才能和雷达/击杀提示视觉统一。
- **alt-tab**：`focusable:false` + `skipTaskbar:true`，保证切出去再切回来不会抢焦点。

---

## 9. VAC 规避：红线清单

### ✅ 必须这样做

- **只用 GSI**——Valve 自己提供的功能，游戏主动把数据 POST 给你，这是最硬的免责理由
- 独立进程，只创建自己的窗口，不打开 cs2.exe 的进程句柄
- 鼠标键盘完全穿透，**不模拟任何输入**（没有自动买枪、没有连跳、没有压枪）
- 不修改 cs2.exe / vpk / panorama / 不加任何注入型启动项
- 只监听 `127.0.0.1`，cfg 里带 token，不对外开端口
- **覆盖层只显示"普通玩家本来就看得到的信息"**，严格限制在 CS:GO 官方 HUD 的范围内
- 运行时不要同时开着 Cheat Engine、内核驱动、其它游戏的修改器

### ❌ 绝对不碰

- `ReadProcessMemory` / `WriteProcessMemory` 读 cs2.exe
- `CreateRemoteThread` / `LoadLibrary` 注入 DLL
- Hook `Present` / SwapChain、替换 `d3d11.dll`、ReShade 式注入
- 内核驱动、隐藏进程 / 隐藏窗口
- 修改 VPK / panorama 文件（哪怕只是换张贴图）
- 任何形式的自动化操作

### 认知校准

VAC 主要做**已知作弊签名 / 模块扫描 + 服务端行为异常检测**。Discord、Steam、OBS、RTSS 这类覆盖层常年无碍，因为它们不碰游戏进程。本项目在形态上等同"一个只会画图的本地网页"，数据还来自官方接口。

但 Valve 从不承诺零风险，所以：

- **先用小号 / 或只在离线 + 机器人环境跑满一两周**再上主号
- 代码保持开源、不混淆、不加壳、命名里别出现 cheat 字样
- **别在 Faceit / ESEA / 5E / B5 等第三方反作弊平台上用**——它们比 VAC 激进得多，覆盖层也可能被判违规。只在官匹、社区服、离线用。

---

## 10. 分阶段开发流程

| 阶段 | 内容 | 验收标准 | 预估 |
|---|---|---|---|
| **P0** | 环境准备：Node / Electron、开控制台、找 cfg 目录、准备 CS:GO 参考截图 | 控制台能打开，找到两个 cfg 目录 | 0.5 天 |
| **P1** | **GSI 打通**：写 cfg + 最小 Node 服务器 | 官匹里能实时打印 HP / 钱 / 弹药 / 比分 | 0.5 天 |
| **P2** | **窗口骨架**：全屏透明置顶窗口 | CS2 全屏窗口化下，色块稳定压在游戏上、鼠标穿透、不抢焦点 | 1 天 |
| **P3** | **关原生 HUD**：autoexec 命令组合 | 屏幕上只剩准星 + 雷达 + 击杀提示 | 0.5 天 |
| **P4** | **HUD 复刻**：拆成 6 个组件逐个对齐（血甲 / 弹药 / 金钱 / 武器图标 / 比分栏 / 计时器） | 截图与 CS:GO 原图逐像素比对 | 3~5 天 |
| **P5** | 缺口补偿 + 设置面板（开关、缩放、位置微调） | 计时器可用，参数可存盘 | 2 天 |
| **P6** | 稳定性打磨：多显示器、不同分辨率、DPI、alt-tab、游戏更新回归 | 连续玩 10 局无异常 | 2 天 |

**合计约 10~14 个工作日**（业余节奏）。

### 验收清单

- [ ] 官匹 / 社区服均能收到 GSI 数据
- [ ] 鼠标点击穿透，游戏内操作 100% 正常
- [ ] 切屏、alt-tab、锁屏后覆盖层不丢、不卡住
- [ ] 帧率损失 < 3%
- [ ] 1440p / 1080p / 不同 DPI 下位置正确
- [ ] 原生 HUD 已完全隐藏（含顶部队伍栏）
- [ ] 未使用任何注入 / 内存读取 / 文件修改

---

## 11. 建议的目录结构

```
OverplayHUD/
├─ app/
│  ├─ main.ts                 # Electron 主进程：窗口创建
│  ├─ gsi/
│  │  ├─ server.ts            # 本机 HTTP 接收
│  │  └─ state.ts             # 状态机、差分、计时器估算
│  └─ renderer/
│     ├─ hud.css
│     ├─ components/
│     │  ├─ HealthArmor.tsx
│     │  ├─ Ammo.tsx
│     │  ├─ Money.tsx
│     │  ├─ ScoreBar.tsx
│     │  ├─ Timer.tsx
│     │  └─ WeaponIcon.tsx
│     └─ assets/icons/
├─ cfg/
│  └─ gamestate_integration_overplayhud.cfg   # 需复制到 CS2 的两个 cfg 目录
└─ docs/
```

---

## 12. 建议的第一步

**花 30 分钟只做 P1。** 建好 cfg、跑起那 30 行的 Node 服务器，确认在官匹里能拿到自己的血量 / 金钱 / 弹药。

这一步是整个项目最大的单点风险——GSI 在某些环境下不工作（第三方平台、个别社区服、cfg 目录放错）。它通了，剩下都是体力活；它不通，后面所有设计都得改。
