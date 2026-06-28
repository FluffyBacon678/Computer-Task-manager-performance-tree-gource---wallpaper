import { clamp, lerp, randomRange } from '../utils/MathUtils.js';
import { ParticlePool } from './ParticlePool.js';
import { SpriteField } from '../visuals/SpriteField.js';

function pointOnLink(link, progress, time = 0) {
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
  const inv = 1 - progress;

  return {
    x: inv * inv * sx + 2 * inv * progress * cx + progress * progress * tx,
    y: inv * inv * sy + 2 * inv * progress * cy + progress * progress * ty
  };
}

export class EdgeParticleSystem {
  constructor(parent, palette, maxParticles = 360) {
    this.palette = palette;
    this.pool = new ParticlePool(maxParticles);
    this.field = new SpriteField(parent, 1024);
    this.accumulators = new Map();
  }

  setPalette(palette) {
    this.palette = palette;
  }

  configure(config) {
    const base = config.lowPerformanceMode ? 160 : 390;
    this.pool.resize(base * config.particleAmount * (config.qualityScale ?? 1));
  }

  spawn(link, category, direction, activity) {
    const particle = this.pool.acquire();
    if (!particle) return;
    particle.mode = 'edge';
    particle.link = link;
    particle.sourceNode = link.source;
    particle.targetNode = link.target;
    particle.pathProgress = direction > 0 ? 0 : 1;
    particle.speed = direction * randomRange(0.28, 0.88) * (0.5 + activity * 1.4);
    particle.life = 0;
    particle.maxLife = randomRange(0.9, 2.2);
    particle.size = randomRange(1.4, 3.2) + activity * 1.2;
    particle.alpha = 0.55 + activity * 0.55;
    particle.category = category;
    particle.color = this.palette.category(category, activity);
  }

  activityFor(category, activityState) {
    if (category === 'networkDown') return activityState.value('netDown');
    if (category === 'networkUp') return activityState.value('netUp');
    if (category === 'network') return Math.max(activityState.value('netDown'), activityState.value('netUp'));
    if (category === 'audio') return activityState.value('audioVolume');
    return activityState.value(category);
  }

  spawnCategory(model, category, activityState, config, dt, rateMultiplier = 1) {
    const activity = this.activityFor(category, activityState) * config.intensity;
    const displayCategory = category.startsWith('network') ? 'network' : category;
    const links = model.links.filter((link) => link.category === displayCategory && !link.secondary);
    if (!links.length) return;

    const rate = rateMultiplier * (config.lowPerformanceMode ? 3.2 : 7.5) * config.particleAmount * (0.1 + activity * 1.8);
    const key = category;
    const next = (this.accumulators.get(key) ?? 0) + rate * dt;
    let accumulator = next;

    while (accumulator >= 1) {
      accumulator -= 1;
      const link = links[Math.floor(Math.random() * links.length)];
      let direction = 1;
      if (category === 'networkDown') {
        direction = link.target.type === 'category' || link.target.type === 'root' ? 1 : -1;
      } else if (category === 'networkUp') {
        direction = link.source.type === 'root' ? 1 : randomRange(0, 1) > 0.5 ? 1 : -1;
      }
      this.spawn(link, displayCategory, direction, activity);
    }

    this.accumulators.set(key, accumulator);
  }

  update(model, activityState, config, dt) {
    this.configure(config);
    this.spawnCategory(model, 'cpu', activityState, config, dt, 1.35 + activityState.value('cpu'));
    this.spawnCategory(model, 'ram', activityState, config, dt, 0.45 + activityState.value('ram') * 0.6);
    this.spawnCategory(model, 'disk', activityState, config, dt, 1.1 + activityState.value('disk') * 2.4);
    this.spawnCategory(model, 'networkDown', activityState, config, dt, 1.4 + activityState.value('netDown') * 2);
    this.spawnCategory(model, 'networkUp', activityState, config, dt, 1.0 + activityState.value('netUp') * 1.8);
    this.spawnCategory(model, 'audio', activityState, config, dt, 0.7 + activityState.value('audioVolume') * 1.8);

    for (let i = 0; i < this.pool.maxParticles; i += 1) {
      const particle = this.pool.particles[i];
      if (!particle.active) continue;
      particle.life += dt;
      particle.pathProgress += particle.speed * dt;
      if (particle.life > particle.maxLife || particle.pathProgress < -0.04 || particle.pathProgress > 1.04) {
        particle.reset();
      }
    }
  }

  render(time, config) {
    this.field.begin();
    // Keep additive sprite alpha modest so dense packets don't blow out to white.
    const glow = 0.4 + config.glowStrength * 0.28;
    for (let i = 0; i < this.pool.maxParticles; i += 1) {
      const particle = this.pool.particles[i];
      if (!particle.active || !particle.link) continue;
      const point = pointOnLink(particle.link, clamp(particle.pathProgress), time);
      const t = particle.life / particle.maxLife;
      const alpha = clamp((1 - t) * particle.alpha);
      const size = lerp(particle.size, particle.size * 0.45, t);
      const reach = size * (config.lowPerformanceMode ? 2 : 3.2);
      this.field.draw(point.x, point.y, reach, particle.color, alpha * glow);
    }
    this.field.end();
  }

  activeCount() {
    return this.pool.activeCount();
  }
}
