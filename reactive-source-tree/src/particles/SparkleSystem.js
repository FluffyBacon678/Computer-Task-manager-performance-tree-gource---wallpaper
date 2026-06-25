import { clamp, randomRange, TAU } from '../utils/MathUtils.js';
import { ParticlePool } from './ParticlePool.js';
import { SpriteField } from '../visuals/SpriteField.js';

export class SparkleSystem {
  constructor(parent, palette, maxSparkles = 180) {
    this.palette = palette;
    this.pool = new ParticlePool(maxSparkles);
    this.field = new SpriteField(parent, 256);
    this.accumulator = 0;
  }

  setPalette(palette) {
    this.palette = palette;
  }

  configure(config) {
    this.pool.resize(config.lowPerformanceMode ? 60 : 180 * config.particleAmount);
  }

  spawn(node, activity) {
    const sparkle = this.pool.acquire();
    if (!sparkle) return;
    const angle = Math.random() * TAU;
    const distance = randomRange(8, 34);
    sparkle.x = node.renderX + Math.cos(angle) * distance;
    sparkle.y = node.renderY + Math.sin(angle) * distance;
    sparkle.vx = Math.cos(angle) * randomRange(5, 36);
    sparkle.vy = Math.sin(angle) * randomRange(5, 36);
    sparkle.life = 0;
    sparkle.maxLife = randomRange(0.22, 0.72);
    sparkle.size = randomRange(0.8, 2.1);
    sparkle.alpha = 0.45 + activity * 0.55;
    sparkle.color = Math.random() < 0.55 ? this.palette.category('audio', activity) : this.palette.colors.coreAccent;
    sparkle.category = 'audio';
  }

  update(model, activityState, config, dt) {
    this.configure(config);
    const treble = activityState.value('audioTreble') * config.intensity;
    const rate = (config.lowPerformanceMode ? 8 : 30) * treble * treble * config.particleAmount;
    this.accumulator += rate * dt;
    const outerNodes = model.getOuterNodes();

    while (this.accumulator >= 1 && outerNodes.length) {
      this.accumulator -= 1;
      const node = outerNodes[Math.floor(Math.random() * outerNodes.length)];
      this.spawn(node, treble);
    }

    for (let i = 0; i < this.pool.maxParticles; i += 1) {
      const sparkle = this.pool.particles[i];
      if (!sparkle.active) continue;
      sparkle.life += dt;
      if (sparkle.life >= sparkle.maxLife) {
        sparkle.reset();
        continue;
      }
      sparkle.x += sparkle.vx * dt;
      sparkle.y += sparkle.vy * dt;
      sparkle.vx *= Math.pow(0.95, dt * 60);
      sparkle.vy *= Math.pow(0.95, dt * 60);
    }
  }

  render(config) {
    this.field.begin();
    const glow = 0.55 + config.glowStrength * 0.35;
    for (let i = 0; i < this.pool.maxParticles; i += 1) {
      const sparkle = this.pool.particles[i];
      if (!sparkle.active) continue;
      const t = sparkle.life / sparkle.maxLife;
      const alpha = clamp((1 - t) * sparkle.alpha);
      const reach = sparkle.size * (config.lowPerformanceMode ? 2.4 : 3.6);
      this.field.draw(sparkle.x, sparkle.y, reach, sparkle.color, alpha * glow);
    }
    this.field.end();
  }

  activeCount() {
    return this.pool.activeCount();
  }
}
