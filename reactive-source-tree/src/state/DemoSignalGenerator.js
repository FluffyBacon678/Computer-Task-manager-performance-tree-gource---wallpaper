import { clamp, lerp } from '../utils/MathUtils.js';
import { createNoise2D } from '../utils/Noise.js';

export class DemoSignalGenerator {
  constructor(activityState) {
    this.activityState = activityState;
    this.time = 0;
    this.noise = createNoise2D(127);
    this.diskBurst = 0;
    this.netBurst = 0;
    this.cpuSpike = 0;
  }

  update(dt, options = {}) {
    this.time += dt * (options.animationSpeed ?? 1);

    if (Math.random() < dt * 0.38) this.diskBurst = 1;
    if (Math.random() < dt * 0.24) this.netBurst = 1;
    if (Math.random() < dt * 0.18) this.cpuSpike = 1;

    this.diskBurst = Math.max(0, this.diskBurst - dt * 4.2);
    this.netBurst = Math.max(0, this.netBurst - dt * 1.8);
    this.cpuSpike = Math.max(0, this.cpuSpike - dt * 2.5);

    const n = (offset, scale = 0.08) => this.noise(this.time * scale + offset, offset * 0.113);
    const cpu = clamp(0.22 + n(1, 0.12) * 0.34 + this.cpuSpike * 0.45);
    const ram = clamp(0.38 + Math.sin(this.time * 0.045) * 0.2 + n(5, 0.025) * 0.18);
    const disk = clamp(0.08 + n(3, 0.22) * 0.12 + this.diskBurst * 0.82);
    const netDown = clamp(0.12 + Math.pow(n(8, 0.14), 1.8) * 0.5 + this.netBurst * 0.55);
    const netUp = clamp(0.08 + Math.pow(n(10, 0.11), 1.9) * 0.36 + this.netBurst * 0.38);
    const gpu = clamp(0.2 + cpu * 0.22 + n(12, 0.07) * 0.35);
    const temperature = clamp(lerp(0.25, 0.72, gpu * 0.7 + cpu * 0.3));

    this.activityState.merge(
      {
        cpu,
        ram,
        gpu,
        disk,
        netDown,
        netUp,
        temperature
      },
      0.42
    );

    if (!options.hasAudio || !options.enableAudio) {
      const bass = clamp(0.08 + Math.pow(n(18, 0.36), 5) * 0.35);
      const mid = clamp(0.06 + n(20, 0.2) * 0.18);
      const treble = clamp(0.04 + Math.pow(n(22, 0.42), 4) * 0.22);
      const volume = clamp((bass + mid + treble) / 2.6);
      this.activityState.merge(
        {
          audioBass: bass,
          audioMid: mid,
          audioTreble: treble,
          audioVolume: volume
        },
        0.55
      );
    }
  }
}
