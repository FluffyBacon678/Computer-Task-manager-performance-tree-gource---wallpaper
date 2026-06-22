export class LinkVisual {
  constructor(graphics) {
    this.graphics = graphics;
  }

  draw(link, time, glowStrength, lowPerformanceMode) {
    const source = link.source;
    const target = link.target;
    const sx = source.renderX;
    const sy = source.renderY;
    const tx = target.renderX;
    const ty = target.renderY;
    const dx = tx - sx;
    const dy = ty - sy;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    const bend = Math.sin(time * 0.45 + link.phase) * (link.secondary ? 6 : 10);
    const cx = (sx + tx) * 0.5 + nx * bend;
    const cy = (sy + ty) * 0.5 + ny * bend;
    const activity = link.activity ?? 0;
    const alpha = (link.secondary ? 0.08 : 0.18) + activity * (link.secondary ? 0.2 : 0.45);
    const width = (link.secondary ? 0.65 : 1.15) + activity * (link.secondary ? 0.8 : 1.5);
    const color = link.color;

    if (!lowPerformanceMode) {
      this.graphics.lineStyle({
        width: width * 5.2,
        color,
        alpha: alpha * 0.08 * glowStrength,
        cap: 'round',
        join: 'round'
      });
      this.graphics.moveTo(sx, sy);
      this.graphics.quadraticCurveTo(cx, cy, tx, ty);
    }

    this.graphics.lineStyle({
      width: width * 2.1,
      color,
      alpha: alpha * 0.22 * glowStrength,
      cap: 'round',
      join: 'round'
    });
    this.graphics.moveTo(sx, sy);
    this.graphics.quadraticCurveTo(cx, cy, tx, ty);

    this.graphics.lineStyle({
      width,
      color,
      alpha: alpha + activity * 0.16,
      cap: 'round',
      join: 'round'
    });
    this.graphics.moveTo(sx, sy);
    this.graphics.quadraticCurveTo(cx, cy, tx, ty);
  }
}
