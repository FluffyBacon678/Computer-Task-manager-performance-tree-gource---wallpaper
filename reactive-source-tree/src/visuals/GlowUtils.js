import { Graphics } from 'pixi.js';

export function drawGlowCircle(graphics, x, y, radius, color, alpha = 1, strength = 1, steps = 3) {
  // More, finely-spaced layers with a smooth (1-t)^2 falloff so the halo reads as a soft
  // gradient instead of a few hard-edged stacked discs. Tiny/low-perf nodes keep the
  // cheap version since their banding is not visible anyway.
  const layers = steps <= 2 ? steps : steps + 3;
  const reach = radius * (1.4 + steps * 0.9);
  for (let i = layers; i >= 1; i -= 1) {
    const t = i / layers;
    const r = radius + (reach - radius) * t;
    const falloff = (1 - t) * (1 - t);
    graphics.beginFill(color, alpha * 0.085 * strength * falloff);
    graphics.drawCircle(x, y, r);
    graphics.endFill();
  }

  graphics.beginFill(color, alpha);
  graphics.drawCircle(x, y, radius);
  graphics.endFill();
}

export function drawGlowLine(graphics, ax, ay, bx, by, color, alpha = 1, width = 1, glowStrength = 1) {
  graphics.lineStyle({
    width: width * 5.8,
    color,
    alpha: alpha * 0.07 * glowStrength,
    cap: 'round',
    join: 'round'
  });
  graphics.moveTo(ax, ay);
  graphics.lineTo(bx, by);

  graphics.lineStyle({
    width: width * 2.6,
    color,
    alpha: alpha * 0.16 * glowStrength,
    cap: 'round',
    join: 'round'
  });
  graphics.moveTo(ax, ay);
  graphics.lineTo(bx, by);

  graphics.lineStyle({
    width,
    color,
    alpha,
    cap: 'round',
    join: 'round'
  });
  graphics.moveTo(ax, ay);
  graphics.lineTo(bx, by);
}
