import { Graphics } from 'pixi.js';
import { clamp, lerp, mixColor, randomRange } from '../utils/MathUtils.js';
import { createNoise2D } from '../utils/Noise.js';
import { SpriteField } from './SpriteField.js';

export class BackgroundRenderer {
  constructor(parent, palette, width, height) {
    this.palette = palette;
    this.graphics = new Graphics();
    parent.addChild(this.graphics);
    // The drifting dust specks (the largest count here) become batched GPU sprites; the
    // few big gradient/mist discs stay as Graphics.
    this.dustField = new SpriteField(parent, 256);
    this.noise = createNoise2D(66);
    this.width = width;
    this.height = height;
    this.dust = Array.from({ length: 180 }, (_, index) => ({
      x: Math.random(),
      y: Math.random(),
      size: randomRange(0.45, 1.8),
      alpha: randomRange(0.08, 0.45),
      phase: index * 0.713
    }));
  }

  setPalette(palette) {
    this.palette = palette;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  render(activityState, config, time) {
    const g = this.graphics;
    const width = this.width;
    const height = this.height;
    const cx = width / 2;
    const cy = height / 2;
    const maxRadius = Math.sqrt(width * width + height * height) * 0.62;
    const load = activityState.value('overallLoad') * config.intensity;
    const gpu = activityState.value('gpu');
    const bass = activityState.value('audioBass');
    const temperature = activityState.value('temperature');
    const background = mixColor(
      this.palette.colors.backgroundA,
      this.palette.colors.gpu,
      clamp((temperature - 0.55) * 0.16)
    );

    g.clear();
    g.beginFill(background, 1);
    g.drawRect(0, 0, width, height);
    g.endFill();

    for (let i = 7; i >= 1; i -= 1) {
      const t = i / 7;
      const radius = maxRadius * t * (0.62 + bass * 0.06);
      const alpha = (0.035 + load * 0.026 + gpu * 0.015) * (1 - t * 0.56);
      g.beginFill(this.palette.colors.backgroundB, alpha);
      g.drawCircle(cx, cy, radius);
      g.endFill();
    }

    const coreMist = 0.02 + load * 0.035 + bass * 0.04;
    g.beginFill(this.palette.colors.coreAccent, coreMist);
    g.drawCircle(cx, cy, maxRadius * 0.32);
    g.endFill();

    const dustLimit = config.lowPerformanceMode ? 72 : this.dust.length;
    this.dustField.begin();
    for (let i = 0; i < dustLimit; i += 1) {
      const dust = this.dust[i];
      const driftX = this.noise(dust.x * 5 + time * 0.012, dust.phase) - 0.5;
      const driftY = this.noise(dust.y * 5, dust.phase + time * 0.01) - 0.5;
      const x = ((dust.x * width + driftX * 38 + width) % width);
      const y = ((dust.y * height + driftY * 34 + height) % height);
      const shimmer = lerp(0.6, 1, this.noise(dust.phase, time * 0.18));
      const size = dust.size * (1 + gpu * 0.45);
      this.dustField.draw(x, y, size * 2.4, this.palette.colors.dust, dust.alpha * shimmer * (0.36 + load * 0.4));
    }
    this.dustField.end();

    if (!config.lowPerformanceMode) {
      for (let i = 0; i < 5; i += 1) {
        const n = this.noise(time * 0.02 + i, i * 8.4);
        const x = lerp(width * 0.2, width * 0.8, n);
        const y = lerp(height * 0.18, height * 0.82, this.noise(i * 3.1, time * 0.02));
        g.beginFill(this.palette.category('gpu', gpu), (0.012 + gpu * 0.014) * config.glowStrength);
        g.drawCircle(x, y, maxRadius * (0.18 + i * 0.025));
        g.endFill();
      }
    }
  }
}
