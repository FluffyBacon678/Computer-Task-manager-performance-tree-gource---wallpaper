import { Graphics } from 'pixi.js';
import { clamp, randomRange, TAU, weightedPick } from '../utils/MathUtils.js';
import { ParticlePool } from './ParticlePool.js';

const categoryWeights = [
  { value: 'cpu', weight: 1.2 },
  { value: 'ram', weight: 0.8 },
  { value: 'gpu', weight: 0.9 },
  { value: 'disk', weight: 0.7 },
  { value: 'network', weight: 1 },
  { value: 'audio', weight: 1 }
];

export class ParticleSystem {
  constructor(parent, palette, maxParticles = 420) {
    this.palette = palette;
    this.pool = new ParticlePool(maxParticles);
    this.graphics = new Graphics();
    parent.addChild(this.graphics);
    this.spawnAccumulator = 0;
  }

  setPalette(palette) {
    this.palette = palette;
  }

  configure(config) {
    const base = config.lowPerformanceMode ? 180 : 460;
    this.pool.resize(base * config.particleAmount);
  }

  spawn(x, y, color, category, options = {}) {
    const particle = this.pool.acquire();
    if (!particle) return null;

    const angle = options.angle ?? Math.random() * TAU;
    const speed = options.speed ?? randomRange(24, 96);
    particle.x = x;
    particle.y = y;
    particle.vx = Math.cos(angle) * speed + (options.vx ?? 0);
    particle.vy = Math.sin(angle) * speed + (options.vy ?? 0);
    particle.life = 0;
    particle.maxLife = options.maxLife ?? randomRange(1.1, 2.8);
    particle.size = options.size ?? randomRange(1.3, 3.2);
    particle.color = color;
    particle.alpha = options.alpha ?? 1;
    particle.mode = options.mode ?? 'free';
    particle.category = category;
    particle.phase = Math.random() * TAU;
    return particle;
  }

  spawnFromGraph(model, activityState, config, dt) {
    const overall = activityState.value('overallLoad') * config.intensity;
    const audio = activityState.value('audioVolume');
    const rate = (config.lowPerformanceMode ? 10 : 24) * config.particleAmount * (0.35 + overall + audio * 0.6);
    this.spawnAccumulator += rate * dt;

    while (this.spawnAccumulator >= 1) {
      this.spawnAccumulator -= 1;
      const category = weightedPick(categoryWeights.map((item) => ({
        ...item,
        weight: item.weight * (0.2 + this.categoryActivity(categoryValue(item.value), activityState) * 1.5)
      })));
      const node = category === 'core' ? model.nodeById.get('root') : model.getCategoryNode(category);
      if (!node) continue;
      const activity = this.categoryActivity(category, activityState);
      const outward = randomRange(0, 1) > 0.22;
      const angle = (node.angle ?? Math.random() * TAU) + randomRange(-0.6, 0.6) + (outward ? 0 : Math.PI);
      this.spawn(node.renderX, node.renderY, this.palette.category(category, activity), category, {
        angle,
        speed: randomRange(22, 72) + activity * 90 + activityState.value('cpu') * 80,
        maxLife: randomRange(0.9, 2.1),
        size: randomRange(1.1, 2.6) + activity * 1.2,
        alpha: 0.45 + activity * 0.65
      });
    }
  }

  categoryActivity(category, activityState) {
    if (category === 'network') return Math.max(activityState.value('netDown'), activityState.value('netUp'));
    if (category === 'audio') return activityState.value('audioVolume');
    if (category === 'core') return activityState.value('overallLoad');
    return activityState.value(category);
  }

  update(model, activityState, config, dt) {
    this.configure(config);
    this.spawnFromGraph(model, activityState, config, dt);

    const drag = Math.pow(0.985, dt * 60);
    for (let i = 0; i < this.pool.maxParticles; i += 1) {
      const particle = this.pool.particles[i];
      if (!particle.active) continue;
      particle.life += dt;
      if (particle.life >= particle.maxLife) {
        particle.reset();
        continue;
      }

      particle.vx *= drag;
      particle.vy *= drag;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    }
  }

  render(config) {
    this.graphics.clear();
    for (let i = 0; i < this.pool.maxParticles; i += 1) {
      const particle = this.pool.particles[i];
      if (!particle.active) continue;
      const t = particle.life / particle.maxLife;
      const alpha = clamp((1 - t) * particle.alpha);
      const size = particle.size * (1 + t * 0.35);

      if (!config.lowPerformanceMode) {
        this.graphics.beginFill(particle.color, alpha * 0.12 * config.glowStrength);
        this.graphics.drawCircle(particle.x, particle.y, size * 3.2);
        this.graphics.endFill();
      }

      this.graphics.beginFill(particle.color, alpha);
      this.graphics.drawCircle(particle.x, particle.y, size);
      this.graphics.endFill();
    }
  }

  activeCount() {
    return this.pool.activeCount();
  }
}

function categoryValue(category) {
  return category;
}
