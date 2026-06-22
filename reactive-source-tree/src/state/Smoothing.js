import { clamp } from '../utils/MathUtils.js';

export class SmoothedValue {
  constructor(value = 0, smoothing = 0.12) {
    this.raw = clamp(value);
    this.value = clamp(value);
    this.smoothing = smoothing;
  }

  set(value) {
    this.raw = clamp(value);
  }

  force(value) {
    this.raw = clamp(value);
    this.value = this.raw;
  }

  update(dt, speed = 1) {
    const factor = 1 - Math.pow(1 - this.smoothing, Math.max(0, dt * 60 * speed));
    this.value += (this.raw - this.value) * clamp(factor, 0, 1);
    this.value = clamp(this.value);
    return this.value;
  }
}
