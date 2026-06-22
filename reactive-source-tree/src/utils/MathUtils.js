export const TAU = Math.PI * 2;

export function clamp(value, min = 0, max = 1) {
  if (Number.isNaN(value) || value === null || value === undefined) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function mapRange(value, inMin, inMax, outMin, outMax, shouldClamp = true) {
  const t = (value - inMin) / (inMax - inMin || 1);
  const normalized = shouldClamp ? clamp(t) : t;
  return lerp(outMin, outMax, normalized);
}

export function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

export function randomSign() {
  return Math.random() < 0.5 ? -1 : 1;
}

export function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function normalizeVector(dx, dy) {
  const length = Math.sqrt(dx * dx + dy * dy) || 1;
  return { x: dx / length, y: dy / length, length };
}

export function hexToNumber(hex) {
  if (typeof hex === 'number') return hex;
  return Number.parseInt(hex.replace('#', ''), 16);
}

export function numberToRgb(color) {
  const value = hexToNumber(color);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
}

export function rgbToNumber({ r, g, b }) {
  return ((clamp(Math.round(r), 0, 255) & 255) << 16) |
    ((clamp(Math.round(g), 0, 255) & 255) << 8) |
    (clamp(Math.round(b), 0, 255) & 255);
}

export function mixColor(a, b, t) {
  const ca = numberToRgb(a);
  const cb = numberToRgb(b);
  return rgbToNumber({
    r: lerp(ca.r, cb.r, t),
    g: lerp(ca.g, cb.g, t),
    b: lerp(ca.b, cb.b, t)
  });
}

export function weightedPick(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item.value;
  }
  return items[items.length - 1].value;
}
