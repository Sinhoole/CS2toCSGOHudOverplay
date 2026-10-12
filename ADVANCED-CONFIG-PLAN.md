# OverplayHUD 进阶配置计划书

> 版本：v0.4  ·  日期：2026-10-10  ·  状态：**第三批已落地**（§13 + §14 + §15）
> 本文描述**规划 + 已实现**。设置界面已分「基础配置」与「进阶配置」两组，
> 进阶组现有四页：**全局默认 / 每元素 / 图标库 / 画图**（见 §13、§14），
> 并提供 **实时预览窗口**（模拟数据，边调边看；见 §15）。

> **v0.4 变更摘要（第三批：实时预览）**
> - 设置界面标题栏新增「**预览**」按钮：打开一个**独立的预览窗口**，
>   它是**第二个 HUD 窗口**（同一份 `renderer/index.html`，只多带 `?preview=1`），
>   所以看到的就是真实覆盖层的同一套渲染代码 —— 不存在「预览像、实际不像」。
> - 数据来自**一份独立的模拟数据源**（自己的 `GsiHub` + `mock` 时间线），
>   与真实 GSI 完全隔离：预览怎么乱跳都不会影响对局，也不产生任何游戏输入。
> - 预览窗口顶部有一条工具条：**暂停/继续、重播、跳到指定阶段（冻结/进行/下包/结算）、
>   试播报 5 类**（击杀/连杀/阵亡/助攻/MVP），用来即时观察图标、弯曲、时间轴、抖动、震动。
> - 预览窗口默认**按当前显示器宽高比**开（真实覆盖层就是铺满整块屏幕的，比例对上位置才对），
>   并且**可自由拖拽缩放** —— 窗口本身就是一台「小显示器」。
> - 开关：设置标题栏按钮 / 托盘菜单 / 命令行 `--preview`，三者等价。
> - 真实覆盖层**一行都没变**：`?preview=1` 之外的所有分支都不进入。

> **v0.3 变更摘要（第二批：每元素 + 自定义图标 + 画图）**
> - 进阶外观从「全局 + 播报每类覆盖」升级为 **每元素独立配置**：
>   新增 `config.adv.elements`，元素 id 约定 `mod.* / ev.* / custom.N / shape.N`；
>   `adv.kinds` 保留为向后兼容读取（`advstyle.js` 里 `resolveKind` 仍可用）。
> - 新增 **自定义图标库** `config.icons`：支持 emoji / 文字、粘贴或上传 SVG、
>   手绘三种来源；渲染时一律**白名单图元重建**，不透传外部标记。
> - 新增 **画图（矢量编辑器）**：矩形 / 椭圆 / 直线 / 自由笔 / 文字，
>   产物可直接存成图标，或成为贴在 HUD 上的 **形状元素** `config.shapes`。
> - 形状元素与自定义文本元素同一套锚点 / 位移 / 缩放 / 旋转 / 辉光语言，
>   且其文字图元支持 `{变量}` 实时插值。
> - 新增纯计算 API（`src/advstyle.js`）：`ELEMENTS / resolveStyle / parseSVG /
>   primitivesToSVG / shapeToSVG / iconSVG / sanitizeColor / sanitizePath / safeDataURL`。
> - 安全：**永不把外部字符串直接注入 DOM**；脚本、事件、外链、`data:text/html` 全部拒绝。

> **v0.2 变更摘要**
> - 新增 `config.json` 的 `adv` 段（总开关 + 引擎 + 全局外观 + 每类覆盖），默认 `enabled:false`。
> - 新增纯计算模块 `src/advstyle.js`（`resolveKind / curvePath / buildCurveSVG / easingOf`），
>   渲染层与无头自检共用。
> - 渲染层（`hud.js`）在 `adv.enabled` 打开时走「进阶路径」：图标、字重字距、描边、弯曲、
>   入场缩放、停留脉冲、HUD 抖动、手柄震动；**关闭时走与以前逐行一致的基础路径**。
> - 设置界面「进阶配置」从只读说明页升级为**真实编辑器**。
> - **当时尚未实现**（其中自定义图片 / 内联 SVG 图标已由 **v0.3 §14** 补上）：
>   任意触发器/条件的积木规则、音效、面板内写代码。

---

## 0. 一页速览（TL;DR）

- **不改现有基础设置**，而是把它们**归入「基础配置」层**，保持直接可用。
- 新增 **「进阶配置」层**：一套 `事件 → 动作` 的规则系统，用**积木式（连线）**拼装，也可**在面板里写代码**（沙箱执行）。
- 进阶层的能力**完全回答你的问题**：自定义图标、显示/隐藏时机、时长、大小变化、震动、弯曲文字 —— 全部做成可组合的「积木」。
- 关键判断：**地基已经够硬**。现有的 schema 驱动设置、变量表 `src/vars.js`、事件队列、mock/selftest/诊断机制都能直接复用，进阶层是「**在上面加一层**」，不是推倒重来。
- 落地节奏：**M0 事件引擎 → M1 展示单元 → M2 效果层 → M3 工作台 → M4 积木/代码**，每个里程碑都能独立交付、独立自检、且**不破坏现有观感**。

---

## 1. 目标 / 非目标

### 1.1 目标
1. 让用户**不改代码**就能自定义：击杀播报的图标、显隐时机、时长、形变、震动、字体弯曲。
2. 提供一套**"硬朗、完善"的基础设施**：触发、条件、展示、时间轴、效果五个环节都是**注册表驱动**，加一种新能力 = 加一行注册。
3. 支持**两条操作路径**：不想写代码的人用**积木/连线**；想放飞的人用**面板内代码**（受限沙箱）。
4. **绝不牺牲现有行为**：老配置导入后逐项对照，观感不变。

### 1.2 非目标（明确不做）
- **不读内存、不注入 DLL、不 hook 渲染、不模拟任何输入**（VAC 底线，见 §11.1）。
- **不追求"复活原生 CS:GO"**——这是覆盖层，只做 Valve 官方 GSI 能给到的信息。
- 不引入联网/云端规则市场（至少 M0–M4 不做）。
- 不重写渲染管线；现有 CSS/HUD 结构保留。

### 1.3 设计原则
| 原则 | 含义 |
|---|---|
| **分层** | 基础层求稳、进阶层求活，两层读写同一份 `config.json`，互不干扰 |
| **数据驱动** | 一切皆数据（规则即 JSON），UI 只是数据的视图；手改文件与点积木**完全等价** |
| **注册表** | 触发器/条件/动作/展示单元都进注册表，新增能力不碰核心 |
| **可降级** | 进阶层任何一条规则坏掉，只影响那一条；基础层永远可用 |
| **可预览** | 所有改动先在设置窗口内实时预览（不落盘），确认后才保存 |
| **可自检** | 每个新能力都要能被无头 `selftest` 断言，而不是只能靠肉眼 |

---

## 2. 现状盘点（可复用的地基）

进阶层能做得"硬朗"，是因为下面这些已经存在：

| 资产 | 位置 | 进阶层怎么用 |
|---|---|---|
| **schema 驱动设置** | `src/settings/settings.js` 的 `SECTIONS` 数组 | 新面板沿用同一套控件生成器（`numControl / selectControl / switchControl / colorControl`），不手写 input |
| **变量表** | `src/vars.js` 的 `OPH_VARS` | 直接作为「条件」和「插值」的**变量字典**（含 `health / money / weapon_raw / round_kills / phase …`） |
| **事件队列** | `src/renderer/hud.js` 的 `renderEvents / enqueueEvent / playNextEvent` | 升级成通用「事件引擎」，现在的 `events` 段变成**一条内置规则** |
| **事件来源** | `src/gsi.js` 的 K/D/A 增量反推 + `events[]` | 扩成**触发器注册表**（kill / death / multi / round_start / bomb_planted …） |
| **锚点与插值** | `ANCHORS`、`fillTemplate()` | 展单元的定位与文字模板直接复用 |
| **实时预览通道** | `settings:preview` IPC（不落盘） | 工作台的实时预览直接用 |
| **mock 与截图** | `tools/start.js --mock --shot` | 目视回归；预览面板的"试播"按钮也走 mock 数据 |
| **无头自检** | `tools/selftest.mjs`（现 194 项） | 给规则编译器/时间轴/迁移写断言 |
| **渲染层诊断** | `main.js` 的 `attachRendererDiagnostics` | 规则运行时报错能被捕获并显示，不会静默 |

> **结论**：不需要重写。进阶层 = 在 `config.js` 里加一段 `rules`，在 `hud.js` 里把 `renderEvents` 泛化成引擎，再补一个工作台页面。

---

## 3. 分层架构

```
┌──────────────────────────────────────────────────────────────┐
│                         config.json                          │
│  ┌───────────────┐  ┌────────────────┐  ┌─────────────────┐  │
│  │ 基础配置(basic)│  │ 进阶配置(rules) │  │ 脚本层(script)  │  │
│  │ 现有全部字段   │  │ 规则列表 JSON   │  │ 受限 JS 表达式  │  │
│  └───────┬───────┘  └───────┬────────┘  └────────┬────────┘  │
└──────────┼──────────────────┼────────────────────┼───────────┘
           │                  │                    │
           ▼                  ▼                    ▼
   ┌───────────────┐   ┌───────────────────────────────────┐
   │ 现有渲染路径   │   │            事件引擎                │
   │ (直接读字段)   │   │  快照 → 触发器 → 条件 → 动作编排    │
   └───────────────┘   └───────────────┬───────────────────┘
                                       │
                        ┌──────────────┴──────────────┐
                        ▼                             ▼
                 ┌────────────┐                ┌────────────┐
                 │ 展示单元    │                │ 效果层      │
                 │ 内容/样式/  │                │ 抖动/震动/  │
                 │ 时间轴      │                │ 音效        │
                 └────────────┘                └────────────┘
```

**三层的关系**：
- **基础配置**：现在的所有开关/滑杆。读写 `config.json` 的原有字段。**本次不动。**
- **进阶配置**：新增的 `rules` 段。一条规则 = 触发 + 条件 + 动作。**积木式**拼装的就是它。
- **脚本层**：规则里的 `when` 和 `do` 允许写受限 JS，做积木表达不了的逻辑。**是同一条规则的另一种写法**，不是第四层结构。

---

## 4. 数据模型

### 4.1 顶层新增

```jsonc
{
  "schemaVersion": 2,          // 新增：用于迁移
  "rules": {
    "engine": {
      "mode": "queue",         // queue 串行 / parallel 并行 / replace 同层顶替
      "maxQueue": 3,           // 队列上限（对应现在「只留最近三条」）
      "dedupeMs": 250          // 同规则去重窗口，防抖
    },
    "list": [ /* Rule[] */ ]
  }
}
```

### 4.2 规则 Rule

```jsonc
{
  "id": "kill-multi",                 // 稳定 id（导入导出/引用用）
  "name": "三杀播报",
  "enabled": true,
  "on": { "type": "multi_kill" },     // —— 触发器（§4.3）
  "when": [                            // —— 条件，全部满足才触发（§4.4）
    { "var": "round_kills", "op": "gte", "value": 3 }
  ],
  "priority": 40,                      // 同帧多条命中时按此排序，取最高
  "do": [ /* Action[] */ ]            // —— 动作（§4.5 / §4.6）
}
```

### 4.3 触发器（内置注册表，初版）

| type | 含义 | 可用变量（节选） |
|---|---|---|
| `kill` / `death` / `assist` / `mvp` | 个人击杀/阵亡/助攻/MVP +1 | `round_kills`、`matchKills`、`weapon_raw` |
| `multi_kill` | 本回合击杀数跨过阈值 | `round_kills` |
| `round_start` / `round_end` / `match_over` | 回合开始/结束、比赛结束 | `round_no`、`scoreCT`、`scoreT` |
| `bomb_planted` / `bomb_defused` / `bomb_exploded` | C4 事件 | `bombPlanted` |
| `low_health` | 血量**首次**跌破阈值 | `health`、`armor` |
| `money_change` | 金钱变动 | `money`、`moneyDelta` |
| `buy_time_in` / `buy_time_out` | 进入/离开购买时间 | `phase` |
| `weapon_switch` | 切换手持武器 | `weapon_raw` |
| `manual` | 由工作台「试播」按钮触发 | 全部（用 mock 值） |

> 每个触发器 = 注册表里一行；`gsi.js` 只要在快照里补一个增量字段，就能新增一种触发。

### 4.4 条件 when（操作符注册表）

```jsonc
{ "var": "weapon_raw", "op": "eq",       "value": "weapon_ak47" }
{ "var": "round_kills","op": "gte",      "value": 3 }
{ "var": "phase",      "op": "in",       "value": ["live", "over"] }
{ "var": "matchKills", "op": "every",    "value": 5 }        // 每 5 杀触发一次
{ "var": "money",      "op": "changed_by", "value": -3000 }
{ "expr": "round_kills >= 3 && health < 30" }                 // —— 脚本条件（§8）
```

支持的操作符：`eq / ne / gt / gte / lt / lte / in / contains / startsWith / regex / changed / every`。

### 4.5 展示单元 element

```jsonc
{
  "kind": "show",
  "element": {
    "anchor": "tc", "offsetX": 0, "offsetY": 96,
    "makeup": "stack",                // stack 堆叠 / solo 单条 / replace 顶替
    "content": {
      "text": "{round_kills} 连杀",    // 走 fillTemplate，变量表同 §2
      "icon": { "type": "emoji", "value": "💀" },   // emoji / svg(内联) / image(本地文件)
      "iconSide": "left", "gap": 8,
      "curve": { "on": false, "radius": 140, "arc": -140, "align": "center" }
    },
    "style": {
      "fontSize": 30, "fontFamily": "", "weight": 700, "italic": false,
      "color": "#F0B23A", "letterSpacing": 0,
      "outline": { "on": false, "width": 2, "color": "#000000" },
      "shadow": { "on": false, "x": 0, "y": 2, "blur": 6, "color": "#000A" }
    }
  }
}
```

### 4.6 时间轴 timeline（"大小会不会变化""多长时间"的答案）

```jsonc
"timeline": {
  "in":   { "type": "scale", "from": 0.7, "dur": 120, "ease": "backOut", "opacityFrom": 0 },
  "hold": { "dur": 1500,
            "pulse": { "scale": [1, 1.12, 1], "dur": 400, "repeat": -1 } },  // 停留期间呼吸/脉冲
  "out":  { "type": "fade", "dur": 240, "ease": "easeOut", "to": 0 },
  "loop": false
}
```
- `in` / `hold` / `out` 三段，各自可设**时长、缓动、起点终点**。
- `hold.pulse` 负责"大小变化"（缩放/呼吸/频闪）。
- 编译目标：**Web Animations API（合成层，不掉帧）**，不用每帧改 DOM。

### 4.7 效果层 effects（"能否震动"的答案）

```jsonc
"effects": [
  { "kind": "shake",  "target": "hud",     "amp": 6, "dur": 220, "axis": "xy" },
  { "kind": "rumble", "target": "gamepad", "strong": 0.7, "weak": 0.3, "dur": 180 },
  { "kind": "sound",  "src": "内置:kill",  "volume": 0.6 }
]
```

- `shake`：让**HUD 元素/整层**抖动（纯 CSS transform，不碰游戏画面）。
- `rumble`：**手柄震动**，走浏览器原生 `Gamepad API`（`vibrationActuator.playEffect('dual-rumble', …)`）。⚠️ 这是**浏览器驱动手柄**，不是往游戏里注入输入；与游戏自身的震动会叠加，需在设置里给总开关与幅度上限（详见 §11.1）。
- `sound`：本地音效文件或内置音。

### 4.8 一条完整的「击杀」规则（示例）

```jsonc
{
  "id": "kill-default", "name": "击杀播报", "enabled": true,
  "on": { "type": "kill" }, "when": [], "priority": 30,
  "do": [{
    "kind": "show",
    "element": {
      "anchor": "tc", "offsetX": 0, "offsetY": 96, "makeup": "solo",
      "content": {
        "text": "{weapon}  击杀  +1",
        "icon": { "type": "emoji", "value": "🎯" }, "iconSide": "left", "gap": 10,
        "curve": { "on": true, "radius": 160, "arc": -120 }
      },
      "style": { "fontSize": 30, "color": "#A6D94A" }
    },
    "timeline": {
      "in":   { "type": "scale", "from": 0.8, "dur": 110, "ease": "backOut", "opacityFrom": 0 },
      "hold": { "dur": 1500, "pulse": { "scale": [1, 1.06, 1], "dur": 500, "repeat": 2 } },
      "out":  { "type": "fade", "dur": 240 }
    },
    "effects": [ { "kind": "shake", "amp": 4, "dur": 180 } ]
  }]
}
```

---

## 5. 逐条回答你的问题

| 你的诉求 | 落地方式 | 归属里程碑 |
|---|---|---|
| **自定义击杀显示图标** | `element.content.icon`：emoji / 内联 SVG / 本地图片；可设左右位置与间距 | M1 |
| **UI 什么时候显示 / 不显示** | `on`（触发）+ `when`（条件）= 显隐时机；配合 `makeup`（堆叠/单条/顶替）与 `enabled` 总开关 | M0–M1 |
| **时间的长短** | `timeline.in/hold/out` 三段时长，单位 ms；`hold` 决定停留 | M1 |
| **大小会不会变化** | `timeline.in.from`（入场缩放）+ `hold.pulse`（呼吸/脉冲，可循环） | M1 |
| **能否震动** | `effects.rumble`（手柄震动，Gamepad API）+ `effects.shake`（HUD 抖动） | M2 |
| **字体可不可以弯曲** | `content.curve`：SVG `textPath` 沿圆弧排字，或逐字 `rotate` 近似；可调半径/张角/对齐 | M1 |
| **进入的方式是什么** | 三级入口：① 设置窗口「进阶配置」工作台；② 基础项旁「进阶…」一键升级为规则；③ 直接编辑 `config.json` 的 `rules` 段（与积木等价） | M3–M4 |

---

## 6. 渲染基础设施（"硬朗"的部分）

### 6.1 时间轴编译器
- 输入：`timeline` 描述；输出：**WAAPI 关键帧 + 时长**（或降级为 CSS class）。
- 纯函数、无 DOM 依赖 → 可被 `selftest` 直接 require 做断言（照 `src/fit.js` 的做法）。

### 6.2 弯曲文字
- 首选 **SVG `<textPath>`**：把文字塞进 `<text>` + `<textPath href="#arc">`，圆弧路径由 `radius/arc` 生成。
- 备选 **逐字旋转**：每个字符一个 `<tspan>`/`<span>`，按圆弧切线角度 `rotate`，兼容性更好但断行差。
- 参数：`radius`（半径）、`arc`（张角，负值向下弯）、`align`（居中/起始）。
- ⚠️ 用 SVG 时**字体描边**走 `stroke`，与 emoji 图标混排要注意基线。

### 6.3 图标管线
- `emoji`：直接用字符，零成本。
- `svg`：内联字符串，安全起见**只允许白名单标签/属性**（防脚本）。
- `image`：本地文件路径 → 主进程读成 dataURL 注入（渲染层无 node，不能自己读盘）。缓存，避免重复读。

### 6.4 震动通道与边界
- **HUD 抖动**：`effects.shake`，纯 transform，安全无副作用。
- **手柄震动**：`Gamepad API`，需用户先按一下手柄获得权限（浏览器要求"用户手势"）。**仅在用户显式开启时生效**，并提供幅度上限。
- ⚠️ 不会、也不能震动"游戏画面"或"鼠标"；与游戏原生震动叠加需说明。

### 6.5 并发与排队
- `engine.mode`：`queue`（串行，和现在一致）/ `parallel`（各规则自己播）/ `replace`（同锚点顶替）。
- 沿用现在的"同帧只挑一条最有信息量"思路，但改成**按 `priority` 排序**，可由用户调。

---

## 7. 编辑工作台 UX（"进入方式"的载体）

设置窗口新增「进阶配置」页，三栏布局：

```
┌──────────────┬────────────────────────────┬─────────────────┐
│  规则列表      │        实时预览画布          │   属性面板        │
│  □ 击杀播报    │   （用 mock 数据试播）        │  触发 / 条件 /    │
│  □ 三杀        │   ┌──────────────┐          │  内容 / 样式 /    │
│  □ 阵亡        │   │  {图标} 连杀  │          │  时间轴 / 效果    │
│  ＋ 新建规则   │   └──────────────┘          │  [试播] [保存]    │
└──────────────┴────────────────────────────┴─────────────────┘
```

- **积木式**：属性面板里的每一项都是一个"积木块"，可增删、可拖动排序；条件行是"变量 + 操作符 + 值"的下拉组合，**连线**体现在"触发 → 条件 → 动作"的因果链上。
- **实时预览**：复用现有 `settings:preview` IPC（不落盘）+ mock 快照；点「试播」立即播放一次。
- **一键升级**：基础配置里每个相关项旁加「进阶…」按钮 → 生成一条等价规则并跳到工作台（原字段保留不删，规则优先）。
- **代码模式**：属性面板可切到"代码"，直接编辑该规则的 JSON / 表达式（见 §8）。

---

## 8. 脚本层（面板内写代码）

### 8.1 两种形态
1. **表达式条件**：`"when": [{ "expr": "round_kills >= 3 && weapon_raw.startsWith('weapon_ak')" }]`
2. **脚本动作**：`"do": [{ "kind": "script", "code": "(ctx) => ({ text: ctx.vars.round_kills + ' 杀!' })" }]`

### 8.2 API 面（沙箱内可用）
- `ctx.vars`：只读的变量表（同 `src/vars.js`）。
- `ctx.emit(element)`：产出一个展示单元。
- `ctx.log(...)`：写到渲染层诊断（会被 `main.js` 转发到终端）。
- 数学/字符串/JSON 等标准内建对象可用。

### 8.3 安全边界
- 渲染层本就 `nodeIntegration:false` + `contextIsolation:true`，**没有 require / fs / net**。
- 用 `new Function(...)` 或 iframe-sandbox 执行；**禁止** `fetch / XMLHttpRequest / WebSocket / importScripts`（可在包裹层里屏蔽）。
- 脚本**只产出展示数据**，无权触碰窗口、游戏、文件系统。

### 8.4 与"积木"的关系
两种写法**编译到同一份规则对象**，可互相来回切换：积木是"图形化的 JSON"，代码是"文本化的 JSON"。

---

## 9. 兼容与迁移

### 9.1 基础配置合并方案（本次已着手）
- 现有 `SECTIONS` 全部分区 **原样保留**，只在**导航**上归入「**基础配置**」分组。
- 新增「**进阶配置**」分组作为进阶层入口（当前为规划说明页）。
- **不改任何字段路径**，因此 `config.json` 无需变动，老用户无感。

### 9.2 旧 `events` 段 → 内置规则
- 加载时把现有 `events.{kill,multi,death,assist,mvp}` **自动映射**成 4–5 条内置规则（`on.type` 对应，`text/color/holdMs/fontSize` 填进 `element`）。
- 映射是**幂等**的：已有 `rules.list` 就不再生成，避免重复。
- 保证：**不写规则的用户，观感与现在一模一样**。

### 9.3 schemaVersion 迁移
- `config.json` 加 `schemaVersion`；`config.js` 的 `merge()` 里做迁移函数链。
- 迁移只增不删，失败时**回退到默认值并记录日志**，绝不因迁移让程序起不来。

### 9.4 导入导出
- 现有「导出/导入配置」直接带上 `rules` 段；导出文件仍带 `_app/_version/_exportedAt` 外壳。

---

## 10. 里程碑计划

| 里程碑 | 目标 | 主要产出 | 验收 |
|---|---|---|---|
| **M0 事件引擎** | 把 `renderEvents` 泛化成通用引擎，现有行为不变 | `src/rules/engine.js`（触发器/条件/动作注册表）、`config.js` 的 `rules` 段、旧 `events` → 内置规则迁移 | selftest：迁移等价断言全绿；mock 观感与现在逐项一致 |
| **M1 展示单元** | 内容/样式/时间轴三件套；图标 + 弯曲文字 | `src/rules/element.js`、`src/rules/timeline.js`（纯函数）、图标管线、SVG 弯字 | selftest：时间轴时长/关键帧断言；目视回归（弯字、图标、缩放入场） |
| **M2 效果层** | 抖动 / 手柄震动 / 音效 | `src/rules/effects.js`；设置里的总开关与幅度上限 | 手动验证：手柄震动可开关；HUD 抖动不残留 transform |
| **M3 工作台** | 可视化编辑规则 | 设置窗口「进阶配置」三栏工作台、实时预览、一键升级 | 目视：增删改规则即时预览；保存/放弃正常 |
| **M4 积木 + 代码** | 连线式拼装 + 面板内代码 | 条件构造器（变量+操作符+值）、代码模式、沙箱 | 安全性自查 + 表达式用例断言 |

> 每个里程碑结束都跑：`npm run selftest` + `npm run mock` 目视 + 设置界面截图核对。

---

## 11. 风险与边界

### 11.1 VAC 底线（最高优先级）
- 本项目**不读内存、不注入 DLL、不 hook 渲染、不模拟任何输入**。
- 进阶层全部是**纯视觉叠加**：规则只决定"画什么、什么时候画、怎么动"。
- **手柄震动**是最需要审视的一项：它由**浏览器直接驱动手柄**，不经过游戏、不注入输入；但与游戏原生震动会叠加。计划：**默认关闭 + 幅度上限 + 明确说明**，且**仅在用户显式开启**时生效。
- 若某项实现需要突破底线，**先停下来跟用户确认**，不得擅自实现。

### 11.2 性能
- 时间轴走 WAAPI 合成层；避免每帧重建 DOM（现有 `rosterSig` 的"指纹不变就不重建"思路继续用）。
- 图标与图片缓存；规则命中做过 `dedupeMs` 防抖。

### 11.3 GSI 数据限制
- **没有击杀事件流**：拿不到"谁杀了谁、什么武器、多远"。触发器只能基于 K/D/A 增量与快照差异 —— 因此"击杀图标按武器区分"要**诚实说明**其前提（能在播报时读到当前手持武器，但不是"被击杀者所用的武器"）。
- `allplayers_*`、`phase_countdowns` 等仍只对观察者有效（与 `roster` 面板同一限制）。

### 11.4 复杂度控制
- 进阶层**默认不生成任何规则**（就是现在的观感）；能力随里程碑逐步开放，先少量、稳定后再扩。
- 每条规则**独立失败**，坏一条不影响其它条与基础层。

---

## 12. 验收标准

1. **回归**：`npm run selftest` 全绿（现 194 → 逐里程碑递增）；`node --check` 全部改动文件通过。
2. **等价**：不写规则的老配置导入后，**逐项对照观感不变**（mock 截图比对）。
3. **可用**：工作台能新建/编辑/试播/保存一条规则；一键升级能从基础项生成等价规则。
4. **安全**：脚本层无 node/网络能力；VAC 底线无一处突破。

---

## 13. 进阶 UI 自定义设置清单（v0.2 已落地）

这一节把「进阶 UI 自定义到底需要哪些设置」逐项列清楚，并标注**状态 / 配置路径 / 取值范围**。
全部集中在 `config.json` 的 `adv` 段；设置界面「进阶配置」页读写的就是它。

> 设计取舍：**全局默认 + 每类覆盖**。
> 绝大多数视觉参数（图标侧、字重字距、描边、弯曲、时间轴、效果）放在 `adv.style / adv.timeline / adv.effects`
> 里统一调；`adv.kinds.<类>` 只放「这一类与全局不同」的项 + 该类图标。
> 这样既不重复 5 份参数，又能做到「只有阵亡才抖动、只有连杀才脉冲」。

### 13.1 总开关与引擎

| 设置 | 路径 | 范围 / 选项 | 默认 | 状态 |
|---|---|---|---|---|
| 启用进阶外观 | `adv.enabled` | 开 / 关 | 关 | ✅ 已实现 |
| 队列上限 | `adv.engine.maxQueue` | 1–8 | 3 | ✅ |
| 去重窗口 | `adv.engine.dedupeMs` | 0–2000 ms | 250 | ✅ |

> `adv.enabled=false` 时，渲染层根本不走进阶分支，观感与升级前**逐行一致**，可随时回退。

### 13.2 图标（"自定义击杀显示图标"）

| 设置 | 路径 | 范围 / 选项 | 默认 | 状态 |
|---|---|---|---|---|
| 每类图标 | `adv.kinds.<类>.icon` | emoji 字符串 | 击杀🎯 / 连杀🔥 / 阵亡💀 / 助攻🤝 / MVP⭐ | ✅ 已实现 |
| 默认位置 | `adv.style.iconSide` | 左 / 右 | 左 | ✅ |
| 每类位置覆盖 | `adv.kinds.<类>.iconSide` | 继承 / 左 / 右 | 继承 | ✅ |
| 与文字间距 | `adv.style.iconGap` | 0–40 px | 10 | ✅ |
| 图标大小 | `adv.style.iconSize` | 0.4–2.5 × | 1 | ✅ |
| 自定义图片 / 内联 SVG 图标 | `adv.kinds.<类>.iconImage` | 本地文件 / 内联 SVG | — | ⏳ 规划（M1 补充） |

### 13.3 文字样式

| 设置 | 路径 | 范围 / 选项 | 默认 | 状态 |
|---|---|---|---|---|
| 字重 | `adv.style.weight` | 300–900 | 700 | ✅ |
| 字距 | `adv.style.letterSpacing` | 0–0.4 em | 0.06 | ✅ |
| 斜体 | `adv.style.italic` | 开 / 关 | 关 | ✅ |
| 深色描边 | `adv.style.outlineOn` | 开 / 关 | 关 | ✅ |
| 描边宽度 | `adv.style.outlineWidth` | 1–6 px | 2 | ✅ |
| 描边颜色 | `adv.style.outlineColor` | 颜色 | `#000000` | ✅ |
| 字体族覆盖 | `adv.style.fontFamily` | CSS font-family | 继承 `font.family` | ⏳ 规划 |

### 13.4 文字弯曲（"字体可不可以弯曲"）

| 设置 | 路径 | 范围 / 选项 | 默认 | 状态 |
|---|---|---|---|---|
| 启用弯曲 | `adv.style.curveOn` | 开 / 关 | 关 | ✅ 已实现（SVG `textPath`） |
| 弯曲半径 | `adv.style.curveRadius` | 40–600 px | 160 | ✅ |
| 弯曲张角 | `adv.style.curveArc` | −320–320°（正拱 / 负谷） | −120 | ✅ |
| 每类覆盖 | `adv.kinds.<类>.curveOn/curveRadius/curveArc` | 继承 / 值 | 继承 | ✅（开关可覆盖，半径/张角走全局） |
| 逐字旋转（兼容备选） | `adv.style.curveMode` | textPath / perChar | textPath | ⏳ 规划 |

### 13.5 时间轴：时长与大小变化（"时间的长短""大小会不会变化"）

| 设置 | 路径 | 范围 / 选项 | 默认 | 状态 |
|---|---|---|---|---|
| 入场起始缩放 | `adv.timeline.inScale` | 0.3–1.5 × | 0.85 | ✅ 已实现 |
| 入场时长 | `adv.timeline.inDur` | 0–800 ms | 120 | ✅ |
| 入场缓动 | `adv.timeline.inEase` | backOut / easeOut / easeIn / easeInOut / linear | backOut | ✅ |
| 停留脉冲 | `adv.timeline.pulseOn` | 开 / 关 | 关 | ✅ |
| 脉冲峰值缩放 | `adv.timeline.pulseTo` | 1–1.6 × | 1.08 | ✅ |
| 单次脉冲时长 | `adv.timeline.pulseDur` | 100–2000 ms | 450 | ✅ |
| 脉冲重复次数 | `adv.timeline.pulseRepeat` | 1–20 | 2 | ✅ |
| 停留时长 | `adv.timeline.holdMs` | 200–6000 ms | 1500 | ✅（覆盖 `events.holdMs`） |
| 淡出时长 | `adv.timeline.outDur` | 0–1200 ms | 240 | ✅（覆盖 `events.fadeMs`） |
| 每类覆盖 | `adv.kinds.<类>.pulseOn` | 继承 / 开 / 关 | 继承 | ✅ |

> 实现要点：入场与脉冲用 **Web Animations API** 的**独立 `scale` 属性**播放，
> 不动锚点类用来居中的 `transform`，因此缩放与定位互不干扰。

### 13.6 效果层（"能否震动"）

| 设置 | 路径 | 范围 / 选项 | 默认 | 状态 |
|---|---|---|---|---|
| HUD 抖动 | `adv.effects.shakeOn` | 开 / 关 | 关 | ✅ 已实现 |
| 抖动幅度 | `adv.effects.shakeAmp` | 1–20 px | 4 | ✅ |
| 抖动时长 | `adv.effects.shakeDur` | 60–800 ms | 180 | ✅ |
| 抖动方向 | `adv.effects.shakeAxis` | xy / x / y | xy | ✅ |
| 手柄震动 | `adv.effects.rumbleOn` | 开 / 关 | 关 | ✅ 已实现（Gamepad API） |
| 强马达强度 | `adv.effects.rumbleStrong` | 0–1 | 0.5 | ✅ |
| 弱马达强度 | `adv.effects.rumbleWeak` | 0–1 | 0.25 | ✅ |
| 震动时长 | `adv.effects.rumbleDur` | 40–1000 ms | 160 | ✅ |
| 每类覆盖 | `adv.kinds.<类>.shakeOn / rumbleOn` | 继承 / 开 / 关 | 继承 | ✅ |
| 音效 | `adv.effects.sound*` | 内置 / 本地文件 | — | ⏳ 规划（M2 补充） |

> **VAC 边界**：HUD 抖动 = 纯 `translate` 动画，只动覆盖层自己；
> 手柄震动 = 浏览器原生 `vibrationActuator.playEffect('dual-rumble')`，
> **不经过游戏、不注入任何输入**。需先按一下手柄完成「用户手势」授权；无手柄时静默跳过。

### 13.7 触发时机（"UI 什么时候显示 / 不显示"）

| 设置 | 路径 | 说明 | 状态 |
|---|---|---|---|
| 播报总开关 | `events.enabled` | 基础段，保持不变 | ✅ 已有 |
| 每类开关 | `events.<类>.on` | 基础段，保持不变 | ✅ 已有 |
| 每类进阶开关 | `adv.kinds.<类>.on` | 该类是否用进阶外观 | ✅ 已实现 |
| 任意触发器（kill / round_start / bomb_planted / low_health …） | `rules[].on` | 规则引擎 | ⏳ 规划（M0） |
| 条件组（武器 / 血量 / 连杀阈值 / 表达式） | `rules[].when` | 规则引擎 | ⏳ 规划（M0/M4） |
| 编排（堆叠 / 单条 / 顶替） | `element.makeup` | 规则引擎 | ⏳ 规划（M1） |

> GSI 没有击杀事件流（拿不到"谁杀了谁、用什么武器"），现有触发器只能基于 K/D/A 增量与快照差异。
> 这一点在 §11.3 已说明，规划中的规则引擎同样受此限制。

### 13.8 进入方式

| 方式 | 位置 | 状态 |
|---|---|---|
| 设置窗口 → 侧栏「进阶配置」 | `src/settings/settings.js` 的 `buildAdvancedSection` | ✅ 已实现 |
| 直接编辑 `config.json` 的 `adv` 段 | 与上面**完全等价** | ✅ 已实现 |
| 基础项旁「进阶…」一键升级 | 未做 | ⏳ 规划（M3） |
| 积木 / 连线工作台 | 未做 | ⏳ 规划（M3） |
| 面板内写代码（脚本层） | 未做 | ⏳ 规划（M4，本次明确不做） |

### 13.9 落地文件一览（v0.2）

| 文件 | 作用 |
|---|---|
| `src/advstyle.js` | 纯计算：`resolveKind`（默认+覆盖合并）、`curvePath` / `buildCurveSVG`（弯字）、`easingOf` |
| `src/config.js` | `DEFAULTS.adv` + `merge()` 对 `adv.kinds` 做健壮性归一化 |
| `src/renderer/hud.js` | `playNextEvent` 分支；`buildAdvEvent / runAdvEvent / shakeHud / rumbleGamepad` |
| `src/renderer/hud.css` | `.ev-adv / .ev-ico / .ev-curve / .ev-outline` |
| `src/renderer/index.html` | 引入 `../advstyle.js` |
| `src/settings/settings.js` | 「进阶配置」编辑器 + `triControl` 三态控件 |
| `tools/selftest.mjs` | `[10] 进阶外观` 断言（26 条） |
| `src/main.js` | 开发用 `--shot-event=<kind>` 强制播报（配合 `--shot-json` 截图核对） |

---

## 14. 每元素进阶 + 自定义图标 + 画图（v0.3 已落地）

### 14.1 核心变化：从「全局」到「每元素」

v0.2 的 `adv` 是「**全局默认 + 播报每类覆盖**」，只服务于击杀播报。
v0.3 把它扩展成「**全局默认 + 任意元素覆盖**」，覆盖面扩到整个 HUD。

**元素 id 约定**（`src/advstyle.js` 的 `ELEMENTS` + 动态补两个前缀）：

| 前缀 | 含义 | 来源 | 进阶能力 |
|---|---|---|---|
| `mod.<模块>` | 6 个内置 HUD 栏位 | `ELEMENTS` 静态清单 | 文字样式（字重/字距/斜体/描边） |
| `ev.<播报>` | kill / multi / death / assist / mvp | `ELEMENTS` 静态清单 | 图标 + 样式 + 弯曲 + 时间轴 + 抖动 + 震动（全套） |
| `custom.<i>` | 第 i 个自定义文本元素 | `config.custom` 动态 | 图标 + 文字样式 |
| `shape.<i>` | 第 i 个形状（画图）元素 | `config.shapes` 动态 | 文字样式 |

**数据**：`config.adv.elements[<id>] = { ...与全局同名的键... }`，写哪个键就覆盖哪个，没写就继承全局。
`advstyle.resolveStyle(adv, id)` 负责合并；`resolveKind(adv, kind)` 仍可用（等价于 `resolveStyle(adv, 'ev.'+kind)`），
并继续读旧的 `adv.kinds[kind]`，所以**老配置不用改**。

**渲染层落地**（`src/renderer/hud.js`）：
- 播报：`playNextEvent` → `resolveStyle(advCfg, 'ev.'+kind)`。
- 自定义元素 / 形状 / 模块：**只有该元素显式写了覆盖**才应用进阶样式，
  避免「打开总开关后观感被悄悄改掉」。

### 14.2 自定义图标库（`config.icons`）

三种来源，统一成一个条目：

```jsonc
{ "id": "ic…", "name": "准星框", "kind": "draw",  "w": 24, "h": 24, "items": [ /* 图元 */ ] }
{ "id": "ic…", "name": "骷髅",   "kind": "text",  "text": "💀" }
{ "id": "ic…", "name": "萌图",   "kind": "image", "data": "data:image/png;base64,…" }
```

- **emoji / 文字**：直接存字符。
- **粘贴 / 上传 SVG**：`parseSVG()` 解析成白名单图元后**重新生成 SVG**，原字符串从不进入 DOM。
- **上传图片**：走 `FileReader.readAsDataURL`，存 dataURL；渲染前过 `safeDataURL()`（只放行 `data:image/*;base64`）。
- **手绘**：见 14.3，同样产出图元。

引用方式：在「进阶 · 每元素」里把图标选成某个库条目（写 `iconRef`），或直接内联 emoji（写 `icon`）。
渲染优先级：`iconRef` > `icon`。

### 14.3 画图（矢量编辑器）→ 图标 / HUD 形状元素

设置界面「进阶 · 画图」页：矩形 / 椭圆 / 直线 / 自由笔 / 文字，带描边色、填充色、线宽、画布尺寸、撤销、清空。
产物有两个去处：

1. **存为图标** → 追加进 `config.icons`（`kind:'draw'`）。
2. **添加为 HUD 形状元素** → 追加进 `config.shapes`，直接画在覆盖层上。

形状元素数据：

```jsonc
{
  "id": "sh…", "name": "信息条", "enabled": true,
  "anchor": "tc", "offsetX": 0, "offsetY": 250, "scale": 1, "rotate": 0,
  "opacity": 1, "glow": 0.35, "glowColor": "#4C8DFF",
  "w": 340, "h": 56,
  "items": [
    { "type": "rect", "x": 0, "y": 0, "w": 340, "h": 56, "rx": 10,
      "fill": "rgba(14,19,26,0.55)", "stroke": "#4C8DFF", "strokeWidth": 2 },
    { "type": "text", "x": 170, "y": 37, "text": "{money} | {weapon}",
      "fontSize": 24, "fill": "#FFFFFF", "anchor": "middle" }
  ]
}
```

- 锚点 / 位移 / 缩放 / 旋转 / 不透明度 / 辉光：与自定义文本元素同一套语言，逐帧只刷新文字。
- **文本图元支持 `{变量}` 实时插值**（变量表同 `src/vars.js`），所以形状能做「活的」信息条。
- 逐个刷新而非整块重建：只有含变量的 `<text>` 会更新，其余图形保持不动。

### 14.4 图元模型与安全（"硬朗"的关键）

所有自定义图形（手绘 / 粘贴 SVG / 上传 SVG）都归一到同一份**图元**表示：

| type | 字段 |
|---|---|
| `rect` | x y w h rx fill stroke strokeWidth opacity |
| `ellipse` | cx cy rx ry fill stroke strokeWidth |
| `line` | x1 y1 x2 y2 stroke strokeWidth strokeLinecap |
| `polyline` / `polygon` | points[[x,y]…] fill stroke strokeWidth |
| `path` | d（只保留 `MmLlHhVvCcSsQqTtAaZz` 与数字，且必须以 moveto 开头） |
| `text` | x y text fontSize weight fill anchor baseline italic |

**安全策略（为什么敢让用户粘贴任意 SVG）**：

1. `parseSVG()` 先剔除 `script / defs / foreignObject / style / metadata / title / desc / image / use / animate / set` 与注释。
2. 只认白名单标签，逐属性取值；颜色过 `sanitizeColor()`（纯字母命名色 / `#hex` / `rgb()/hsl()`，其余丢弃），
   `path.d` 过 `sanitizePath()`。
3. `primitivesToSVG()` / `shapeToSVG()` **由程序自己重建 SVG 字符串**，文本过 XML 转义。
4. 渲染层拿到的永远是「我们生成的、只含数字与白名单颜色」的标记 ——
   外部字符串自始至终没有进入 DOM 的机会。`on*` 事件、`javascript:`、`url(…)` 全部在解析阶段就被丢弃。

### 14.5 进入方式（已实现）

| 方式 | 位置 |
|---|---|
| 全局默认 | 设置 → 进阶配置 → **进阶 · 全局默认** |
| 每元素覆盖 | 设置 → 进阶配置 → **进阶 · 每元素** |
| 图标库 | 设置 → 进阶配置 → **进阶 · 图标库** |
| 画图 | 设置 → 进阶配置 → **进阶 · 画图** |
| 直接改 `config.json` | `adv.elements` / `icons` / `shapes`，与界面**完全等价** |

### 14.6 落地文件一览（v0.3 增量）

| 文件 | 作用 |
|---|---|
| `src/advstyle.js` | `ELEMENTS` / `resolveStyle` / `parseSVG` / `primitivesToSVG` / `shapeToSVG` / `iconSVG` / 颜色与路径白名单 |
| `src/config.js` | `icons` / `shapes` / `adv.elements` + `merge()` 归一化 |
| `src/renderer/hud.js` | `buildShapes` / `renderShapes` / `applyAnchor` / `makeIconNode` / 模块与自定义元素的每元素样式 |
| `src/renderer/hud.css` | `.shape-layer` / `.shape-item` / `.ci-adv` / 图标 SVG·图片样式 |
| `src/renderer/index.html` | 新增 `#shapeLayer` |
| `src/settings/settings.js` | 三个新分页 + `ovNum / ovSelect / ovColor / ovIcon / elementCard / shapeCard` + 画图编辑器 |
| `src/settings/settings.css` | 覆盖控件 / 图标网格 / 工具栏 / 画布样式 |
| `tools/selftest.mjs` | `[11]` 每元素进阶 + 图元引擎 + 自定义图标（25 条） |

### 14.7 仍未实现（诚实说明）

- **任意触发器 / 条件的积木规则**（`rules[]`，M0）：击杀之外的显示时机（三杀以上、特定武器、低血…）
  仍未做；目前进阶外观还是挂在既有播报与既有元素上。
- **音效**（M2）。
- **面板内写代码的脚本层**（M4）：用户已明确本次不做。

---

## 15. 实时预览（v0.4 已落地）

**要解决的问题**：进阶外观的参数（图标、字重、描边、弯曲、入场缩放、脉冲、抖动、震动、
时间轴长短）**全都是"动起来才看得见"的**，静态看设置页的滑杆根本判断不了。
以前只有两条路：① 开着游戏打一场；② `npm run mock` 再盯着屏幕。两条都别扭。

**做法**：给设置界面配一个**"小显示器"** —— 一个独立的预览窗口。

### 15.1 为什么是"第二个 HUD 窗口"而不是内嵌缩略图

| 方案 | 为什么没用 / 用了 |
|---|---|
| 设置页里嵌 iframe 缩略图 | 要额外造一层 `postMessage` 桥，窗口一小（几十像素）根本看不清字重与描边；缩略图 ≠ 实况 |
| 用截图生成一张静态预览 | 看不到动画（弯曲、脉冲、抖动、时间轴），而动画恰恰是最需要调的部分 |
| **独立预览窗口（采用）** | 同一份 `renderer/index.html`，`?preview=1` 区分 —— **同一套渲染代码**，所见即所得；可拖拽缩放，窗口本身就是一台可换尺寸的显示器；关掉即走，完全独立 |

关键点：**预览与真实覆盖层共用渲染代码**，所以不存在"预览里好好的，进游戏变了"。

### 15.2 数据从哪来（与真实对局严格隔离）

```
独立模拟数据源：  new GsiHub(cfg)  ←  mock.buildPayload(t)  ←  setInterval 10Hz
                        │
                        └─ hud:snapshot ──→ 预览窗口
真实数据源：      hub（真实 GSI POST / mock）
                        │
                        └─ hud:snapshot ──→ 覆盖层窗口
```

两个 hub 各走各的，**预览里的金钱/血量/击杀怎么跳都不会影响对局**；
模拟数据也不会被当成真实 GSI 数据混进覆盖层。

### 15.3 工具条（预览窗口顶部）

| 按钮 | 做什么 | 走哪条路 |
|---|---|---|
| ⏸ 暂停 / ▶ 继续 | 冻结画面（模拟数据仍在跑） | 渲染层本地开关，不打扰主进程 |
| ↺ 重播 | 模拟时间线归零，从头演一遍 | `preview:cmd('restart')` → 主进程重建 hub + 模拟源 |
| 跳到：冻结时间 / 回合进行 / 已下包 / 回合结算 | 直接跳到第 5 / 40 / 70 / 125 秒 | `preview:cmd('seek', t)` |
| 试播报：击杀 / 连杀 / 阵亡 / 助攻 / MVP | **立刻**播一条，用来调外观 | 渲染层直接压进播报队列，**和真实播报同一条渲染路径** |

> ⚠️ 时间线重置后必须通知渲染层清掉"播报基线"（`hud:preview-reset`），
> 否则新一轮的击杀会被当成旧事件吞掉（自检里有对应断言）。

### 15.4 预览窗口的尺寸语义

真实覆盖层是**铺满整块屏幕**的，所以「位置对不对」只在**比例一致**时才有意义。
因此预览窗口：

- 默认**按当前显示器的宽高比**开（宽取 960 或用显示器宽度，高度按比例算 + 工具条 34px）；
- **可拖拽、可缩放** —— 拉大就等于换了一台更大的显示器，HUD 按新尺寸重新映射；
- 顶部工具条占 34px，HUD 画布整体下移这 34px（`applyBounds` 里一行判断）。

### 15.5 三条进入方式（完全等价）

1. 设置窗口标题栏「**预览**」按钮（开着时变成「预览中」并高亮）；
2. 托盘菜单「**实时预览（模拟数据）…** / 关闭实时预览」；
3. 命令行 `--preview`。

### 15.6 落地文件一览（v0.4 增量）

| 文件 | 改动 |
|---|---|
| `src/renderer/index.html` | 新增 `#previewBar` 工具条（**默认 `display:none`**，真实覆盖层永远看不到） |
| `src/renderer/hud.css` | `.preview-bar / .pv-btn / .pv-sep / .pv-lab / .pv-note`，只在 `body.preview-mode` 下生效 |
| `src/renderer/hud.js` | `PREVIEW` 判定（`?preview=1`）、`BRIDGE` 兜底、`previewAwareBounds`、工具条事件、`firePreviewEvent`、`onPreviewReset` |
| `src/preload.js` | 新增 `previewCmd(cmd,arg)` / `onPreviewReset(cb)` |
| `src/main.js` | `previewWin` 生命周期、`startPrevFeed/stopPrevFeed`（独立 hub + mock）、`applyConfig` 同步推送、`settings:toggle-preview`、`preview:cmd`、托盘入口、`--preview`、`--shot-preview=`（开发截图） |
| `src/settings/index.html` / `.css` | 标题栏「预览」按钮 + 样式 |
| `src/settings/preload.js` | `togglePreview / getPreviewState / onPreviewState` |
| `src/settings/settings.js` | 按钮绑定、状态同步（窗口被自己关掉时按钮也跟着变）、开预览时把**未保存**的当前配置一并推过去 |
| `tools/selftest.mjs` | `[12]` 实时预览（20 条：时间线预设 + 「只影响预览」的静态约束） |

### 15.7 边界（诚实说明）

- 预览里 **`allplayers` 一直有数据**（mock 特意一直给），所以名单面板能在预览里看到；
  真实对局里它只在**死亡观战**时才有 —— 这是 Valve 的限制，不是预览的锅。
- 预览是**独立窗口**，不跟随设置窗口的开关；关掉设置窗口它还在（托盘里也能关）。
- 仍未实现：在预览窗口里**直接改参数**（目前改参数在设置窗口，预览只是"看"）。

---

## 附：术语表

| 术语 | 含义 |
|---|---|
| 触发器 trigger | "什么时候"——快照里发生的一件事（击杀、下包…） |
| 条件 when | "什么前提下"——一组变量判断 |
| 动作 do | "做什么"——显示单元 / 效果 |
| 展示单元 element | 一次可见的产出（文字 + 图标 + 样式 + 时间轴） |
| 效果 effect | 抖动 / 震动 / 音效等附加反馈 |
| 积木 / 连线 | 把上面这些用图形化控件拼装 |
| 脚本层 | 用受限 JS 表达同样的规则 |
