import { Graphics } from 'pixi.js';

export function drawGlowCircle(graphics, x, y, radius, color, alpha = 1, strength = 1, steps = 3) {
  // Flat-filled discs can't make a true gradient, so each disc adds a hard edge. Use the
  // FEWEST that still read as glow — one broad faint halo + one tighter halo + the solid
  // core — so a node looks like a glowing dot, not a bullseye of concentric rings.
  const reach = radius * (1.4 + steps * 0.9);
  graphics.beginFill(color, alpha * 0.05 * strength);
  graphics.drawCircle(x, y, reach);
  graphics.endFill();
  graphics.beginFill(color, alpha * 0.1 * strength);
  graphics.drawCircle(x, y, radius + (reach - radius) * 0.42);
  graphics.endFill();
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
