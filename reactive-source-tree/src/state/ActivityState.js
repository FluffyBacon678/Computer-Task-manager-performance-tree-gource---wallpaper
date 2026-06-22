import { ACTIVITY_KEYS } from '../config.js';
import { clamp } from '../utils/MathUtils.js';
import { SmoothedValue } from './Smoothing.js';

const smoothingByKey = {
  cpu: 0.08,
  ram: 0.035,
  gpu: 0.07,
  disk: 0.16,
  netDown: 0.12,
  netUp: 0.12,
  audioBass: 0.22,
  audioMid: 0.18,
  audioTreble: 0.2,
  audioVolume: 0.16,
  temperature: 0.025,
  overallLoad: 0.08
};

export class ActivityState {
  constructor() {
    this.signals = Object.fromEntries(
      ACTIVITY_KEYS.map((key) => [key, new SmoothedValue(0, smoothingByKey[key] ?? 0.1)])
    );
    this.telemetryFreshness = 0;
  }

  setRaw(key, value) {
    if (!this.signals[key]) return;
    this.signals[key].set(value);
  }

  merge(values = {}, weight = 1) {
    for (const [key, value] of Object.entries(values)) {
      if (!this.signals[key] || value === null || value === undefined) continue;
      const current = this.signals[key].raw;
      this.signals[key].set(current + (clamp(value) - current) * clamp(weight));
    }
  }

  update(dt, speed = 1) {
    this.telemetryFreshness = Math.max(0, this.telemetryFreshness - dt);
    this.computeOverallRaw();

    for (const key of ACTIVITY_KEYS) {
      this.signals[key].update(dt, speed);
    }
  }

  computeOverallRaw() {
    const cpu = this.raw('cpu');
    const ram = this.raw('ram');
    const gpu = this.raw('gpu');
    const disk = this.raw('disk');
    const network = Math.max(this.raw('netDown'), this.raw('netUp'));
    const audio = this.raw('audioVolume');
    const overall =
      cpu * 0.25 +
      ram * 0.2 +
      gpu * 0.2 +
      disk * 0.1 +
      network * 0.1 +
      audio * 0.15;
    this.signals.overallLoad.set(overall);
  }

  raw(key) {
    return this.signals[key]?.raw ?? 0;
  }

  value(key) {
    return this.signals[key]?.value ?? 0;
  }

  snapshot() {
    return Object.fromEntries(ACTIVITY_KEYS.map((key) => [key, this.value(key)]));
  }

  rawSnapshot() {
    return Object.fromEntries(ACTIVITY_KEYS.map((key) => [key, this.raw(key)]));
  }
}
