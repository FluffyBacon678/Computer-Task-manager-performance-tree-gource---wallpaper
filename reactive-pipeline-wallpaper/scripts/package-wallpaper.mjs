import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';

const root = process.cwd();
const dist = join(root, 'dist');

function copyFile(name) {
  const source = join(root, name);
  if (existsSync(source)) cpSync(source, join(dist, name), { recursive: true });
}

function copyDirFiltered(source, target) {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source)) {
    if (entry === 'node_modules' || entry === 'logs' || entry.endsWith('.log')) continue;
    const from = join(source, entry);
    const to = join(target, entry);
    if (statSync(from).isDirectory()) copyDirFiltered(from, to);
    else cpSync(from, to);
  }
}

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function makePreviewPng(file) {
  const width = 512;
  const height = 288;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  const core = { x: width * 0.5, y: height * 0.52 };
  const wells = [
    { x: core.x - 150, y: core.y + 18, color: [0, 200, 255], radius: 56 },
    { x: core.x - 54, y: core.y - 86, color: [176, 76, 255], radius: 60 },
    { x: core.x + 142, y: core.y - 38, color: [255, 159, 28], radius: 64 },
    { x: core.x + 54, y: core.y + 88, color: [255, 209, 102], radius: 54 },
    { x: core.x + 184, y: core.y + 64, color: [6, 214, 160], radius: 46 },
    { x: core.x, y: core.y, color: [125, 211, 252], radius: 42 }
  ];

  function segmentDistance(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
  }

  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const i = row + 1 + x * 4;
      const vignette = Math.max(0, 1 - Math.hypot((x - width / 2) / width, (y - height / 2) / height) * 1.7);
      let r = 4 + vignette * 10;
      let g = 8 + vignette * 16;
      let b = 18 + vignette * 28;

      const field = Math.max(0, 1 - Math.hypot((x - core.x) / (width * 0.44), (y - core.y) / (height * 0.36)));
      r += field * 5;
      g += field * 14;
      b += field * 24;

      wells.forEach((well, index) => {
        if (index < wells.length - 1) {
          const line = segmentDistance(x, y, core.x, core.y, well.x, well.y);
          if (line < 2.8) {
            const lk = (1 - line / 2.8) * 0.24;
            r += well.color[0] * lk;
            g += well.color[1] * lk;
            b += well.color[2] * lk;
          }
        }

        const d = Math.hypot(x - well.x, y - well.y);
        if (d < well.radius) {
          const k = (1 - d / well.radius) ** 1.75;
          r += well.color[0] * k * 0.58;
          g += well.color[1] * k * 0.58;
          b += well.color[2] * k * 0.58;
        }
      });

      raw[i] = Math.min(255, Math.round(r));
      raw[i + 1] = Math.min(255, Math.round(g));
      raw[i + 2] = Math.min(255, Math.round(b));
      raw[i + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
  writeFileSync(file, png);
}

mkdirSync(dist, { recursive: true });
copyFile('project.json');
copyFile('README.md');
makePreviewPng(join(dist, 'preview.png'));

const helperSource = join(root, 'telemetry-helper');
if (existsSync(helperSource)) {
  const helperTarget = join(dist, 'telemetry-helper');
  if (existsSync(helperTarget)) rmSync(helperTarget, { recursive: true, force: true });
  copyDirFiltered(helperSource, helperTarget);
}

console.log('Packaged Reactive Pipeline wallpaper');
