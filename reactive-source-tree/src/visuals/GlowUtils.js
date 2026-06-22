import { Graphics } from 'pixi.js';

export function drawGlowCircle(graphics, x, y, radius, color, alpha = 1, strength = 1, steps = 3) {
  for (let i = steps; i >= 1; i -= 1) {
    const t = i / steps;
    graphics.beginFill(color, alpha * 0.08 * strength * t);
    graphics.drawCircle(x, y, radius * (1.45 + i * 0.9));
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
