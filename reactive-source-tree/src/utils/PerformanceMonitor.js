export class PerformanceMonitor {
  constructor() {
    this.fps = 60;
    this.frameCount = 0;
    this.accumulator = 0;
    this.activeParticles = 0;
    this.nodeCount = 0;
    this.telemetryStatus = 'off';
  }

  update(dt) {
    this.frameCount += 1;
    this.accumulator += dt;

    if (this.accumulator >= 0.5) {
      this.fps = this.frameCount / this.accumulator;
      this.frameCount = 0;
      this.accumulator = 0;
    }
  }

  setStats({ activeParticles, nodeCount, telemetryStatus }) {
    if (typeof activeParticles === 'number') this.activeParticles = activeParticles;
    if (typeof nodeCount === 'number') this.nodeCount = nodeCount;
    if (telemetryStatus) this.telemetryStatus = telemetryStatus;
  }
}
