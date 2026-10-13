[English](README.en.md) | [日本語](README.ja.md) | **简体中文**

<div align="center">

# OverplayHUD

把 CS2 的 HUD 还原为 CS:GO 时期的样式

基于 Valve 官方 Game State Integration 的全屏透明覆盖层

![version](https://img.shields.io/badge/version-2.2.0-CC0000?style=flat-square)
![platform](https://img.shields.io/badge/platform-Windows-111111?style=flat-square)
![license](https://img.shields.io/badge/license-MIT-111111?style=flat-square)

![覆盖层界面](docs/hud.png)

</div>

---

## 项目简介

CS2 更替了 CS:GO 时期的 HUD 布局。本项目在游戏画面之上叠加一层全透明、可穿透鼠标的覆盖层，
依照 CS:GO 的布局与视觉风格，重新绘制比分面板、金钱、生命值与护甲、弹药、连杀提示及武器栏。

数据来源为 Valve 官方提供的 GSI（Game State Integration）接口。游戏进程主动将 JSON 数据
POST 至本机端口，程序仅负责接收与渲染。全过程不读取游戏内存、不注入 DLL、不挂钩渲染管线、
不模拟任何输入。

> 不建议在 Faceit、ESEA、5E、B5 等第三方反作弊平台使用。此类平台的检测策略较 VAC 更为激进，
> 覆盖层本身亦可能被判定为违规。

## 主要功能

**HUD 模块**

| 模块 | 内容 |
|---|---|
| 比分面板 | 屏幕顶部居中，含阵营徽记、存活标识、比分与回合计时 |
| 金钱提示 | 当前余额；购买支出与击杀奖励以附加行显示 |
| 生命值与护甲 | 底部横栏，生命值按数值分为四个状态等级，护甲与头盔分别标识 |
| 弹药与连杀 | 右下角，含连杀骷髅徽章与弹匣 / 备弹计数 |
| 武器栏 | 屏幕右侧竖排，依次为主武器、副武器、近战武器、投掷物与特殊装备 |

**播报与自定义**

- 击杀、连杀、阵亡、助攻、MVP 五类事件触发文字播报，同一帧内仅播报一条
- 支持任意数量的自定义文本元素，可插入变量（生命值、金钱、战绩、回合等）
- 内置图形工具，可绘制矩形、椭圆、直线、自由曲线与文字，保存为 HUD 元素或图标

**外观与配置**

- 内置 12 套字体预设，亦可指定任意系统字体
- 各元素的位移、缩放、旋转、不透明度、辉光与描边均可独立调整
- 进阶外观支持入场、脉冲、抖动动画，弯曲文字与手柄震动反馈
- 全部配置项提供中文图形界面，修改即时预览

**其他功能**

- 自动探测 CS2 安装目录，一键写入 GSI 配置与原生 HUD 关闭命令
- 配置方案支持导出、导入与分享

## 下载与安装

安装包与便携版均发布于本仓库的 **Releases** 页面：

| 文件 | 说明 |
|---|---|
| `OverplayHUD-x.y.z-setup.exe` | 安装包，创建开始菜单与桌面快捷方式（推荐） |
| `OverplayHUD-x.y.z-portable.exe` | 单文件便携版，无需安装 |

安装步骤：

1. 运行程序，系统托盘出现 OverplayHUD 图标
2. 右键托盘图标，选择「安装 GSI 配置到 CS2」
3. 完全退出并重新启动 CS2（重连服务器无效）
4. 在 CS2 视频设置中将显示模式设为「全屏窗口」，否则覆盖层会被游戏画面遮挡
5. 右键托盘图标，选择「设置」进行外观调整

## 从源码运行

适用于需要修改代码或自行构建的场景。运行环境要求 Node.js 18 及以上版本与 Windows。

### 1. 安装 GSI 配置

```bash
npm run install-cfg
```

程序自动定位 CS2 目录，将 `gamestate_integration_overplayhud.cfg` 复制到
`game/csgo/cfg` 与 `game/core/cfg` 两个目录。CS2 存在两份 cfg 目录，仅放置一份可能无法生效。
未能自动定位时，可手动指定游戏路径：

```bash
node tools/install-cfg.mjs --game "D:\SteamLibrary\steamapps\common\Counter-Strike Global Offensive"
```

完成后必须完全重启 CS2。

### 2. 验证数据连接

```bash
npm run verify
```

进入任意对局后，终端每秒输出一行状态数据。若 20 秒内无输出，程序将打印排查清单。

### 3. 启动覆盖层

```bash
npm start        # 正常使用
npm run mock     # 不启动游戏，以模拟数据预览效果
```

## 关闭 CS2 原生 HUD

设置界面「原生 HUD 命令」页可勾选并一键写入 CS2，亦可手动执行：

```cfg
cl_draw_only_deathnotices 1          // 仅保留准星与击杀提示
cl_drawhud_force_radar 1             // 保留雷达
cl_drawhud_force_teamid_overhead 1   // 保留队友头顶标识
bind alt toggle cl_drawhud_force_deathnotices 1 0
r_drawtracers_firstperson false      // 关闭第一人称曳光弹
```

雷达与击杀提示由游戏原生界面渲染。GSI 不向本地玩家提供雷达坐标数据，故这两项保留原生显示。

## 设置界面

程序启动后自动打开设置界面，亦可通过托盘菜单或 `npm run settings` 打开。

导航分为四组：总览、基础配置、进阶配置、工具与帮助。外观参数以滑杆与色板方式提供，
修改后立即作用于覆盖层，确认无误后点击保存。未保存的修改在关闭窗口时丢弃。

设置界面内置「实时预览」功能，可另开独立窗口，以模拟数据展示进阶外观效果，
不影响当前对局，亦不产生任何游戏输入。

## 使用限制

GSI 接口存在如下固有限制，无法通过程序规避：

| 项目 | 说明 |
|---|---|
| 雷达与击杀提示 | 保留游戏原生渲染 |
| 存活人数 | 本地玩家视角无此数据，默认显示 CT / T 标识；观察者视角可显示实际人数 |
| 队友与对手信息 | 仅在死亡观战、GOTV 或回放时提供 |
| 击杀事件流 | 无此数据，播报依据两次数据快照的击杀 / 死亡 / 助攻增量推断 |
| 回合计时 | 由本地时钟推算，误差约 ±0.5 秒；观察者视角改用官方数据，无误差 |

以上限制源于 Valve 对 GSI 接口的开放范围，与本程序的实现方式无关。

## 安全与兼容性

- 数据仅来源于官方 GSI，仅监听 `127.0.0.1`，不对外暴露端口
- 不读取游戏内存，不注入 DLL，不挂钩渲染管线，不模拟任何输入
- 显示内容限于普通玩家可见的信息范围
- CS2 显示模式需设置为「全屏窗口」，独占全屏下覆盖层会被遮挡

## 文档

| 文件 | 内容 |
|---|---|
| **README.md** | 项目简介、安装与使用说明 |
| [TUTORIAL.md](TUTORIAL.md) | 图文教程：设置界面各页面说明、注意事项与实现方法 |
| [DESIGN.md](DESIGN.md) | 开发文档：模块设计细节、配置文件字段参考、打包流程与故障排查 |
| [DEV-PLAN.md](DEV-PLAN.md) | 开发计划 |
| [ADVANCED-CONFIG-PLAN.md](ADVANCED-CONFIG-PLAN.md) | 进阶外观配置规划 |

## 许可

[MIT](LICENSE)

本项目与 Valve Corporation 无关联。Counter-Strike、CS:GO、CS2 为 Valve 的商标。
本项目仅通过 Valve 官方开放的 GSI 接口读取数据，并在自有窗口中重新绘制界面。
