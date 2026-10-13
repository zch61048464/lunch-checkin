// 生成 PWA 图标（纯 Node，无额外依赖）：绿色圆角底 + 白色餐盘 + 简化二维码角标
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size, roundedCorner) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const S = 4; // 超采样抗锯齿
  const green = [31, 138, 76];
  const white = [255, 255, 255];
  const r = size * 0.5;
  const inRound = (x, y) => {
    if (!roundedCorner) return true;
    const rad = size * 0.22;
    const cx = Math.min(Math.max(x, rad), size - rad);
    const cy = Math.min(Math.max(y, rad), size - rad);
    return (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad;
  };
  const colorAt = (x, y) => {
    if (!inRound(x, y)) return null;
    const d = Math.hypot(x - r, y - r);
    if (d < size * 0.3 && d > size * 0.22) return white; // 餐盘外圈
    if (d <= size * 0.14) return white; // 盘心
    // 盘心里的小方块（二维码意象）
    const q = size * 0.045;
    const dx = Math.abs(x - r), dy = Math.abs(y - r);
    if (dx < q * 1.4 && dy < q * 1.4 && !(dx < q * 0.5 && dy < q * 0.5)) return green;
    return green;
  };
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      let R = 0, G = 0, B = 0, A = 0;
      for (let sy = 0; sy < S; sy++)
        for (let sx = 0; sx < S; sx++) {
          const c = colorAt(x + (sx + 0.5) / S, y + (sy + 0.5) / S);
          if (c) { R += c[0]; G += c[1]; B += c[2]; A++; }
        }
      const o = row + 1 + x * 4;
      const n = S * S;
      raw[o] = A ? Math.round(R / A) : 0;
      raw[o + 1] = A ? Math.round(G / A) : 0;
      raw[o + 2] = A ? Math.round(B / A) : 0;
      raw[o + 3] = Math.round((A / n) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public', { recursive: true });
writeFileSync('public/icon-192.png', png(192, true));
writeFileSync('public/icon-512.png', png(512, false)); // maskable 需要满铺
writeFileSync('public/apple-touch-icon.png', png(180, false)); // iOS 自己裁圆角
writeFileSync('public/favicon.png', png(64, true));
console.log('icons generated');
