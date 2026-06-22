import { Graphics } from 'pixi.js';
import { clamp, lerp } from '../utils/MathUtils.js';

class Pulse {
  constructor() {
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.radius = 0;
    this.maxRadius = 100;
    this.life = 0;
    this.maxLife = 1;
    this.alpha = 1;
    this.color = 0xffffff;
    this.thickness = 1;
  }
}

export class PulseSystem {
  constructor(parent, palette, maxPulses = 70) {
    this.palette = palette;
    this.graphics = new Graphics();
    parent.addChild(this.graphics);
    this.pulses = Array.from({ length: maxPulses }, () => new Pulse());
    this.previous = {
      bass: 0,
      cpu: 0,
      disk: 0,
      net: 0,
      ram: 0,
      temperature: 0
    };
    this.heatCooldown = 0;
  }

  setPalette(palette) {
    this.palette = palette;
  }

  acquire() {
    return this.pulses.find((pulse) => !pulse.active);
  }

  spawn(x, y, color, options = {}) {
    const pulse = this.acquire();
    if (!pulse) return;
    pulse.active = true;
    pulse.x = x;
    pulse.y = y;
    pulse.radius = options.radius ?? 4;
    pulse.maxRadius = options.maxRadius ?? 120;
    pulse.life = 0;
    pulse.maxLife = options.maxLife ?? 1.2;
    pulse.alpha = options.alpha ?? 0.8;
    pulse.color = color;
    pulse.thickness = options.thickness ?? 1.2;
  }

  maybeSpawn(model, activityState, config) {
    const bass = activityState.value('audioBass');
    const cpu = activityState.value('cpu');
    const disk = activityState.value('disk');
    const net = Math.max(activityState.value('netDown'), activityState.value('netUp'));
    const ram = activityState.value('ram');
    const temperature = activityState.value('temperature');
    const root = model.nodeById.get('root');

    if (root && bass > 0.18 && bass - this.previous.bass > 0.035) {
      this.spawn(root.renderX, root.renderY, this.palette.colors.coreAccent, {
        maxRadius: lerp(90, 230, bass),
        maxLife: lerp(0.8, 1.35, bass),
        alpha: 0.34 + bass * 0.48,
        thickness: 1.4 + bass * 2
      });
    }

    this.spawnOnSpike(model, 'cpu', cpu, this.previous.cpu, config, 0.42);
    this.spawnOnSpike(model, 'disk', disk, this.previous.disk, config, 0.32);
    this.spawnOnSpike(model, 'network', net, this.previous.net, config, 0.36);

    const ramNode = model.getCategoryNode('ram');
    if (ramNode && ram > 0.72 && Math.random() < 0.018 * config.intensity) {
      this.spawn(ramNode.renderX, ramNode.renderY, this.palette.category('ram', ram), {
        maxRadius: 210,
        maxLife: 2.6,
        alpha: 0.2,
        thickness: 1
      });
    }

    if (root && temperature > 0.76 && this.heatCooldown <= 0) {
      this.spawn(root.renderX, root.renderY, this.palette.category('gpu', temperature), {
        maxRadius: 260 + temperature * 90,
        maxLife: 3.4,
        alpha: (temperature - 0.72) * 0.38,
        thickness: 0.9
      });
      this.heatCooldown = 2.8;
    }

    this.previous = { bass, cpu, disk, net, ram, temperature };
  }

  spawnOnSpike(model, category, current, previous, config, threshold) {
    const node = model.getCategoryNode(category);
    if (!node) return;
    if (current > threshold && current - previous > 0.04) {
      this.spawn(node.renderX, node.renderY, this.palette.category(category, current), {
        maxRadius: lerp(74, 170, current),
        maxLife: lerp(0.55, 1.1, current),
        alpha: 0.22 + current * 0.38,
        thickness: 1 + current * 1.4
      });
    }
  }

  update(model, activityState, config, dt) {
    this.heatCooldown = Math.max(0, this.heatCooldown - dt);
    this.maybeSpawn(model, activityState, config);

    for (const pulse of this.pulses) {
      if (!pulse.active) continue;
      pulse.life += dt;
      if (pulse.life >= pulse.maxLife) {
        pulse.active = false;
        continue;
      }
      const t = pulse.life / pulse.maxLife;
      pulse.radius = lerp(0, pulse.maxRadius, 1 - Math.pow(1 - t, 2));
    }
  }

  render(config) {
    this.graphics.clear();
    for (const pulse of this.pulses) {
      if (!pulse.active) continue;
      const t = pulse.life / pulse.maxLife;
      const alpha = clamp((1 - t) * pulse.alpha);
      this.graphics.lineStyle({
        width: pulse.thickness,
        color: pulse.color,
        alpha
      });
      this.graphics.drawCircle(pulse.x, pulse.y, pulse.radius);

      if (!config.lowPerformanceMode) {
        this.graphics.lineStyle({
          width: pulse.thickness * 4,
          color: pulse.color,
          alpha: alpha * 0.08 * config.glowStrength
        });
        this.graphics.drawCircle(pulse.x, pulse.y, pulse.radius);
      }
    }
  }

  activeCount() {
    return this.pulses.filter((pulse) => pulse.active).length;
  }
}
