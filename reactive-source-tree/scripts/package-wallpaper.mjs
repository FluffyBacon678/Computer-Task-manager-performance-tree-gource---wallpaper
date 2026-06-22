import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { deflateSync } from 'node:zlib';

const root = process.cwd();
const dist = join(root, 'dist');
const previewPath = join(root, 'preview.png');
const distPreviewPath = join(dist, 'preview.png');

function displayPath(path) {
  return relative(root, path).replaceAll('\\', '/') || '.';
}

const width = 1280;
const height = 720;
const pixels = Buffer.alloc(width * height * 4);

const nodes = [
  { x: 640, y: 360, r: 23, color: [238, 252, 255] },
  { x: 640, y: 156, r: 13, color: [0, 200, 255] },
  { x: 850, y: 262, r: 13, color: [176, 76, 255] },
  { x: 860, y: 486, r: 13, color: [255, 159, 28] },
  { x: 638, y: 582, r: 13, color: [255, 209, 102] },
  { x: 424, y: 486, r: 13, color: [6, 214, 160] },
  { x: 424, y: 244, r: 13, color: [255, 79, 216] }
];

const links = nodes.slice(1).map((node) => [nodes[0], node]);

function clamp(value, min = 0, max = 255) {
  return Math.max(min, Math.min(max, value));
}

function blendPixel(x, y, color, alpha) {
  if (x < 0 || y < 0 || x >= width || y >= height || alpha <= 0) return;
  const index = (Math.floor(y) * width + Math.floor(x)) * 4;
  const inv = 1 - alpha;
  pixels[index] = clamp(pixels[index] * inv + color[0] * alpha);
  pixels[index + 1] = clamp(pixels[index + 1] * inv + color[1] * alpha);
  pixels[index + 2] = clamp(pixels[index + 2] * inv + color[2] * alpha);
  pixels[index + 3] = 255;
}

function drawCircle(cx, cy, radius, color, alpha) {
  const minX = Math.floor(cx - radius);
  const maxX = Math.ceil(cx + radius);
  const minY = Math.floor(cy - radius);
  const maxY = Math.ceil(cy + radius);
  const radiusSq = radius * radius;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq > radiusSq) continue;
      const edge = 1 - Math.sqrt(distanceSq) / radius;
      blendPixel(x, y, color, alpha * Math.min(1, edge * 2.8));
    }
  }
}

function drawLine(ax, ay, bx, by, color, widthPx, alpha) {
  const steps = Math.ceil(Math.hypot(bx - ax, by - ay));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    drawCircle(x, y, widthPx, color, alpha);
  }
}

function drawBackground() {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const dx = (x - width / 2) / width;
      const dy = (y - height / 2) / height;
      const radial = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 2.2);
      pixels[index] = 3 + radial * 7;
      pixels[index + 1] = 5 + radial * 16;
      pixels[index + 2] = 12 + radial * 34;
      pixels[index + 3] = 255;
    }
  }
}

function drawPreview() {
  drawBackground();

  for (const [source, target] of links) {
    drawLine(source.x, source.y, target.x, target.y, target.color, 11, 0.055);
    drawLine(source.x, source.y, target.x, target.y, target.color, 3, 0.36);
  }

  for (const node of nodes) {
    drawCircle(node.x, node.y, node.r * 4.6, node.color, 0.055);
    drawCircle(node.x, node.y, node.r * 2.4, node.color, 0.12);
    drawCircle(node.x, node.y, node.r, node.color, 0.92);

    for (let i = 0; i < 8; i += 1) {
      const angle = (Math.PI * 2 * i) / 8 + node.x * 0.001;
      const distance = node.r * (3.8 + (i % 3));
      drawCircle(
        node.x + Math.cos(angle) * distance,
        node.y + Math.sin(angle) * distance,
        2.4,
        node.color,
        0.48
      );
    }
  }

  for (let i = 0; i < 320; i += 1) {
    const hash = createHash('sha1').update(String(i)).digest();
    const x = (hash[0] / 255) * width;
    const y = (hash[1] / 255) * height;
    const color = i % 3 === 0 ? [0, 200, 255] : i % 3 === 1 ? [255, 79, 216] : [6, 214, 160];
    drawCircle(x, y, 0.7 + (hash[2] / 255) * 1.4, color, 0.16 + (hash[3] / 255) * 0.18);
  }
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng() {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rawOffset = y * (width * 4 + 1);
    raw[rawOffset] = 0;
    pixels.copy(raw, rawOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

drawPreview();
const png = encodePng();
writeFileSync(previewPath, png);

mkdirSync(dist, { recursive: true });
copyFileSync(join(root, 'project.json'), join(dist, 'project.json'));
copyFileSync(previewPath, distPreviewPath);
copyFileSync(join(root, 'README.md'), join(dist, 'README.md'));

const helperSource = join(root, 'telemetry-helper');
const helperTarget = join(dist, 'telemetry-helper');
rmSync(helperTarget, { recursive: true, force: true });
cpSync(helperSource, helperTarget, {
  recursive: true,
  filter: (source) => {
    const normalized = source.replaceAll('\\', '/');
    return !normalized.includes('/node_modules') && !normalized.endsWith('.log');
  }
});

console.log(`Generated ${displayPath(previewPath)}`);
console.log(`Copied metadata and preview to ${displayPath(distPreviewPath)}`);
console.log(`Copied telemetry helper to ${displayPath(helperTarget)}`);
