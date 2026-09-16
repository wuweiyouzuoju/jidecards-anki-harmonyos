// SPDX-License-Identifier: AGPL-3.0-or-later
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

// 预先生成 RGBA 光雾，运行时不计算渐变或滤镜；最外圈强制完全透明。
const size = 256;
const directory = new URL('../entry/src/main/resources/rawfile/themes/', import.meta.url);
mkdirSync(directory, { recursive: true });
const clouds = [
  [[.37, .34, .41, [85, 94, 246]], [.59, .57, .33, [154, 87, 230]]],
  [[.65, .35, .38, [32, 185, 228]], [.37, .58, .36, [50, 204, 178]]],
  [[.50, .65, .40, [234, 105, 188]], [.65, .37, .30, [249, 174, 112]]],
];
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(name, data) {
  const content = Buffer.concat([Buffer.from(name), data]);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(content));
  return Buffer.concat([length, content, crc]);
}
clouds.forEach((lobes, index) => {
  const pixels = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let alpha = 0; let rgb = [0, 0, 0];
    for (const [cx, cy, radius, color] of lobes) {
      const distance = Math.hypot(x / (size - 1) - cx, y / (size - 1) - cy) / radius;
      const weight = distance >= 1 ? 0 : .85 * (1 - distance * distance) ** 3;
      const combined = weight + alpha * (1 - weight);
      if (combined > 0) rgb = rgb.map((value, channel) => (color[channel] * weight + value * alpha * (1 - weight)) / combined);
      alpha = combined;
    }
    // 透明边缘至少 8 像素，缩放采样也不会带出矩形轮廓。
    const edge = Math.min(x, y, size - 1 - x, size - 1 - y);
    alpha *= Math.min(1, Math.max(0, (edge - 8) / 16));
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    pixels[offset] = Math.round(rgb[0]); pixels[offset + 1] = Math.round(rgb[1]); pixels[offset + 2] = Math.round(rgb[2]);
    pixels[offset + 3] = Math.round(alpha * 255);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  writeFileSync(new URL(`iridescent_cloud_${index}.png`, directory), Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0)),
  ]));
});
