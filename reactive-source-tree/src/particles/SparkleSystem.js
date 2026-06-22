import { Graphics } from 'pixi.js';
import { clamp, randomRange, TAU } from '../utils/MathUtils.js';
import { ParticlePool } from './ParticlePool.js';

export class SparkleSystem {
  constructor(parent, palette, maxSparkles = 180) {
    this.palette = palette;
    this.pool = new ParticlePool(maxSparkles);
    this.graphics = new Graphics();
    parent.addChild(this.graphics);
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
    this.graphics.clear();
    for (let i = 0; i < this.pool.maxParticles; i += 1) {
      const sparkle = this.pool.particles[i];
      if (!sparkle.active) continue;
      const t = sparkle.life / sparkle.maxLife;
      const alpha = clamp((1 - t) * sparkle.alpha);
      this.graphics.lineStyle({
        width: 1,
        color: sparkle.color,
        alpha
      });
      const size = sparkle.size;
      this.graphics.moveTo(sparkle.x - size, sparkle.y);
      this.graphics.lineTo(sparkle.x + size, sparkle.y);
      this.graphics.moveTo(sparkle.x, sparkle.y - size);
      this.graphics.lineTo(sparkle.x, sparkle.y + size);

      if (!config.lowPerformanceMode) {
        this.graphics.beginFill(sparkle.color, alpha * 0.12 * config.glowStrength);
        this.graphics.drawCircle(sparkle.x, sparkle.y, size * 4);
        this.graphics.endFill();
      }
    }
  }

  activeCount() {
    return this.pool.activeCount();
  }
}
