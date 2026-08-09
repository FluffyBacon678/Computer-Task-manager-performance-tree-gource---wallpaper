export const TAU = Math.PI * 2;

export function clamp(value, min = 0, max = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return min;
  return Math.min(max, Math.max(min, Number(value)));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function formatPercent(value) {
  const percent = clamp(value) * 100;
  if (percent > 0 && percent < 1) return `${percent.toFixed(1)}%`;
  return `${Math.round(percent)}%`;
}

export function safeName(value, fallback = 'process') {
  if (typeof value !== 'string') return fallback;
  return value.replace(/[^\w .:+-]/g, '').trim().slice(0, 32) || fallback;
}

