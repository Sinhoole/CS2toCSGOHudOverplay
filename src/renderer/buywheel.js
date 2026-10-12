'use strict';

/**
 * 两级购买轮盘。
 * 一级：5 个分类扇区（装备/手枪/冲锋枪/主武器/道具），点击 → 主进程让 CS2
 *       exec 该阵营 × 分类的 cfg（cfg 会重新绑定购买键）。
 * 二级：该分类勾选的武器（最多 5 件），每件显示绑定的购买键；按真键由游戏
 *       自己购买，点格子则由主进程注入 buy 命令。
 * 右键：从二级退回一级。Esc：关轮盘恢复穿透。
 */

const $ = (id) => document.getElementById(id);

let bw = null;            // cfg.buywheel
let bounds = null;
let catalog = null;       // { categories: [{id,label}], weapons: [...] }
let money = 0;
let team = 'CT';          // 从 GSI 快照自动识别，点中心徽章可手动切换
let level = 1;            // 1=分类 2=武器
let cat = null;           // 二级当前分类 id

const CAT_BY_ID = () => new Map((catalog ? catalog.categories : []).map((c) => [c.id, c.label]));
const WEAPON_BY_ID = () => new Map((catalog ? catalog.weapons : []).map((w) => [w.id, w]));

window.oph.onConfig((payload) => {
  bw = payload.cfg;
  bounds = payload.bounds;
  catalog = payload.catalog || { categories: [], weapons: [] };
  build();
});

window.oph.onSnapshot((s) => {
  if (s && typeof s.money === 'number') money = s.money;
  // 阵营以 GSI 为准；换了阵营（上半场结束）自动退回一级
  if (s && (s.team === 'CT' || s.team === 'T') && s.team !== team) {
    team = s.team;
    level = 1;
    cat = null;
    build();
  }
  updateCenter();
});

window.oph.onResult((r) => {
  if (!r) return;
  if (r.type === 'activate') {
    if (r.ok) {
      level = 2;
      cat = r.cat;
      build();
      hint(`已激活 ${teamLabel(team)}·${catLabel(r.cat)}，按对应键购买`);
    } else {
      hint(r.reason === 'no_cs2' ? '没找到 CS2 · exec 指令已复制' : '激活失败 · 看控制台');
    }
    return;
  }
  // 武器下单反馈
  if (r.ok) hint('已下单 ✓');
  else if (r.reason === 'no_cs2') hint('没找到 CS2 · 指令已复制');
  else hint('下单失败 · 看控制台');
});

// ---------- 渲染 ----------

function build() {
  const wheel = $('wheel');
  wheel.innerHTML = '';
  wheel.appendChild(centerEl());

  const items = (level === 1) ? level1Items() : level2Items();
  const cx = bounds.width / 2;
  const cy = bounds.height / 2;
  const R = Math.min(bounds.width, bounds.height) * 0.30;
  const n = Math.max(items.length, 1);

  items.forEach((it, i) => {
    const ang = (-90 + i * (360 / n)) * Math.PI / 180;
    const el = document.createElement('div');
    el.className = 'slot' + (level === 1 ? ' cat' : '');
    el.style.left = (cx + R * Math.cos(ang)) + 'px';
    el.style.top = (cy + R * Math.sin(ang)) + 'px';

    const lbl = document.createElement('span');
    lbl.className = 'lbl';
    lbl.textContent = it.label;
    el.appendChild(lbl);

    if (it.key) {
      const key = document.createElement('span');
      key.className = 'key';
      key.textContent = it.key;
      el.appendChild(key);
    }
    if (it.sub) {
      const sub = document.createElement('span');
      sub.className = 'sub';
      sub.textContent = it.sub;
      el.appendChild(sub);
    }

    el.addEventListener('click', () => {
      el.classList.add('fired');
      setTimeout(() => el.classList.remove('fired'), 220);
      if (level === 1) {
        hint('激活中…');
        window.oph.activate(team, it.id);
      } else {
        window.oph.exec({ id: it.id, label: it.label, command: it.command, key: it.rawKey });
      }
    });

    wheel.appendChild(el);
  });

  updateCenter();
}

/** 一级：5 个分类 */
function level1Items() {
  const labels = CAT_BY_ID();
  return (catalog ? catalog.categories : []).map((c) => ({
    id: c.id,
    label: labels.get(c.id) || c.id,
    sub: `${countWeapons(team, c.id)} 件`,
  }));
}

/** 二级：当前分类勾选的武器（最多 5 件），带绑定键 */
function level2Items() {
  if (!bw || !bw.teams || !bw.teams[team] || !cat) return [];
  const wmap = WEAPON_BY_ID();
  const keys = Array.isArray(bw.keys) ? bw.keys : [];
  return (bw.teams[team][cat] || []).slice(0, 5).map((id, i) => {
    const w = wmap.get(id);
    return {
      id,
      label: w ? w.label : id,
      command: w ? w.buy : `buy ${id}`,
      key: keys[i] ? normKey(keys[i]) : '',
      rawKey: keys[i] || '',
    };
  });
}

function countWeapons(t, c) {
  if (!bw || !bw.teams || !bw.teams[t]) return 0;
  return Math.min((bw.teams[t][c] || []).length, 5);
}

function centerEl() {
  const c = $('center');
  c.querySelector('.c-label').textContent = (bw && bw.centerLabel) || 'BUY';
  return c;
}

function updateCenter() {
  const teamEl = document.querySelector('.c-team');
  if (teamEl) {
    teamEl.textContent = teamLabel(team);
    teamEl.classList.toggle('t', team === 'T');
  }
  const moneyEl = document.querySelector('.c-money');
  if (!bw || !moneyEl) return;
  if (bw.showMoney) {
    moneyEl.style.display = '';
    moneyEl.textContent = '$' + Number(money || 0).toLocaleString('en-US');
  } else {
    moneyEl.style.display = 'none';
  }
}

function hint(text) {
  const el = document.querySelector('.c-hint');
  if (el) el.textContent = text;
}

function teamLabel(t) { return t === 'T' ? 'T 阵营' : 'CT 阵营'; }
function catLabel(id) { return CAT_BY_ID().get(id) || id; }
function normKey(k) {
  const s = String(k || '').trim();
  if (!s) return '';
  return /^f\d{1,2}$/i.test(s) ? s.toUpperCase() : s.toLowerCase();
}

// ---------- 交互 ----------

// 点中心阵营徽章：手动切换阵营（GSI 拿不到队伍时用，比如热身早期）
$('center').addEventListener('click', (e) => {
  if (e.target.closest('.c-team')) {
    team = team === 'CT' ? 'T' : 'CT';
    level = 1;
    cat = null;
    build();
  }
});

// 右键：二级 → 一级
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (level === 2) {
    level = 1;
    cat = null;
    build();
    hint('点分类激活对应 cfg');
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && bw && bw.closeOnEsc) {
    e.preventDefault();
    window.oph.requestClose();
  }
});
