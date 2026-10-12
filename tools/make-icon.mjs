/**
 * 生成图标，纯 Node 实现，不需要任何第三方库。
 *
 *   assets/tray.png    32x32   托盘图标
 *   assets/icon.png    512x512 备用（Linux / 网页用）
 *   build/icon.ico     多尺寸   Windows 打包用
 *
 * 图形含义：屏幕外框 + 顶部比分条 + 底部左右两条 HUD 条。
 * 坐标都按 32 格的设计稿写，再按目标尺寸等比放大。
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- PNG ----------
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** 按 32 格设计稿画一张 size×size 的 RGBA 图 */
function render(size) {
  const k = size / 32;
  const S = (v) => Math.max(1, Math.round(v * k));
  const raw = Buffer.alloc(size * size * 4, 0);

  const px = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a;
  };
  const rect = (x, y, w, h, r, g, b, a = 255) => {
    const X = S(x), Y = S(y), W = S(w), H = S(h);
    for (let dy = 0; dy < H; dy++) for (let dx = 0; dx < W; dx++) px(X + dx, Y + dy, r, g, b, a);
  };

  // 外框（深色底 + 亮蓝描边，中间掏空）
  rect(2, 2, 28, 28, 16, 18, 22, 235);
  rect(3, 3, 26, 26, 16, 18, 22, 0);
  const edge = S(28);
  for (let i = 0; i < edge; i++) {
    const t = S(2) + i;
    px(t, S(2), 120, 170, 220, 255);
    px(t, S(2) + edge - 1, 120, 170, 220, 255);
    px(S(2), t, 120, 170, 220, 255);
    px(S(2) + edge - 1, t, 120, 170, 220, 255);
  }
  // 顶部中央比分条 / 底部左侧血量条 / 底部右侧弹药条
  rect(11, 7, 10, 3, 232, 236, 240, 255);
  rect(6, 22, 9, 3, 232, 236, 240, 255);
  rect(17, 22, 9, 3, 232, 236, 240, 255);

  return raw;
}

function toPng(size) {
  const raw = render(size);

  // 每行前面加一个 filter byte
  const scanlines = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    scanlines[y * (size * 4 + 1)] = 0;
    raw.copy(scanlines, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- ICO ----------
// 多尺寸 ICO，每张图直接嵌 PNG（Vista 以后都认）。
function toIco(sizes) {
  const images = sizes.map((s) => ({ size: s, png: toPng(s) }));

  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0);   // reserved
  dir.writeUInt16LE(1, 2);   // type: 1 = icon
  dir.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, png }) => {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;   // 256 要写 0
    e[1] = size >= 256 ? 0 : size;
    e[2] = 0;                        // 调色板数
    e[3] = 0;                        // reserved
    e.writeUInt16LE(1, 4);           // color planes
    e.writeUInt16LE(32, 6);          // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
  });

  return Buffer.concat([dir, ...entries, ...images.map((i) => i.png)]);
}

function write(rel, buf) {
  const out = join(ROOT, rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, buf);
  console.log(`已生成 ${rel}  ${buf.length} 字节`);
}

write(join('assets', 'tray.png'), toPng(32));
write(join('assets', 'icon.png'), toPng(512));
write(join('build', 'icon.ico'), toIco([16, 32, 48, 256]));
