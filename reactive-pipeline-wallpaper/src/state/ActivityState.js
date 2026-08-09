import { clamp, damp } from '../utils/MathUtils.js';

const CHANNELS = ['cpu', 'ram', 'gpu', 'disk', 'netDown', 'netUp', 'overallLoad', 'temperature'];

export class ActivityState {
  constructor() {
    this.values = Object.fromEntries(CHANNELS.map((key) => [key, 0]));
    this.targets = { ...this.values };
  }

  merge(values = {}, weight = 1) {
    for (const key of CHANNELS) {
      if (values[key] === null || values[key] === undefined) continue;
      const next = clamp(values[key]);
      this.targets[key] = clamp(this.targets[key] * (1 - weight) + next * weight);
    }
    this.targets.overallLoad = Math.max(
      this.targets.cpu,
      this.targets.ram * 0.72,
      this.targets.gpu,
      this.targets.disk,
      this.targets.netDown,
      this.targets.netUp
    );
  }

  update(dt) {
    for (const key of CHANNELS) {
      this.values[key] = damp(this.values[key], this.targets[key], 7.5, dt);
    }
  }

  value(key) {
    return this.values[key] ?? 0;
  }

  snapshot() {
    return { ...this.values };
  }
}

