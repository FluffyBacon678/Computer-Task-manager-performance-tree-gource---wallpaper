import { Graphics } from 'pixi.js';
import { clamp } from '../utils/MathUtils.js';

// A Gource-style activity beam: a bright head shoots from a source (a branch, or the
// scheduler actor) to a target node and the trail fades. Used to "light up" a process
// when it is born or spikes.
class Beam {
  constructor() {
    this.active = false;
    this.x1 = 0;
    this.y1 = 0;
    this.x2 = 0;
    this.y2 = 0;
    this.color = 0xffffff;
    this.life = 0;
    this.maxLife = 0.42;
  }
}

export class BeamSystem {
  constructor(parent, palette, maxBeams = 48) {
    this.palette = palette;
    this.graphics = new Graphics();
    parent.addChild(this.graphics);
    this.beams = Array.from({ length: maxBeams }, () => new Beam());
  }

  setPalette(palette) {
    this.palette = palette;
  }

  acquire() {
    return this.beams.find((beam) => !beam.active);
  }

  spawn(x1, y1, x2, y2, color) {
    const beam = this.acquire();
    if (!beam) return;
    beam.active = true;
    beam.x1 = x1;
    beam.y1 = y1;
    beam.x2 = x2;
    beam.y2 = y2;
    beam.color = color;
    beam.life = 0;
    beam.maxLife = 0.42;
  }

  update(model, config, dt) {
    const events = model.beamEvents;
    if (events && events.length) {
      for (const event of events) {
        const source = model.nodeById.get(event.sourceId);
        const target = model.nodeById.get(event.targetId);
        if (source && target) {
          this.spawn(source.renderX, source.renderY, target.renderX, target.renderY, event.color ?? target.color);
        }
      }
      events.length = 0;
    }

    for (const beam of this.beams) {
      if (!beam.active) continue;
      beam.life += dt;
      if (beam.life >= beam.maxLife) beam.active = false;
    }
  }

  render(config) {
    this.graphics.clear();
    for (const beam of this.beams) {
      if (!beam.active) continue;
      const t = beam.life / beam.maxLife;
      const head = clamp(t / 0.55); // head reaches the target in the first 55%
      const hx = beam.x1 + (beam.x2 - beam.x1) * head;
      const hy = beam.y1 + (beam.y2 - beam.y1) * head;
      const fade = clamp(1 - t);

      this.graphics.lineStyle({ width: 1.6, color: beam.color, alpha: 0.5 * fade, cap: 'round' });
      this.graphics.moveTo(beam.x1, beam.y1);
      this.graphics.lineTo(hx, hy);

      if (!config.lowPerformanceMode) {
        this.graphics.lineStyle({ width: 5, color: beam.color, alpha: 0.12 * fade * config.glowStrength, cap: 'round' });
        this.graphics.moveTo(beam.x1, beam.y1);
        this.graphics.lineTo(hx, hy);
      }

      this.graphics.beginFill(beam.color, 0.45 * fade);
      this.graphics.drawCircle(hx, hy, 4 + (1 - fade) * 3);
      this.graphics.endFill();
      this.graphics.beginFill(0xffffff, 0.7 * fade);
      this.graphics.drawCircle(hx, hy, 2.2);
      this.graphics.endFill();
    }
  }

  activeCount() {
    return this.beams.filter((beam) => beam.active).length;
  }
}
