'use strict';

const fs = require('fs');
const path = require('path');
const GAME_CMDS = require('./gamecmds');
const ADV = require('./advstyle');

/**
 * 全部可调参数。改 config.json 即可，不要改这里。
 */
const DEFAULTS = {
  // ---- 通信 ----
  port: 58880,          // 必须与 cfg/gamestate_integration_overplayhud.cfg 里的 uri 一致
  host: '127.0.0.1',    // 只监听回环，不对外暴露
  token: '',            // 与 cfg 里 auth.token 一致；留空 = 不校验

  // ---- 窗口 ----
  displayIndex: 0,      // 第几块显示器（0 = 主显示器）
  // 设计基准分辨率 = HUD 的「虚拟屏幕」。CS:GO 时代想要 4:3 拉伸的怀旧感，
  // 就把这里设成 1280x960（或其它 4:3），再配合 fit: 'fill' 铺满全屏。
  designWidth: 1920,
  designHeight: 1080,
  // 设计分辨率 → 真实屏幕的映射方式：
  //   'fill'    非等比拉伸铺满（4:3 拉伸的经典观感：1280x960 + 这个 = CS:GO 味道）
  //   'stretch' 等比缩放到「刚好填满」（Cover）：不裁剪，但会超出设计边界
  //   'contain' 等比缩放到「刚好完整」（Contain，默认）：可能留黑边，不裁剪
  fit: 'contain',
  scale: 1.0,           // 额外缩放倍率（在 fit 之上再乘）
  safezone: { x: 0.95, y: 0.95 },   // 建议与 CS2 的 safezonex / safezoney 保持一致
  enableInteraction: false,          // true = 鼠标可点到 HUD（调试用，会挡住游戏操作）
  openSettingsOnStart: true,         // 启动后自动打开设置窗口；false = 只留托盘图标

  // ---- 布局 ----
  layout: {
    offsetX: 0,                   // 全局水平微调（px，按 1920 基准）
    offsetY: 0,                   // 全局垂直微调
  },

  // ---- 字体 ----
  font: {
    preset: 'default',            // 内置字体预设 id（见 src/advstyle.js 的 FONTS）
    family: '',                   // 自定义 CSS font-family；**非空时盖过 preset**
  },

  // ---- 文本自定义 ----
  // 只放「想覆盖默认值」的项，留空就用内置默认（见 src/weapon-names.js）。
  text: {
    weaponNames: {},              // { "weapon_ak47": "阿卡47" } 键是 GSI 的英文内部名
    grenadeChars: {               // 投掷物单字，键是道具 id
      flame: '火', smoke: '烟', he: '雷', flash: '闪', decoy: '诱',
    },
    grenadeSep: '・',             // 投掷物之间的分隔符
    labels: { alive: '存活', ct: 'CT', t: 'T' },
  },

  // ---- 自定义文本元素 ----
  // text 里可以用 {变量} 插值，可用变量见 README。增删改都在设置界面里做。
  custom: [],

  // ---- 自定义图标库 ----
  // 用户自己攒的图标，供播报 / 自定义元素 / 形状元素引用（按 id）。
  //   kind:'text'  → text 是一段文字或 emoji
  //   kind:'draw'  → w/h + items[] 是白名单图元（手绘或由粘贴的 SVG 解析而来）
  //   kind:'image' → data 是 data:image/...;base64 图片
  // ⚠️ 图元只保留几何 / 颜色等安全字段，渲染时由程序自己重建 SVG，
  //    所以粘贴任何 SVG 都不可能带进脚本。
  icons: [],

  // ---- 画图生成的 HUD 元素（形状元素）----
  // 每一项是一块用 SVG 画的图形，锚点 / 位移 / 缩放 / 旋转 / 辉光和自定义文本元素同一套语言。
  //   w / h  = 画布尺寸（viewBox）；items[] = 图元数组；文本图元里可用 {变量} 插值。
  shapes: [],

  // ---- 每块 HUD 独立设置 ----
  // offsetX/offsetY：相对默认锚点的像素位移（正数向右 / 向下）
  // scaleX/scaleY：缩放倍率，两个值可以不一样 = 非等比拉伸
  // rotate：旋转角度（度），正数顺时针；配合非等比缩放能做出伪 3D 的倾斜感
  // opacity：整个模块的不透明度（1 = 不透明），和底栏浓度是两回事
  // glow：辉光强度 0~1，0 = 关闭；glowColor 是辉光颜色
  modules: {
    scoreboard: {
      offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1,
      rotate: 0, opacity: 1, glow: 0, glowColor: '#FFFFFF',
      ctColor: '#1F4A78', tColor: '#C8A63C', centerColor: '#1C1E22',
    },
    money: {
      offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1,
      rotate: 0, opacity: 1, glow: 0, glowColor: '#FFFFFF',
      barColor: '#0E131A', barAlpha: 0.5,
    },
    vitals: {
      offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1,
      rotate: 0, opacity: 1, glow: 0, glowColor: '#FFFFFF',
      barColor: '#0E131A', barAlpha: 0.5,
    },
    ammo: {
      offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1,
      rotate: 0, opacity: 1, glow: 0, glowColor: '#FFFFFF',
      barColor: '#0E131A', barAlpha: 0.5,
    },
    weaponList: {
      offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1,
      rotate: 0, opacity: 1, glow: 0, glowColor: '#FFFFFF',
      textColor: '#FFFFFF', dimColor: 'rgba(242, 245, 247, 0.6)',
      // SVG 图标态开关（与上面「文字态」各自独立，可并存）
      svgMode: false,
      // SVG 图标态专属配置：纯色剪影 + 选中放大辉光
      svg: {
        offsetX: -210, offsetY: 0, scaleX: 1, scaleY: 1, rotate: 0, opacity: 1,
        color: '#3b82f6',          // 剪影底色（纯蓝）
        activeColor: '#FFFFFF',    // 选中时剪影转白
        glow: 6, glowColor: '#3b82f6',   // 选中辉光半径 / 颜色
        idleHideMs: 3000,          // 预留键：开局显示毫秒后隐藏（本期未实装行为）
        // 各槽位强制图标（留空 = 按武器名自动映射）
        icons: { 1: '', 2: '', 3: '', 4: '', 5: '' },
        // 每槽位独立辉光颜色（留空 = 回落到上面的全局 glowColor）
        glowColors: { 1: '', 2: '', 3: '', 4: '', 5: '' },
        // 刀型对照表：刀内部名 → 指定刀 SVG（留空 = 用同名刀形）
        knives: {},
      },
    },
    roster: {
      offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1,
      rotate: 0, opacity: 1, glow: 0, glowColor: '#FFFFFF',
      barColor: '#0E131A', barAlpha: 0.5,
      textColor: '#FFFFFF',        // 队友名字
      dimColor: 'rgba(242, 245, 247, 0.55)',  // 对手名字
      aliveColor: '#F2F5F7',       // 存活标记
      deadColor: '#7A828B',        // 阵亡标记 / 阵亡行
      selfColor: '#E8C46A',        // 自己那一行
      accentColor: '#4C8DFF',      // 分组标题条
    },
  },

  // ---- 队友 / 对手名单面板 ----
  // 数据来自 GSI 的 allplayers，⚠️ 只有死亡观战 / GOTV / 回放时才有，
  // 存活期间游戏不下发，面板会自动隐藏（不去编造数据）。
  roster: {
    scope: 'team',        // team = 自己队 / enemy = 对手 / all = 双方分两组
    rowsPerTeam: 5,       // 每个分组最多显示几人
    sortBy: 'score',      // score = 按个人得分 / kills = 按击杀 / slot = 按游戏内顺位
    hideDead: false,      // 只列还活着的（观战想快速看剩几个人时开）
    showHealth: true,
    showArmor: false,
    showWeapon: true,
    showKda: true,
    showMoney: false,
    showSelf: true,       // 是否把自己也列进去
  },

  // ---- 击杀 / 死亡播报 ----
  // 文字里同样支持 {变量} 插值，变量表见 README 与设置界面。
  events: {
    enabled: true,
    anchor: 'tc',         // 九个锚点，和自定义文本元素同一套
    offsetX: 0, offsetY: 96,
    fontSize: 30,
    holdMs: 1500,         // 停留时长
    fadeMs: 240,
    kill:   { on: true,  text: '击杀  +1',        color: '#A6D94A' },
    multi:  { on: true,  text: '{round_kills} 连杀', color: '#F0B23A' },
    death:  { on: true,  text: '阵 亡',           color: '#E8231C' },
    assist: { on: false, text: '助攻  +1',        color: '#8FA0B4' },
    mvp:    { on: false, text: 'MVP',             color: '#E8C46A' },
  },

  // ---- 进阶配置：播报的「进阶外观」----
  // 基础段 events 只管文字 / 颜色 / 位置 / 停留时长；这里管更细的视觉：
  // 图标、文字样式、弯曲、入场缩放与脉冲、HUD 抖动、手柄震动。
  // ⚠️ adv.enabled = false 时，一切与现在完全一致（进阶路径根本不执行）。
  // ⚠️ 全部是纯视觉叠加：不读内存、不注入、**不模拟任何输入**。
  //    手柄震动走浏览器原生 Gamepad API（vibrationActuator），不经过游戏。
  adv: {
    enabled: false,             // 进阶外观总开关
    engine: {
      maxQueue: 3,              // 播报队列上限，超出丢弃最早的
      dedupeMs: 250,            // 同类事件去重窗口（ms）
    },
    // 全局默认外观。每类播报可在 kinds[kind] 里覆盖其中若干项。
    style: {
      iconOn: true,             // 全局：默认是否显示图标（关掉 = 所有元素都不显示）
      iconSide: 'left',         // 图标位置：left / right
      iconGap: 10,              // 图标与文字间距（px）
      iconSize: 1,              // 图标相对字号的大小倍率
      weight: 700,              // 字重
      letterSpacing: 0.06,      // 字距（em）
      italic: false,            // 斜体
      outlineOn: false,         // 深色描边
      outlineWidth: 2,          // 描边宽度（px）
      outlineColor: '#000000',
      curveOn: false,           // 文字弯曲（SVG textPath）
      curveRadius: 160,         // 弯曲半径（px）
      curveArc: -120,           // 弯曲张角（度）：正 = 拱形，负 = 谷形
    },
    // 时间轴：入场 → 停留 → 淡出；「大小会不会变化」由 inScale + pulse 决定
    timeline: {
      inScale: 0.85,            // 入场起始缩放（1 = 不缩放）
      inDur: 120,               // 入场时长（ms）
      inEase: 'backOut',        // 入场缓动：backOut / easeOut / easeIn / easeInOut / linear
      pulseOn: false,           // 停留期间脉冲（呼吸式大小变化）
      pulseTo: 1.08,            // 脉冲峰值缩放
      pulseDur: 450,            // 单次脉冲时长（ms）
      pulseRepeat: 2,           // 脉冲重复次数
      holdMs: 1500,             // 停留时长（ms，覆盖基础段的 events.holdMs）
      outDur: 240,              // 淡出时长（ms，覆盖基础段的 events.fadeMs）
    },
    // 效果层
    effects: {
      shakeOn: false,           // HUD 抖动（纯 transform，不碰游戏画面）
      shakeAmp: 4,              // 抖动幅度（px）
      shakeDur: 180,            // 抖动时长（ms）
      shakeAxis: 'xy',          // xy / x / y
      rumbleOn: false,          // 手柄震动（Gamepad API，需先按一下手柄授权）
      rumbleStrong: 0.5,        // 强马达强度 0~1
      rumbleWeak: 0.25,         // 弱马达强度 0~1
      rumbleDur: 160,           // 震动时长（ms）
    },
    // 每类播报：on 决定该类是否用进阶外观；icon 是该类的图标（emoji）。
    // 其余键（iconSide / curveOn / pulseOn / shakeOn / rumbleOn …）写上 = 覆盖全局默认。
    // ⚠️ 已由下面的 elements 取代（elements 优先，这里只做向后兼容读取）。
    kinds: {
      kill:   { on: true,  icon: '🎯' },
      multi:  { on: true,  icon: '🔥', pulseOn: true },
      death:  { on: true,  icon: '💀', shakeOn: true },
      assist: { on: false, icon: '🤝' },
      mvp:    { on: false, icon: '⭐', pulseOn: true },
    },
    // 每一个「元素」可以有自己的进阶外观（覆盖上面的全局默认）。
    // 元素 id 见 src/advstyle.js 的 ELEMENTS：
    //   mod.<模块>   顶部比分 / 金钱 / 血量护甲 / 弹药 / 武器栏 / 名单面板
    //   ev.<播报>    kill / multi / death / assist / mvp
    //   custom.<i>   第 i 个自定义文本元素
    //   shape.<i>    第 i 个形状（画图）元素
    // 可覆盖的键与全局一致：icon / iconRef / iconSide / iconGap / iconSize /
    // weight / letterSpacing / italic / outlineOn / outlineWidth / outlineColor /
    // curveOn / curveRadius / curveArc / inScale / inDur / inEase /
    // pulseOn / pulseTo / pulseDur / pulseRepeat / holdMs / outDur /
    // shakeOn / shakeAmp / shakeDur / shakeAxis / rumbleOn / rumble* …（只写想改的）
    elements: {},
  },

  // ---- 购买轮盘（两级）----
  // ⚠️ VAC 红线例外：本项目底线是「不模拟任何输入」，但用户已明确批准此功能
  // 在点选格子时向 CS2 注入按键 / 控制台指令（路线 B）。仅限购买时间、仅本地玩家自用。
  //
  // 工作方式：一级轮盘 = 5 个分类扇区（装备/手枪/冲锋枪/主武器/道具），点击后向控制台
  // 注入 `exec oph_bw_<阵营>_<分类>` 激活对应的 cfg —— 那份 cfg 先 unbind 掉购买键，再
  // 把同一组键 bind 成该分类武器的 buy 命令（键在分类间复用）。二级轮盘里按真键购买
  // 由游戏自己完成；点格子下单才走注入（src/buyexec.js），失败退化为复制指令到剪贴板。
  // cfg 生成逻辑在 src/buycfg.js，保存设置时自动写入 CS2 的 cfg 目录。
  buywheel: {
    enabled: false,           // 总开关（用户已不需要购买轮盘，默认关闭；代码保留，需要时改回 true）
    openOnBuyTime: true,      // 进入购买时间（freezetime / warmup）自动弹出轮盘
    closeOnEsc: true,         // 按 Esc 关闭轮盘并恢复鼠标穿透
    showMoney: true,          // 轮盘中心显示当前资金
    centerLabel: 'BUY',       // 轮盘中心主文字
    execMode: 'auto',         // 点格子下单：auto=有 key 发 key 否则打控制台 / key / console
    consoleKey: '`',          // 打开控制台用的键（默认反引号，和 CS2 一致）
    unbindOnClose: true,      // 关轮盘时 exec oph_bw_clear.cfg，把购买键全部解绑
    cfgDir: '',               // cfg 输出目录；空 = 自动探测 CS2 安装目录
    // 5 个购买键：所有阵营 × 分类复用同一组键（激活分类 cfg 时会重新绑定）
    keys: ['F1', 'F2', 'F3', 'F4', 'F5'],
    // 每个阵营 × 分类勾选的武器 id（最多 5 个，目录见 src/buycfg.js 的 CATALOG）
    teams: {
      CT: {
        gear:   ['vest', 'vesthelm', 'defuser', 'taser'],
        pistol: ['hkp2000', 'usp_silencer', 'p250', 'fiveseven', 'deagle'],
        smg:    ['mp9', 'mp7', 'mp5sd', 'ump45', 'p90'],
        rifle:  ['m4a1', 'm4a1_silencer', 'aug', 'ssg08', 'awp'],
        nade:   ['flashbang', 'smokegrenade', 'hegrenade', 'incgrenade', 'decoy'],
      },
      T: {
        gear:   ['vest', 'vesthelm', 'taser'],
        pistol: ['glock', 'p250', 'tec9', 'elite', 'deagle'],
        smg:    ['mac10', 'mp7', 'mp5sd', 'ump45', 'p90'],
        rifle:  ['ak47', 'sg556', 'ssg08', 'awp', 'g3sg1'],
        nade:   ['flashbang', 'smokegrenade', 'hegrenade', 'molotov', 'decoy'],
      },
    },
  },

  // ---- 游戏侧配套命令（关原生 HUD / 保留雷达与队友标识 / Alt 开关 / 曳光弹）----
  // 命令目录与 cfg 生成逻辑在 src/gamecmds.js，那里的 CATALOG 是唯一权威。
  // 这里的 enabled 键必须与它一一对应（tools/selftest.mjs 会校验）。
  // autoexec=true 时，程序会在 CS2 的 autoexec.cfg 里维护一段带标记的区块，
  // 让命令每次启动自动生效；关掉时只摘掉那段，不动用户 autoexec 里的其它行。
  gamecmds: {
    autoexec: false,
    enabled: GAME_CMDS.defaultEnabled(),
  },

  // ---- HUD 视觉 ----
  hud: {
    barAlpha: 0.50,            // 底部半透明横条的不透明度，设 0 可完全关掉底栏
    healthRedThreshold: 50,    // 血量低于等于此值时进度条填充由白转红
    lowHealthThreshold: 25,    // 血量低于等于此值时触发红色发光预警 + 底栏左侧红渐变
    moneyGainColor: '#A6D94A',   // 击杀奖励 / 收入的文字颜色
    moneySpendColor: '#E8231C',  // 购买支出的文字颜色
    moneyDeltaHoldMs: 1800,      // 变动提示停留时长（规范要求 1.5~2 秒）
    aliveCountMode: 'label',
    factionMark: true,           // 顶部阵营色块里的底纹（CT 翅膀 / T 交叉弯刀）     // 'label' 只显示 CT/T；'auto' 有真实人数时（GOTV/观察者）自动显示人数
  },

  // ---- 组件开关 ----
  show: {
    scoreBar: true,
    timer: true,
    health: true,
    armor: true,
    money: true,
    ammo: true,
    roundKills: true,
    weaponList: true,    // 右侧 1-5 号武器栏（纯文字方案）
    weaponTextOutline: false,  // 武器栏文字是否带深色描边（默认不要）
    defuseKit: true,
    // 队友 / 对手名单面板：数据源 allplayers 被 Valve 限定为「仅观察者有效」，
    // 实训证明存活时拿不到、死亡观战也常常拿不到 → 该功能已取消（默认关闭）。
    // 代码与诊断全部保留，日后要重新优化时把这里改回 true 即可。
    // ⚠️ 不影响比分栏的存活人数 —— 那是 gsi.js 另行计算的，与此开关无关。
    roster: false,
  },

  // ---- 计时器估算（GSI 对本地玩家不提供 phase_countdowns，只能本地推算）----
  timer: {
    roundSeconds: 115,   // MR12 回合时长
    freezeSeconds: 15,   // 冻结时间
    bombSeconds: 40,     // C4 引爆时间
    hideWhenNoMatch: true,
  },

  staleTimeoutMs: 40000, // 超过这个时间没收到数据就认为不在比赛中，隐藏 HUD。
                         // ⚠️ 必须明显大于 cfg 里的 heartbeat（心跳），否则游戏里站着不动
                         // 时 GSI 不发包，会被误判成「退出对局」而把 HUD 藏掉
};

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, patch) {
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  for (const [k, v] of Object.entries(patch || {})) {
    out[k] = isObject(v) && isObject(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out;
}

// 配置目录。开发时是项目根目录；打包后由 main.js 改成用户数据目录
// —— app.asar 是只读的，配置文件必须写到别处去。
let configDir = path.join(__dirname, '..');

function setConfigDir(dir) {
  if (dir) configDir = dir;
  return configDir;
}

function file() {
  return path.join(configDir, 'config.json');
}

/** 把用户配置补全成完整配置（缺的字段用默认值填） */
function merge(user) {
  const cfg = deepMerge(DEFAULTS, isObject(user) ? user : {});
  // 迁移：旧版购买轮盘用的是单层 slots 数组，两级方案已弃用，清掉防止脏数据残留
  if (cfg.buywheel && Array.isArray(cfg.buywheel.slots)) delete cfg.buywheel.slots;
  // 购买键固定 5 个，用户配置里长度不对时补齐 / 截断
  if (cfg.buywheel) {
    const keys = Array.isArray(cfg.buywheel.keys) ? cfg.buywheel.keys.map((k) => String(k || '')) : [];
    while (keys.length < 5) keys.push('');
    cfg.buywheel.keys = keys.slice(0, 5);
  }
  // 字体：preset 必须是 advstyle 里真实存在的预设（写坏就回落默认），family 一律转成字符串。
  // 不校验的话，设置界面的下拉会因为匹配不上而显示成空白，看着像坏了。
  if (!isObject(cfg.font)) cfg.font = deepMerge(DEFAULTS.font, {});
  if (typeof cfg.font.family !== 'string') cfg.font.family = '';
  if (!ADV.FONTS.some((f) => f.id === cfg.font.preset)) cfg.font.preset = DEFAULTS.font.preset;

  // 进阶配置：kinds 必须是对象且 5 类齐全（用户手改 config.json 时可能写坏）
  if (!isObject(cfg.adv)) cfg.adv = deepMerge(DEFAULTS.adv, {});
  else {
    if (!isObject(cfg.adv.kinds)) cfg.adv.kinds = deepMerge(DEFAULTS.adv.kinds, {});
    if (!isObject(cfg.adv.elements)) cfg.adv.elements = {};
  }
  // 自定义图标库：必须是对象数组，且 id / kind 合法；脏数据直接丢掉（不影响启动）
  cfg.icons = (Array.isArray(cfg.icons) ? cfg.icons : [])
    .filter((it) => isObject(it) && typeof it.id === 'string' && it.id
      && (it.kind === 'text' || it.kind === 'draw' || it.kind === 'image'));
  // 形状元素：数组元素 deepMerge 不会补默认值，这里兜一遍必需字段
  cfg.shapes = (Array.isArray(cfg.shapes) ? cfg.shapes : [])
    .filter((it) => isObject(it))
    .map((it) => Object.assign({
      id: '', name: '形状', enabled: true,
      anchor: 'tl', offsetX: 0, offsetY: 0, scale: 1, rotate: 0,
      opacity: 1, glow: 0, glowColor: '#FFFFFF',
      w: 120, h: 60, items: [],
    }, it));
  // 游戏侧命令：enabled 只保留目录里真实存在的 id（手改 config.json 写坏的键丢掉），
  // 值只认显式 false 为关、其余一律当开；autoexec 只认严格的 true。
  if (!isObject(cfg.gamecmds)) cfg.gamecmds = {};
  cfg.gamecmds.enabled = GAME_CMDS.resolveEnabled(cfg.gamecmds.enabled);
  cfg.gamecmds.autoexec = cfg.gamecmds.autoexec === true;
  return cfg;
}

function load() {
  let user = {};
  try {
    user = JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch (e) {
    // 没有 config.json 就用默认值，首次运行会自动生成一份
  }
  const cfg = merge(user);
  try {
    if (!fs.existsSync(file())) {
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(file(), JSON.stringify(cfg, null, 2), 'utf8');
    }
  } catch (e) { /* 只读目录也不影响运行 */ }
  return cfg;
}

/**
 * 写入配置文件。会先补全成完整配置再落盘，
 * 这样设置界面只传它改过的那部分也能得到一份完整的 config.json。
 */
function save(user) {
  const cfg = merge(user);
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  return cfg;
}

/** 恢复出厂设置（把默认值写进 config.json） */
function reset() {
  return save(DEFAULTS);
}

/** 只补全不落盘，设置界面的实时预览用 */
function preview(user) {
  return merge(user);
}

module.exports = {
  load, save, reset, preview, merge, deepMerge, DEFAULTS,
  file, setConfigDir,
  // 保留 FILE 这个写法，但它现在是动态的（打包后路径会变）
  get FILE() { return file(); },
};
